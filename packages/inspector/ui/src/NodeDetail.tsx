import type { ReactNode } from "react";
import type { NodeInfo, RunEvent, SerializedNode } from "./types";
import { useInspectorContext } from "./useInspector";
import { FreshnessNote } from "./FreshnessNote";

function Block({ title, children, open }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="block" open={open}>
      <summary>{title}</summary>
      <div className="block-body">{children}</div>
    </details>
  );
}

interface ContentBlock {
  type?: string;
  text?: string;
  name?: string;
  input?: unknown;
  content?: unknown;
  is_error?: boolean;
}

function contentOf(message: unknown): ContentBlock[] {
  const content = (message as { content?: unknown } | null)?.content;
  if (typeof content === "string") return [{ type: "text", text: content }];
  return Array.isArray(content) ? (content as ContentBlock[]) : [];
}

function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (typeof c === "string" ? c : ((c as { text?: string }).text ?? JSON.stringify(c))))
      .join("\n");
  }
  return JSON.stringify(content, null, 2);
}

function Turn({ event }: { event: RunEvent }) {
  const data = event.data as { kind?: string; role?: string; message?: unknown; text?: string; name?: string; detail?: string; reason?: string; attempt?: number; maxAttempts?: number };
  if (data.kind === "turn") {
    const blocks = contentOf(data.message);
    return (
      <div className={`turn ${data.role}`}>
        {blocks.map((b, i) => {
          if (b.type === "text") return <div key={i} className="turn-text">{b.text}</div>;
          if (b.type === "tool_use") {
            return (
              <div key={i} className="tool-call">
                <span className="tool-name">{b.name}</span>
                <pre>{JSON.stringify(b.input, null, 2)}</pre>
              </div>
            );
          }
          if (b.type === "tool_result") {
            const text = resultText(b.content);
            return (
              <details key={i} className={`tool-result ${b.is_error ? "error" : ""}`}>
                <summary>{b.is_error ? "tool error" : "tool result"} ({text.length} chars)</summary>
                <pre>{text}</pre>
              </details>
            );
          }
          return null;
        })}
      </div>
    );
  }
  if (data.kind === "denied") {
    return (
      <div className="event denied">
        denied {data.name}
        {data.detail ? ` ${data.detail}` : ""}: {data.reason}
      </div>
    );
  }
  if (data.kind === "retry") {
    return (
      <div className="event warn">
        API retry {data.attempt}/{data.maxAttempts}: {data.reason}
      </div>
    );
  }
  return null;
}

function Timeline({ events }: { events: RunEvent[] }) {
  const hasTurns = events.some((e) => (e.data as { kind?: string } | null)?.kind === "turn");
  return (
    <div className="timeline">
      {events.map((e) => {
        if (e.kind === "node:event") {
          const kind = (e.data as { kind?: string }).kind;
          // Turns carry the full conversation; text/tool lines would repeat them.
          if (hasTurns && (kind === "text" || kind === "tool")) return null;
          if (kind === "note") {
            return <div key={e.seq} className="event">{(e.data as { text?: string }).text}</div>;
          }
          if (kind === "text" || kind === "tool") {
            const d = e.data as { text?: string; name?: string; detail?: string };
            return <div key={e.seq} className="event muted">{d.text ?? `${d.name} ${d.detail ?? ""}`}</div>;
          }
          return <Turn key={e.seq} event={e} />;
        }
        return (
          <div key={e.seq} className={`event marker ${e.kind}`}>
            <span className="mono">#{e.seq}</span> {e.kind}
            {typeof e.data === "string" && e.data ? `: ${e.data}` : ""}
          </div>
        );
      })}
    </div>
  );
}

