// Wire shapes, mirrored from @wolder/core and packages/inspector/src/api.ts.
// Duplicated on purpose: the UI bundle must not import server code.

export type Freshness = "fresh" | "stale" | "never";

export interface SerializedNode {
  id: string;
  label: string;
  regions: string[];
  goal: string;
  contexts: string[];
  layerContexts: string[];
  includedFiles: string[];
  gates: Array<{ name?: string; [key: string]: unknown }>;
  after: string[];
  asks: Array<{ targetId: string; [key: string]: unknown }>;
  provides?: string;
  chainHash: string;
}

export interface SerializedGraph {
  root: string;
  nodes: SerializedNode[];
  order: string[];
  contracts: Array<{ id: string; provider: string; requesters: string[] }>;
}

export interface GraphDiagnostic {
  message: string;
  agents: string[];
  regions?: string[];
  hint?: string;
}

export type GraphResult = (
  | { ok: true; graph: SerializedGraph }
  | { ok: false; diagnostic: GraphDiagnostic }
  | { ok: false; crash: string }
) & {
  programFiles: string[];
  freshness: Record<string, Freshness>;
  contractFreshness: Record<string, Freshness>;
  /** Why each node or contract would re-run; keyed by node id or contract id. */
  reasons: Record<string, string[]>;
};

export type EventKind =
  | "phase" | "note" | "warn" | "node:start" | "node:event" | "node:skipped" | "node:done"
  | "contract:settled" | "gate" | "snapshot" | "run:done" | "run:failed";

export interface RunEvent {
  seq: number;
  t: number;
  kind: EventKind;
  node?: string;
  contract?: string;
  data: unknown;
}

export interface RunMeta {
  id: string;
  root: string;
  startedAt: string;
  finishedAt?: string;
  status: "running" | "ok" | "failed";
  error?: string;
  graph: SerializedGraph | null;
}

export interface GateReport {
  name: string;
  command: string;
  pass: boolean;
  output: string;
  attempt: number;
}

export interface NodeInfo {
  prompts: Array<{ attempt: number; system: string; user: string }>;
  events: RunEvent[];
  gates: GateReport[];
  files: string[];
  inputHashes: Record<string, string>;
}

export interface ContractInfo {
  settled: {
    summary?: string;
    terms?: Array<{ name: string; detail: string }>;
    files?: string[];
    requesters?: string[];
    provider?: string;
  } | null;
  transcript: Array<{ speaker: string; text: string }>;
}

export type FileInfo = { content: string } | { skipped: true };

export interface SnapshotInfo {
  tree: Record<string, string>;
  seq: number;
}

export interface Selection {
  kind: "node" | "contract";
  id: string;
}
