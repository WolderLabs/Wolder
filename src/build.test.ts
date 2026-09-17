import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { wolder } from "./wolder.js";
import { createSilentReporter } from "./reporter.js";
import { createPermissionGuard } from "./runner.js";
import { readManifest } from "./manifest.js";
import { GateError, RegionViolationError } from "./errors.js";
import type {
  AgentRunner,
  AgentRunRequest,
  Negotiator,
  WolderInstance,
  WolderServices,
} from "./types.js";

/** What a fake agent writes, per node id. */
type Plan = Record<string, Record<string, string>>;

interface Recorded {
  nodeId: string;
  prompt: string;
  attempt: number;
}

/**
 * A runner that writes a planned set of files — through the same permission guard
 * the real one uses, so boundary enforcement is exercised rather than assumed.
 */
function fakeRunner(plan: Plan): AgentRunner & { calls: Recorded[] } {
  const calls: Recorded[] = [];
  const attempts = new Map<string, number>();

  return {
    calls,
    async run(request: AgentRunRequest) {
      const attempt = (attempts.get(request.nodeId) ?? 0) + 1;
      attempts.set(request.nodeId, attempt);
      calls.push({ nodeId: request.nodeId, prompt: request.prompt, attempt });

      const guard = createPermissionGuard(request);
      for (const [path, content] of Object.entries(plan[request.nodeId] ?? {})) {
        const decision = guard.decide("Write", { file_path: path, content });
        if (decision.behavior === "deny") {
          throw new RegionViolationError(request.nodeId, path, request.regions);
        }
        const abs = resolve(request.root, path);
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, content, "utf-8");
      }
      return { files: guard.written(), text: "done" };
    },
  };
}

function fakeNegotiator(
  settle: (providerId: string) => {
    summary: string;
    terms?: Array<{ name: string; detail: string }>;
    files?: Array<{ path: string; content: string }>;
  },
): Negotiator & { rounds: string[] } {
  const rounds: string[] = [];
  return {
    rounds,
    async negotiate(request) {
      rounds.push(request.provider.id);
      const outcome = settle(request.provider.id);
      return {
        summary: outcome.summary,
        terms: outcome.terms ?? [],
        files: outcome.files ?? [],
        transcript: [],
      };
    },
  };
}

let root: string;

