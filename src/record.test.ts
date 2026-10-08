import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { wolder } from "./wolder.js";
import { createSilentReporter } from "./reporter.js";
import { createPermissionGuard } from "./runner.js";
import { clean } from "./commands.js";
import { GateError } from "./errors.js";
import {
  RECORD_DIR,
  composeReporters,
  listRuns,
  readEvents,
  safeDirName,
} from "./record.js";
import type { AgentRunner, AgentRunRequest, Negotiator, Reporter, WolderServices } from "./types.js";

type Plan = Record<string, Record<string, string>>;

/** Writes a planned set of files through the real permission guard. */
function fakeRunner(plan: Plan): AgentRunner & { calls: AgentRunRequest[] } {
  const calls: AgentRunRequest[] = [];
  return {
    calls,
    async run(request: AgentRunRequest) {
      calls.push(request);
      const guard = createPermissionGuard(request);
      for (const [path, content] of Object.entries(plan[request.nodeId] ?? {})) {
        if (guard.decide("Write", { file_path: path, content }).behavior === "deny") {
          throw new Error(`${request.nodeId} was refused ${path}`);
        }
        const abs = resolve(request.root, path);
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, content, "utf-8");
      }
      return { files: guard.written(), text: "done" };
    },
  };
}

let root: string;

