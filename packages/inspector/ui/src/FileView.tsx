import { useMemo } from "react";
import { diffRows } from "./highlight";
import type { FileInfo, SnapshotInfo } from "./types";
import { useInspectorContext } from "./useInspector";

export function FileView({ path }: { path: string }) {
  const { runId, at, atSeq, setOpenFile, api } = useInspectorContext();

  const snap = api<SnapshotInfo>("snapshot", runId ? { run: runId, at: atSeq } : null);
  const prevSeq = snap.data && snap.data.seq > 0 ? snap.data.seq - 1 : null;
  const prevSnap = api<SnapshotInfo>("snapshot", runId && prevSeq !== null ? { run: runId, at: prevSeq } : null);

  const inNow = snap.data ? path in snap.data.tree : false;
  const inPrev = prevSnap.data ? path in prevSnap.data.tree : false;
  const current = api<FileInfo>(
    "file",
    runId && snap.data && inNow ? { run: runId, at: at === "now" ? "now" : atSeq, path } : null,
  );
  const previous = api<FileInfo>(
    "file",
    runId && prevSnap.data && inPrev && prevSeq !== null ? { run: runId, at: prevSeq, path } : null,
  );

  const text = current.data && "content" in current.data ? current.data.content : null;
  const prevText = previous.data && "content" in previous.data ? previous.data.content : "";
  const rows = useMemo(() => (text === null ? [] : diffRows(prevText, text, path)), [text, prevText, path]);

  const identical = text !== null && rows.every((r) => r.kind === "same");
  const waiting = snap.loading || current.loading || (prevSeq !== null && (prevSnap.loading || previous.loading));

  return (
    <div className="fileview">
      <div className="pane-head">
        <span className="mono ellipsis" title={path}>{path}</span>
        <span className="muted nowrap">at {at === "now" ? "now" : `event ${atSeq}`}</span>
        <button className="icon-btn" onClick={() => setOpenFile(null)} aria-label="Close file" title="Close file">✕</button>
      </div>
      <div className="fileview-body">
      {current.error && <div className="banner error">{current.error}</div>}
      {snap.data && !inNow && <div className="muted pad">Not in the project at this point.</div>}
      {current.data && "skipped" in current.data && (
        <div className="muted pad">Too large or binary: its content was not recorded.</div>
      )}
      {waiting && <div className="muted pad">loading...</div>}
      {text !== null && (
        <>
          {identical && <div className="muted diff-note">unchanged since the previous snapshot</div>}
          <pre className="diff">
            {rows.map((row, i) => (
              <div key={i} className={`line ${row.kind}`}>
                <span className="num">{row.line ?? ""}</span>
                <span className="sign">{row.kind === "add" ? "+" : row.kind === "del" ? "-" : ""}</span>
                <span className="src">
                  {row.tokens.map((t, j) => (t.cls ? <span key={j} className={t.cls}>{t.text}</span> : t.text))}
                </span>
              </div>
            ))}
          </pre>
        </>
      )}
      </div>
    </div>
  );
}
