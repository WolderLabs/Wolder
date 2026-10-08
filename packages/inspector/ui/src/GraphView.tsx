import dagre from "@dagrejs/dagre";
import { useCallback, useMemo, useRef, useState } from "react";
import { ContractDetail } from "./ContractDetail";
import { NodeDetail } from "./NodeDetail";
import { Split } from "./Split";
import type { SerializedGraph } from "./types";
import { useInspectorContext } from "./useInspector";

const NODE_W = 190;
const NODE_H = 54;
const CONTRACT = 26;

interface Placed {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Edge {
  key: string;
  points: Array<{ x: number; y: number }>;
  dashed: boolean;
}

function layout(graph: SerializedGraph, rankdir: "LR" | "TB"): { nodes: Placed[]; contracts: Placed[]; edges: Edge[]; width: number; height: number } {
  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({ rankdir, nodesep: 28, ranksep: rankdir === "LR" ? 70 : 48, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));
  const ids = new Set(graph.nodes.map((n) => n.id));
  for (const node of graph.nodes) g.setNode(node.id, { width: NODE_W, height: NODE_H });
  const contractIds = new Set<string>();
  for (const node of graph.nodes) {
    for (const dep of node.after) if (ids.has(dep)) g.setEdge(dep, node.id, { dashed: false }, `after:${dep}>${node.id}`);
  }
  // asks: requester -> contract -> provider, so the contract node sits at the midpoint.
  for (const contract of graph.contracts) {
    if (!ids.has(contract.provider)) continue;
    contractIds.add(contract.id);
    g.setNode(contract.id, { width: CONTRACT, height: CONTRACT });
    g.setEdge(contract.id, contract.provider, { dashed: true }, `c:${contract.id}>${contract.provider}`);
    for (const requester of contract.requesters) {
      if (ids.has(requester)) g.setEdge(requester, contract.id, { dashed: true }, `c:${requester}>${contract.id}`);
    }
  }
  dagre.layout(g);

  const place = (id: string): Placed => {
    const n = g.node(id);
    return { id, x: n.x, y: n.y, w: n.width, h: n.height };
  };
  const edges: Edge[] = g.edges().map((e) => ({
    key: e.name ?? `${e.v}>${e.w}`,
    points: g.edge(e).points,
    dashed: Boolean((g.edge(e) as { dashed?: boolean }).dashed),
  }));
  const meta = g.graph();
  return {
    nodes: graph.nodes.map((n) => place(n.id)),
    contracts: [...contractIds].map(place),
    edges,
    width: (meta.width ?? 400) + 20,
    height: (meta.height ?? 200) + 20,
  };
}

function path(points: Array<{ x: number; y: number }>): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
}

/** Below this pane width the graph flows top to bottom, so it scrolls one way instead of two. */
const VERTICAL_BELOW = 520;

/** The width of the element the returned ref is attached to. */
function useElementWidth(): [(el: HTMLElement | null) => void, number] {
  const [width, setWidth] = useState(Infinity);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: HTMLElement | null) => {
    observer.current?.disconnect();
    if (!el) return;
    observer.current = new ResizeObserver(([entry]) => entry && setWidth(entry.contentRect.width));
    observer.current.observe(el);
  }, []);
  return [ref, width];
}

