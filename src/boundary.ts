import type { AgentRunRequest, BoundaryRequest, BoundaryOwner, OwnerAdvice } from "./types.js";
import { regionsMatch, toRootRelative } from "./region.js";

/** The in-process MCP server the runner mounts, and the names the guard recognises. */
export const BOUNDARY_SERVER = "wolder";
export const WHO_OWNS_TOOL = `mcp__${BOUNDARY_SERVER}__who_owns`;
export const REQUEST_PATH_TOOL = `mcp__${BOUNDARY_SERVER}__request_path`;
export const ASK_OWNER_TOOL = `mcp__${BOUNDARY_SERVER}__ask_owner`;
export const BOUNDARY_TOOL_NAMES: readonly string[] = [
  WHO_OWNS_TOOL,
  ASK_OWNER_TOOL,
  REQUEST_PATH_TOOL,
];

/** How many times one node may consult owners. Fixed: a node that needs more is mis-scoped. */
export const MAX_OWNER_CONSULTS = 3;

/** The agent in `owners` whose regions cover a root-relative path, if any. */
export function findOwner(
  owners: readonly BoundaryOwner[],
  path: string,
): BoundaryOwner | undefined {
  return owners.find((owner) => regionsMatch(owner.regions, path));
}

/**
 * The three boundary tools as plain functions, so the real SDK runner and a test's
 * fake runner exercise the same logic. None writes anything. `whoOwns` and `askOwner` never
 * fail the run; `requestPath` records the request and tells the agent to stop — the
 * runner then ends the session and `build.ts` fails the run with a
 * `BoundaryRequestError` once the runner returns.
 */
export function createBoundaryTools(
  request: Pick<AgentRunRequest, "root" | "regions" | "owners" | "nodeId" | "consultOwner">,
) {
  let requested: BoundaryRequest | undefined;
  const advice: Array<OwnerAdvice & { path: string }> = [];
  let consults = 0;
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

    async askOwner(path: string, question: string): Promise<string> {
      const located = locate(path);
      if ("error" in located) return located.error;
      const rel = located.path;
      if (regionsMatch(request.regions, rel)) {
        return `"${rel}" is inside your own region (${request.regions.join(", ")}). Nobody else to ask — you may write it.`;
      }
      const owner = findOwner(owners, rel);
      if (!owner) {
        return (
          `No agent owns "${rel}", so there is no one to ask. If you truly need it, call ` +
          `request_path with a reason and a recommendation; otherwise do without it.`
        );
      }
      if (!request.consultOwner) {
        return `${owner.id} owns "${rel}", but owners cannot be consulted in this run. Use who_owns and adapt.`;
      }
      if (consults >= MAX_OWNER_CONSULTS) {
        return (
          `You have used all ${MAX_OWNER_CONSULTS} ask_owner calls for this run. Decide with ` +
          `what you have: adapt within your own region, or call request_path with your ` +
          `recommendation.`
        );
      }
      consults++;
      let answer: string;
      try {
        answer = await request.consultOwner(owner, question);
      } catch (err) {
        return `${owner.id} could not be consulted (${err instanceof Error ? err.message : String(err)}). Use who_owns and adapt.`;
      }
      advice.push({ path: rel, owner: owner.id, question, answer });
      return (
        `${owner.id} advises (read-only: nothing was changed or granted):
${answer}

` +
        `You cannot write in ${owner.id}'s region. Adapt within your own, or if this cannot be ` +
        `solved that way call request_path with a reason and your recommendation.`
      );
    },

    requestPath(path: string, reason: string, recommendation: string): string {
      if (!recommendation || recommendation.trim() === "") {
        return (
          `Not recorded: request_path needs a recommendation — how the generation program (or ` +
          `an agent's goal) should change so you would not need this path. Write it after ` +
          `using who_owns / ask_owner, then call request_path again. The run continues.`
        );
      }
      const located = locate(path);
      const rel = "error" in located ? path : located.path;
      requested = {
        path: rel,
        reason,
        recommendation: recommendation.trim(),
        advice: advice
          .filter((a) => a.path === rel)
          .map(({ owner, question, answer }) => ({ owner, question, answer })),
      };
      return (
        `Request recorded. It will not be granted: a region has exactly one owner and ` +
        `boundaries do not widen at runtime. This run is being stopped so the developer can ` +
        `fix the program. Do not call any more tools.`
      );
    },

    requested: (): BoundaryRequest | undefined => requested,
  };
}
