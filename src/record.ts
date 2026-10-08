import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, posix, relative, resolve, sep } from "node:path";
import type {
  AgentEvent,
  Contract,
  GateReport,
  NegotiationTurn,
  Reporter,
  RunResult,
} from "./types.js";
import type { SerializedGraph } from "./serialize.js";
import { sha256 } from "./util.js";

export const RECORD_DIR = ".wolder";

/** Files larger than this are recorded as skipped rather than stored. */
const MAX_BLOB_BYTES = 2 * 1024 * 1024;
const SKIPPED = "<skipped>";
const IGNORED_NAMES = new Set([RECORD_DIR, "node_modules", ".git", "wolder.manifest.json", ".env"]);

export interface RunEvent {
  /** 0-based, monotonic within a run. */
  readonly seq: number;
  /** Milliseconds since the run started. */
  readonly t: number;
  readonly kind:
    | "phase"
    | "note"
    | "warn"
    | "node:start"
    | "node:event"
    | "node:skipped"
    | "node:done"
    | "contract:settled"
    | "gate"
    | "snapshot"
    | "run:done"
    | "run:failed";
  readonly node?: string;
  readonly contract?: string;
  readonly data: unknown;
}

export interface RunMeta {
  /** ISO timestamp with ':' replaced by '-'. */
  readonly id: string;
  readonly root: string;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly status: "running" | "ok" | "failed";
  readonly error?: string;
  /** The serialised graph; null until the graph is assembled. */
  readonly graph: SerializedGraph | null;
}

export interface Recorder extends Reporter {
  readonly runDir: string;
}

/**
 * Node and contract ids contain `/`, `:`, `+` and `*`. None of them is safe as a
 * path segment on every platform, so every id goes through here first.
 */
export function safeDirName(id: string): string {
  return id.replace(/[^A-Za-z0-9._+-]/g, "_");
}

function isContractId(id: string): boolean {
  return id.startsWith("contract:");
}

/**
 * A `Reporter` that writes the run to `<root>/.wolder/runs/<id>/`. The record is
 * history, not state — freshness is the manifest's job — and an inspector bug must
 * never fail a generation run, so every filesystem write is fenced and reports
 * through the event log instead of throwing.
 */
export function createRecorder(root: string, options: { keepRuns?: number } = {}): Recorder {
  const keepRuns = options.keepRuns ?? 20;
  const recordRoot = resolve(root, RECORD_DIR);
  const runsDir = join(recordRoot, "runs");
  const objectsDir = join(recordRoot, "objects");
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const stamp = startedAt.replace(/:/g, "-");

  let id = stamp;
  let runDir = join(runsDir, id);
  for (let n = 1; existsSync(runDir); n++) {
    id = `${stamp}-${n}`;
    runDir = join(runsDir, id);
  }

  let seq = 0;
  let meta: RunMeta = { id, root, startedAt, status: "running", graph: null };
  const eventsPath = join(runDir, "events.jsonl");

  function guarded(action: () => void, what: string): void {
    try {
      action();
    } catch (err) {
      try {
        appendFileSync(
          eventsPath,
          JSON.stringify({
            seq: seq++,
            t: Date.now() - started,
            kind: "warn",
            data: `recorder could not ${what}: ${(err as Error).message}`,
          }) + "\n",
        );
      } catch {
        // Nowhere left to report to. The run goes on.
      }
    }
  }

  function append(kind: RunEvent["kind"], rest: Partial<RunEvent> & { data: unknown }): void {
    guarded(() => {
      const event: RunEvent = { seq: seq++, t: Date.now() - started, kind, ...rest };
      appendFileSync(eventsPath, JSON.stringify(event) + "\n");
    }, `append a ${kind} event`);
  }

  function writeMeta(): void {
    guarded(
      () => writeFileSync(join(runDir, "run.json"), JSON.stringify(meta, null, 2)),
      "write run.json",
    );
  }

  /** Attribute an id to the right field, so contracts and nodes do not blur. */
  const who = (target: string): { node?: string; contract?: string } =>
    isContractId(target) ? { contract: target } : { node: target };

  guarded(() => {
    mkdirSync(runDir, { recursive: true });
    mkdirSync(objectsDir, { recursive: true });
    writeFileSync(eventsPath, "");
  }, "create the run directory");
  writeMeta();
  guarded(() => writeFileSync(join(recordRoot, "latest"), id), "update latest");
  guarded(() => {
    const runs = readdirSync(runsDir).sort();
    for (const old of runs.slice(0, Math.max(0, runs.length - keepRuns))) {
      rmSync(join(runsDir, old), { recursive: true, force: true });
    }
  }, "prune old runs");

  function snapshot(node: string): void {
    guarded(() => {
      const tree: Record<string, string> = {};
      scanTree(root, (path, sha, content) => {
        tree[path] = sha;
        if (content === null) return;
        const blob = join(objectsDir, sha);
        if (!existsSync(blob)) writeFileSync(blob, content);
      });
      append("snapshot", { node, data: { tree } });
    }, "take a snapshot");
  }

  return {
    runDir,
    phase: (name) => append("phase", { data: name }),
    nodeStart: (target, detail) => append("node:start", { ...who(target), data: detail ?? null }),
    nodeEvent: (target, event: AgentEvent) =>
      append("node:event", { ...who(target), data: event }),
    nodeSkipped: (target, reason) => append("node:skipped", { ...who(target), data: reason }),
    nodeDone(target, files) {
      append("node:done", { node: target, data: { files } });
      snapshot(target);
    },
    note: (message) => append("note", { data: message }),
    warn: (message) => append("warn", { data: message }),
    nodePrompt(target, prompt) {
      const rel = posix.join("nodes", safeDirName(target), `prompt-${prompt.attempt}.md`);
      guarded(() => {
        mkdirSync(join(runDir, "nodes", safeDirName(target)), { recursive: true });
        writeFileSync(
          join(runDir, ...rel.split("/")),
          `# System\n\n${prompt.system}\n\n# User\n\n${prompt.user}\n`,
        );
      }, "write a prompt");
      append("note", { node: target, data: { prompt: rel } });
    },
    graphAssembled(graph) {
      meta = { ...meta, graph };
      writeMeta();
    },
    gate: (target, report: GateReport) => append("gate", { node: target, data: report }),
    contractSettled(contract: Contract, transcript: readonly NegotiationTurn[]) {
      guarded(() => {
        const dir = join(runDir, "contracts", safeDirName(contract.id));
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "transcript.json"), JSON.stringify(transcript, null, 2));
      }, "write a contract transcript");
      append("contract:settled", {
        contract: contract.id,
        data: {
          summary: contract.summary,
          terms: contract.terms,
          files: contract.files.map((f) => f.path),
          requesters: contract.requesters,
          provider: contract.provider,
        },
      });
    },
    summary(result: RunResult) {
      append("run:done", {
        data: {
          skipped: result.skipped,
          contracts: result.contracts.map((c) => c.id),
          durationMs: result.durationMs,
        },
      });
      meta = { ...meta, status: "ok", finishedAt: new Date().toISOString() };
      writeMeta();
    },
    failed(err) {
      append("run:failed", { data: { message: err.message, name: err.name } });
      meta = { ...meta, status: "failed", error: err.message, finishedAt: new Date().toISOString() };
      writeMeta();
    },
  };
}

