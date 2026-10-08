import { closeSync, existsSync, openSync, readSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import chokidar from "chokidar";
import { RECORD_DIR } from "@wolder/core";
import type { RunEvent } from "@wolder/core";
import { reloadProgram } from "./api.js";
import type { Store } from "./api.js";

export type Broadcast = (message: unknown) => void;

/** Read the bytes appended to a file since `offset`; returns whole lines only. */
function readAppended(path: string, offset: number): { lines: string[]; offset: number } {
  const size = statSync(path).size;
  if (size <= offset) return { lines: [], offset: size < offset ? 0 : offset };
  const buffer = Buffer.alloc(size - offset);
  const fd = openSync(path, "r");
  try {
    readSync(fd, buffer, 0, buffer.length, offset);
  } finally {
    closeSync(fd);
  }
  const text = buffer.toString("utf-8");
  const end = text.lastIndexOf("\n");
  if (end === -1) return { lines: [], offset };
  return {
    lines: text.slice(0, end).split("\n").filter((l) => l.trim() !== ""),
    offset: offset + Buffer.byteLength(text.slice(0, end + 1)),
  };
}

/**
 * Watch the program files (reload and push `graph`) and every run's `events.jsonl`
 * (push each new line as `event`). Returns a function that stops watching.
 */
export async function startWatching(store: Store, broadcast: Broadcast): Promise<() => Promise<void>> {
  const closers: Array<() => Promise<void>> = [];

  const programFiles = store.program?.programFiles ?? [store.programPath];
  const programWatcher = chokidar.watch(programFiles, { ignoreInitial: true });
  let reloading: Promise<unknown> = Promise.resolve();
  programWatcher.on("change", () => {
    reloading = reloading.then(async () => {
      const graph = await reloadProgram(store);
      broadcast({ type: "graph", graph });
    });
  });
  closers.push(() => programWatcher.close());

  if (store.root) {
    const runsDir = join(store.root, RECORD_DIR, "runs");
    const offsets = new Map<string, number>();
    if (existsSync(runsDir)) {
      for (const name of readdirSync(runsDir)) {
        const file = join(runsDir, name, "events.jsonl");
        if (existsSync(file)) offsets.set(file, statSync(file).size);
      }
    }
    const pump = (file: string): void => {
      if (basename(file) !== "events.jsonl") return;
      try {
        const { lines, offset } = readAppended(file, offsets.get(file) ?? 0);
        offsets.set(file, offset);
        const runId = basename(dirname(file));
        for (const line of lines) {
          broadcast({ type: "event", runId, event: JSON.parse(line) as RunEvent });
        }
      } catch {
        // A half-written line is picked up on the next change.
      }
    };
    const recordWatcher = chokidar.watch(runsDir, { ignoreInitial: true, depth: 2 });
    recordWatcher.on("add", pump).on("change", pump);
    closers.push(() => recordWatcher.close());
  }

  return async () => {
    await Promise.all(closers.map((close) => close()));
  };
}
