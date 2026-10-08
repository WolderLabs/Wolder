import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { wolder } from "./wolder.js";
import { createSilentReporter } from "./reporter.js";
import { RECORD_DIR } from "./record.js";
import type { AgentRunner } from "./types.js";

const savedEnv = { ...process.env };
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(resolve(tmpdir(), "wolder-assemble-"));
});

afterEach(() => {
  process.env = { ...savedEnv };
  rmSync(dir, { recursive: true, force: true });
});

function countingRunner(): AgentRunner & { calls: number } {
  const runner = {
    calls: 0,
    async run() {
      runner.calls++;
      return { files: [], text: "" };
    },
  };
  return runner;
}

describe("assemble()", () => {
  it("reports an overlap as data, naming both agents and both regions", () => {
    const w = wolder({ root: dir, model: "m" });
    w.layer().agent().owns("src/").goal("one");
    w.layer().agent().owns("src/api/").goal("two");

    const outcome = w.assemble();
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.diagnostic.agents).toHaveLength(2);
    expect(outcome.diagnostic.regions).toHaveLength(2);
    expect(outcome.diagnostic.message).toMatch(/overlap/);
    expect(outcome.diagnostic.hint).toMatch(/asks/);
  });

  it("returns ok for a valid program", () => {
    const w = wolder({ root: dir, model: "m" });
    const a = w.layer().agent().owns("a.ts").goal("a");
    w.layer().agent().owns("b.ts").after(a).goal("b");
    expect(w.assemble().ok).toBe(true);
  });

  it("reports an empty program as a diagnostic rather than throwing", () => {
    const w = wolder({ root: dir, model: "m" });
    const outcome = w.assemble();
    expect(outcome.ok).toBe(false);
  });
});

describe("WOLDER_ASSEMBLE_ONLY", () => {
  it("writes the assembled graph, returns an empty result and runs nothing", async () => {
    const runner = countingRunner();
    const w = wolder({ root: dir, model: "m", services: { runner } });
    w.layer().agent().owns("a.ts").goal("a");

    const out = resolve(dir, "graph.json");
    process.env.WOLDER_ASSEMBLE_ONLY = "1";
    process.env.WOLDER_ASSEMBLE_OUT = out;

    const result = await w.run({ reporter: createSilentReporter() });
    expect(result).toEqual({ artifacts: [], contracts: [], skipped: [], durationMs: 0 });
    expect(runner.calls).toBe(0);

    const written = JSON.parse(readFileSync(out, "utf-8"));
    expect(written.ok).toBe(true);
    expect(written.graph.nodes).toHaveLength(1);
    expect(existsSync(resolve(dir, RECORD_DIR))).toBe(false);
    expect(existsSync(resolve(dir, "wolder.manifest.json"))).toBe(false);
  });

  it("writes a diagnostic for a broken program", async () => {
    const w = wolder({ root: dir, model: "m" });
    w.layer().agent().owns("src/").goal("one");
    w.layer().agent().owns("src/").goal("two");
    const out = resolve(dir, "graph.json");
    process.env.WOLDER_ASSEMBLE_ONLY = "1";
    process.env.WOLDER_ASSEMBLE_OUT = out;

    await w.run();
    expect(JSON.parse(readFileSync(out, "utf-8")).ok).toBe(false);
  });

  it("fails clearly when the output path is missing", async () => {
    const w = wolder({ root: dir, model: "m" });
    w.layer().agent().owns("a.ts").goal("a");
    process.env.WOLDER_ASSEMBLE_ONLY = "1";
    delete process.env.WOLDER_ASSEMBLE_OUT;
    await expect(w.run()).rejects.toThrow(/WOLDER_ASSEMBLE_OUT/);
  });
});

describe("WOLDER_FORCE", () => {
  it("regenerates fresh nodes when set", async () => {
    const runner = countingRunner();
    const make = () => {
      const w = wolder({ root: dir, model: "m", services: { runner } });
      w.layer().agent().owns("a.ts").goal("a");
      return w;
    };
    const quiet = { reporter: createSilentReporter() };
    await make().run(quiet);
    await make().run(quiet);
    expect(runner.calls).toBe(1); // the second run came from the manifest

    process.env.WOLDER_FORCE = "1";
    await make().run(quiet);
    expect(runner.calls).toBe(2);
  });
});

describe("WOLDER_PLAN", () => {
  it("writes the plan, returns an empty result and runs nothing", async () => {
    const runner = countingRunner();
    const w = wolder({ root: dir, model: "m", services: { runner } });
    w.layer().agent().owns("a.ts").goal("a");
    const out = resolve(dir, "plan.json");
    process.env.WOLDER_PLAN = "1";
    process.env.WOLDER_PLAN_OUT = out;

    const result = await w.run({ reporter: createSilentReporter() });
    expect(result).toEqual({ artifacts: [], contracts: [], skipped: [], durationMs: 0 });
    expect(runner.calls).toBe(0);
    const written = JSON.parse(readFileSync(out, "utf-8"));
    expect(written.ok).toBe(true);
    expect(written.plan.nodes["a.ts"].status).toBe("never");
    expect(existsSync(resolve(dir, RECORD_DIR))).toBe(false);
    expect(existsSync(resolve(dir, "wolder.manifest.json"))).toBe(false);
  });

  it("fails clearly when the output path is missing", async () => {
    const w = wolder({ root: dir, model: "m" });
    w.layer().agent().owns("a.ts").goal("a");
    process.env.WOLDER_PLAN = "1";
    delete process.env.WOLDER_PLAN_OUT;
    await expect(w.run()).rejects.toThrow(/WOLDER_PLAN_OUT/);
  });
});
