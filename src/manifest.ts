import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Contract } from "./types.js";
import { sha256 } from "./util.js";

export const MANIFEST_VERSION = 2;
export const DEFAULT_MANIFEST_PATH = "wolder.manifest.json";

export interface ManifestNode {
  nodeId: string;
  /** Every structural and upstream input that feeds this node's cache key. */
  inputHashes: Record<string, string>;
  outputHash: string;
  /** Discovered after the run — the agent decides what it writes, so we record it. */
  files: string[];
  dependsOn: string[];
  lastRun: string;
}

/** A contract is a first-class artifact: recorded, inspectable, a cache input. */
export interface ManifestContract {
  id: string;
  provider: string;
  requesters: string[];
  label: string;
  /** Hash of the settled content — a cache input to every participant. */
  hash: string;
  /** Hash of what went into the negotiation — an unchanged contract must not re-settle. */
  inputHash: string;
  summary: string;
  terms: Array<{ name: string; detail: string }>;
  files: string[];
  lastRun: string;
}

export interface Manifest {
  version: number;
  nodes: Record<string, ManifestNode>;
  contracts: Record<string, ManifestContract>;
}

export function createEmptyManifest(): Manifest {
  return { version: MANIFEST_VERSION, nodes: {}, contracts: {} };
}

export function readManifest(root: string, manifestPath = DEFAULT_MANIFEST_PATH): Manifest {
  const abs = resolve(root, manifestPath);
  if (!existsSync(abs)) return createEmptyManifest();

  let parsed: Partial<Manifest>;
  try {
    parsed = JSON.parse(readFileSync(abs, "utf-8")) as Partial<Manifest>;
  } catch {
    return createEmptyManifest();
  }
  // A v1 manifest describes expectations and fixed scopes; none of that survives.
  if (parsed.version !== MANIFEST_VERSION) return createEmptyManifest();

  return {
    version: MANIFEST_VERSION,
    nodes: parsed.nodes ?? {},
    contracts: parsed.contracts ?? {},
  };
}

export function writeManifest(
  manifest: Manifest,
  root: string,
  manifestPath = DEFAULT_MANIFEST_PATH,
): void {
  writeFileSync(
    resolve(root, manifestPath),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf-8",
  );
}

/** Hash of a set of files as they currently sit on disk. Missing files hash as absent. */
export function hashFiles(files: readonly string[], root: string): string {
  const parts: string[] = [];
  for (const file of [...files].sort()) {
    const abs = resolve(root, file);
    parts.push(file, existsSync(abs) ? sha256(readFileSync(abs, "utf-8")) : "<missing>");
  }
  return sha256(parts.join("\0"));
}

export function computeCacheKey(inputHashes: Record<string, string>): string {
  const sorted = Object.keys(inputHashes).sort();
  return sha256(sorted.map((k) => `${k}=${inputHashes[k]}`).join("\0"));
}

export function isFresh(
  manifest: Manifest,
  nodeId: string,
  inputHashes: Record<string, string>,
): boolean {
  const existing = manifest.nodes[nodeId];
  if (!existing) return false;
  return computeCacheKey(existing.inputHashes) === computeCacheKey(inputHashes);
}

/** Have the files this node produced been deleted or hand-edited since? */
export function isOutputFresh(manifest: Manifest, nodeId: string, root: string): boolean {
  const node = manifest.nodes[nodeId];
  if (!node) return false;
  if (node.files.some((f) => !existsSync(resolve(root, f)))) return false;
  return hashFiles(node.files, root) === node.outputHash;
}

export function updateManifestNode(
  manifest: Manifest,
  nodeId: string,
  data: {
    inputHashes: Record<string, string>;
    outputHash: string;
    files: string[];
    dependsOn: string[];
  },
): void {
  manifest.nodes[nodeId] = {
    nodeId,
    inputHashes: data.inputHashes,
    outputHash: data.outputHash,
    files: data.files,
    dependsOn: data.dependsOn,
    lastRun: new Date().toISOString(),
  };
}

export function updateManifestContract(
  manifest: Manifest,
  contract: Contract,
  inputHash: string,
): void {
  manifest.contracts[contract.id] = {
    id: contract.id,
    provider: contract.provider,
    requesters: [...contract.requesters],
    label: contract.label,
    hash: contract.hash,
    inputHash,
    summary: contract.summary,
    terms: contract.terms.map((t) => ({ name: t.name, detail: t.detail })),
    files: contract.files.map((f) => f.path),
    lastRun: new Date().toISOString(),
  };
}

/** The contract settled last time for this provider, if any. */
export function cachedContract(
  manifest: Manifest,
  contractId: string,
): ManifestContract | undefined {
  return manifest.contracts[contractId];
}

/** Forget nodes and contracts that the current program no longer declares. */
export function pruneManifest(
  manifest: Manifest,
  liveNodeIds: readonly string[],
  liveContractIds: readonly string[],
): void {
  const nodes = new Set(liveNodeIds);
  const contracts = new Set(liveContractIds);
  for (const id of Object.keys(manifest.nodes)) {
    if (!nodes.has(id)) delete manifest.nodes[id];
  }
  for (const id of Object.keys(manifest.contracts)) {
    if (!contracts.has(id)) delete manifest.contracts[id];
  }
}

/** Node ids that depend, directly or transitively, on the given node. */
export function getDependents(manifest: Manifest, nodeId: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  function walk(id: string): void {
    for (const [candidate, node] of Object.entries(manifest.nodes)) {
      if (seen.has(candidate) || !node.dependsOn.includes(id)) continue;
      seen.add(candidate);
      found.push(candidate);
      walk(candidate);
    }
  }

  walk(nodeId);
  return found;
}
