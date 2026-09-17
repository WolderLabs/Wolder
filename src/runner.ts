import { relative, resolve, isAbsolute } from "node:path";
import type {
  AgentEvent,
  AgentRunner,
  AgentRunRequest,
  AgentRunResult,
} from "./types.js";
import { regionsMatch, toPosix } from "./region.js";

/** Everything that writes. Each of these goes through the region check. */
export const WRITE_TOOLS = ["Write", "Edit", "MultiEdit", "NotebookEdit"] as const;

/** Everything that reads. Confined to the project, but free to roam inside it. */
export const READ_TOOLS = ["Read", "Glob", "Grep"] as const;

/**
 * The tools an agent is given at all. Notably absent: Bash. An agent with a shell
 * can write anywhere, and the checks an agent would want a shell for are the
 * layer's gates, which wolder runs itself and feeds back.
 */
export const AGENT_TOOLS = [...READ_TOOLS, ...WRITE_TOOLS];

const WRITE_TOOL_SET = new Set<string>(WRITE_TOOLS);
const READ_TOOL_SET = new Set<string>(READ_TOOLS);

/** The input fields of each tool that name a filesystem location. */
const PATH_FIELDS = ["file_path", "notebook_path", "path"] as const;
/** Fields holding a glob rather than a path — checked for escapes, not containment. */
const GLOB_FIELDS = ["pattern", "glob"] as const;

/**
 * The SDK options that make the boundary real.
 *
 * `tools` is what restricts the available set. `allowedTools` means "auto-approve
 * without asking", which bypasses `canUseTool` entirely — so it stays **empty**.
 * Every single tool call goes through the guard, reads included.
 */
export function toolOptions(): {
  tools: string[];
  allowedTools: string[];
  disallowedTools: string[];
} {
  return {
    tools: AGENT_TOOLS,
    allowedTools: [],
    disallowedTools: ["Bash", "WebFetch", "WebSearch", "Task"],
  };
}

/**
 * Decide whether a tool call is allowed, and record what it wrote.
 *
 * Two different boundaries, both enforced here rather than asked for in the prompt:
 *
 * - **Writing** is confined to the agent's own regions. Everything outside belongs
 *   to somebody else.
 * - **Reading** is confined to the project root. An agent needs to roam the project
 *   to understand it, but nothing above the root is any of its business — that way
 *   lies the developer's other repositories, their shell history, and the `.env`
 *   holding the very API key paying for the run.
 *
 * Bash is not offered at all: an agent with a shell can do both anyway, and the
 * checks an agent would want a shell for are the layer's gates, which wolder runs
 * itself and feeds back.
 */
export function createPermissionGuard(request: Pick<AgentRunRequest, "root" | "regions">) {
  const written = new Set<string>();

  function decideRead(
    toolName: string,
    input: Record<string, unknown>,
    allow: { behavior: "allow"; updatedInput: Record<string, unknown> },
  ): typeof allow | { behavior: "deny"; message: string } {
    for (const field of PATH_FIELDS) {
      const value = input[field];
      if (typeof value !== "string" || value.trim() === "") continue;
      if (toRootRelative(value, request.root) === null && !isRootItself(value, request.root)) {
        return {
          behavior: "deny",
          message:
            `${toolName} was pointed at "${value}", which is outside this project ` +
            `(rooted at "${request.root}"). You may read anything inside the project ` +
            `and nothing above it. Use a path relative to the project root.`,
        };
      }
    }

    // A pattern is resolved against the search root, so `..` in one is an escape.
    for (const field of GLOB_FIELDS) {
      const value = input[field];
      if (typeof value !== "string") continue;
      if (toPosix(value).split("/").includes("..")) {
        return {
          behavior: "deny",
          message:
            `The ${field} "${value}" reaches outside the project with "..". ` +
            `Search within the project root instead.`,
        };
      }
    }

    return allow;
  }

  /**
   * `updatedInput` is echoed on every allow. The SDK's `.d.ts` marks it optional,
   * but the runtime schema rejects an allow without it — and the rejection surfaces
   * to the agent as an opaque ZodError, which it then works around by trying other
   * tools and other path spellings until it gives up. Always send it back.
   */
  function decide(
    toolName: string,
    input: Record<string, unknown>,
  ):
    | { behavior: "allow"; updatedInput: Record<string, unknown> }
    | { behavior: "deny"; message: string } {
    const allow = { behavior: "allow" as const, updatedInput: input };

    if (READ_TOOL_SET.has(toolName)) return decideRead(toolName, input, allow);
    if (!WRITE_TOOL_SET.has(toolName)) return allow;

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
    return allow;
  }

  return {
    decide,
    written: () => [...written].sort(),
  };
}

/** The root directory itself is a legitimate thing to list or search. */
function isRootItself(target: string, root: string): boolean {
  const abs = isAbsolute(target) ? target : resolve(root, target);
  return resolve(abs) === resolve(root);
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
      const emit = (event: AgentEvent) => request.onEvent?.(event);

      const session = query({
        prompt: request.prompt,
        options: {
          cwd: request.root,
          model: request.model,
          systemPrompt: request.systemPrompt,
          ...toolOptions(),
          maxTurns: request.maxTurns,
          permissionMode: "default",
          canUseTool: async (toolName, input) => {
            const decision = guard.decide(toolName, input);
            if (decision.behavior === "deny") {
              emit({
                kind: "denied",
                name: toolName,
                detail: describeToolInput(input),
                reason: decision.message,
              });
            }
            return decision;
          },
        },
      });

      let text = "";
      for await (const message of session) {
        // Generation is slow enough that silence reads as a hang. Everything below
        // exists so it does not.
        if (message.type === "assistant") {
          for (const event of describeAssistantTurn(message.message)) emit(event);
          continue;
        }
        if (message.type === "system" && message.subtype === "api_retry") {
          emit({
            kind: "retry",
            attempt: message.attempt,
            maxAttempts: message.max_retries,
            delayMs: message.retry_delay_ms,
            reason: message.error,
          });
          continue;
        }
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

/** Turn one assistant turn into the events worth showing: what it said, what it used. */
export function describeAssistantTurn(message: { content: unknown }): AgentEvent[] {
  const events: AgentEvent[] = [];
  if (!Array.isArray(message.content)) return events;

  for (const block of message.content) {
    if (!block || typeof block !== "object") continue;
    const typed = block as { type?: string; text?: string; name?: string; input?: unknown };

    if (typed.type === "text" && typeof typed.text === "string") {
      const text = firstLine(typed.text);
      if (text) events.push({ kind: "text", text });
    } else if (typed.type === "tool_use" && typeof typed.name === "string") {
      events.push({
        kind: "tool",
        name: typed.name,
        detail: describeToolInput(typed.input),
      });
    }
  }
  return events;
}

/** The one field of a tool call worth putting on a progress line. */
function describeToolInput(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const record = input as Record<string, unknown>;
  for (const key of ["file_path", "notebook_path", "path", "pattern", "command"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim() !== "") return truncate(value, 80);
  }
  return undefined;
}

function firstLine(text: string): string {
  const line = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l !== "");
  return line ? truncate(line, 100) : "";
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
