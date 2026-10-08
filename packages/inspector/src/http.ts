import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { callHandler, isHandlerName } from "./api.js";
import type { Store } from "./api.js";

const UI_DIST = resolve(dirname(fileURLToPath(import.meta.url)), "..", "ui", "dist");

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".map": "application/json",
};

export interface HttpServer {
  readonly server: Server;
  readonly port: number;
  broadcast(message: unknown): void;
  close(): Promise<void>;
}

/** Extra routes (the MCP endpoint) mount here; return true when the request was handled. */
export type ExtraRoute = (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((done, fail) => {
    let body = "";
    req.on("data", (chunk) => (body += String(chunk)));
    req.on("end", () => done(body));
    req.on("error", fail);
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function serveStatic(urlPath: string, res: ServerResponse): void {
  if (!existsSync(join(UI_DIST, "index.html"))) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(
      "<!doctype html><title>Wolder inspector</title><p>The inspector UI has not been built yet. " +
        "The API is live at <code>/api/&lt;name&gt;</code>.</p>",
    );
    return;
  }
  const requested = normalize(decodeURIComponent(urlPath)).replace(/^[/\\]+/, "");
  let file = resolve(UI_DIST, requested);
  const inside = file === UI_DIST || file.startsWith(UI_DIST + sep);
  if (!inside || !existsSync(file) || !statSync(file).isFile()) file = join(UI_DIST, "index.html");
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
}

/** Bind to 127.0.0.1 only: the API can write program files and start runs. */
export async function startHttpServer(
  store: Store,
  options: { port?: number; extraRoute?: ExtraRoute } = {},
): Promise<HttpServer> {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (options.extraRoute && (await options.extraRoute(req, res))) return;
      if (url.pathname.startsWith("/api/")) {
        const name = url.pathname.slice("/api/".length);
        if (req.method !== "POST") return json(res, 405, { error: "Use POST with a JSON body." });
        if (!isHandlerName(name)) return json(res, 404, { error: `No API handler "${name}".` });
        const raw = await readBody(req);
        const params = raw.trim() === "" ? {} : (JSON.parse(raw) as Record<string, unknown>);
        return json(res, 200, await callHandler(store, name, params));
      }
      if (req.method !== "GET") return json(res, 405, { error: "Not found." });
      serveStatic(url.pathname, res);
    } catch (err) {
      if (!res.headersSent) json(res, 500, { error: (err as Error).message });
      else res.end();
    }
  });

  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    if (new URL(req.url ?? "/", "http://127.0.0.1").pathname !== "/ws") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  await new Promise<void>((done, fail) => {
    server.once("error", fail);
    server.listen(options.port ?? 4747, "127.0.0.1", done);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : (options.port ?? 4747);

  return {
    server,
    port,
    broadcast(message) {
      const text = JSON.stringify(message);
      for (const client of wss.clients) if (client.readyState === 1) client.send(text);
    },
    close() {
      return new Promise<void>((done) => {
        for (const client of wss.clients) client.terminate();
        wss.close();
        server.close(() => done());
        server.closeAllConnections();
      });
    },
  };
}
