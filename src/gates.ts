import { execSync } from "node:child_process";
import type { Gate } from "./types.js";

export interface GateResult {
  readonly gate: Gate;
  readonly pass: boolean;
  readonly output: string;
}

/**
 * An ambient check over an agent's writable region — a compile, a test run.
 * Gates are configured on the layer and run by wolder, not by the agent: an
 * agent with a shell could write anywhere, and the boundary is the point.
 *
 * `{files}` and `{regions}` in the command expand to the node's written files
 * and its claimed regions.
 */
export function runGate(
  gate: Gate,
  root: string,
  files: readonly string[],
  regions: readonly string[],
): GateResult {
  const command = gate.command
    .replace(/\{files\}/g, files.map(quote).join(" "))
    .replace(/\{regions\}/g, regions.map(quote).join(" "));

  try {
    const output = execSync(command, { cwd: root, stdio: "pipe", encoding: "utf-8" });
    return { gate, pass: true, output };
  } catch (err: unknown) {
    return { gate, pass: false, output: captureOutput(err) };
  }
}

export function runGates(
  gates: readonly Gate[],
  root: string,
  files: readonly string[],
  regions: readonly string[],
): GateResult | null {
  for (const gate of gates) {
    const result = runGate(gate, root, files, regions);
    if (!result.pass) return result;
  }
  return null;
}

function quote(value: string): string {
  return /[\s"']/.test(value) ? JSON.stringify(value) : value;
}

function captureOutput(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as { stdout?: unknown; stderr?: unknown; message?: string };
    const parts = [e.stdout, e.stderr]
      .map((part) => (part == null ? "" : String(part)))
      .filter((part) => part.trim() !== "");
    if (parts.length > 0) return parts.join("\n");
    if (e.message) return e.message;
  }
  return String(err);
}