const METHODS = [
  "phase",
  "nodeStart",
  "nodeEvent",
  "nodeSkipped",
  "nodeDone",
  "note",
  "warn",
  "summary",
  "nodePrompt",
  "gate",
  "failed",
  "contractSettled",
  "graphAssembled",
] as const;

/** Forward every call to every reporter, in order, skipping optional methods that are absent. */
export function composeReporters(...reporters: Reporter[]): Reporter {
  const composed: Record<string, (...args: unknown[]) => void> = {};
  for (const method of METHODS) {
    composed[method] = (...args: unknown[]) => {
      for (const reporter of reporters) {
        const fn = (reporter as unknown as Record<string, ((...a: unknown[]) => void) | undefined>)[
          method
        ];
        fn?.apply(reporter, args);
      }
    };
  }
  return composed as unknown as Reporter;
}

/** Recorded runs, newest first. */
export function listRuns(root: string): RunMeta[] {
  const runsDir = resolve(root, RECORD_DIR, "runs");
  if (!existsSync(runsDir)) return [];
  const runs: RunMeta[] = [];
  for (const name of readdirSync(runsDir)) {
    try {
      runs.push(JSON.parse(readFileSync(join(runsDir, name, "run.json"), "utf-8")) as RunMeta);
    } catch {
      // A half-written or hand-damaged run is not worth failing the listing for.
    }
  }
  return runs.sort((a, b) => b.id.localeCompare(a.id));
}

export function readEvents(runDir: string): RunEvent[] {
  const path = join(runDir, "events.jsonl");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as RunEvent);
}

/** `path -> sha256` for every recordable file under root, with forward-slash paths. */
export function snapshotTree(root: string): Record<string, string> {
  const tree: Record<string, string> = {};
  scanTree(root, (path, sha) => {
    tree[path] = sha;
  });
  return tree;
}

function scanTree(
  root: string,
  visit: (path: string, sha: string, content: Buffer | null) => void,
): void {
  const base = resolve(root);
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (IGNORED_NAMES.has(entry.name)) continue;
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      const path = relative(base, abs).split(sep).join("/");
      try {
        if (statSync(abs).size > MAX_BLOB_BYTES) {
          visit(path, SKIPPED, null);
          continue;
        }
        const content = readFileSync(abs);
        if (content.includes(0)) {
          visit(path, SKIPPED, null); // not UTF-8 text
          continue;
        }
        visit(path, sha256(content.toString("utf-8")), content);
      } catch {
        visit(path, SKIPPED, null);
      }
    }
  };
  walk(base);
}
