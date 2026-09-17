import type { AgentNode } from "./types.js";
import type { AgentSpec, Registry } from "./program.js";
import { describe } from "./program.js";
import { GraphError } from "./errors.js";
import { regionsIntersect } from "./region.js";
import { hashLayer } from "./layer.js";
import { hashJson } from "./util.js";

export interface Graph {
  readonly nodes: readonly AgentNode[];
  readonly byId: ReadonlyMap<string, AgentNode>;
  /** Spec id → node id, for reading artifacts back off handles. */
  readonly specToNode: ReadonlyMap<string, string>;
  /** Node ids in dependency order on `uses` edges alone. */
  readonly order: readonly string[];
}

/**
 * Turn the declaration-time registry into a checked graph.
 *
 * Everything that can be wrong with a program is caught here — before a single
 * generation token is spent. That is the payoff of deferred execution: the whole
 * program is known, so the checks can be total.
 */
export function assembleGraph(registry: Registry): Graph {
  const specs = registry.nodes();
  if (specs.length === 0) {
    throw new GraphError(
      "This program declares no agents to run.\n" +
        "An agent becomes a node once it has an .act() instruction and nothing is derived from it.",
    );
  }

  const specToNode = new Map<string, string>();
  for (const spec of specs) {
    if (spec.regions.length === 0) {
      throw new GraphError(
        `${describe(spec)} has an .act() but no .canWrite() region, so there is nowhere for it ` +
          `to put its output. Give it a region it owns exclusively.`,
      );
    }
    specToNode.set(spec.id, nodeId(spec));
  }

  // Identical regions are the degenerate overlap, so this catches duplicate ids too.
  checkRegionOverlap(specs, specToNode);

  const byId = new Map<string, AgentNode>();
  const nodes: AgentNode[] = [];
  for (const spec of specs) {
    const id = specToNode.get(spec.id)!;
    const uses = spec.uses.map((targetSpecId) =>
      resolveEdge(registry, specToNode, targetSpecId, spec, "uses"),
    );
    const requests = spec.requests.map((edge) => ({
      targetId: resolveEdge(registry, specToNode, edge.targetId, spec, "requests"),
      ask: edge.ask,
    }));

    const node: AgentNode = {
      id,
      label: spec.provides ?? id,
      layer: spec.layer,
      regions: spec.regions,
      instruction: spec.instruction!,
      contexts: spec.contexts,
      uses,
      requests,
      provides: spec.provides,
      chainHash: chainHash(spec, specToNode),
    };
    byId.set(id, node);
    nodes.push(node);
  }

  // `.requests()` is compile-time constrained to providers, but a JS program can
  // still get here, and the check is cheap.
  for (const node of nodes) {
    for (const edge of node.requests) {
      const target = byId.get(edge.targetId)!;
      if (target.provides === undefined) {
        throw new GraphError(
          `${node.id} .requests() ${target.id}, which does not provide anything.\n` +
            `Add .provides("<label>") to it — you cannot ask an agent for a contract it ` +
            `never offered to hold up.`,
        );
      }
    }
  }

  const order = topologicalOrder(nodes);
  return { nodes, byId, specToNode, order };
}

/**
 * A node's id is its writable region. Regions are provably non-overlapping, so
 * this is unique — and it is stable when the program is reordered, which a
 * declaration counter would not be.
 */
function nodeId(spec: AgentSpec): string {
  return [...spec.regions].sort().join("+");
}

function checkRegionOverlap(
  specs: readonly AgentSpec[],
  specToNode: ReadonlyMap<string, string>,
): void {
  for (let i = 0; i < specs.length; i++) {
    for (let j = i + 1; j < specs.length; j++) {
      const a = specs[i]!;
      const b = specs[j]!;
      for (const ra of a.regions) {
        for (const rb of b.regions) {
          if (!regionsIntersect(ra, rb)) continue;
          throw new GraphError(
            `${describe(a)} (${specToNode.get(a.id)}) and ${describe(b)} ` +
              `(${specToNode.get(b.id)}) both claim to write "${ra}" and "${rb}", ` +
              `which overlap.\n` +
              `Each agent owns its region outright. What you probably want is for one of ` +
              `them to own that ground and the other to ask for what it needs:\n` +
              `  .requests(owner, "what you need from it")  — negotiates a contract first\n` +
              `  .uses(owner)                                — takes the owner's files as context\n` +
              `A broad region like canWrite("src/") is usually the culprit; narrow it.`,
          );
        }
      }
    }
  }
}

function resolveEdge(
  registry: Registry,
  specToNode: ReadonlyMap<string, string>,
  targetSpecId: string,
  from: AgentSpec,
  method: string,
): string {
  const resolved = specToNode.get(targetSpecId);
  if (resolved) return resolved;

  const target = registry.get(targetSpecId);
  const name = target ? describe(target) : `agent ${targetSpecId}`;
  if (target && registry.wasDerivedFrom(target.id)) {
    throw new GraphError(
      `${describe(from)} .${method}() an agent that was extended afterwards, so the value it ` +
        `points at is a template rather than a node.\n` +
        `Agents are immutable: every builder call returns a new value. Pass the value at the ` +
        `end of ${name}'s chain — the one you assigned to a variable — not an intermediate one.`,
    );
  }
  throw new GraphError(
    `${describe(from)} .${method}() ${name}, which never runs because it has no .act() instruction.`,
  );
}

/**
 * The cache key's structural half: the entire builder chain plus the layer it
 * spawned from, with edge targets written as node ids so reordering a program
 * does not invalidate it.
 */
function chainHash(spec: AgentSpec, specToNode: ReadonlyMap<string, string>): string {
  const chain = spec.chain.map((entry) => ({
    method: entry.method,
    args: entry.args.map((arg) => {
      if (arg && typeof arg === "object" && "target" in arg) {
        const { target, ...rest } = arg as { target: string };
        return { ...rest, target: specToNode.get(target) ?? target };
      }
      return arg;
    }),
  }));
  return hashJson({ chain, layer: hashLayer(spec.layer) });
}

/**
 * Order on `uses` edges only. Immutability means an edge can only point at a value
 * that already existed, so a cycle is very hard to express — but the check is cheap
 * and a self-reference or a hand-built graph would otherwise hang.
 *
 * A `requests` edge carries content, not sequence —
 * the contract phase is what removes the need to order it, and the content flows
 * both ways, so neither endpoint has to run first.
 */
export function topologicalOrder(nodes: readonly AgentNode[]): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const sorted: string[] = [];
  const done = new Set<string>();
  const onStack: string[] = [];
  const visiting = new Set<string>();

  function visit(id: string): void {
    if (done.has(id)) return;
    if (visiting.has(id)) {
      const cycle = [...onStack.slice(onStack.indexOf(id)), id];
      throw new GraphError(
        `Dependency cycle in .uses(): ${cycle.join(" -> ")}\n` +
          `A .uses() edge means "run that first, then give me its files". If these agents ` +
          `instead need to agree on something, use .requests() — a content edge that does ` +
          `not imply an order.`,
      );
    }
    visiting.add(id);
    onStack.push(id);
    for (const dep of byId.get(id)!.uses) visit(dep);
    onStack.pop();
    visiting.delete(id);
    done.add(id);
    sorted.push(id);
  }

  for (const node of nodes) visit(node.id);
  return sorted;
}