beforeEach(() => {
  root = mkdtempSync(resolve(tmpdir(), "wolder-record-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const quiet = { reporter: createSilentReporter() };

function instance(services: Partial<WolderServices>, config = {}) {
  return wolder({ root, model: "test-model", config, services });
}

function latestRunDir(): string {
  const id = readFileSync(resolve(root, RECORD_DIR, "latest"), "utf-8");
  return resolve(root, RECORD_DIR, "runs", id);
}

function twoNodes(w: ReturnType<typeof instance>) {
  const a = w.layer().agent().owns("a.ts").goal("a");
  w.layer().agent().owns("b.ts").after(a).goal("b");
}

const PLAN: Plan = { "a.ts": { "a.ts": "export const a = 1;" }, "b.ts": { "b.ts": "export const b = 2;" } };

describe("the run record", () => {
  it("writes run.json with status ok and an event log from phase to run:done", async () => {
    const w = instance({ runner: fakeRunner(PLAN) });
    twoNodes(w);
    await w.run(quiet);

    const dir = latestRunDir();
    const meta = JSON.parse(readFileSync(resolve(dir, "run.json"), "utf-8"));
    expect(meta.status).toBe("ok");
    expect(meta.finishedAt).toBeDefined();

    const events = readEvents(dir);
    expect(events[0]!.kind).toBe("phase");
    expect(events.at(-1)!.kind).toBe("run:done");
  });

  it("numbers events contiguously from 0", async () => {
    const w = instance({ runner: fakeRunner(PLAN) });
    twoNodes(w);
    await w.run(quiet);

    const events = readEvents(latestRunDir());
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i));
  });

  it("keeps the prompt each node received, in both sections", async () => {
    const w = instance({ runner: fakeRunner(PLAN) });
    twoNodes(w);
    await w.run(quiet);

    for (const id of ["a.ts", "b.ts"]) {
      const prompt = readFileSync(
        resolve(latestRunDir(), "nodes", safeDirName(id), "prompt-1.md"),
        "utf-8",
      );
      expect(prompt).toContain("# System");
      expect(prompt).toContain("# User");
    }
  });

  it("records a failing gate and the retry prompt carrying its feedback", async () => {
    const marker = resolve(root, "gate-passes");
    let calls = 0;
    const runner: AgentRunner = {
      async run() {
        if (calls++ > 0) writeFileSync(marker, "ok", "utf-8");
        return { files: [], text: "" };
      },
    };
    const w = instance({ runner });
    w.layer()
      .gate(`node -e "process.exit(require('fs').existsSync('gate-passes') ? 0 : 1)"`, {
        name: "marker",
      })
      .agent()
      .owns("a.ts")
      .goal("a");
    await w.run(quiet);

    const dir = latestRunDir();
    const gates = readEvents(dir).filter((e) => e.kind === "gate");
    expect(gates.map((e) => (e.data as { pass: boolean }).pass)).toEqual([false, true]);
    expect(gates[0]!.data).toMatchObject({ name: "marker", attempt: 1 });

    const retry = readFileSync(resolve(dir, "nodes", safeDirName("a.ts"), "prompt-2.md"), "utf-8");
    const user = retry.slice(retry.indexOf("# User"));
    expect(user).toContain('The "marker" check failed');
  });

  it("snapshots after every node:done with blobs that match", async () => {
    const w = instance({ runner: fakeRunner(PLAN) });
    twoNodes(w);
    await w.run(quiet);

    const dir = latestRunDir();
    const events = readEvents(dir);
    const doneIndexes = events.flatMap((e, i) => (e.kind === "node:done" ? [i] : []));
    expect(doneIndexes).toHaveLength(2);
    for (const i of doneIndexes) expect(events[i + 1]!.kind).toBe("snapshot");

    const snapshots = events.filter((e) => e.kind === "snapshot");
    const first = (snapshots[0]!.data as { tree: Record<string, string> }).tree;
    const last = (snapshots[1]!.data as { tree: Record<string, string> }).tree;
    expect(Object.keys(first)).toContain("a.ts");
    expect(Object.keys(first)).not.toContain("b.ts");
    expect(Object.keys(last).sort()).toEqual(["a.ts", "b.ts"]);

    for (const [path, sha] of Object.entries(last)) {
      const blob = resolve(root, RECORD_DIR, "objects", sha);
      expect(readFileSync(blob, "utf-8")).toBe(readFileSync(resolve(root, path), "utf-8"));
    }
    expect(Object.keys(last).some((p) => p.startsWith(RECORD_DIR))).toBe(false);
  });

  it("still records a fully cached run, with skips and no snapshots", async () => {
    const w1 = instance({ runner: fakeRunner(PLAN) });
    twoNodes(w1);
    await w1.run(quiet);

    const w2 = instance({ runner: fakeRunner(PLAN) });
    twoNodes(w2);
    await w2.run(quiet);

    expect(listRuns(root)).toHaveLength(2);
    const events = readEvents(latestRunDir());
    expect(events.filter((e) => e.kind === "node:skipped")).toHaveLength(2);
    expect(events.some((e) => e.kind === "snapshot")).toBe(false);
  });

  it("keeps only the newest keepRuns runs and points latest at the newest", async () => {
    for (let i = 0; i < 3; i++) {
      const w = instance({ runner: fakeRunner(PLAN) }, { keepRuns: 2 });
      twoNodes(w);
      await w.run({ ...quiet, force: true });
    }
    const runs = readdirSync(resolve(root, RECORD_DIR, "runs")).sort();
    expect(runs).toHaveLength(2);
    expect(readFileSync(resolve(root, RECORD_DIR, "latest"), "utf-8")).toBe(runs.at(-1));
    expect(listRuns(root)[0]!.id).toBe(runs.at(-1));
  });

  it("marks the run failed when a gate gives up", async () => {
    const w = wolder({
      root,
      model: "test-model",
      config: { maxRetries: 1 },
      services: { runner: fakeRunner(PLAN) },
    });
    w.layer().gate('node -e "process.exit(1)"', { name: "never" }).agent().owns("a.ts").goal("a");
    await expect(w.run(quiet)).rejects.toThrow(GateError);

    const dir = latestRunDir();
    const meta = JSON.parse(readFileSync(resolve(dir, "run.json"), "utf-8"));
    expect(meta.status).toBe("failed");
    expect(meta.error).toContain("never");
    const last = readEvents(dir).at(-1)!;
    expect(last.kind).toBe("run:failed");
    expect(last.data).toMatchObject({ name: "GateError" });
  });

  it("persists a contract transcript and a contract:settled event", async () => {
    const transcript = [
      { speaker: "a", text: "I need X" },
      { speaker: "b", text: "Here is X" },
    ];
    const negotiator: Negotiator = {
      async negotiate() {
        return { summary: "agreed", terms: [{ name: "X", detail: "x" }], files: [], transcript };
      },
    };
    const w = instance({ runner: fakeRunner(PLAN), negotiator });
    const b = w.layer().agent().owns("b.ts").goal("b").provides("B");
    w.layer().agent().owns("a.ts").goal("a").asks(b, "give me X");
    await w.run(quiet);

    const dir = latestRunDir();
    const saved = JSON.parse(
      readFileSync(resolve(dir, "contracts", safeDirName("contract:b.ts"), "transcript.json"), "utf-8"),
    );
    expect(saved).toEqual(transcript);

    const settled = readEvents(dir).find((e) => e.kind === "contract:settled")!;
    expect(settled.contract).toBe("contract:b.ts");
    expect(settled.data).toMatchObject({ summary: "agreed", provider: "b.ts", requesters: ["a.ts"] });
  });

  it("does not record when record is false", async () => {
    const w = instance({ runner: fakeRunner(PLAN) });
    twoNodes(w);
    await w.run({ ...quiet, record: false });
    expect(existsSync(resolve(root, RECORD_DIR))).toBe(false);
  });
});

describe("composeReporters", () => {
  it("forwards every call and tolerates reporters without the optional methods", () => {
    const calls: string[] = [];
    const full: Reporter = {
      phase: (n) => calls.push(`phase:${n}`),
      nodeStart: () => {},
      nodeEvent: () => {},
      nodeSkipped: () => {},
      nodeDone: () => {},
      note: () => {},
      warn: () => {},
      summary: () => {},
      nodePrompt: (id) => calls.push(`prompt:${id}`),
      gate: (id) => calls.push(`gate:${id}`),
      failed: (e) => calls.push(`failed:${e.message}`),
    };
    const bare = createSilentReporter();
    const composed = composeReporters(bare, full);

    composed.phase("p");
    composed.nodePrompt?.("n", { system: "s", user: "u", attempt: 1 });
    composed.gate?.("n", { name: "g", command: "c", pass: true, output: "", attempt: 1 });
    composed.failed?.(new Error("boom"));

    expect(calls).toEqual(["phase:p", "prompt:n", "gate:n", "failed:boom"]);
    // Neither side throws when the other lacks the method.
    expect(() => composeReporters(bare).gate?.("n", {} as never)).not.toThrow();
  });
});

describe("wolder clean", () => {
  it("removes the .wolder directory", async () => {
    const w = instance({ runner: fakeRunner(PLAN) });
    twoNodes(w);
    await w.run(quiet);
    expect(existsSync(resolve(root, RECORD_DIR))).toBe(true);

    clean(root);
    expect(existsSync(resolve(root, RECORD_DIR))).toBe(false);
  });
});

describe("safeDirName", () => {
  it("makes ids safe as path segments", () => {
    expect(safeDirName("contract:src/services/**")).not.toMatch(/[:/*]/);
    expect(safeDirName("a+b")).toBe("a+b");
  });
});