export function GraphView() {
  const { graph, events, atSeq, at, selection, select } = useInspectorContext();

  // The graph to draw: the program's, or (when it did not assemble) the last run's.
  const drawn: SerializedGraph | null = graph?.ok && "graph" in graph ? graph.graph : null;
  const [scrollRef, width] = useElementWidth();
  const rankdir = width < VERTICAL_BELOW ? "TB" : "LR";
  const laid = useMemo(() => (drawn ? layout(drawn, rankdir) : null), [drawn, rankdir]);

  // Per-node activity up to the scrubber position.
  const activity = useMemo(() => {
    const info = new Map<string, { last: string; count: number }>();
    for (const e of events) {
      if (at !== "now" && e.seq > atSeq) break;
      if (!e.node) continue;
      const entry = info.get(e.node) ?? { last: "", count: 0 };
      if (e.kind === "node:event") entry.count++;
      entry.last = e.kind;
      info.set(e.node, entry);
    }
    return info;
  }, [events, at, atSeq]);

  if (!graph) return <div className="muted pad">loading graph...</div>;
  if (!drawn || !laid) {
    // Not assembled: all the wire gives us is the agents the diagnostic names.
    const agents = !graph.ok && "diagnostic" in graph ? graph.diagnostic.agents : [];
    return (
      <div className="pad">
        <div className="muted">The program does not assemble, so there is no full graph. Agents named by the error:</div>
        <div className="graph-fallback">
          {agents.map((a) => (
            <div key={a} className="node-box">{a}</div>
          ))}
        </div>
      </div>
    );
  }

  const placed = new Map([...laid.nodes, ...laid.contracts].map((p) => [p.id, p]));

  const canvas = (
    <div className="graph">
      <div className="graph-scroll" ref={scrollRef}>
        <svg width={laid.width} height={laid.height} className="graph-svg">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" className="arrow" />
            </marker>
          </defs>
          {laid.edges.map((e) => (
            <path
              key={e.key}
              d={path(e.points)}
              className={`edge ${e.dashed ? "asks" : "after"}`}
              markerEnd="url(#arrow)"
            />
          ))}
          {laid.contracts.map((c) => {
            const isSelected = selection?.kind === "contract" && selection.id === c.id;
            return (
              <g
                key={c.id}
                className={`contract-node ${graph.contractFreshness?.[c.id] ?? ""} ${isSelected ? "selected" : ""}`}
                transform={`translate(${c.x},${c.y})`}
                onClick={() => select({ kind: "contract", id: c.id })}
              >
                <title>{c.id}</title>
                <rect x={-c.w / 2} y={-c.h / 2} width={c.w} height={c.h} rx={4} transform="rotate(45)" />
                <text textAnchor="middle" dy="0.35em">
                  C
                </text>
              </g>
            );
          })}
          {drawn.nodes.map((node) => {
            const p = placed.get(node.id)!;
            const fresh = graph.freshness[node.id] ?? "never";
            const act = activity.get(node.id);
            const running = act?.last === "node:start" || (act?.last === "node:event" && !isDone(events, node.id, atSeq, at));
            const isSelected = selection?.kind === "node" && selection.id === node.id;
            return (
              <g
                key={node.id}
                className={`node ${fresh} ${running ? "running" : ""} ${isSelected ? "selected" : ""}`}
                transform={`translate(${p.x - p.w / 2},${p.y - p.h / 2})`}
                onClick={() => select({ kind: "node", id: node.id })}
              >
                <rect width={p.w} height={p.h} rx={8} />
                <text x={10} y={22} className="node-title">
                  {truncate(node.label || node.id, 24)}
                </text>
                <text x={10} y={40} className="node-sub">
                  {running && act ? `running · ${act.count} events` : truncate(node.regions.join(", "), 26)}
                </text>
                <title>{node.id}</title>
              </g>
            );
          })}
        </svg>
      </div>
      <Legend />
    </div>
  );
  const detail = selection?.kind === "node" ? <NodeDetail /> : selection?.kind === "contract" ? <ContractDetail /> : null;
  return <Split id="graph" main={canvas} detail={detail} />;
}

function isDone(events: ReturnType<typeof useInspectorContext>["events"], node: string, atSeq: number, at: unknown): boolean {
  return events.some((e) => e.node === node && (e.kind === "node:done" || e.kind === "node:skipped") && (at === "now" || e.seq <= atSeq));
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

function Legend() {
  return (
    <div className="legend muted">
      <span><span className="swatch fresh" /> fresh</span>
      <span><span className="swatch stale" /> stale</span>
      <span><span className="swatch never" /> never run</span>
      <span><span className="line-sample solid" /> after</span>
      <span><span className="line-sample dashed" /> asks (◇ contract)</span>
    </div>
  );
}
