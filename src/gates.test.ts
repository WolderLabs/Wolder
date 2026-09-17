import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { runGate, runGates } from "./gates.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(resolve(tmpdir(), "wolder-gates-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const ok = { command: 'node -e "process.exit(0)"', name: "ok" };
const fails = { command: 'node -e "console.error(\'boom\'); process.exit(1)"', name: "fails" };

describe("runGate", () => {
  it("passes on a zero exit", () => {
    expect(runGate(ok, root, [], []).pass).toBe(true);
  });

  it("fails on a non-zero exit and captures the output", () => {
    const result = runGate(fails, root, [], []);
    expect(result.pass).toBe(false);
    expect(result.output).toContain("boom");
  });

  it("runs in the project root", () => {
    writeFileSync(resolve(root, "marker"), "x", "utf-8");
    const gate = {
      command: `node -e "process.exit(require('fs').existsSync('marker') ? 0 : 1)"`,
      name: "marker",
    };
    expect(runGate(gate, root, [], []).pass).toBe(true);
  });

  it("expands {files} and {regions}", () => {
    const gate = {
      command: `node -e "console.log(process.argv.slice(1).join('|'))" {files} {regions}`,
      name: "echo",
    };
    const result = runGate(gate, root, ["src/a.ts"], ["src/**"]);
    expect(result.output).toContain("src/a.ts|src/**");
  });

  it("quotes an expansion containing spaces", () => {
    const gate = {
      command: `node -e "console.log(process.argv.length - 1)" {files}`,
      name: "count",
    };
    expect(runGate(gate, root, ["a file.ts"], []).output.trim()).toBe("1");
  });

  it("reports a command that does not exist as a failure", () => {
    const result = runGate({ command: "definitely-not-a-command", name: "missing" }, root, [], []);
    expect(result.pass).toBe(false);
    expect(result.output.length).toBeGreaterThan(0);
  });
});

describe("runGates", () => {
  it("returns null when every gate passes", () => {
    expect(runGates([ok, ok], root, [], [])).toBeNull();
  });

  it("returns the first failure and stops there", () => {
    const failure = runGates([ok, fails, { ...fails, name: "second" }], root, [], []);
    expect(failure?.gate.name).toBe("fails");
  });

  it("passes trivially when there are no gates", () => {
    expect(runGates([], root, [], [])).toBeNull();
  });
});
