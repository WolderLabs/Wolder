import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type {
  AgentNode,
  Artifact,
  RunOptions,
  RunResult,
  Plan,
  PlanEntry,
  BoundaryOwner,
  Contract,
  ContractFile,
  Reporter,
  WolderConfig,
  WolderServices,
} from "./types.js";
import type { Registry } from "./program.js";
import { assembleGraph, type Graph } from "./graph.js";
import { buildGateFeedback, buildSystemPrompt, buildUserPrompt } from "./prompt.js";
import { runGates } from "./gates.js";
import { RegionViolationError, GateError, BoundaryRequestError } from "./errors.js";
import { findOwner } from "./boundary.js";
import { regionsMatch } from "./region.js";
import { hashJson, sha256 } from "./util.js";
import {
  hashFiles,
  isFresh,
  isOutputFresh,
  pruneManifest,
  readManifest,
  updateManifestContract,
  updateManifestNode,
  writeManifest,
} from "./manifest.js";
import { createConsoleReporter } from "./reporter.js";
import { serializeGraph } from "./serialize.js";
import { composeReporters, createRecorder } from "./record.js";

export interface RunInputs {
  readonly root: string;
  readonly model: string;
  readonly config: Required<WolderConfig>;
  readonly registry: Registry;
  readonly services: WolderServices;
}

/**
 * The one await in a program.
 *
 * Declaration order is not execution order, so everything happens here: the graph
 * is assembled and checked, contracts settle, then nodes run in dependency order
 * with independent ones in parallel.
 */
export async function runProgram(
  inputs: RunInputs,
  options: RunOptions = {},
): Promise<RunResult> {
  const { root, config } = inputs;
  // `WOLDER_FORCE=1` lets a parent process (the inspector) force a run it spawns.
  if (process.env.WOLDER_FORCE === "1" && options.force === undefined) {
    options = { ...options, force: true };
  }
  const base = options.reporter ?? createConsoleReporter();
  const reporter =
    options.record === false
      ? base
      : composeReporters(base, createRecorder(root, { keepRuns: config.keepRuns }));

  reporter.phase("Checking the graph");
  try {
    return await executeProgram(inputs, options, reporter);
  } catch (err) {
    reporter.failed?.(err instanceof Error ? err : new Error(String(err)));
    throw err;
  }
}

async function executeProgram(
  inputs: RunInputs,
  options: RunOptions,
  reporter: Reporter,
): Promise<RunResult> {
  const started = Date.now();
  const { root, config, registry, services } = inputs;

  const graph = assembleGraph(registry);
  reporter.graphAssembled?.(serializeGraph(graph, root));
  reporter.note(
    `${graph.nodes.length} agent(s), ${countEdges(graph)} edge(s) — boundaries and ` +
      `dependencies check out`,
  );

  const manifest = readManifest(root, config.manifestPath);

  const contracts = await settleContracts(graph, inputs, manifest, reporter, options);
  const contractsByNode = indexContracts(contracts);

  reporter.phase("Generating");
  const artifacts = new Map<string, Artifact>();
  const skipped: string[] = [];
  const running = new Map<string, Promise<Artifact>>();
  const owners: BoundaryOwner[] = graph.nodes.map((n) => ({
    id: n.id,
    goal: n.goal,
    regions: n.regions,
  }));

  function run(id: string): Promise<Artifact> {
    const existing = running.get(id);
    if (existing) return existing;

    const promise = (async () => {
      const node = graph.byId.get(id)!;
      // Dependencies first. `asks` is a content edge and deliberately does not
      // appear here — the contract phase already removed the need to order it.
      await Promise.all(node.after.map(run));
      const artifact = await executeNode(
        node,
        owners.filter((o) => o.id !== node.id),
        inputs,
        manifest,
        contractsByNode.get(node.id) ?? [],
        artifacts,
        reporter,
        options,
        skipped,
      );
      artifacts.set(node.id, artifact);
      return artifact;
    })();

    running.set(id, promise);
    // Sibling failures must not surface as unhandled rejections.
    promise.catch(() => {});
    return promise;
  }

  const settledRuns = await Promise.allSettled(graph.nodes.map((node) => run(node.id)));
  const failure = settledRuns.find((r) => r.status === "rejected");

  pruneManifest(
    manifest,
    graph.nodes.map((n) => n.id),
    contracts.map((c) => c.id),
  );
  writeManifest(manifest, root, config.manifestPath);

  if (failure && failure.status === "rejected") throw failure.reason;

  for (const [specId, nodeId] of graph.specToNode) {
    const artifact = artifacts.get(nodeId);
    if (artifact) registry.setArtifact(specId, artifact);
  }
  registry.markBuilt();

  const result: RunResult = {
    artifacts: graph.nodes.map((n) => artifacts.get(n.id)!),
    contracts,
    skipped,
    durationMs: Date.now() - started,
  };
  reporter.summary(result);
  return result;
}

