import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendFileSync, mkdirSync, mkdtempSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RECORD_DIR } from "@wolder/core";
import { startWatching } from "./watch.js";
import type { Store } from "./api.js";

let dir: string;
let program: string;
let stop: (() => Promise<void>) | undefined;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "wolder-watch-"));
  program = join(dir, "wolder.program.ts");
  writeFileSync(program, "// v1\n");
});
afterEach(async () => {
  await stop?.();
  stop = undefined;
  rmSync(dir, { recursive: true, force: true });
});

function storeFor(root: string | null = null): Store {
  return { programPath: program, program: null, root };
}

async function until(condition: () => boolean, ms = 8000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("timed out waiting for the watcher");
    await new Promise((done) => setTimeout(done, 25));
  }
}

/** Chokidar needs a moment after `watch()` before it reports changes. */
const settle = (): Promise<void> => new Promise((done) => setTimeout(done, 400));

describe("startWatching", () => {
  it("reloads when a program file is written in place", async () => {
    let reloads = 0;
    const messages: unknown[] = [];
    stop = await startWatching(storeFor(), (m) => messages.push(m), { reload: async () => ++reloads });
    await settle();
    writeFileSync(program, "// v2\n");
    await until(() => messages.length === 1);
    expect(reloads).toBe(1);
    expect(messages[0]).toMatchObject({ type: "graph" });
  });

  it("reloads when a program file is replaced, as an editor or git checkout does", async () => {
    let reloads = 0;
    stop = await startWatching(storeFor(), () => {}, { reload: async () => ++reloads });
    await settle();
    const replacement = join(dir, "wolder.program.ts.tmp");
    writeFileSync(replacement, "// v2\n");
    renameSync(replacement, program);
    await until(() => reloads === 1);
    await settle();
    // The watch must survive the replacement, not die with the old file.
    writeFileSync(replacement, "// v3\n");
    renameSync(replacement, program);
    await until(() => reloads === 2);
  });

  it("reloads when a program file is deleted and written again", async () => {
    let reloads = 0;
    stop = await startWatching(storeFor(), () => {}, { reload: async () => ++reloads });
    await settle();
    unlinkSync(program);
    await until(() => reloads === 1);
    await settle();
    writeFileSync(program, "// back\n");
    await until(() => reloads === 2);
  });

  it("ignores neighbouring files that are not program files", async () => {
    let reloads = 0;
    stop = await startWatching(storeFor(), () => {}, { reload: async () => ++reloads });
    await settle();
    writeFileSync(join(dir, "notes.txt"), "not a program file\n");
    await settle();
    expect(reloads).toBe(0);
  });

  it("keeps reloading after a reload fails", async () => {
    let calls = 0;
    const reload = async (): Promise<number> => {
      calls += 1;
      if (calls === 1) throw new Error("the program crashed");
      return calls;
    };
    stop = await startWatching(storeFor(), () => {}, { reload });
    await settle();
    writeFileSync(program, "// v2\n");
    await until(() => calls === 1);
    await settle();
    writeFileSync(program, "// v3\n");
    await until(() => calls === 2);
  });

  it("starts watching a newly imported file after a reload finds it", async () => {
    const lib = join(dir, "lib", "shared.ts");
    mkdirSync(join(dir, "lib"));
    writeFileSync(lib, "// v1\n");
    let reloads = 0;
    const reload = async (store: Store): Promise<void> => {
      reloads += 1;
      store.program = { ok: false, crash: "", programFiles: [program, lib] };
    };
    stop = await startWatching(storeFor(), () => {}, { reload });
    await settle();
    writeFileSync(program, "// now imports ./lib/shared\n");
    await until(() => reloads === 1);
    await settle();
    writeFileSync(lib, "// v2\n");
    await until(() => reloads === 2);
  });

  it("streams events from a record directory that appears after watching began", async () => {
    const root = join(dir, "project");
    const messages: Array<{ type: string; runId?: string; event?: { seq: number } }> = [];
    stop = await startWatching(storeFor(root), (m) => messages.push(m as never));
    const runDir = join(root, RECORD_DIR, "runs", "run-1");
    mkdirSync(runDir, { recursive: true });
    const events = join(runDir, "events.jsonl");
    writeFileSync(events, `${JSON.stringify({ seq: 0, t: 0, kind: "phase", data: {} })}\n`);
    await until(() => messages.some((m) => m.event?.seq === 0));
    await settle();
    appendFileSync(events, `${JSON.stringify({ seq: 1, t: 1, kind: "note", data: {} })}\n`);
    await until(() => messages.some((m) => m.event?.seq === 1));
    expect(messages.filter((m) => m.type === "event").map((m) => m.runId)).toEqual(["run-1", "run-1"]);
  });
});
