import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { loadProgram } from "./program.js";

const repo = resolve(import.meta.dirname, "..", "..", "..");
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("loadProgram", () => {
  it("assembles the todo sample into four nodes", async () => {
    const result = await loadProgram(resolve(repo, "samples/todo-service/wolder.program.ts"));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.graph.nodes).toHaveLength(4);
  }, 30_000);

  it("returns a diagnostic for an overlapping program", async () => {
    // Inside the repo, so the program resolves @wolder/core through node_modules.
    const dir = mkdtempSync(resolve(repo, "packages", "inspector", ".tmp-"));
    dirs.push(dir);
    const file = resolve(dir, "wolder.program.ts");
    writeFileSync(
      file,
      `import { wolder } from "@wolder/core";
const w = wolder({ root: import.meta.dirname, model: "m" });
const layer = w.layer();
layer.agent().owns("src/").goal("one");
layer.agent().owns("src/a/").goal("two");
await w.run();
`,
    );
    const result = await loadProgram(file);
    expect(result.ok).toBe(false);
    if (!result.ok && "diagnostic" in result) {
      expect(result.diagnostic.agents).toHaveLength(2);
    } else {
      throw new Error("expected a diagnostic");
    }
  }, 30_000);
});
