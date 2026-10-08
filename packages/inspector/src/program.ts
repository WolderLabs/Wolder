import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { GraphDiagnostic, Plan, SerializedGraph } from "@wolder/core";

export type ProgramResult =
  | { ok: true; graph: SerializedGraph; plan: Plan; programFiles: string[] }
  | { ok: false; diagnostic: GraphDiagnostic; programFiles: string[] }
  | { ok: false; crash: string; programFiles: string[] };

/**
 * The program path plus every local `.ts` file it imports, one level deep, found by
 * a regex over `import ... from "./..."` lines. Good enough for the first version:
 * it misses transitive imports, dynamic imports and `export ... from`.
 */
export function findProgramFiles(programPath: string): string[] {
  const program = resolve(programPath);
  const files = [program];
  let source = "";
  try {
    source = readFileSync(program, "utf-8");
  } catch {
    return files;
  }
  const pattern = /import\s[^;]*?from\s*["'](\.{1,2}\/[^"']+)["']/g;
  for (const match of source.matchAll(pattern)) {
    const spec = match[1]!;
    const base = resolve(dirname(program), spec);
    const candidates = [base, base.replace(/\.js$/, ".ts"), `${base}.ts`, join(base, "index.ts")];
    const found = candidates.find((c) => c.endsWith(".ts") && existsSync(c));
    if (found && !files.includes(found)) files.push(found);
  }
  return files;
}

/** How to launch `tsx` without a shell: node plus tsx's own CLI entry. */
export function tsxCommand(): { command: string; args: string[] } {
  try {
    const require = createRequire(import.meta.url);
    return { command: process.execPath, args: [require.resolve("tsx/cli")] };
  } catch {
    return { command: process.platform === "win32" ? "npx.cmd" : "npx", args: ["tsx"] };
  }
}

/** Assemble and plan the program in a child `tsx` process: the checked graph plus what the next run would redo. No model is touched. */
export async function loadProgram(programPath: string): Promise<ProgramResult> {
  const program = resolve(programPath);
  const programFiles = findProgramFiles(program);
  const dir = mkdtempSync(join(tmpdir(), "wolder-inspect-"));
  const out = join(dir, "plan.json");
  const { command, args } = tsxCommand();

  try {
    const exit = await new Promise<{ code: number | null; text: string }>((done) => {
      const child = spawn(command, [...args, program], {
        cwd: dirname(program),
        env: { ...process.env, WOLDER_PLAN: "1", WOLDER_PLAN_OUT: out },
        stdio: ["ignore", "ignore", "pipe"],
        windowsHide: true,
      });
      let text = "";
      child.stderr.on("data", (chunk) => (text += String(chunk)));
      child.on("error", (err) => done({ code: -1, text: text + err.message }));
      child.on("close", (code) => done({ code, text }));
    });

    if (!existsSync(out)) {
      return {
        ok: false,
        crash: exit.text.trim() || `the program exited with code ${exit.code} and wrote nothing`,
        programFiles,
      };
    }
    const outcome = JSON.parse(readFileSync(out, "utf-8")) as
      | { ok: true; graph: SerializedGraph; plan: Plan }
      | { ok: false; diagnostic: GraphDiagnostic };
    return { ...outcome, programFiles };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
