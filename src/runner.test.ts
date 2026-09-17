import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import {
  AGENT_TOOLS,
  READ_TOOLS,
  WRITE_TOOLS,
  createPermissionGuard,
  describeAssistantTurn,
  toRootRelative,
  toolOptions,
} from "./runner.js";

const root = resolve("/project");

function guard(regions: string[]) {
  return createPermissionGuard({ root, regions });
}

describe("write enforcement", () => {
  it("allows a write inside the region and records it", () => {
    const g = guard(["src/services/**"]);
    expect(g.decide("Write", { file_path: "src/services/todo.ts" }).behavior).toBe("allow");
    expect(g.written()).toEqual(["src/services/todo.ts"]);
  });

  it("refuses a write outside the region and says why", () => {
    const g = guard(["src/services/**"]);
    const decision = g.decide("Edit", { file_path: "src/controllers/todo.ts" });

    expect(decision.behavior).toBe("deny");
    expect(decision.behavior === "deny" && decision.message).toMatch(
      /outside your writable region/,
    );
    expect(decision.behavior === "deny" && decision.message).toMatch(/Another agent owns it/);
    expect(g.written()).toEqual([]);
  });

  it("covers every file-writing tool", () => {
    for (const tool of ["Write", "Edit", "MultiEdit", "NotebookEdit"]) {
      expect(guard(["a.ts"]).decide(tool, { file_path: "b.ts" }).behavior).toBe("deny");
    }
  });

  it("checks the notebook path too", () => {
    expect(guard(["a.ipynb"]).decide("NotebookEdit", { notebook_path: "b.ipynb" }).behavior).toBe(
      "deny",
    );
  });

  it("lets an agent read anywhere inside the project, region or not", () => {
    for (const tool of ["Read", "Glob", "Grep"]) {
      expect(guard(["a.ts"]).decide(tool, { file_path: "anything.ts" }).behavior).toBe("allow");
    }
  });

  it("resolves an absolute path back to the region", () => {
    const g = guard(["src/services/**"]);
    expect(
      g.decide("Write", { file_path: resolve(root, "src/services/todo.ts") }).behavior,
    ).toBe("allow");
    expect(g.written()).toEqual(["src/services/todo.ts"]);
  });

  it("refuses an escape out of the project", () => {
    const g = guard(["src/**"]);
    expect(g.decide("Write", { file_path: "../../etc/passwd" }).behavior).toBe("deny");
    expect(g.decide("Write", { file_path: resolve("/elsewhere/x.ts") }).behavior).toBe("deny");
  });

  it("refuses a write it cannot check", () => {
    const decision = guard(["a.ts"]).decide("Write", { content: "x" });
    expect(decision.behavior).toBe("deny");
    expect(decision.behavior === "deny" && decision.message).toMatch(/without a file path/);
  });

  it("honours several regions", () => {
    const g = guard(["README.md", "src/services/**"]);
    expect(g.decide("Write", { file_path: "README.md" }).behavior).toBe("allow");
    expect(g.decide("Write", { file_path: "src/services/a.ts" }).behavior).toBe("allow");
    expect(g.decide("Write", { file_path: "package.json" }).behavior).toBe("deny");
  });

  it("reports each written file once, sorted", () => {
    const g = guard(["src/**"]);
    g.decide("Write", { file_path: "src/b.ts" });
    g.decide("Edit", { file_path: "src/a.ts" });
    g.decide("Edit", { file_path: "src/a.ts" });
    expect(g.written()).toEqual(["src/a.ts", "src/b.ts"]);
  });
});

describe("toRootRelative", () => {
  it("relativises a path inside the root", () => {
    expect(toRootRelative(resolve(root, "src/a.ts"), root)).toBe("src/a.ts");
    expect(toRootRelative("src/a.ts", root)).toBe("src/a.ts");
  });

  it("returns null for the root itself and for anything outside it", () => {
    expect(toRootRelative(root, root)).toBeNull();
    expect(toRootRelative("../x.ts", root)).toBeNull();
  });
});

describe("read confinement", () => {
  it("refuses a read above the project root", () => {
    const decision = guard(["a.ts"]).decide("Read", {
      file_path: resolve(root, "..", "other-project", "secrets.ts"),
    });
    expect(decision.behavior).toBe("deny");
    expect(decision.behavior === "deny" && decision.message).toMatch(/outside this project/);
  });

  it("refuses a read of an unrelated absolute path", () => {
    // The case seen in a real run: an agent reaching into ~/.claude.
    const decision = guard(["a.ts"]).decide("Read", {
      file_path: resolve("/home/someone/.claude/projects/other/package.json"),
    });
    expect(decision.behavior).toBe("deny");
  });

  it("refuses a relative escape", () => {
    expect(guard(["a.ts"]).decide("Read", { file_path: "../../.env" }).behavior).toBe("deny");
  });

  it("allows the project root itself, so an agent can list and search it", () => {
    for (const tool of ["Glob", "Grep"]) {
      expect(guard(["a.ts"]).decide(tool, { path: root }).behavior).toBe("allow");
      expect(guard(["a.ts"]).decide(tool, { path: "." }).behavior).toBe("allow");
    }
  });

  it("allows a search with no path at all — it defaults to the root", () => {
    expect(guard(["a.ts"]).decide("Glob", { pattern: "src/**/*.ts" }).behavior).toBe("allow");
  });

  it("refuses a pattern that climbs out with ..", () => {
    const decision = guard(["a.ts"]).decide("Glob", { pattern: "../**/*.env" });
    expect(decision.behavior).toBe("deny");
    expect(decision.behavior === "deny" && decision.message).toMatch(/reaches outside/);
  });

  it("refuses a grep glob that climbs out", () => {
    expect(
      guard(["a.ts"]).decide("Grep", { pattern: "TOKEN", glob: "../../**" }).behavior,
    ).toBe("deny");
  });

  it("does not mistake a pattern containing .. inside a name for an escape", () => {
    expect(guard(["a.ts"]).decide("Glob", { pattern: "src/**/a..b.ts" }).behavior).toBe("allow");
  });

  it("leaves writes judged by region, not merely by the root", () => {
    // A path inside the project but outside the region is still refused.
    const decision = guard(["src/services/**"]).decide("Write", { file_path: "package.json" });
    expect(decision.behavior).toBe("deny");
    expect(decision.behavior === "deny" && decision.message).toMatch(/writable region/);
  });
});

