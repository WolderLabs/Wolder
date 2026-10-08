import { useInspectorContext } from "./useInspector";
import type { Freshness } from "./types";

/** Whether the next run would redo this node or contract, and why (from the dry-run plan). */
export function FreshnessNote({ id, status }: { id: string; status?: Freshness }) {
  const { graph } = useInspectorContext();
  if (!graph || !graph.ok || !status) return null;
  const reasons = graph.reasons?.[id] ?? [];
  return (
    <div className={`freshness-note ${status}`}>
      <strong>{status === "fresh" ? "Fresh: the next run skips it" : status === "never" ? "Never run" : "Stale: the next run redoes it"}</strong>
      {reasons.length > 0 && (
        <ul>
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
