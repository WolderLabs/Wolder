import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { wolder } from "./wolder.js";
import { createSilentReporter } from "./reporter.js";
import { createPermissionGuard, toolOptions } from "./runner.js";
import { createBoundaryTools, REQUEST_PATH_TOOL, WHO_OWNS_TOOL } from "./boundary.js";
import { BoundaryRequestError } from "./errors.js";
import { RECORD_DIR } from "./record.js";
import { readManifest } from "./manifest.js";
import type { AgentRunRequest, AgentRunner } from "./types.js";

const quiet = { reporter: createSilentReporter() };

let root: string;
beforeEach(() => {
  root = mkdtempSync(resolve(tmpdir(), "wolder-boundary-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** A fake agent that, for the controller, runs `act` against the real boundary tools. */
function runnerFor(
  act: (tools: ReturnType<typeof createBoundaryTools>, request: AgentRunRequest) => void,
): AgentRunner {
  return {
    async run(request) {
      const tools = createBoundaryTools(request);
      if (request.nodeId === "src/controllers/TodoController.ts") act(tools, request);
      return { files: [], text: "", boundaryRequest: tools.requested() };
    },
  };
}

function program(runner: AgentRunner) {
  const w = wolder({ root, model: "test-model", services: { runner } });
  const project = w.layer();
  project
    .agent()
    .owns("src/services/TodoService.ts")
    .goal("Create a TodoService class with CRUD over an in-memory Map.");
  project
    .agent()
    .owns("src/controllers/TodoController.ts")
    .goal("Create a TodoController that wraps the service.");
  return w;
}

describe("who_owns", () => {
  it("names the owner, its goal and regions, and the edges that reach it", () => {
    let answer = "";
    const w = program(runnerFor((tools) => (answer = tools.whoOwns("src/services/TodoService.ts"))));
    return w.run(quiet).then(() => {
      expect(answer).toContain("owned by another agent: src/services/TodoService.ts");
      expect(answer).toContain("Create a TodoService class");
      expect(answer).toContain("Its regions: src/services/TodoService.ts");
      expect(answer).toContain(".asks(src/services/TodoService.ts");
      expect(answer).toContain(".after(src/services/TodoService.ts)");
    });
  });

  it("matches a path through a directory region, and says when nobody owns it", async () => {
    const answers: string[] = [];
    const w = wolder({
      root,
      model: "test-model",
      services: {
        runner: runnerFor((tools) => {
          answers.push(tools.whoOwns("src/lib/deep/x.ts"));
          answers.push(tools.whoOwns("docs/guide.md"));
          answers.push(tools.whoOwns("src/controllers/TodoController.ts"));
        }),
      },
    });
    const project = w.layer();
    project.agent().owns("src/lib/").goal("library");
    project.agent().owns("src/controllers/TodoController.ts").goal("controller");
    await w.run(quiet);

    expect(answers[0]).toContain("owned by another agent: src/lib/**");
    expect(answers[1]).toMatch(/No agent owns "docs\/guide.md"/);
    expect(answers[2]).toContain("inside your own region");
  });

  it("never records a request or fails the run", async () => {
    const w = program(runnerFor((tools) => void tools.whoOwns("nowhere.ts")));
    await expect(w.run(quiet)).resolves.toBeDefined();
  });
});

describe("request_path", () => {
  it("fails the run naming the agent, path, reason and the owner's edges", async () => {
    const w = program(
      runnerFor((tools) =>
        tools.requestPath("src/services/TodoService.ts", "I need to add a findByTitle method"),
      ),
    );
    const err = await w.run(quiet).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(BoundaryRequestError);
    const message = (err as Error).message;
    expect(message).toContain("src/controllers/TodoController.ts asked to write");
    expect(message).toContain('"src/services/TodoService.ts"');
    expect(message).toContain("owned by src/services/TodoService.ts");
    expect(message).toContain("Reason given: I need to add a findByTitle method");
    expect(message).toContain("Create a TodoService class");
    expect(message).toContain('.asks(src/services/TodoService.ts, "what you need")');
    expect(message).toContain(".after(src/services/TodoService.ts)");
    expect(message).toContain("tighten its goal");
    expect((err as BoundaryRequestError).owner?.id).toBe("src/services/TodoService.ts");
  });

  it("fails the run for an unowned path and suggests .owns() or a new agent", async () => {
    const w = program(runnerFor((tools) => tools.requestPath("src/utils/ids.ts", "shared ids")));
    const err = (await w.run(quiet).catch((e: unknown) => e)) as BoundaryRequestError;

    expect(err).toBeInstanceOf(BoundaryRequestError);
    expect(err.owner).toBeUndefined();
    expect(err.message).toContain("and no agent owns it");
    expect(err.message).toContain("Reason given: shared ids");
    expect(err.message).toContain('.owns("src/utils/ids.ts")');
    expect(err.message).toContain("declare a new agent");
    expect(err.message).toContain("tighten its goal");
  });

  it("records the run as failed with the full message and leaves the node unrecorded", async () => {
    const w = program(runnerFor((tools) => tools.requestPath("src/utils/ids.ts", "shared ids")));
    const err = (await w.run(quiet).catch((e: unknown) => e)) as Error;

    const runs = resolve(root, RECORD_DIR, "runs");
    const dir = resolve(runs, readdirSync(runs)[0]!);
    const meta = JSON.parse(readFileSync(resolve(dir, "run.json"), "utf-8"));
    expect(meta.status).toBe("failed");
    expect(meta.error).toBe(err.message);
    const events = readFileSync(resolve(dir, "events.jsonl"), "utf-8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    const last = events.at(-1);
    expect(last.kind).toBe("run:failed");
    expect(last.data).toMatchObject({ name: "BoundaryRequestError", message: err.message });

    const manifest = readManifest(root);
    expect(manifest.nodes["src/controllers/TodoController.ts"]).toBeUndefined();
  });
});

describe("the guard", () => {
  const request = () => ({ root, regions: ["src/controllers/TodoController.ts"] });

  it("allows both boundary tools by name", () => {
    const guard = createPermissionGuard(request());
    for (const tool of [WHO_OWNS_TOOL, REQUEST_PATH_TOOL]) {
      expect(guard.decide(tool, { path: "x.ts" }).behavior).toBe("allow");
    }
    expect(guard.written()).toEqual([]);
  });

  it("still denies an out-of-bounds write, pointing at the two tools", () => {
    const decision = createPermissionGuard(request()).decide("Write", {
      file_path: "src/services/TodoService.ts",
    });
    expect(decision.behavior).toBe("deny");
    const message = decision.behavior === "deny" ? decision.message : "";
    expect(message).toContain("outside your writable region");
    expect(message).toContain("who_owns");
    expect(message).toContain("request_path");
  });

  it("keeps allowedTools empty so every call reaches canUseTool", () => {
    expect(toolOptions().allowedTools).toEqual([]);
  });
});
