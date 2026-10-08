import { useCallback, useEffect, useRef, useState } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { javascript } from "@codemirror/lang-javascript";
import { syntaxHighlighting } from "@codemirror/language";
import { highlighter } from "./highlight";
import { call, useInspectorContext } from "./useInspector";

type ProgramFile = { path: string; content: string };

const base = (p: string) => p.split(/[\\/]/).pop() ?? p;

// Colours come from app.css variables, so the editor follows the light and dark themes.
const theme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "var(--code-bg)", color: "var(--code-text)", fontSize: "13px" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { overflow: "auto", fontFamily: "var(--mono)", lineHeight: "1.6" },
  ".cm-content": { padding: "10px 0", caretColor: "var(--accent)" },
  ".cm-line": { padding: "0 16px 0 8px" },
  ".cm-gutters": { backgroundColor: "var(--code-bg)", color: "var(--code-gutter)", border: "none" },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 8px 0 14px", minWidth: "40px" },
  ".cm-foldGutter .cm-gutterElement": { padding: "0 4px" },
  ".cm-activeLine": { backgroundColor: "var(--code-active)" },
  ".cm-activeLineGutter": { backgroundColor: "var(--code-active)", color: "var(--code-text)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "var(--code-selection)",
  },
  ".cm-selectionMatch": { backgroundColor: "var(--code-match)" },
  "&.cm-focused .cm-matchingBracket": { backgroundColor: "var(--code-match)", outline: "1px solid var(--code-gutter)" },
  ".cm-foldPlaceholder": { backgroundColor: "var(--chip)", border: "none", color: "var(--muted)", padding: "0 6px" },
  ".cm-tooltip": { backgroundColor: "var(--panel)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "6px" },
  ".cm-tooltip-autocomplete ul li[aria-selected]": { backgroundColor: "var(--accent)", color: "var(--on-accent)" },
  ".cm-panels": { backgroundColor: "var(--panel)", color: "var(--text)" },
  ".cm-panels.cm-panels-bottom": { borderTop: "1px solid var(--border)" },
  ".cm-searchMatch": { backgroundColor: "var(--code-match)", outline: "1px solid var(--stale-b)" },
  ".cm-textfield, .cm-button": {
    backgroundColor: "var(--bg)",
    backgroundImage: "none",
    color: "var(--text)",
    border: "1px solid var(--border)",
    borderRadius: "4px",
  },
});

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
          syntaxHighlighting(highlighter),
          theme,
          EditorView.lineWrapping,
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
      <div className="pane-head tabs">
        <div className="tab-list">
          {files.map((f) => (
            <button
              key={f.path}
              className={f.path === active ? "tab active" : "tab"}
              title={f.path}
              onClick={() => setActive(f.path)}
            >
              {base(f.path)}
              {f.path === active && dirty ? " •" : ""}
            </button>
          ))}
        </div>
        {status && <span className="status muted">{status}</span>}
        <button className="btn" onClick={() => void save()} disabled={!dirty} title="Save (Ctrl/Cmd+S)">
          Save
        </button>
      </div>
      <div className="editor" ref={host} />
    </div>
  );
}