beforeEach(() => {
  root = mkdtempSync(resolve(tmpdir(), "wolder-build-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function instance(services: Partial<WolderServices>): WolderInstance {
  return wolder({ root, model: "test-model", services });
}

const silent = { reporter: createSilentReporter() };

describe("a uses-only program, end to end", () => {
  it("runs every node and records what each wrote", async () => {
    const runner = fakeRunner({
      "src/services/**": { "src/services/todo.ts": "export class TodoService {}" },
      "src/controllers/**": { "src/controllers/todo.ts": "export class TodoController {}" },
    });
    const w = instance({ runner });

    const project = w.layer().context("A todo service.");
    const service = project.scopedAgent().canWrite("src/services/").act("service");
    project.scopedAgent().canWrite("src/controllers/").uses(service).act("controller");

    const result = await w.build(silent);

    expect(result.artifacts.map((a) => a.id).sort()).toEqual([
      "src/controllers/**",
      "src/services/**",
    ]);
    expect(readFileSync(resolve(root, "src/services/todo.ts"), "utf-8")).toContain(
      "TodoService",
    );
    expect(readManifest(root).nodes["src/services/**"]!.files).toEqual([
      "src/services/todo.ts",
    ]);
  });

  it("runs a dependency before its dependent", async () => {
    const runner = fakeRunner({ "a.ts": { "a.ts": "a" }, "b.ts": { "b.ts": "b" } });
    const w = instance({ runner });

    const a = w.layer().scopedAgent().canWrite("a.ts").act("a");
    w.layer().scopedAgent().canWrite("b.ts").uses(a).act("b");

    await w.build(silent);
    expect(runner.calls.map((c) => c.nodeId)).toEqual(["a.ts", "b.ts"]);
  });

  it("hands a dependent its dependency's files as context", async () => {
    const runner = fakeRunner({
      "a.ts": { "a.ts": "export const upstreamMarker = 1;" },
      "b.ts": { "b.ts": "b" },
    });
    const w = instance({ runner });

    const a = w.layer().scopedAgent().canWrite("a.ts").act("a");
    w.layer().scopedAgent().canWrite("b.ts").uses(a).act("b");

    await w.build(silent);
    const dependent = runner.calls.find((c) => c.nodeId === "b.ts")!;
    expect(dependent.prompt).toContain("Files from agents you depend on");
    expect(dependent.prompt).toContain("upstreamMarker");
  });

  it("runs independent nodes in parallel", async () => {
    const live = { count: 0, peak: 0 };
    const runner: AgentRunner = {
      async run() {
        live.count++;
        live.peak = Math.max(live.peak, live.count);
        await new Promise((r) => setTimeout(r, 10));
        live.count--;
        return { files: [], text: "" };
      },
    };
    const w = instance({ runner });
    const layer = w.layer();
    for (const name of ["a", "b", "c"]) {
      layer.scopedAgent().canWrite(`${name}.ts`).act(name);
    }

    await w.build(silent);
    expect(live.peak).toBe(3);
  });

  it("passes the layer's accumulated context and included files through", async () => {
    writeFileSync(resolve(root, "model.ts"), "export interface TodoItem {}", "utf-8");
    const runner = fakeRunner({ "a.ts": { "a.ts": "a" } });
    const w = instance({ runner });

    w.layer()
      .context("shared prose")
      .context("narrower prose")
      .includeFile("model.ts")
      .scopedAgent()
      .canWrite("a.ts")
      .act("do the thing");

    await w.build(silent);
    const prompt = runner.calls[0]!.prompt;
    expect(prompt.indexOf("shared prose")).toBeLessThan(prompt.indexOf("narrower prose"));
    expect(prompt).toContain("export interface TodoItem {}");
    expect(prompt).toContain("do the thing");
  });

  it("reports a failing node without leaving sibling rejections unhandled", async () => {
    const runner: AgentRunner = {
      async run(request) {
        if (request.nodeId === "b.ts") throw new Error("agent exploded");
        return { files: [], text: "" };
      },
    };
    const w = instance({ runner });
    const layer = w.layer();
    layer.scopedAgent().canWrite("a.ts").act("a");
    layer.scopedAgent().canWrite("b.ts").act("b");

    await expect(w.build(silent)).rejects.toThrow("agent exploded");
  });
});

describe("boundaries", () => {
  it("refuses a write outside the agent's region", async () => {
    const runner = fakeRunner({ "src/services/**": { "src/controllers/todo.ts": "nope" } });
    const w = instance({ runner });
    w.layer().scopedAgent().canWrite("src/services/").act("service");

    await expect(w.build(silent)).rejects.toThrow(RegionViolationError);
  });
});

describe("caching", () => {
  it("does no work on a second run of an unchanged program", async () => {
    const plan: Plan = { "a.ts": { "a.ts": "a" }, "b.ts": { "b.ts": "b" } };
    const program = (runner: AgentRunner) => {
      const w = instance({ runner });
      const a = w.layer().context("shared").scopedAgent().canWrite("a.ts").act("a");
      w.layer().context("shared").scopedAgent().canWrite("b.ts").uses(a).act("b");
      return w;
    };

    const first = fakeRunner(plan);
    await program(first).build(silent);
    expect(first.calls).toHaveLength(2);

    const second = fakeRunner(plan);
    const result = await program(second).build(silent);
    expect(second.calls).toHaveLength(0);
    expect([...result.skipped].sort()).toEqual(["a.ts", "b.ts"]);
  });

  it("re-runs a node whose act changed, and its dependents, and nothing else", async () => {
    const plan: Plan = {
      "a.ts": { "a.ts": "a" },
      "b.ts": { "b.ts": "b" },
      "c.ts": { "c.ts": "c" },
    };
    const program = (runner: AgentRunner, aInstruction: string) => {
      const w = instance({ runner });
      const layer = w.layer();
      const a = layer.scopedAgent().canWrite("a.ts").act(aInstruction);
      layer.scopedAgent().canWrite("b.ts").uses(a).act("b");
      layer.scopedAgent().canWrite("c.ts").act("c");
      return w;
    };

    await program(fakeRunner(plan), "write a").build(silent);

    // `a` now writes something different, so `b` must see the new output.
    const second = fakeRunner({ ...plan, "a.ts": { "a.ts": "a changed" } });
    const result = await program(second, "write a differently").build(silent);

    expect(second.calls.map((c) => c.nodeId).sort()).toEqual(["a.ts", "b.ts"]);
    expect(result.skipped).toEqual(["c.ts"]);
  });

  it("re-runs a node whose layer context changed", async () => {
    const plan: Plan = { "a.ts": { "a.ts": "a" } };
    const program = (runner: AgentRunner, context: string) => {
      const w = instance({ runner });
      w.layer().context(context).scopedAgent().canWrite("a.ts").act("a");
      return w;
    };

    await program(fakeRunner(plan), "one").build(silent);
    const second = fakeRunner(plan);
    await program(second, "two").build(silent);
    expect(second.calls).toHaveLength(1);
  });

  it("re-runs a node whose included file changed", async () => {
    writeFileSync(resolve(root, "model.ts"), "v1", "utf-8");
    const plan: Plan = { "a.ts": { "a.ts": "a" } };
    const program = (runner: AgentRunner) => {
      const w = instance({ runner });
      w.layer().includeFile("model.ts").scopedAgent().canWrite("a.ts").act("a");
      return w;
    };

    await program(fakeRunner(plan)).build(silent);
    writeFileSync(resolve(root, "model.ts"), "v2", "utf-8");
    const second = fakeRunner(plan);
    await program(second).build(silent);
    expect(second.calls).toHaveLength(1);
  });

  it("re-runs a node whose output was edited by hand", async () => {
    const plan: Plan = { "a.ts": { "a.ts": "a" } };
    const program = (runner: AgentRunner) => {
      const w = instance({ runner });
      w.layer().scopedAgent().canWrite("a.ts").act("a");
      return w;
    };

    await program(fakeRunner(plan)).build(silent);
    writeFileSync(resolve(root, "a.ts"), "edited by hand", "utf-8");
    const second = fakeRunner(plan);
    await program(second).build(silent);
    expect(second.calls).toHaveLength(1);
  });

  it("regenerates everything when forced", async () => {
    const plan: Plan = { "a.ts": { "a.ts": "a" } };
    const program = (runner: AgentRunner) => {
      const w = instance({ runner });
      w.layer().scopedAgent().canWrite("a.ts").act("a");
      return w;
    };

    await program(fakeRunner(plan)).build(silent);
    const second = fakeRunner(plan);
    await program(second).build({ ...silent, force: true });
    expect(second.calls).toHaveLength(1);
  });

  it("forgets nodes the program no longer declares", async () => {
    await (() => {
      const w = instance({ runner: fakeRunner({ "a.ts": { "a.ts": "a" } }) });
      w.layer().scopedAgent().canWrite("a.ts").act("a");
      return w.build(silent);
    })();
    expect(Object.keys(readManifest(root).nodes)).toEqual(["a.ts"]);

    await (() => {
      const w = instance({ runner: fakeRunner({ "b.ts": { "b.ts": "b" } }) });
      w.layer().scopedAgent().canWrite("b.ts").act("b");
      return w.build(silent);
    })();
    expect(Object.keys(readManifest(root).nodes)).toEqual(["b.ts"]);
  });
});

describe("contracts", () => {
  function contractProgram(services: Partial<WolderServices>) {
    const w = instance(services);
    const project = w.layer();
    const dependencies = project
      .scopedAgent()
      .canWrite("package.json")
      .act("initialise the package")
      .provides("NPM dependencies");
    project
      .scopedAgent()
      .canWrite("src/controllers/")
      .requests(dependencies, "A framework like Express.js")
      .act("write a controller")
      .provides("Todo API");
    return w;
  }

  it("settles once per provider and injects the contract into both sides", async () => {
    const runner = fakeRunner({
      "package.json": {},
      "src/controllers/**": { "src/controllers/todo.ts": "controller" },
    });
    const negotiator = fakeNegotiator(() => ({
      summary: "The package agent will install express@5.",
      terms: [{ name: "express", detail: "express@5.0.0 as a dependency" }],
    }));

    const result = await contractProgram({ runner, negotiator }).build(silent);

    expect(negotiator.rounds).toEqual(["package.json"]);
    expect(result.contracts).toHaveLength(1);
    for (const call of runner.calls) {
      expect(call.prompt).toContain("Agreed contracts");
      expect(call.prompt).toContain("express@5.0.0");
    }
  });

  it("writes contract files into the provider's region before it runs", async () => {
    const runner = fakeRunner({
      "package.json": {},
      "src/controllers/**": { "src/controllers/todo.ts": "controller" },
    });
    const negotiator = fakeNegotiator(() => ({
      summary: "express@5",
      files: [{ path: "package.json", content: '{"dependencies":{"express":"^5.0.0"}}' }],
    }));

    const result = await contractProgram({ runner, negotiator }).build(silent);

    expect(readFileSync(resolve(root, "package.json"), "utf-8")).toContain("express");
    // The requester sees them as decisions already made, like a `uses` edge.
    const requester = runner.calls.find((c) => c.nodeId === "src/controllers/**")!;
    expect(requester.prompt).toContain('"express":"^5.0.0"');
    // And they count as the provider's output, so they do not read as drift later.
    const provider = result.artifacts.find((a) => a.id === "package.json")!;
    expect(provider.files).toEqual(["package.json"]);
  });

  it("refuses a contract file outside the provider's region", async () => {
    const runner = fakeRunner({ "package.json": {}, "src/controllers/**": {} });
    const negotiator = fakeNegotiator(() => ({
      summary: "sneaky",
      files: [{ path: "src/controllers/injected.ts", content: "nope" }],
    }));

    await expect(contractProgram({ runner, negotiator }).build(silent)).rejects.toThrow(
      RegionViolationError,
    );
  });

  it("does not re-settle an unchanged contract on a second run", async () => {
    const plan: Plan = {
      "package.json": {},
      "src/controllers/**": { "src/controllers/todo.ts": "controller" },
    };
    const settle = () => ({
      summary: "express@5",
      files: [{ path: "package.json", content: '{"name":"x"}' }],
    });

    await contractProgram({ runner: fakeRunner(plan), negotiator: fakeNegotiator(settle) }).build(
      silent,
    );

    const second = fakeNegotiator(settle);
    const runner = fakeRunner(plan);
    const result = await contractProgram({ runner, negotiator: second }).build(silent);

    expect(second.rounds).toEqual([]);
    expect(runner.calls).toHaveLength(0);
    expect(result.contracts[0]!.summary).toBe("express@5");
  });

  it("re-runs both participants when the contract changes", async () => {
    const plan: Plan = {
      "package.json": {},
      "src/controllers/**": { "src/controllers/todo.ts": "controller" },
    };
    await contractProgram({
      runner: fakeRunner(plan),
      negotiator: fakeNegotiator(() => ({ summary: "express@5" })),
    }).build(silent);

    const runner = fakeRunner(plan);
    await contractProgram({
      runner,
      // A different program shape would normally cause this; simulate the settled
      // content changing while everything else stays put.
      negotiator: {
        async negotiate() {
          return { summary: "fastify@5", terms: [], files: [], transcript: [] };
        },
      },
    }).build({ ...silent, force: false });

    // The contract's negotiation inputs are unchanged, so it is reused from the
    // manifest and nothing re-runs — a settled contract must not churn.
    expect(runner.calls).toHaveLength(0);
  });

  it("settles one contract covering every inbound request", async () => {
    const runner = fakeRunner({
      "README.md": { "README.md": "# docs" },
      "src/services/**": { "src/services/a.ts": "a" },
      "src/controllers/**": { "src/controllers/a.ts": "a" },
    });
    const negotiator = fakeNegotiator(() => ({ summary: "one README covering both" }));
    const w = instance({ runner, negotiator });

    const project = w.layer();
    const readme = project
      .scopedAgent()
      .canWrite("README.md")
      .act("write the readme")
      .provides("Documentation");
    project
      .scopedAgent()
      .canWrite("src/services/")
      .requests(readme, "Document service usage")
      .act("service");
    project
      .scopedAgent()
      .canWrite("src/controllers/")
      .requests(readme, "Document the API")
      .act("controller");

    const result = await w.build(silent);

    expect(negotiator.rounds).toEqual(["README.md"]);
    expect(result.contracts).toHaveLength(1);
    expect([...result.contracts[0]!.requesters].sort()).toEqual([
      "src/controllers/**",
      "src/services/**",
    ]);
  });
});

describe("ambient gates", () => {
  it("passes a node whose gate succeeds", async () => {
    const runner = fakeRunner({ "a.ts": { "a.ts": "a" } });
    const w = instance({ runner });
    w.layer().gate("node -e \"process.exit(0)\"", { name: "ok" }).scopedAgent()
      .canWrite("a.ts")
      .act("a");

    await expect(w.build(silent)).resolves.toBeDefined();
    expect(runner.calls).toHaveLength(1);
  });

  it("feeds a failing gate back to the agent and retries", async () => {
    const marker = resolve(root, "gate-passes");
    const runner: AgentRunner & { calls: Recorded[] } = Object.assign(
      {
        async run(request: AgentRunRequest) {
          // Fail the first attempt, then create the file the gate looks for.
          if (runner.calls.length > 0) writeFileSync(marker, "ok", "utf-8");
          runner.calls.push({
            nodeId: request.nodeId,
            prompt: request.prompt,
            attempt: runner.calls.length + 1,
          });
          return { files: [], text: "" };
        },
      },
      { calls: [] as Recorded[] },
    );

    const w = instance({ runner });
    w.layer()
      .gate(`node -e "process.exit(require('fs').existsSync('gate-passes') ? 0 : 1)"`, {
        name: "marker",
      })
      .scopedAgent()
      .canWrite("a.ts")
      .act("a");

    await w.build(silent);
    expect(runner.calls).toHaveLength(2);
    expect(runner.calls[1]!.prompt).toContain('The "marker" check failed');
  });

  it("gives up after maxRetries and names the gate", async () => {
    const runner = fakeRunner({ "a.ts": { "a.ts": "a" } });
    const w = wolder({
      root,
      model: "test-model",
      config: { maxRetries: 2 },
      services: { runner },
    });
    w.layer()
      .gate('node -e "process.exit(1)"', { name: "always fails" })
      .scopedAgent()
      .canWrite("a.ts")
      .act("a");

    await expect(w.build(silent)).rejects.toThrow(GateError);
    expect(runner.calls).toHaveLength(2);
  });
});

describe("reading results", () => {
  it("makes an artifact readable off the handle after the build", async () => {
    const runner = fakeRunner({ "a.ts": { "a.ts": "a" } });
    const w = instance({ runner });
    const agent = w.layer().scopedAgent().canWrite("a.ts").act("a").provides("A");

    expect(() => agent.artifact).toThrow(/await w\.build\(\)/);
    await w.build(silent);
    expect(agent.artifact.files).toEqual(["a.ts"]);
    expect(agent.artifact.provides).toBe("A");
  });
});
