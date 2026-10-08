import { useMemo } from "react";
import { FileView } from "./FileView";
import type { NodeInfo, SnapshotInfo } from "./types";
import { useInspectorContext } from "./useInspector";

interface TreeDir {
  dirs: Map<string, TreeDir>;
  files: string[];
}

function buildTree(paths: string[]): TreeDir {
  const root: TreeDir = { dirs: new Map(), files: [] };
  for (const path of paths) {
    const parts = path.split("/");
    let dir = root;
    for (const part of parts.slice(0, -1)) {
      let next = dir.dirs.get(part);
      if (!next) dir.dirs.set(part, (next = { dirs: new Map(), files: [] }));
      dir = next;
    }
    dir.files.push(path);
  }
  return root;
}

export function ProjectView() {
  const { runId, events, at, atSeq, selection, openFile, setOpenFile, api } = useInspectorContext();

  const hasRun = runId !== null && events.length > 0;
  const snap = api<SnapshotInfo>("snapshot", hasRun ? { run: runId, at: atSeq } : null);
  const before = api<SnapshotInfo>(
    "snapshot",
    hasRun && snap.data && snap.data.seq > 0 ? { run: runId, at: snap.data.seq - 1 } : null,
  );
  const node = api<NodeInfo>(
    "node",
    hasRun && selection?.kind === "node" ? { run: runId, id: selection.id } : null,
  );

  const tree = snap.data?.tree;
  const previous = before.data?.tree ?? {};
  const paths = useMemo(() => Object.keys(tree ?? {}).sort(), [tree]);
  const root = useMemo(() => buildTree(paths), [paths]);
  const byNode = new Set(node.data?.files ?? []);

  if (!hasRun) return <div className="project muted">No recorded run to show a project from.</div>;

  const renderDir = (dir: TreeDir, name: string, depth: number): JSX.Element => (
    <details key={name + depth} open className="dir">
      <summary style={{ paddingLeft: depth * 12 }}>{name}/</summary>
      {[...dir.dirs].map(([n, d]) => renderDir(d, n, depth + 1))}
      {dir.files.map((path) => renderFile(path, depth + 1))}
    </details>
  );

  const renderFile = (path: string, depth: number): JSX.Element => {
    const sha = tree?.[path];
    const state = !(path in previous) ? "added" : previous[path] !== sha ? "changed" : "";
    return (
      <div
        key={path}
        className={`file ${state} ${openFile === path ? "open" : ""} ${byNode.has(path) ? "by-node" : ""}`}
        style={{ paddingLeft: depth * 12 }}
        onClick={() => setOpenFile(path)}
        title={byNode.has(path) ? `written by ${selection?.id}` : state || undefined}
      >
        {path.split("/").pop()}
        {byNode.has(path) && <span className="badge">node</span>}
        {state && <span className={`badge ${state}`}>{state === "added" ? "+" : "~"}</span>}
      </div>
    );
  };

  return (
    <div className="project">
      <div className="tree">
        <div className="tree-head muted">
          project at {at === "now" ? "now (last snapshot)" : `event ${atSeq}`}
          {snap.data && snap.data.seq < 0 && " — before the first snapshot"}
        </div>
        {snap.error && <div className="banner error">{snap.error}</div>}
        {paths.length === 0 && !snap.loading && <div className="muted pad">No files yet.</div>}
        {[...root.dirs].map(([n, d]) => renderDir(d, n, 0))}
        {root.files.map((p) => renderFile(p, 0))}
      </div>
      {openFile && <FileView path={openFile} />}
    </div>
  );
}
