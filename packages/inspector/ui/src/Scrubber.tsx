import { useInspectorContext } from "./useInspector";

export function Scrubber() {
  const { events, at, atSeq, setAt } = useInspectorContext();
  if (events.length === 0) return <div className="scrubber muted">No events recorded yet.</div>;

  const max = events.length; // the last position is "now"
  const value = at === "now" ? max : Math.min(at, max - 1);
  const ticks = events.filter((e) => e.kind === "node:done");
  const current = at === "now" ? null : events[value];

  return (
    <div className="scrubber">
      <div className="scrubber-label">
        {current ? (
          <>
            <span className="mono">#{current.seq}</span> {current.kind}
            {current.node ? <> · {current.node}</> : current.contract ? <> · {current.contract}</> : null}
          </>
        ) : (
          <>
            <strong>now</strong> · reading the live disk
          </>
        )}
      </div>
      <div className="scrubber-track">
        <input
          type="range"
          min={0}
          max={max}
          step={1}
          value={value}
          aria-label="Run time"
          onChange={(e) => {
            const next = Number(e.target.value);
            setAt(next >= max ? "now" : next);
          }}
        />
        <div className="ticks" aria-hidden>
          {ticks.map((e) => (
            <span
              key={e.seq}
              className="tick"
              title={`${e.node} done`}
              style={{ left: `${(e.seq / max) * 100}%` }}
            />
          ))}
        </div>
      </div>
      <div className="scrubber-foot muted">
        event {atSeq} of {events.length - 1}
      </div>
    </div>
  );
}
