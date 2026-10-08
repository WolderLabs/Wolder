import { Group, Panel, Separator } from "react-resizable-panels";
import { GraphView } from "./GraphView";
import { ProjectView } from "./ProjectView";
import { Scrubber } from "./Scrubber";
import { InspectorContext, useInspector } from "./useInspector";

export function App() {
  const inspector = useInspector();
  const { graph, runs, runId, setRunId, connected, error, meta } = inspector;

  return (
    <InspectorContext.Provider value={inspector}>
      <div className="app">
        <header className="topbar">
          <strong>Wolder inspector</strong>
          <span className={connected ? "pill ok" : "pill bad"}>{connected ? "live" : "offline"}</span>
          <span className="spacer" />
          <label>
            run{" "}
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
        <Group orientation="horizontal" className="columns">
          <Panel defaultSize="20%" minSize="10%">
            <div className="pane placeholder">Program — step 6</div>
          </Panel>
          <Separator className="divider" />
          <Panel defaultSize="45%" minSize="20%">
            <div className="pane graph-pane">
              <GraphView />
            </div>
          </Panel>
          <Separator className="divider" />
          <Panel defaultSize="35%" minSize="15%">
            <div className="pane project-pane">
              <Scrubber />
              <ProjectView />
            </div>
          </Panel>
        </Group>
      </div>
    </InspectorContext.Provider>
  );
}
