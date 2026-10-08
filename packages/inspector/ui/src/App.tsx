import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Group, Panel, Separator, useDefaultLayout, usePanelRef } from "react-resizable-panels";
import { ChatView } from "./ChatView";
import { ProgramView } from "./ProgramView";
import { GraphView } from "./GraphView";
import { ProjectView } from "./ProjectView";
import { Scrubber } from "./Scrubber";
import { InspectorContext, useInspector } from "./useInspector";
import { COLUMNS, COLUMN_LABELS, layoutStorage, maxColumns, parseOrder, shownColumns, toggleColumn } from "./layout";
import type { ColumnId } from "./layout";

const ORDER_KEY = "wolder-inspector:columns";
const DEFAULT_SIZE: Record<ColumnId, string> = { program: "32%", graph: "38%", project: "30%" };
const CHAT_BAR = 36;

function useWindowWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = (): void => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}

/**
 * Where a column appears on screen. The column itself is rendered once, through a
 * portal into `host`, and the host element is moved here. Hiding a column or
 * re-arranging the layout therefore never unmounts it, so unsaved edits and the
 * chat survive.
 */
function Slot({ host }: { host: HTMLElement }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    ref.current?.appendChild(host);
    return () => host.remove();
  }, [host]);
  return <div className="slot" ref={ref} />;
}

/** The editor over the chat; the chat collapses to its title bar. */
function ProgramColumn() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [chatOpen, setChatOpen] = useState(true);
  const chat = usePanelRef();
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({ id: "wolder-inspector:program", storage: layoutStorage });
  return (
    <Group orientation="vertical" className="split" defaultLayout={defaultLayout} onLayoutChanged={onLayoutChanged}>
      <Panel id="editor" minSize={96}>
        <ProgramView refreshKey={refreshKey} />
      </Panel>
      <Separator className="divider row" />
      <Panel
        id="chat"
        panelRef={chat}
        collapsible
        collapsedSize={CHAT_BAR}
        minSize={140}
        defaultSize="36%"
        onResize={(size) => setChatOpen(size.inPixels > CHAT_BAR + 1)}
      >
        <ChatView
          open={chatOpen}
          onToggle={() => (chat.current?.isCollapsed() ? chat.current.expand() : chat.current?.collapse())}
          onTurnEnd={() => setRefreshKey((n) => n + 1)}
        />
      </Panel>
    </Group>
  );
}

export function App() {
  const inspector = useInspector();
  const { graph, runs, runId, setRunId, connected, error, meta } = inspector;

  const [order, setOrder] = useState(() => parseOrder(layoutStorage.getItem(ORDER_KEY)));
  const max = maxColumns(useWindowWidth());
  const shown = shownColumns(order, max);
  const toggle = (id: ColumnId): void => {
    const next = toggleColumn(order, id, max);
    setOrder(next);
    layoutStorage.setItem(ORDER_KEY, JSON.stringify(next));
  };

  const [hosts] = useState(() => {
    const host = (): HTMLDivElement => Object.assign(document.createElement("div"), { className: "pane-host" });
    return { program: host(), graph: host(), project: host() } satisfies Record<ColumnId, HTMLDivElement>;
  });
  const columns: Record<ColumnId, ReactNode> = {
    program: (
      <div className="pane">
        <ProgramColumn />
      </div>
    ),
    graph: (
      <div className="pane">
        <GraphView />
      </div>
    ),
    project: (
      <div className="pane project-pane">
        <Scrubber />
        <ProjectView />
      </div>
    ),
  };

  // One remembered layout per combination of columns.
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "wolder-inspector:columns",
    panelIds: shown,
    storage: layoutStorage,
  });

  return (
    <InspectorContext.Provider value={inspector}>
      <div className="app">
        <header className="topbar">
          <strong className="brand">Wolder inspector</strong>
          <span className={connected ? "pill ok" : "pill bad"}>{connected ? "live" : "offline"}</span>
          <nav className="panel-toggles" aria-label="Panels">
            {COLUMNS.map((id) => (
              <button
                key={id}
                className={shown.includes(id) ? "toggle on" : "toggle"}
                aria-pressed={shown.includes(id)}
                title={shown.includes(id) ? `Hide ${COLUMN_LABELS[id]}` : `Show ${COLUMN_LABELS[id]}`}
                onClick={() => toggle(id)}
              >
                {COLUMN_LABELS[id]}
              </button>
            ))}
          </nav>
          <span className="spacer" />
          <label className="run-picker">
            <span className="muted">run</span>
            <select value={runId ?? ""} onChange={(e) => setRunId(e.target.value)}>
              {runs.length === 0 && <option value="">no recorded runs</option>}
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.id} ({r.status})
                </option>
              ))}
            </select>
          </label>
          {meta && <span className={`pill ${meta.status}`}>{meta.status}</span>}
        </header>
        {error && <div className="banner error">{error}</div>}
        {graph && !graph.ok && "diagnostic" in graph && (
          <div className="banner error">
            <div>{graph.diagnostic.message}</div>
            {graph.diagnostic.hint && <div className="hint">{graph.diagnostic.hint}</div>}
          </div>
        )}
        {graph && !graph.ok && "crash" in graph && (
          <div className="banner error">
            <div>The program crashed while assembling.</div>
            <pre>{graph.crash}</pre>
          </div>
        )}
        <Group
          key={shown.join("+")}
          orientation="horizontal"
          className="columns"
          defaultLayout={defaultLayout}
          onLayoutChanged={onLayoutChanged}
        >
          {shown.map((id, i) => (
            <Fragment key={id}>
              {i > 0 && <Separator className="divider col" />}
              <Panel id={id} minSize={240} defaultSize={shown.length === COLUMNS.length ? DEFAULT_SIZE[id] : undefined}>
                <Slot host={hosts[id]} />
              </Panel>
            </Fragment>
          ))}
        </Group>
        {COLUMNS.map((id) => createPortal(columns[id], hosts[id], id))}
      </div>
    </InspectorContext.Provider>
  );
}
