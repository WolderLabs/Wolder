import { relative, resolve, isAbsolute } from "node:path";
import type { AgentRunner, AgentRunRequest, AgentRunResult } from "./types.js";
import { regionsMatch, toPosix } from "./region.js";

/** Everything that writes. Each of these goes through the region check. */
export const WRITE_TOOLS = ["Write", "Edit", "MultiEdit", "NotebookEdit"] as const;

/** Everything that only reads. Safe to auto-approve. */
export const READ_TOOLS = ["Read", "Glob", "Grep"] as const;

/**
 * The tools an agent is given at all. Notably absent: Bash. An agent with a shell
 * can write anywhere, and the checks an agent would want a shell for are the
 * layer's gates, which wolder runs itself and feeds back.
 */
export const AGENT_TOOLS = [...READ_TOOLS, ...WRITE_TOOLS];

const WRITE_TOOL_SET = new Set<string>(WRITE_TOOLS);

/**
 * The SDK options that make the boundary real.
 *
 * `tools` is what restricts the available set. `allowedTools` means "auto-approve
 * without asking" — so a write tool must be kept *out* of it, or the SDK runs the
 * call without ever consulting `canUseTool` and the region guard never sees it.
 */
export function toolOptions(): {
  tools: string[];
  allowedTools: string[];
  disallowedTools: string[];
} {
  return {
    tools: AGENT_TOOLS,
    allowedTools: [...READ_TOOLS],
    disallowedTools: ["Bash", "WebFetch", "WebSearch", "Task"],
  };
}

/**
 * Decide whether a tool call is allowed, and record what it wrote.
 *
 * Boundaries are enforced here rather than asked for in the prompt. Bash is not
 * offered at all: an agent with a shell can write anywhere, and the checks an
 * agent would want a shell for are the layer's gates, which wolder runs itself
 * and feeds back.
 */
export function createPermissionGuard(request: Pick<AgentRunRequest, "root" | "regions">) {
  const written = new Set<string>();

  function decide(
    toolName: string,
    input: Record<string, unknown>,
  ): { behavior: "allow" } | { behavior: "deny"; message: string } {
    if (!WRITE_TOOL_SET.has(toolName)) return { behavior: "allow" };

    const target = input["file_path"] ?? input["notebook_path"] ?? input["path"];
    if (typeof target !== "string") {
      return {
        behavior: "deny",
        message: `${toolName} was called without a file path, so wolder cannot check it against your writable region.`,
      };
    }

    const path = toRootRelative(target, request.root);
    if (path === null) {
      return {
        behavior: "deny",
        message: `"${target}" is outside the project, and you may only write inside ${request.regions.join(", ")}.`,
      };
    }
    if (!regionsMatch(request.regions, path)) {
      return {
        behavior: "deny",
        message:
          `"${path}" is outside your writable region (${request.regions.join(", ")}). ` +
          `Another agent owns it. Work with what you were given as context instead — ` +
          `do not try another path to reach it.`,
      };
    }

    written.add(path);
    return { behavior: "allow" };
  }

  return {
    decide,
    written: () => [...written].sort(),
  };
}

export function toRootRelative(target: string, root: string): string | null {
  const abs = isAbsolute(target) ? target : resolve(root, target);
  const rel = toPosix(relative(resolve(root), abs));
  if (rel === "" || rel.startsWith("../")) return null;
  return rel;
}

/** The real runner: a Claude Agent SDK session fenced to the node's region. */
export function createSdkRunner(): AgentRunner {
  return {
    async run(request: AgentRunRequest): Promise<AgentRunResult> {
      const { query } = await import("@anthropic-ai/claude-agent-sdk");
      const guard = createPermissionGuard(request);

      const session = query({
        prompt: request.prompt,
        options: {
          cwd: request.root,
          model: request.model,
          systemPrompt: request.systemPrompt,
          ...toolOptions(),
          maxTurns: request.maxTurns,
          permissionMode: "default",
          canUseTool: async (toolName, input) => guard.decide(toolName, input),
        },
      });

      let text = "";
      for await (const message of session) {
        if (message.type !== "result") continue;
        if (message.subtype === "success") {
          text = message.result;
        } else {
          throw new Error(
            `${request.nodeId}: the agent stopped without finishing (${message.subtype})` +
              (message.errors?.length ? `: ${message.errors.join("; ")}` : ""),
          );
        }
      }

      return { files: guard.written(), text };
    },
  };
}