/* ------------------------------------------------------------- contracts */

/**
 * Contracts settle in their own phase, after the graph checks and before any
 * generation, so the full set is known before the first file is written.
 *
 * Negotiation is grouped per provider, not per edge: one provider settling one
 * contract that covers every inbound request is the whole point of the README
 * case, and pairwise bargaining would produce conflicting agreements about one file.
 */
async function settleContracts(
  graph: Graph,
  inputs: RunInputs,
  manifest: ReturnType<typeof readManifest>,
  reporter: Reporter,
  options: RunOptions,
): Promise<Contract[]> {
  const grouped = groupAsks(graph);
  if (grouped.size === 0) return [];

  reporter.phase("Settling contracts");

  // Negotiations are independent of one another, so they run together. Settling them
  // one at a time made the contract phase as slow as the sum of its exchanges.
  const settled = await Promise.all(
    [...grouped]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([providerId, requests]) =>
        settleOne(providerId, requests, graph, inputs, manifest, reporter, options),
      ),
  );

  // Writing happens after every negotiation resolves, so a contract file cannot land
  // in a region while another negotiation is still deciding what belongs there.
  const contracts: Contract[] = [];
  for (const { contract, inputHash, fresh } of settled) {
    if (fresh) {
      const provider = graph.byId.get(contract.provider)!;
      writeContractFiles(contract, provider, inputs.root);
      if (contract.files.length > 0) {
        reporter.note(
          `  ${contract.files.length} contract file(s) written into ${provider.id}'s region`,
        );
      }
      updateManifestContract(manifest, contract, inputHash);
    }
    contracts.push(contract);
  }

  return contracts;
}

type AskRequests = Array<{ node: AgentNode; ask: string }>;

/** `asks` edges grouped per provider — one contract per provider, shared by plan and run. */
function groupAsks(graph: Graph): Map<string, AskRequests> {
  const grouped = new Map<string, AskRequests>();
  for (const node of graph.nodes) {
    for (const edge of node.asks) {
      const list = grouped.get(edge.targetId) ?? [];
      list.push({ node, ask: edge.ask });
      grouped.set(edge.targetId, list);
    }
  }
  return grouped;
}

