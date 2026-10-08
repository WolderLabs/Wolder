import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createPermissionGuard, createSilentReporter, wolder } from "@wolder/core";
import type { AgentRunner, SerializedGraph } from "@wolder/core";
import type { Store } from "./api.js";

/** A recorded two-node run in a temp dir, for tests of the read API and the MCP server. */
export async function recordedProject(): Promise<{ root: string; store: Store; programFile: string }> {
  const root = mkdtempSync(resolve(tmpdir(), "wolder-inspector-"));
  const plan: Record<string, Record<string, string>> = {
    "a/**": { "a/one.ts": "export const one = 1;" },
    "b/**": { "b/two.ts": "export const two = 2;", "b/three.ts": "export const three = 3;" },
  };
  const runner: AgentRunner = {
    async run(request) {
      const guard = createPermissionGuard(request);
      for (const [path, content] of Object.entries(plan[request.nodeId] ?? {})) {
        guard.decide("Write", { file_path: path, content });
        mkdirSync(dirname(resolve(request.root, path)), { recursive: true });
        writeFileSync(resolve(request.root, path), content, "utf-8");
      }
      return { files: guard.written(), text: "done" };
    },
  };

  const w = wolder({ root, model: "test-model", services: { runner } });
  const first = w.layer().agent().owns("a/").goal("first");
  w.layer().agent().owns("b/").after(first).goal("second");
  await w.run({ reporter: createSilentReporter() });

  const programFile = resolve(root, "wolder.program.ts");
  writeFileSync(programFile, "export {};\n");
  const graph = { root, nodes: [], order: [], contracts: [] } as SerializedGraph;
  const store: Store = {
    programPath: programFile,
    program: { ok: true, graph, programFiles: [programFile] },
    root,
  };
  return { root, store, programFile };
}
