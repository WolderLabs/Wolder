import { dirname, relative } from "node:path";
import type { query as sdkQuery } from "@anthropic-ai/claude-agent-sdk";
import {
  DSL_REFERENCE,
  createPermissionGuard,
  DEFAULTS,
} from "@wolder/core";
import type { AgentEvent } from "@wolder/core";
import { createMcpServer } from "./mcp.js";
import type { Store } from "./api.js";

export interface ChatOptions {
  model: string;
  apiKey?: string;
  /** Default: core's `maxTurns` default (40). */
  maxTurns?: number;
  /** Inject a fake in tests; defaults to the Claude Agent SDK's `query`. */
  query?: typeof sdkQuery;
}

export interface ChatSession {
  send(text: string, onEvent: (e: AgentEvent) => void): Promise<string>;
}

const CHAT_PROMPT =
  "You edit the wolder program files only. Inspect before you edit. Explain each edit in one sentence.";

/** Tools the chat agent never sees: it edits through Edit/Write behind the guard and does not start runs. */
const WITHHELD = ["run_start", "program_edit"];

const toPosix = (p: string) => p.split("\\").join("/");

/**
 * One in-memory chat session per server process. The agent can write only the
 * program's own files (an explicit list, not the directory), and read only inside the
 * program's directory. `allowedTools` stays empty so every call reaches `canUseTool`.
 */
export function createChatSession(store: Store, options: ChatOptions): ChatSession {
  const history: Array<{ role: "user" | "assistant"; text: string }> = [];

  return {
    async send(text, onEvent) {
      const query = options.query ?? (await import("@anthropic-ai/claude-agent-sdk")).query;
      const programDir = dirname(store.programPath);
      const programFiles = store.program?.programFiles ?? [store.programPath];
      const regions = programFiles.map((f) => toPosix(relative(programDir, f)));
      const guard = createPermissionGuard({ root: programDir, regions });
      const mcp = createMcpServer(store, { exclude: WITHHELD });

      const transcript = history
        .map((m) => `${m.role === "user" ? "User" : "You"}: ${m.text}`)
        .join("\n\n");
      const prompt = transcript ? `${transcript}\n\nUser: ${text}` : text;

      const session = query({
        prompt,
        options: {
          cwd: programDir,
          model: options.model,
          systemPrompt: `${DSL_REFERENCE}\n\n${CHAT_PROMPT}`,
          tools: ["Read", "Glob", "Grep", "Edit", "Write"],
          allowedTools: [],
          disallowedTools: ["Bash", "WebFetch", "WebSearch", "Task"],
          mcpServers: { wolder: { type: "sdk", name: "wolder", instance: mcp as never } },
          maxTurns: options.maxTurns ?? DEFAULTS.maxTurns,
          permissionMode: "default",
          ...(options.apiKey ? { env: { ...process.env, ANTHROPIC_API_KEY: options.apiKey } } : {}),
          canUseTool: async (toolName: string, input: Record<string, unknown>) => {
            const decision = guard.decide(toolName, input);
            if (decision.behavior === "deny") {
              onEvent({ kind: "denied", name: toolName, reason: decision.message });
            }
            return decision;
          },
        },
      });

      let reply = "";
      for await (const message of session) {
        if (message.type === "assistant") {
          const content = (message.message as { content?: unknown }).content;
          if (!Array.isArray(content)) continue;
          for (const block of content as Array<{ type?: string; text?: string; name?: string; input?: Record<string, unknown> }>) {
            if (block.type === "text" && block.text) onEvent({ kind: "text", text: block.text });
            else if (block.type === "tool_use" && block.name) {
              const detail = block.input?.["file_path"] ?? block.input?.["path"] ?? block.input?.["pattern"];
              onEvent({ kind: "tool", name: block.name, detail: typeof detail === "string" ? detail : undefined });
            }
          }
        } else if (message.type === "result") {
          if (message.subtype !== "success") {
            throw new Error(`The chat agent stopped without finishing (${message.subtype}).`);
          }
          reply = message.result;
        }
      }
      history.push({ role: "user", text }, { role: "assistant", text: reply });
      return reply;
    },
  };
}
