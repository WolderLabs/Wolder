import { createStore, reloadProgram } from "./api.js";
import type { Store } from "./api.js";
import { startHttpServer } from "./http.js";
import { startWatching } from "./watch.js";

export interface InspectorOptions {
  /** Path to the wolder program. */
  program: string;
  /** Default 4747. Pass 0 for any free port. */
  port?: number;
}

export interface Inspector {
  readonly store: Store;
  readonly url: string;
  readonly port: number;
  close(): Promise<void>;
}

/** Load the program, then start the HTTP/websocket server and the watchers. */
export async function createInspector(options: InspectorOptions): Promise<Inspector> {
  const store = createStore(options.program);
  await reloadProgram(store);
  const http = await startHttpServer(store, { port: options.port });
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
export type { Store, HandlerName } from "./api.js";
export type { ProgramResult } from "./program.js";
