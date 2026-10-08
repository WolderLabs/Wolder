import { DEFAULTS } from "@wolder/core";
import { createStore, reloadProgram } from "./api.js";
import type { Store } from "./api.js";
import type { ChatOptions } from "./chat.js";
import { createChatSession } from "./chat.js";
import { startHttpServer } from "./http.js";
import { mcpRoute } from "./mcp.js";
import { ensureUiBuilt } from "./ui-build.js";
import { startWatching } from "./watch.js";

export interface InspectorOptions {
  /** Path to the wolder program. */
  program: string;
  /** Default 4747. Pass 0 for any free port. */
  port?: number;
  /** Build ui/dist first if it is missing (and say so). `wolder inspect` sets this. */
  buildUi?: boolean;
  /** Model for the chat agent. Default: core default model. */
  chatModel?: string;
  /** Test seam: replaces the SDK `query` for chat. */
  chatQuery?: ChatOptions["query"];
}

export interface Inspector {
  readonly store: Store;
  readonly url: string;
  readonly port: number;
  close(): Promise<void>;
}

/** Load the program, then start the HTTP/websocket server and the watchers. */
export async function createInspector(options: InspectorOptions): Promise<Inspector> {
  if (options.buildUi) ensureUiBuilt();
  const store = createStore(options.program);
  await reloadProgram(store);
  const chat = createChatSession(store, {
    model: options.chatModel ?? DEFAULTS.model,
    apiKey: process.env["ANTHROPIC_API_KEY"],
    query: options.chatQuery,
  });
  const http = await startHttpServer(store, {
    port: options.port,
    extraRoute: mcpRoute(store),
    chat: (text, emit) => chat.send(text, emit),
  });
  const stopWatching = await startWatching(store, http.broadcast);
  return {
    store,
    url: `http://127.0.0.1:${http.port}`,
    port: http.port,
    async close() {
      await stopWatching();
      await http.close();
    },
  };
}

export { createStore, reloadProgram, handlers, callHandler } from "./api.js";
export { loadProgram, findProgramFiles } from "./program.js";
export { ensureUiBuilt } from "./ui-build.js";
export { createMcpServer, runMcpStdio, mcpRoute } from "./mcp.js";
export type { Store, HandlerName } from "./api.js";
export type { ProgramResult } from "./program.js";
export { createChatSession } from "./chat.js";
