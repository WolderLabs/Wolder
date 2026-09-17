import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type {
  AgentNode,
  Artifact,
  BuildOptions,
  BuildResult,
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
import { RegionViolationError, GateError } from "./errors.js";
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

export interface BuildInputs {
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
export async function runBuild(
  inputs: BuildInputs,
  options: BuildOptions = {},
): Promise<BuildResult> {
  const started = Date.now();
  const reporter = options.reporter ?? createConsoleReporter();
  const { root, config, registry, services } = inputs;

  reporter.phase("Checking the graph");
  const graph = assembleGraph(registry);
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

  function run(id: string): Promise<Artifact> {
    const existing = running.get(id);
    if (existing) return existing;

    const promise = (async () => {
      const node = graph.byId.get(id)!;
      // Dependencies first. `requests` is a content edge and deliberately does not
      // appear here — the contract phase already removed the need to order it.
      await Promise.all(node.uses.map(run));
      const artifact = await executeNode(
        node,
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

  const result: BuildResult = {
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
  inputs: BuildInputs,
  manifest: ReturnType<typeof readManifest>,
  reporter: Reporter,
  options: BuildOptions,
): Promise<Contract[]> {
  const grouped = new Map<string, Array<{ node: AgentNode; ask: string }>>();
  for (const node of graph.nodes) {
    for (const edge of node.requests) {
      const list = grouped.get(edge.targetId) ?? [];
      list.push({ node, ask: edge.ask });
      grouped.set(edge.targetId, list);
    }
  }
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
  inputs: BuildInputs,
  manifest: ReturnType<typeof readManifest>,
  reporter: Reporter,
  options: BuildOptions,
): Promise<SettledContract> {
  const provider = graph.byId.get(providerId)!;
  const id = `contract:${providerId}`;
  const inputHash = hashJson({
    provider: provider.chainHash,
    model: inputs.model,
    requests: requests
      .map((r) => ({ id: r.node.id, chain: r.node.chainHash, ask: r.ask }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  });

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
      instruction: provider.instruction,
      regions: provider.regions,
    },
    requesters: requests.map((r) => ({
      id: r.node.id,
      label: r.node.provides ?? r.node.id,
      context: partyContext(r.node),
      instruction: r.node.instruction,
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
  inputs: BuildInputs,
  manifest: ReturnType<typeof readManifest>,
  contracts: readonly Contract[],
  artifacts: ReadonlyMap<string, Artifact>,
  reporter: Reporter,
  options: BuildOptions,
  skipped: string[],
): Promise<Artifact> {
  const { root, config, model, services } = inputs;
  const upstreamFiles = node.uses.flatMap((id) => artifacts.get(id)?.files ?? []);
  const inputHashes = computeInputHashes(node, inputs, contracts, artifacts);

  if (
    !options.force &&
    isFresh(manifest, node.id, inputHashes) &&
    isOutputFresh(manifest, node.id, root)
  ) {
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
    const result = await services.runner.run({
      nodeId: node.id,
      root,
      model,
      apiKey: config.apiKey || undefined,
      systemPrompt,
      prompt,
      regions: node.regions,
      maxTurns: config.maxTurns,
      onEvent: (event) => reporter.nodeEvent(node.id, event),
    });
    for (const file of result.files) written.add(file);

    const failure = runGates(gates, root, [...written], node.regions);
    if (!failure) break;

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
    dependsOn: [...node.uses],
  });

  reporter.nodeDone(node.id, files);
  return { kind: "artifact", id: node.id, outputHash, files, provides: node.provides };
}

/**
 * A node is keyed on its entire builder chain and layer (both folded into
 * `chainHash`), the contents of the files that layer includes, the output of
 * everything it `uses`, and every contract it is party to.
 */
function computeInputHashes(
  node: AgentNode,
  inputs: BuildInputs,
  contracts: readonly Contract[],
  artifacts: ReadonlyMap<string, Artifact>,
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
  for (const id of node.uses) {
    hashes[`uses:${id}`] = artifacts.get(id)?.outputHash ?? "<unbuilt>";
  }
  for (const contract of contracts) {
    hashes[contract.id] = contract.hash;
  }

  return hashes;
}

function countEdges(graph: Graph): number {
  return graph.nodes.reduce((sum, n) => sum + n.uses.length + n.requests.length, 0);
}
