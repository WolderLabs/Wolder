import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { DSL_REFERENCE } from "@wolder/core";
import { recordedProject } from "./fixture.js";
import { startHttpServer } from "./http.js";
import { createMcpServer, mcpRoute } from "./mcp.js";
import type { Store } from "./api.js";

let root: string;
let store: Store;

beforeEach(async () => {
  ({ root, store } = await recordedProject());
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

async function connect(): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createMcpServer(store).connect(serverSide);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientSide);
  return client;
}

const textOf = (result: unknown): string =>
  (result as { content: Array<{ text: string }> }).content[0]!.text;

describe("the MCP server", () => {
  it("lists one tool per handler plus wolder_explain", async () => {
    const client = await connect();
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "contract",
        "diff",
        "file",
        "graph",
        "node",
        "program_edit",
        "program_files",
        "run",
        "run_start",
        "runs",
        "snapshot",
        "wolder_explain",
      ].sort(),
    );
  });

  it("calls runs and node against a recorded run", async () => {
    const client = await connect();
    const runs = JSON.parse(textOf(await client.callTool({ name: "runs", arguments: {} })));
    expect(runs).toHaveLength(1);
    const node = JSON.parse(
      textOf(await client.callTool({ name: "node", arguments: { run: runs[0].id, id: "b/**" } })),
    );
    expect(node.files).toContain("b/two.ts");
    expect(node.prompts[0].user).toContain("second");
  });

  it("reports handler errors as tool errors", async () => {
    const client = await connect();
    const result = await client.callTool({ name: "run", arguments: { id: "missing" } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/No recorded run/);
  });

  it("explains the DSL", async () => {
    const client = await connect();
    expect(textOf(await client.callTool({ name: "wolder_explain", arguments: {} }))).toBe(
      DSL_REFERENCE,
    );
    expect(DSL_REFERENCE).toContain(".owns(");
  });

  it("is mounted at /mcp on the HTTP server", async () => {
    const http = await startHttpServer(store, { port: 0, extraRoute: mcpRoute(store) });
    try {
      const client = new Client({ name: "test", version: "0" });
      await client.connect(
        new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${http.port}/mcp`)),
      );
      const runs = JSON.parse(textOf(await client.callTool({ name: "runs", arguments: {} })));
      expect(runs).toHaveLength(1);
      await client.close();
    } finally {
      await http.close();
    }
  });
});
