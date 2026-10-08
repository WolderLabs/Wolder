import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { RECORD_DIR, isFresh, isOutputFresh, readManifest, safeDirName } from "@wolder/core";
import type { GateReport, NegotiationTurn, RunEvent, RunMeta } from "@wolder/core";
import { findProgramFiles, loadProgram, tsxCommand } from "./program.js";
import type { ProgramResult } from "./program.js";
import {
  eventsOf,
  insideRoot,
  metaOf,
  readBlob,
  readPrompts,
  runDirOf,
  runsOf,
  treeAt,
} from "./record.js";

export interface Store {
  readonly programPath: string;
  /** The last `loadProgram` result; null until the first load. */
  program: ProgramResult | null;
  /** The generated project root, or null when the program did not assemble. */
  root: string | null;
}

export function createStore(programPath: string): Store {
  return { programPath: resolve(programPath), program: null, root: null };
}

/** Re-assemble the program and refresh the store. */
export async function reloadProgram(store: Store): Promise<ProgramResult> {
  const result = await loadProgram(store.programPath);
  store.program = result;
  if (result.ok) store.root = result.graph.root;
  return result;
}

async function ensureLoaded(store: Store): Promise<ProgramResult> {
  return store.program ?? (await reloadProgram(store));
}

async function requireRoot(store: Store): Promise<string> {
  await ensureLoaded(store);
  if (!store.root) {
    throw new Error(
      "The program did not assemble, so there is no project root to read a record from. Fix the graph error shown by `graph` first.",
    );
  }
  return store.root;
}

export type Freshness = "fresh" | "stale" | "never";

type Params = Record<string, unknown>;

function str(params: Params, key: string): string {
  const value = params[key];
  if (typeof value !== "string") throw new Error(`Missing string parameter "${key}"`);
  return value;
}

function num(params: Params, key: string): number {
  const value = params[key];
  if (typeof value !== "number") throw new Error(`Parameter "${key}" must be a number`);
  return value;
}