describe("the shape of an allow decision", () => {
  it("echoes updatedInput back, because the SDK's runtime schema demands it", () => {
    // Its .d.ts says `updatedInput?`, but an allow without it is rejected at runtime
    // and the agent only sees an opaque ZodError. Regression guard for a bug that
    // silently cost every write.
    const decision = guard(["a.ts"]).decide("Write", { file_path: "a.ts", content: "x" });
    expect(decision).toEqual({
      behavior: "allow",
      updatedInput: { file_path: "a.ts", content: "x" },
    });
  });

  it("echoes it for read-only tools too", () => {
    const decision = guard(["a.ts"]).decide("Read", { file_path: "anything.ts" });
    expect(decision).toEqual({
      behavior: "allow",
      updatedInput: { file_path: "anything.ts" },
    });
  });

  it("carries no updatedInput on a denial, only a message", () => {
    const decision = guard(["a.ts"]).decide("Write", { file_path: "b.ts" });
    expect(decision.behavior).toBe("deny");
    expect(decision).not.toHaveProperty("updatedInput");
  });
});

describe("SDK tool options", () => {
  const options = toolOptions();

  it("keeps every write tool out of allowedTools", () => {
    // `allowedTools` means "auto-approve without asking". A write tool listed there
    // executes without `canUseTool` ever running, so the region guard never sees it
    // and the boundary silently stops existing. This is the invariant.
    for (const tool of WRITE_TOOLS) {
      expect(options.allowedTools).not.toContain(tool);
    }
  });

  it("offers every write tool, so the guard is what decides", () => {
    for (const tool of WRITE_TOOLS) {
      expect(options.tools).toContain(tool);
    }
  });

  it("auto-approves nothing at all, so every call reaches the guard", () => {
    // Reads are fenced to the project root, which only works if `canUseTool` runs
    // for them — and anything in `allowedTools` skips it.
    expect(options.allowedTools).toEqual([]);
    for (const tool of READ_TOOLS) {
      expect(options.allowedTools).not.toContain(tool);
    }
  });

  it("gives the agent no shell and no network", () => {
    expect(options.tools).not.toContain("Bash");
    expect(options.disallowedTools).toContain("Bash");
    for (const tool of ["WebFetch", "WebSearch", "Task"]) {
      expect(options.disallowedTools).toContain(tool);
    }
  });

  it("guards every tool it offers that can write", () => {
    const guarded = AGENT_TOOLS.filter(
      (tool) => guard(["a.ts"]).decide(tool, { file_path: "b.ts" }).behavior === "deny",
    );
    expect(guarded.sort()).toEqual([...WRITE_TOOLS].sort());
  });
});

describe("translating an assistant turn into progress events", () => {
  it("reports each tool the agent reaches for, with the field worth showing", () => {
    expect(
      describeAssistantTurn({
        content: [
          { type: "tool_use", name: "Read", input: { file_path: "src/models/TodoItem.ts" } },
          { type: "tool_use", name: "Glob", input: { pattern: "src/**/*.ts" } },
        ],
      }),
    ).toEqual([
      { kind: "tool", name: "Read", detail: "src/models/TodoItem.ts" },
      { kind: "tool", name: "Glob", detail: "src/**/*.ts" },
    ]);
  });

  it("reports what the agent said, first line only", () => {
    expect(
      describeAssistantTurn({
        content: [
          { type: "text", text: "\n  Writing the service.\nThen the tests.\n" },
        ],
      }),
    ).toEqual([{ kind: "text", text: "Writing the service." }]);
  });

  it("truncates a long line rather than flooding the terminal", () => {
    const [event] = describeAssistantTurn({
      content: [{ type: "text", text: "x".repeat(500) }],
    });
    expect(event!.kind).toBe("text");
    expect(event!.kind === "text" && event!.text.length).toBeLessThanOrEqual(100);
  });

  it("drops an empty text block instead of emitting a blank line", () => {
    expect(describeAssistantTurn({ content: [{ type: "text", text: "   \n  " }] })).toEqual(
      [],
    );
  });

  it("copes with content that is not what it expects", () => {
    expect(describeAssistantTurn({ content: undefined })).toEqual([]);
    expect(describeAssistantTurn({ content: [null, 42, { type: "thinking" }] })).toEqual([]);
  });

  it("emits a tool event even when no field is worth showing", () => {
    expect(describeAssistantTurn({ content: [{ type: "tool_use", name: "TodoWrite" }] })).toEqual([
      { kind: "tool", name: "TodoWrite", detail: undefined },
    ]);
  });
});
