import type { ContractInfo } from "./types";
import { useInspectorContext } from "./useInspector";
import { FreshnessNote } from "./FreshnessNote";

export function ContractDetail() {
  const { selection, graph, runId, select, api } = useInspectorContext();
  const id = selection?.kind === "contract" ? selection.id : null;
  const info = api<ContractInfo>("contract", id && runId ? { run: runId, id } : null);
  if (!id) return null;

  const settled = info.data?.settled;
  return (
    <aside className="detail">
      <div className="pane-head">
        <strong>Contract</strong>
        <span className="muted mono ellipsis">{id}</span>
        <button className="icon-btn" onClick={() => select(null)} aria-label="Close" title="Close">✕</button>
      </div>
      <div className="detail-body">
        <FreshnessNote id={id} status={graph?.ok ? graph.contractFreshness[id] : undefined} />
        {!runId && <div className="muted">No recorded run, so no negotiation to show.</div>}
        {info.error && <div className="banner error">{info.error}</div>}
        {info.loading && <div className="muted">loading...</div>}
        {info.data && !settled && <div className="muted">This contract was not settled in the selected run (it may have been cached).</div>}
        {settled && (
          <>
            <p>{settled.summary}</p>
            <div className="muted">
              {settled.provider} provides to {(settled.requesters ?? []).join(", ")}
            </div>
            <h4>Terms</h4>
            <table>
              <thead>
                <tr><th>Term</th><th>Detail</th></tr>
              </thead>
              <tbody>
                {(settled.terms ?? []).map((t) => (
                  <tr key={t.name}>
                    <td className="mono">{t.name}</td>
                    <td>{t.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(settled.files ?? []).length > 0 && <div className="muted">files: {settled.files!.join(", ")}</div>}
          </>
        )}
        {info.data && info.data.transcript.length > 0 && (
          <>
            <h4>Transcript</h4>
            <div className="transcript">
              {info.data.transcript.map((turn, i) => (
                <div key={i} className={`bubble ${i % 2 === 0 ? "left" : "right"}`}>
                  <div className="speaker">{turn.speaker}</div>
                  <div className="wrap">{turn.text}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
