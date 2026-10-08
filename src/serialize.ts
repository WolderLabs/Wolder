import type { AskEdge, Gate } from "./types.js";
import type { Graph } from "./graph.js";

export interface SerializedNode {
  id: string;
  label: string;
  regions: string[];
  goal: string;
  /** The agent's own context. */
  contexts: string[];
  /** Context inherited from its layer, in order. */
  layerContexts: string[];
  includedFiles: string[];
  gates: Gate[];
  after: string[];
  asks: AskEdge[];
  provides?: string;
  chainHash: string;
}

export interface SerializedGraph {
  root: string;
  nodes: SerializedNode[];
  order: string[];
  /** Derived from `asks`, grouped per provider exactly as the contract phase does. */
  contracts: Array<{ id: string; provider: string; requesters: string[] }>;
}

/** A pre-flight problem as data, so a UI can draw it rather than parse it. */
export interface GraphDiagnostic {
  message: string;
  /** Node ids or spec descriptions involved. */
  agents: string[];
  regions?: string[];
  /** The "what you probably want" paragraph. */
  hint?: string;
}

export function serializeGraph(graph: Graph, root: string): SerializedGraph {
  const requesters = new Map<string, string[]>();
  for (const node of graph.nodes) {
    for (const edge of node.asks) {
      const list = requesters.get(edge.targetId) ?? [];
      list.push(node.id);
      requesters.set(edge.targetId, list);
    }
  }

  return {
    root,
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      label: node.label,
      regions: [...node.regions],
      goal: node.goal,
      contexts: [...node.contexts],
      layerContexts: [...node.layer.contexts],
      includedFiles: [...node.layer.includedFiles],
      gates: node.layer.gates.map((g) => ({ ...g })),
      after: [...node.after],
      asks: node.asks.map((a) => ({ ...a })),
      provides: node.provides,
      chainHash: node.chainHash,
    })),
    order: [...graph.order],
    contracts: [...requesters]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([provider, list]) => ({
        id: `contract:${provider}`,
        provider,
        requesters: list,
      })),
  };
}
