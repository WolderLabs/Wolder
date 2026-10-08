import { closeSync, existsSync, openSync, readSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import chokidar from "chokidar";
import { RECORD_DIR } from "@wolder/core";
import type { RunEvent } from "@wolder/core";
import { reloadProgram } from "./api.js";
import type { Store } from "./api.js";

export type Broadcast = (message: unknown) => void;

export interface WatchOptions {
  /** Replaces `reloadProgram`; for tests, which must not spawn the program. */
  reload?: (store: Store) => Promise<unknown>;
}

/** Events for one save arrive in a burst (unlink, add, change); reload once. */
const RELOAD_DEBOUNCE_MS = 100;
/** How often to look for a record directory that did not exist when watching began. */
const RECORD_POLL_MS = 1000;

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
 *
 * The program files are watched through their directories, not as files: an editor
 * or `git checkout` replaces a file rather than writing into it, and a watch held on
 * the old file never hears about the new one.
 */
export async function startWatching(
  store: Store,
  broadcast: Broadcast,
  options: WatchOptions = {},
): Promise<() => Promise<void>> {
  const reload = options.reload ?? reloadProgram;
  const closers: Array<() => Promise<void>> = [];
  let stopped = false;

  const currentFiles = (): string[] => store.program?.programFiles ?? [store.programPath];
  const isProgramFile = (path: string): boolean => {
    const target = resolve(path);
    return currentFiles().some((file) => resolve(file) === target);
  };

  const programWatcher = chokidar.watch([], { ignoreInitial: true, depth: 0 });
  const watchedDirs = new Set<string>();
  /** A reload can find new imports; their directories join the watch. */
  const watchProgramDirs = (): void => {
    for (const file of currentFiles()) {
      const dir = dirname(resolve(file));
      if (watchedDirs.has(dir)) continue;
      watchedDirs.add(dir);
      programWatcher.add(dir);
    }
  };
  watchProgramDirs();

  const offsets = new Map<string, number>();
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

  let recordWatching = false;
  /**
   * The root is unknown until the program assembles, and `.wolder/runs` does not
   * exist until the first run, so this is retried after each reload and on a poll.
   * Runs that exist when the inspector starts are history and are not replayed; a
   * directory that appears later holds a run in flight, sent from its first event.
   */
  const startRecordWatcher = (atStartup: boolean): void => {
    if (recordWatching || stopped || !store.root) return;
    const runsDir = join(store.root, RECORD_DIR, "runs");
    if (!existsSync(runsDir)) return;
    recordWatching = true;
    if (atStartup) {
      for (const name of readdirSync(runsDir)) {
        const file = join(runsDir, name, "events.jsonl");
        if (existsSync(file)) offsets.set(file, statSync(file).size);
      }
    }
    const recordWatcher = chokidar.watch(runsDir, { ignoreInitial: atStartup, depth: 2 });
    recordWatcher.on("add", pump).on("change", pump);
    closers.push(() => recordWatcher.close());
  };
  startRecordWatcher(true);
  const poll = setInterval(() => startRecordWatcher(false), RECORD_POLL_MS);
  poll.unref();
  closers.push(async () => clearInterval(poll));

  let reloading: Promise<void> = Promise.resolve();
  let timer: NodeJS.Timeout | undefined;
  const scheduleReload = (path: string): void => {
    if (!isProgramFile(path)) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      reloading = reloading.then(async () => {
        if (stopped) return;
        try {
          const graph = await reload(store);
          watchProgramDirs();
          startRecordWatcher(false);
          broadcast({ type: "graph", graph });
        } catch {
          // One failed reload must not end the chain; the next save tries again.
        }
      });
    }, RELOAD_DEBOUNCE_MS);
  };
  programWatcher.on("add", scheduleReload).on("change", scheduleReload).on("unlink", scheduleReload);
  closers.push(async () => {
    clearTimeout(timer);
    await programWatcher.close();
  });

  return async () => {
    stopped = true;
    await Promise.all(closers.map((close) => close()));
  };
}