export function NodeDetail() {
  const { selection, graph, runId, runs, select, api } = useInspectorContext();
  const id = selection?.kind === "node" ? selection.id : null;
  const spec: SerializedNode | undefined =
    graph?.ok && "graph" in graph ? graph.graph.nodes.find((n) => n.id === id) : undefined;
  const info = api<NodeInfo>("node", id && runId ? { run: runId, id } : null);

  if (!id) return null;

  // "Changed since previous run": compare chain hashes recorded in each run.json.
  const idx = runs.findIndex((r) => r.id === runId);
  const thisHash = runs[idx]?.graph?.nodes.find((n) => n.id === id)?.chainHash;
  const prevRun = idx >= 0 ? runs[idx + 1] : undefined;
  const prevHash = prevRun?.graph?.nodes.find((n) => n.id === id)?.chainHash;
  const chainChanged = prevRun && thisHash && prevHash ? thisHash !== prevHash : null;

  return (
    <aside className="drawer">
      <div className="drawer-head">
        <strong>{spec?.label ?? id}</strong>
        <span className="muted mono"> {id}</span>
        <button onClick={() => select(null)} aria-label="Close">x</button>
      </div>
      <div className="drawer-body">
        <FreshnessNote id={id} status={graph?.ok ? graph.freshness[id] : undefined} />
        {spec && (
          <>
            <Block title="Goal" open>
              <pre className="wrap">{spec.goal.trim()}</pre>
            </Block>
            <Block title="Regions" open>
              <ul>{spec.regions.map((r) => <li key={r} className="mono">{r}</li>)}</ul>
              {spec.after.length > 0 && <div className="muted">after: {spec.after.join(", ")}</div>}
              {spec.asks.length > 0 && <div className="muted">asks: {spec.asks.map((a) => a.targetId).join(", ")}</div>}
            </Block>
            <Block title={`Context stack (${spec.layerContexts.length} layer, ${spec.contexts.length} own)`}>
              {spec.layerContexts.map((c, i) => (
                <details key={`l${i}`} className="block">
                  <summary>layer context {i + 1}</summary>
                  <pre className="wrap">{c.trim()}</pre>
                </details>
              ))}
              {spec.contexts.map((c, i) => (
                <details key={`o${i}`} className="block">
                  <summary>agent context {i + 1}</summary>
                  <pre className="wrap">{c.trim()}</pre>
                </details>
              ))}
              {spec.includedFiles.length > 0 && <div className="muted">includes: {spec.includedFiles.join(", ")}</div>}
            </Block>
          </>
        )}
        {!runId && <div className="muted">No recorded run, so there is no prompt or timeline to show.</div>}
        {info.error && <div className="banner error">{info.error}</div>}
        {info.loading && <div className="muted">loading...</div>}
        {info.data && (
          <>
            <Block title={`Prompts (${info.data.prompts.length} attempt${info.data.prompts.length === 1 ? "" : "s"})`}>
              {info.data.prompts.map((p) => (
                <details key={p.attempt} className="block">
                  <summary>attempt {p.attempt}</summary>
                  <div className="muted">system</div>
                  <pre className="wrap">{p.system}</pre>
                  <div className="muted">user</div>
                  <pre className="wrap">{p.user}</pre>
                </details>
              ))}
            </Block>
            <Block title={`Timeline (${info.data.events.length} events)`} open>
              <Timeline events={info.data.events} />
            </Block>
            <Block title={`Gates (${info.data.gates.length})`} open={info.data.gates.length > 0}>
              {info.data.gates.length === 0 && <div className="muted">No gate results in this run.</div>}
              {info.data.gates.map((g, i) => (
                <details key={i} className={`gate ${g.pass ? "pass" : "fail"}`}>
                  <summary>
                    {g.pass ? "pass" : "fail"} · {g.name} · attempt {g.attempt}
                  </summary>
                  <div className="mono muted">{g.command}</div>
                  <pre>{g.output}</pre>
                </details>
              ))}
            </Block>
            <Block title="Files written">
              {info.data.files.length === 0 ? <div className="muted">none</div> : <ul>{info.data.files.map((f) => <li key={f} className="mono">{f}</li>)}</ul>}
            </Block>
            <Block title="Cache inputs">
              {chainChanged === true && <div className="marker-changed">changed since previous run (agent chain hash differs)</div>}
              {chainChanged === false && <div className="muted">agent chain hash unchanged since previous run</div>}
              {chainChanged === null && <div className="muted">no previous run to compare with</div>}
              {Object.keys(info.data.inputHashes).length === 0 ? (
                <div className="muted">Input hashes are only kept for the latest run.</div>
              ) : (
                <table>
                  <tbody>
                    {Object.entries(info.data.inputHashes).map(([k, v]) => (
                      <tr key={k}>
                        <td>{k}</td>
                        <td className="mono">{String(v).slice(0, 16)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Block>
          </>
        )}
      </div>
    </aside>
  );
}
