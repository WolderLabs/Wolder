import type { AgentRunRequest, BoundaryRequest, BoundaryOwner } from "./types.js";
import { regionsMatch, toRootRelative } from "./region.js";

/** The in-process MCP server the runner mounts, and the names the guard recognises. */
export const BOUNDARY_SERVER = "wolder";
export const WHO_OWNS_TOOL = `mcp__${BOUNDARY_SERVER}__who_owns`;
export const REQUEST_PATH_TOOL = `mcp__${BOUNDARY_SERVER}__request_path`;
export const BOUNDARY_TOOL_NAMES: readonly string[] = [WHO_OWNS_TOOL, REQUEST_PATH_TOOL];

/** The agent in `owners` whose regions cover a root-relative path, if any. */
export function findOwner(
  owners: readonly BoundaryOwner[],
  path: string,
): BoundaryOwner | undefined {
  return owners.find((owner) => regionsMatch(owner.regions, path));
}

/**
 * The two boundary tools as plain functions, so the real SDK runner and a test's
 * fake runner exercise the same logic. Neither writes anything. `whoOwns` never
 * fails the run; `requestPath` records the request and tells the agent to stop — the
 * runner then ends the session and `build.ts` fails the run with a
 * `BoundaryRequestError` once the runner returns.
 */
export function createBoundaryTools(
  request: Pick<AgentRunRequest, "root" | "regions" | "owners" | "nodeId">,
) {
  let requested: BoundaryRequest | undefined;
  const owners = request.owners ?? [];

  function locate(path: string): { path: string } | { error: string } {
    const rel = toRootRelative(path, request.root);
    return rel === null
      ? { error: `"${path}" is outside the project, so no agent owns it and no one can.` }
      : { path: rel };
  }

  return {
    whoOwns(path: string): string {
      const located = locate(path);
      if ("error" in located) return located.error;
      const rel = located.path;

      if (regionsMatch(request.regions, rel)) {
        return `"${rel}" is inside your own region (${request.regions.join(", ")}). You may write it.`;
      }
      const owner = findOwner(owners, rel);
      if (!owner) {
        return (
          `No agent owns "${rel}". You cannot write it either — it is outside your region ` +
          `(${request.regions.join(", ")}). If you truly need it, call request_path; that ends ` +
          `this run and tells the developer to add it to an agent's .owns(). Otherwise do ` +
          `without it.`
        );
      }
      return [
        `"${rel}" is owned by another agent: ${owner.id}.`,
        `Its goal: ${owner.goal.replace(/\s+/g, " ").trim()}`,
        `Its regions: ${owner.regions.join(", ")}`,
        `You cannot write there and nothing widens your boundary at runtime. The proper way to ` +
          `depend on it is an edge in the program: .asks(${owner.id}, "what you need") for ` +
          `content or a contract (settled before either of you runs), or .after(${owner.id}) ` +
          `if you need its finished files to exist first. Neither is yours to add from here, so ` +
          `adapt within your own region: if this behaviour belongs to ${owner.id}, leave it to ` +
          `them and say so in your final message.`,
      ].join("\n");
    },

    requestPath(path: string, reason: string): string {
      const located = locate(path);
      requested = { path: "error" in located ? path : located.path, reason };
      return (
        `Request recorded. It will not be granted: a region has exactly one owner and ` +
        `boundaries do not widen at runtime. This run is being stopped so the developer can ` +
        `fix the program. Do not call any more tools.`
      );
    },

    requested: (): BoundaryRequest | undefined => requested,
  };
}