export const handlers = {
  async "program.files"(store: Store) {
    const loaded = await ensureLoaded(store);
    return {
      files: loaded.programFiles.map((path) => ({ path, content: readFileSync(path, "utf-8") })),
    };
  },

  async graph(store: Store) {
    const loaded = await ensureLoaded(store);
    const freshness: Record<string, Freshness> = {};
    if (loaded.ok) {
      const manifest = readManifest(loaded.graph.root);
      for (const node of loaded.graph.nodes) {
        const recorded = manifest.nodes[node.id];
        if (!recorded) {
          freshness[node.id] = "never";
          continue;
        }
        // The chain hash is the part of the cache key computable without a run.
        // Upstream and contract hashes are not, so this can say "fresh" for a node
        // the next run would re-run because an upstream changed.
        const unchanged = isFresh(manifest, node.id, recorded.inputHashes);
        freshness[node.id] =
          unchanged &&
          recorded.inputHashes.chain === node.chainHash &&
          isOutputFresh(manifest, node.id, loaded.graph.root)
            ? "fresh"
            : "stale";
      }
    }
    return { ...loaded, freshness };
  },

  async runs(store: Store): Promise<RunMeta[]> {
    return runsOf(await requireRoot(store));
  },

  async run(store: Store, params: Params): Promise<{ meta: RunMeta; events: RunEvent[] }> {
    const root = await requireRoot(store);
    const id = str(params, "id");
    return { meta: metaOf(root, id), events: eventsOf(root, id) };
  },

  async node(store: Store, params: Params) {
    const root = await requireRoot(store);
    const run = str(params, "run");
    const id = str(params, "id");
    const events = eventsOf(root, run).filter((e) => e.node === id && e.kind !== "snapshot");
    const done = events.filter((e) => e.kind === "node:done").pop();
    const gates = events.filter((e) => e.kind === "gate").map((e) => e.data as GateReport);

    // inputHashes live in wolder.manifest.json, which only describes the latest run.
    // For older runs they were not recorded, so the UI should say so.
    let inputHashes: Record<string, string> = {};
    const latest = runsOf(root)[0];
    if (latest && latest.id === run) {
      inputHashes = readManifest(root).nodes[id]?.inputHashes ?? {};
    }

    return {
      prompts: readPrompts(runDirOf(root, run), id),
      events,
      gates,
      files: (done?.data as { files?: string[] } | undefined)?.files ?? [],
      inputHashes,
    };
  },

  async contract(store: Store, params: Params) {
    const root = await requireRoot(store);
    const run = str(params, "run");
    const id = str(params, "id");
    const settled =
      eventsOf(root, run).find((e) => e.kind === "contract:settled" && e.contract === id)?.data ??
      null;
    const file = join(runDirOf(root, run), "contracts", safeDirName(id), "transcript.json");
    const transcript = existsSync(file)
      ? (JSON.parse(readFileSync(file, "utf-8")) as NegotiationTurn[])
      : [];
    return { settled, transcript };
  },

  async snapshot(store: Store, params: Params) {
    const root = await requireRoot(store);
    return treeAt(eventsOf(root, str(params, "run")), num(params, "at"));
  },

  async file(store: Store, params: Params): Promise<{ content: string } | { skipped: true }> {
    const root = await requireRoot(store);
    const path = str(params, "path");
    if (params.at === "now") {
      const abs = insideRoot(root, path);
      if (!existsSync(abs)) throw new Error(`"${path}" does not exist on disk`);
      return { content: readFileSync(abs, "utf-8") };
    }
    const { tree } = treeAt(eventsOf(root, str(params, "run")), num(params, "at"));
    const sha = tree[path];
    if (!sha) throw new Error(`"${path}" is not in the snapshot at that point`);
    const content = sha === "<skipped>" ? null : readBlob(root, sha);
    return content === null ? { skipped: true } : { content };
  },

  async diff(store: Store, params: Params) {
    const root = await requireRoot(store);
    const events = eventsOf(root, str(params, "run"));
    const a = treeAt(events, num(params, "a")).tree;
    const b = treeAt(events, num(params, "b")).tree;
    return {
      added: Object.keys(b).filter((p) => !(p in a)).sort(),
      removed: Object.keys(a).filter((p) => !(p in b)).sort(),
      changed: Object.keys(b).filter((p) => p in a && a[p] !== b[p]).sort(),
    };
  },

  async "program.edit"(store: Store, params: Params) {
    const loaded = await ensureLoaded(store);
    const path = resolve(str(params, "path"));
    const allowed = new Set(
      [...loaded.programFiles, ...findProgramFiles(store.programPath)].map((p) => resolve(p)),
    );
    if (!allowed.has(path)) {
      throw new Error(
        `"${str(params, "path")}" is not one of the program files. Only ${[...allowed].join(", ")} can be edited here.`,
      );
    }
    writeFileSync(path, str(params, "content"), "utf-8");
    return { ok: true as const };
  },

  async "run.start"(store: Store, params: Params) {
    const root = await requireRoot(store);
    const before = new Set(runsOf(root).map((r) => r.id));
    const { command, args } = tsxCommand();
    const child = spawn(command, [...args, store.programPath], {
      cwd: dirname(store.programPath),
      env: { ...process.env, ...(params.force ? { WOLDER_FORCE: "1" } : {}) },
      stdio: "ignore",
      detached: true,
      windowsHide: true,
    });
    child.unref();
    // No IPC: the child creates the run directory, so wait for a new one to appear.
    for (let i = 0; i < 100; i++) {
      const fresh = runsOf(root).find((r) => !before.has(r.id));
      if (fresh) return { runId: fresh.id };
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(
      `The program was started but no run appeared under ${join(root, RECORD_DIR, "runs")} within 10 seconds. Run it by hand to see why.`,
    );
  },
};

export type HandlerName = keyof typeof handlers;

export function isHandlerName(name: string): name is HandlerName {
  return Object.prototype.hasOwnProperty.call(handlers, name);
}

export async function callHandler(
  store: Store,
  name: HandlerName,
  params: Params = {},
): Promise<unknown> {
  return (handlers[name] as (s: Store, p: Params) => unknown)(store, params);
}
