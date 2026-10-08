import { useCallback, useEffect, useRef, useState } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { javascript } from "@codemirror/lang-javascript";
import { call, useInspectorContext } from "./useInspector";

type ProgramFile = { path: string; content: string };

const base = (p: string) => p.split(/[\\/]/).pop() ?? p;

/**
 * File tabs plus a CodeMirror editor. Ctrl/Cmd+S saves through program.edit; the
 * server's watcher then reloads the program and pushes the new graph.
 * Selecting a node scrolls to the first line containing `.owns("<region>")` for one
 * of its regions: good enough, not a real source map.
 */
export function ProgramView({ refreshKey }: { refreshKey: number }) {
  const { graph, selection } = useInspectorContext();
  const [files, setFiles] = useState<ProgramFile[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const activeRef = useRef<string | null>(null);
  activeRef.current = active;

  const load = useCallback(async () => {
    try {
      const res = await call<{ files: ProgramFile[] }>("program.files");
      setFiles(res.files);
      setActive((cur) => (cur && res.files.some((f) => f.path === cur) ? cur : (res.files[0]?.path ?? null)));
      setDirty(false);
    } catch (err) {
      setStatus((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const save = useCallback(async () => {
    const v = view.current;
    const path = activeRef.current;
    if (!v || !path) return;
    try {
      await call("program.edit", { path, content: v.state.doc.toString() });
      setDirty(false);
      setStatus("saved");
    } catch (err) {
      setStatus((err as Error).message);
    }
  }, []);

  // One editor, rebuilt when the active file or its loaded content changes.
  const content = files.find((f) => f.path === active)?.content;
  useEffect(() => {
    if (!host.current || content === undefined) return;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: content,
        extensions: [
          basicSetup,
          javascript({ typescript: true }),
          keymap.of([
            {
              key: "Mod-s",
              preventDefault: true,
              run: () => {
                void save();
                return true;
              },
            },
          ]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) setDirty(true);
          }),
          EditorView.theme({ "&": { height: "100%" }, ".cm-scroller": { overflow: "auto" } }),
        ],
      }),
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
  }, [active, content, save]);

  // Selecting a node scrolls to its `.owns("<region>")` line.
  useEffect(() => {
    const v = view.current;
    if (!v || !selection || selection.kind !== "node" || !graph?.ok) return;
    const node = graph.graph.nodes.find((n) => n.id === selection.id);
    if (!node) return;
    const text = v.state.doc.toString();
    for (const region of node.regions) {
      // Regions are normalised ("src/x/**"); the source may say "src/x/". Match the prefix.
      const at = text.indexOf(`.owns("${region.replace(/\*+$/, "")}`);
      if (at >= 0) {
        v.dispatch({ selection: { anchor: at }, effects: EditorView.scrollIntoView(at, { y: "center" }) });
        return;
      }
    }
  }, [selection, graph, content, active]);

  return (
    <div className="program-view">
      <div className="tabs">
        {files.map((f) => (
          <button
            key={f.path}
            className={f.path === active ? "tab active" : "tab"}
            title={f.path}
            onClick={() => setActive(f.path)}
          >
            {base(f.path)}
            {f.path === active && dirty ? " *" : ""}
          </button>
        ))}
        <span className="spacer" />
        <button className="tab" onClick={() => void save()} disabled={!dirty}>
          Save
        </button>
      </div>
      {status && <div className="status">{status}</div>}
      <div className="editor" ref={host} />
    </div>
  );
}
