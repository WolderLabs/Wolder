import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { createPermissionGuard, toRootRelative } from "./runner.js";

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

  it("allows reading anywhere — the boundary is about writing", () => {
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
