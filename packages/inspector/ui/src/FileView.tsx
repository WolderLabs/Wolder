import { diffLines } from "diff";
import { useMemo } from "react";
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
  const pieces = useMemo(
    () => (text === null ? [] : diffLines(prevText, text)),
    [text, prevText],
  );

  const identical = text !== null && pieces.every((p) => !p.added && !p.removed);
  const waiting = snap.loading || current.loading || (prevSeq !== null && (prevSnap.loading || previous.loading));

  return (
    <div className="fileview">
      <div className="fileview-head">
        <span className="mono">{path}</span>
        <span className="muted"> at {at === "now" ? "now" : `event ${atSeq}`}</span>
        <button onClick={() => setOpenFile(null)} aria-label="Close file">x</button>
      </div>
      {current.error && <div className="banner error">{current.error}</div>}
      {snap.data && !inNow && <div className="muted pad">Not in the project at this point.</div>}
      {current.data && "skipped" in current.data && (
        <div className="muted pad">Too large or binary: its content was not recorded.</div>
      )}
      {waiting && <div className="muted pad">loading...</div>}
      {text !== null && (
        <pre className="diff">
          {identical && <div className="muted">unchanged since the previous snapshot</div>}
          {pieces.map((piece, i) => {
            const lines = piece.value.replace(/\n$/, "").split("\n");
            const kind = piece.added ? "add" : piece.removed ? "del" : "same";
            return lines.map((line, j) => (
              <div key={`${i}-${j}`} className={`line ${kind}`}>
                <span className="sign">{piece.added ? "+" : piece.removed ? "-" : " "}</span>
                {line}
              </div>
            ));
          })}
        </pre>
      )}
    </div>
  );
}
