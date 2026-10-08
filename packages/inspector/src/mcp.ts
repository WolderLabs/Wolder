import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { DSL_REFERENCE } from "@wolder/core";
import { callHandler } from "./api.js";
import type { HandlerName, Store } from "./api.js";

interface ToolSpec {
  /** The MCP tool name (underscores). */
  name: string;
  /** The API handler it calls. */
  handler: HandlerName;
  description: string;
  shape: z.ZodRawShape;
}

const run = z.string().describe("A run id, as listed by `runs`.");
const at = z
  .union([z.number().int(), z.literal("now")])
  .describe('An event sequence number from the run\'s events, or "now" for the files on disk.');

const TOOLS: ToolSpec[] = [
  {
    name: "graph",
    handler: "graph",
    description:
      "The assembled agent graph (nodes, edges, contracts, execution order) with each node and contract's freshness and the reasons it would re-run (from a dry-run plan), or the diagnostic explaining why the program does not assemble. Call this first to learn what the program declares.",
    shape: {},
  },
  {
    name: "runs",
    handler: "runs",
    description:
      "Every recorded run, newest first, with status and timing. Call this to find a run id for the other tools.",
    shape: {},
  },
  {
    name: "run",
    handler: "run",
    description:
      "One run's metadata and its full ordered event log. Call this to see what happened and in what order.",
    shape: { id: run },
  },
  {
    name: "node",
    handler: "node",
    description:
      "The prompt an agent received, every conversation turn, gate results and cache inputs for one node in one run. Call this before editing an agent's goal.",
    shape: { run, id: z.string().describe("A node id, as listed by `graph`.") },
  },
  {
    name: "contract",
    handler: "contract",
    description:
      "The settled terms of one contract and the full negotiation transcript between its agents. Call this when an agent disagrees with, or ignores, what a neighbour provides.",
    shape: { run, id: z.string().describe("A contract id such as `contract:src/services/**`.") },
  },
  {
    name: "snapshot",
    handler: "snapshot",
    description:
      "The project file tree (path to content hash) as it stood at a point in a run. Call this to see which files existed at a given event.",
    shape: { run, at: z.number().int().describe("An event sequence number.") },
  },
  {
    name: "file",
    handler: "file",
    description:
      'One file\'s content as of a point in a run, or from disk with at="now". Call this to read what an agent actually wrote.',
    shape: { run, at, path: z.string().describe("A project-relative path with forward slashes.") },
  },
  {
    name: "diff",
    handler: "diff",
    description:
      "The files added, removed and changed between two points in a run. Call this to see what one node contributed.",
    shape: {
      run,
      a: z.number().int().describe("The earlier event sequence number."),
      b: z.number().int().describe("The later event sequence number."),
    },
  },
  {
    name: "program_files",
    handler: "program.files",
    description:
      "The wolder program's source files and their contents. Call this to read the program before changing it.",
    shape: {},
  },
  {
    name: "program_edit",
    handler: "program.edit",
    description:
      "Replace the full content of one wolder program file; refuses any file that is not part of the program. Call this to change a goal, a region or an edge.",
    shape: {
      path: z.string().describe("An absolute path from `program_files`."),
      content: z.string().describe("The complete new file content."),
    },
  },
  {
    name: "run_start",
    handler: "run.start",
    description:
      "Start a generation run of the program and return its run id. Call this only when the user asks to run; it spends model tokens.",
    shape: { force: z.boolean().optional().describe("Re-run every node, ignoring the cache.") },
  },
];

function text(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

/** One MCP tool per API handler, plus `wolder_explain`. */
export function createMcpServer(
  store: Store,
  options: { exclude?: readonly string[] } = {},
): McpServer {
  const server = new McpServer({ name: "wolder-inspector", version: "0.1.0" });

  // The SDK's generic inference over a dynamic zod shape is excessively deep under
  // the zod copies this workspace resolves, so register through a loose signature.
  const register = server.registerTool.bind(server) as unknown as (
    name: string,
    config: { description: string; inputSchema: z.ZodRawShape },
    handler: (args: Record<string, unknown>) => Promise<unknown>,
  ) => void;

  for (const tool of TOOLS) {
    if (options.exclude?.includes(tool.name)) continue;
    register(
      tool.name,
      { description: tool.description, inputSchema: tool.shape },
      async (args) => {
        try {
          return text(await callHandler(store, tool.handler, args));
        } catch (err) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: (err as Error).message }],
          };
        }
      },
    );
  }

  server.registerTool(
    "wolder_explain",
    {
      description:
        "The reference for the wolder DSL: layers, agents, regions, edges and contracts. Call this before writing or editing a wolder program.",
    },
    async () => ({ content: [{ type: "text" as const, text: DSL_REFERENCE }] }),
  );

  return server;
}

/** Serve the MCP server on stdio until the transport closes. Used by `wolder inspect --mcp`. */
export async function runMcpStdio(store: Store): Promise<void> {
  const server = createMcpServer(store);
  await server.connect(new StdioServerTransport());
}

/**
 * The `/mcp` route for the HTTP server. Stateless: each request gets its own server
 * and transport, so there are no sessions to leak.
 */
export function mcpRoute(store: Store) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    if (new URL(req.url ?? "/", "http://127.0.0.1").pathname !== "/mcp") return false;
    const server = createMcpServer(store);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res);
    return true;
  };
}