/** What went into a negotiation. An unchanged hash means the contract need not re-settle. */
function contractInputHash(provider: AgentNode, requests: AskRequests, model: string): string {
  return hashJson({
    provider: provider.chainHash,
    model,
    requests: requests
      .map((r) => ({ id: r.node.id, chain: r.node.chainHash, ask: r.ask }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  });
}

interface SettledContract {
  readonly contract: Contract;
  readonly inputHash: string;
  /** False when it came back from the manifest unchanged. */
  readonly fresh: boolean;
}

async function settleOne(
  providerId: string,
  requests: Array<{ node: AgentNode; ask: string }>,
  graph: Graph,
  inputs: RunInputs,
  manifest: ReturnType<typeof readManifest>,
  reporter: Reporter,
  options: RunOptions,
): Promise<SettledContract> {
  const provider = graph.byId.get(providerId)!;
  const id = `contract:${providerId}`;
  const inputHash = contractInputHash(provider, requests, inputs.model);

  const cached = manifest.contracts[id];
  if (!options.force && cached?.inputHash === inputHash) {
    const restored = restoreContract(cached, inputs.root);
    if (restored) {
      reporter.nodeSkipped(id, "unchanged — reusing the settled contract");
      return { contract: restored, inputHash, fresh: false };
    }
  }

  reporter.nodeStart(
    id,
    `${provider.label} <-> ${requests.map((r) => r.node.id).join(", ")}`,
  );

  const outcome = await inputs.services.negotiator.negotiate({
    provider: {
      id: provider.id,
      label: provider.provides ?? provider.id,
      context: partyContext(provider),
      instruction: provider.goal,
      regions: provider.regions,
    },
    requesters: requests.map((r) => ({
      id: r.node.id,
      label: r.node.provides ?? r.node.id,
      context: partyContext(r.node),
      instruction: r.node.goal,
      regions: r.node.regions,
      ask: r.ask,
    })),
    maxRounds: inputs.config.negotiationRounds,
    model: inputs.model,
    apiKey: inputs.config.apiKey || undefined,
    onEvent: (event) => reporter.nodeEvent(id, event),
  });

  const contract: Contract = {
    id,
    provider: provider.id,
    label: provider.provides ?? provider.id,
    requesters: requests.map((r) => r.node.id),
    summary: outcome.summary,
    terms: outcome.terms,
    files: outcome.files,
    hash: hashJson({
      label: provider.provides,
      summary: outcome.summary,
      terms: outcome.terms,
      files: outcome.files,
    }),
  };

  reporter.contractSettled?.(contract, outcome.transcript);
  return { contract, inputHash, fresh: true };
}

function writeContractFiles(contract: Contract, provider: AgentNode, root: string): void {
  for (const file of contract.files) {
    if (!regionsMatch(provider.regions, file.path)) {
      throw new RegionViolationError(provider.id, file.path, provider.regions);
    }
    const abs = resolve(root, file.path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, file.content, "utf-8");
  }
}

function restoreContract(
  cached: NonNullable<ReturnType<typeof readManifest>["contracts"][string]>,
  root: string,
): Contract | null {
  const files: ContractFile[] = [];
  for (const path of cached.files) {
    const abs = resolve(root, path);
    if (!existsSync(abs)) return null; // a contract file was deleted — settle again
    files.push({ path, content: readFileSync(abs, "utf-8") });
  }
  return {
    id: cached.id,
    provider: cached.provider,
    label: cached.label,
    requesters: cached.requesters,
    summary: cached.summary,
    terms: cached.terms,
    files,
    hash: cached.hash,
  };
}

function indexContracts(contracts: readonly Contract[]): Map<string, Contract[]> {
  const index = new Map<string, Contract[]>();
  for (const contract of contracts) {
    for (const participant of [contract.provider, ...contract.requesters]) {
      const list = index.get(participant) ?? [];
      if (!list.includes(contract)) list.push(contract);
      index.set(participant, list);
    }
  }
  return index;
}

function partyContext(node: AgentNode): string {
  return [...node.layer.contexts, ...node.contexts].join("\n\n");
}

/* ------------------------------------------------------------- execution */

async function executeNode(
  node: AgentNode,
  otherOwners: readonly BoundaryOwner[],
  inputs: RunInputs,
  manifest: ReturnType<typeof readManifest>,
  contracts: readonly Contract[],
  artifacts: ReadonlyMap<string, Artifact>,
  reporter: Reporter,
  options: RunOptions,
  skipped: string[],
): Promise<Artifact> {
  const { root, config, model, services } = inputs;
  const upstreamFiles = node.after.flatMap((id) => artifacts.get(id)?.files ?? []);
  const inputHashes = computeInputHashes(
    node,
    inputs,
    contracts,
    (id) => artifacts.get(id)?.outputHash,
  );

  if (!options.force && isNodeFresh(manifest, node.id, inputHashes, root)) {
    const cached = manifest.nodes[node.id]!;
    reporter.nodeSkipped(node.id, "unchanged — nothing to do");
    skipped.push(node.id);
    return {
      kind: "artifact",
      id: node.id,
      outputHash: cached.outputHash,
      files: cached.files,
      provides: node.provides,
    };
  }

  reporter.nodeStart(node.id, node.provides ? `provides "${node.provides}"` : undefined);

  const gates = node.layer.gates;
  const basePrompt = buildUserPrompt({ node, root, upstreamFiles, contracts, gates });
  const systemPrompt = buildSystemPrompt(node);

  // Contract files are already on disk in this node's region, and are part of what
  // it produced — they must not read as drift on the next run.
  const written = new Set<string>(
    contracts
      .filter((c) => c.provider === node.id)
      .flatMap((c) => c.files.map((f) => f.path)),
  );

  let prompt = basePrompt;
  for (let attempt = 1; ; attempt++) {
    reporter.nodePrompt?.(node.id, { system: systemPrompt, user: prompt, attempt });
    const result = await services.runner.run({
      nodeId: node.id,
      root,
      model,
      apiKey: config.apiKey || undefined,
      systemPrompt,
      prompt,
      regions: node.regions,
      maxTurns: config.maxTurns,
      owners: otherOwners,
      onEvent: (event) => reporter.nodeEvent(node.id, event),
    });
    // A request for a path outside the agent's regions is never granted. It ends the
    // node and the run, like a gate that will not pass — before anything is recorded.
    if (result.boundaryRequest) {
      const { path, reason } = result.boundaryRequest;
      throw new BoundaryRequestError(
        node.id,
        path,
        reason,
        node.regions,
        findOwner(otherOwners, path),
      );
    }
    for (const file of result.files) written.add(file);

    const results = runGates(gates, root, [...written], node.regions);
    results.forEach((r) =>
      reporter.gate?.(node.id, {
        name: r.gate.name,
        command: r.gate.command,
        pass: r.pass,
        output: r.output,
        attempt,
      }),
    );
    const failed = results.find((r) => !r.pass);
    if (!failed) break;
    const failure = failed;

    if (attempt >= config.maxRetries) {
      throw new GateError(node.id, failure.gate.name, failure.output, attempt);
    }
    reporter.warn(
      `${node.id} failed the "${failure.gate.name}" gate — attempt ${attempt + 1}/${config.maxRetries}`,
    );
    prompt = `${basePrompt}\n\n${buildGateFeedback(failure.gate, failure.output)}`;
  }

  const files = [...written].sort();
  if (files.length === 0) {
    reporter.warn(`${node.id} finished without writing any files`);
  }

  const outputHash = hashFiles(files, root);
  updateManifestNode(manifest, node.id, {
    inputHashes,
    outputHash,
    files,
    dependsOn: [...node.after],
  });

  reporter.nodeDone(node.id, files);
  return { kind: "artifact", id: node.id, outputHash, files, provides: node.provides };
}

/**
 * A node is keyed on its entire builder chain and layer (both folded into
 * `chainHash`), the contents of the files that layer includes, the output of
 * everything it runs `after`, and every contract it is party to.
 */
function computeInputHashes(
  node: AgentNode,
  inputs: RunInputs,
  contracts: ReadonlyArray<{ id: string; hash: string }>,
  outputHashOf: (id: string) => string | undefined,
): Record<string, string> {
  const hashes: Record<string, string> = {
    chain: node.chainHash,
    model: inputs.model,
  };

  for (const path of node.layer.includedFiles) {
    const abs = resolve(inputs.root, path);
    hashes[`include:${path}`] = existsSync(abs)
      ? sha256(readFileSync(abs, "utf-8"))
      : "<missing>";
  }
  for (const id of node.after) {
    hashes[`after:${id}`] = outputHashOf(id) ?? "<unbuilt>";
  }
  for (const contract of contracts) {
    hashes[contract.id] = contract.hash;
  }

  return hashes;
}

/** The one freshness test: same cache key, and the files it wrote untouched. */
function isNodeFresh(
  manifest: ReturnType<typeof readManifest>,
  id: string,
  inputHashes: Record<string, string>,
  root: string,
): boolean {
  return isFresh(manifest, id, inputHashes) && isOutputFresh(manifest, id, root);
}

function countEdges(graph: Graph): number {
  return graph.nodes.reduce((sum, n) => sum + n.after.length + n.asks.length, 0);
}

/* ------------------------------------------------------------------ plan */

/**
 * Dry run: what would `run` do, and why? Walks the graph in dependency order and
 * computes every cache key through the same functions a real run uses, then compares
 * against the manifest. It never calls the runner or the negotiator, never writes a
 * file, and never creates a recorder.
 *
 * A fresh upstream means its files on disk are current, so downstream keys are exact.
 * A stale upstream or contract makes everything that depends on it stale: its new
 * output is unknowable without running it. (A real run may still skip such a node if
 * the regenerated output happens to be identical, so "stale" is an upper bound there.)
 */
export function planGraph(graph: Graph, inputs: RunInputs, options: RunOptions = {}): Plan {
  const { root, config } = inputs;
  const force = options.force ?? process.env.WOLDER_FORCE === "1";
  const manifest = readManifest(root, config.manifestPath);

  const contractEntries: Record<string, PlanEntry> = {};
  const contractHash = new Map<string, string>(); // fresh contracts only
  const contractsOf = new Map<string, string[]>();

  const grouped = [...groupAsks(graph)].sort(([a], [b]) => a.localeCompare(b));
  for (const [providerId, requests] of grouped) {
    const provider = graph.byId.get(providerId)!;
    const id = `contract:${providerId}`;
    const cached = manifest.contracts[id];
    let entry: PlanEntry;
    if (force) {
      entry = { status: "stale", reasons: ["forced"] };
    } else if (!cached) {
      entry = { status: "never", reasons: ["never settled"] };
    } else if (cached.inputHash !== contractInputHash(provider, requests, inputs.model)) {
      entry = {
        status: "stale",
        reasons: [
          `${providerId} or an agent asking it changed (goal, context, layer, ask or model), ` +
            `so ${id} must be renegotiated`,
        ],
      };
    } else if (!restoreContract(cached, root)) {
      entry = {
        status: "stale",
        reasons: [`a file of ${id} was deleted, so it must be renegotiated`],
      };
    } else {
      entry = { status: "fresh", reasons: [] };
      contractHash.set(id, cached.hash);
    }
    contractEntries[id] = entry;
    for (const party of [providerId, ...requests.map((r) => r.node.id)]) {
      const list = contractsOf.get(party) ?? [];
      if (!list.includes(id)) list.push(id);
      contractsOf.set(party, list);
    }
  }

  const nodeEntries: Record<string, PlanEntry> = {};
  const outputHash = new Map<string, string>(); // fresh nodes only

  for (const nodeId of graph.order) {
    const node = graph.byId.get(nodeId)!;
    const recorded = manifest.nodes[nodeId];
    const myContracts = contractsOf.get(nodeId) ?? [];

    if (force) {
      nodeEntries[nodeId] = { status: "stale", reasons: ["forced"] };
      continue;
    }
    if (!recorded) {
      nodeEntries[nodeId] = { status: "never", reasons: ["never run"] };
      continue;
    }

    const reasons: string[] = [];
    const staleUpstream = node.after.filter((id) => !outputHash.has(id));
    const staleContracts = myContracts.filter((id) => !contractHash.has(id));
    for (const id of staleUpstream) reasons.push(`upstream \`${id}\` is stale`);
    for (const id of staleContracts) {
      reasons.push(`contract \`${id}\` must be renegotiated`);
    }

    const current = computeInputHashes(
      node,
      inputs,
      myContracts
        .filter((id) => contractHash.has(id))
        .map((id) => ({ id, hash: contractHash.get(id)! })),
      (id) => outputHash.get(id),
    );
    // Keys that depend on something stale cannot be compared: their value is unknown.
    const unknown = (key: string): boolean =>
      (key.startsWith("after:") && staleUpstream.includes(key.slice(6))) ||
      staleContracts.includes(key);
    const keys = new Set([...Object.keys(recorded.inputHashes), ...Object.keys(current)]);
    for (const key of [...keys].sort()) {
      if (unknown(key) || recorded.inputHashes[key] === current[key]) continue;
      reasons.push(describeChange(key, key in recorded.inputHashes, key in current));
    }
    if (!isOutputFresh(manifest, nodeId, root)) {
      reasons.push("generated files were edited or deleted since the last run");
    }

    if (reasons.length === 0) {
      nodeEntries[nodeId] = { status: "fresh", reasons: [] };
      outputHash.set(nodeId, recorded.outputHash);
    } else {
      nodeEntries[nodeId] = { status: "stale", reasons };
    }
  }

  return { nodes: nodeEntries, contracts: contractEntries };
}

function describeChange(key: string, was: boolean, now: boolean): string {
  if (key === "chain") return "goal, context or layer changed";
  if (key === "model") return "model changed";
  if (key.startsWith("include:")) return `${key.slice(8)} changed`;
  if (key.startsWith("after:")) {
    const id = key.slice(6);
    if (!now) return `no longer runs after \`${id}\``;
    if (!was) return `now runs after \`${id}\``;
    return `upstream \`${id}\` produced different output`;
  }
  if (!now) return `no longer party to \`${key}\``;
  if (!was) return `now party to \`${key}\``;
  return `contract \`${key}\` was settled differently`;
}
