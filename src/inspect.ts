import { resolve, dirname } from "node:path";
import { existsSync } from "node:fs";
import { exec } from "node:child_process";
import { loadConfig } from "./config.js";
import * as log from "./log.js";

const DEFAULT_PROGRAM = "wolder.program.ts";
const DEFAULT_PORT = 4747;

/** The slice of @wolder/inspector used here; declared locally so core never type-depends on it. */
interface InspectorModule {
  createStore(programPath: string): unknown;
  reloadProgram(store: any): Promise<unknown>;
  runMcpStdio(store: any): Promise<void>;
  createInspector(options: {
    program: string;
    port?: number;
    buildUi?: boolean;
    chatModel?: string;
  }): Promise<{ url: string; close(): Promise<void> }>;
}

export interface InspectArgs {
  program: string;
  port: number;
  mcp: boolean;
  open: boolean;
}

/** Parse `wolder inspect` arguments. Throws an Error that teaches on bad input. */
export function parseInspectArgs(args: string[]): InspectArgs {
  const out: InspectArgs = { program: DEFAULT_PROGRAM, port: DEFAULT_PORT, mcp: false, open: true };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--mcp") out.mcp = true;
    else if (arg === "--no-open") out.open = false;
    else if (arg === "--port" || arg.startsWith("--port=")) {
      const raw = arg === "--port" ? args[++i] : arg.slice("--port=".length);
      const port = Number(raw);
      if (raw === undefined || !Number.isInteger(port) || port < 0 || port > 65535) {
        throw new Error(`--port needs a number between 0 and 65535, got "${raw ?? ""}". Example: wolder inspect --port 4747`);
      }
      out.port = port;
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option for inspect: ${arg}. Options: --port <n>, --mcp, --no-open.`);
    } else out.program = arg;
  }
  return out;
}

/** The command that opens a URL in the default browser on this platform. */
export function openCommand(url: string, platform: string = process.platform): string {
  if (platform === "darwin") return `open "${url}"`;
  if (platform === "win32") return `start "" "${url}"`;
  return `xdg-open "${url}"`;
}

function openBrowser(url: string): void {
  try {
    exec(openCommand(url), () => {});
  } catch {
    // Opening a browser is a convenience; the URL is printed regardless.
  }
}

export async function inspect(args: InspectArgs): Promise<void> {
  const program = resolve(process.cwd(), args.program);
  if (!existsSync(program)) {
    log.error(`Program file not found: ${program}`);
    log.info(`Specify a file: wolder inspect <file>`);
    process.exit(1);
  }

  // Lazy: core must not load the inspector (and its server dependencies) otherwise.
  const specifier = "@wolder/inspector";
  const inspector = (await import(specifier)) as InspectorModule;

  if (args.mcp) {
    // stdout belongs to the MCP protocol; nothing else may write to it.
    const store = inspector.createStore(program);
    await inspector.reloadProgram(store);
    await inspector.runMcpStdio(store);
    return;
  }

  const config = await loadConfig(dirname(program));
  const handle = await inspector.createInspector({
    program,
    port: args.port,
    buildUi: true,
    chatModel: config.inspectorModel || config.model,
  });
  log.success(`Inspector running at ${handle.url}  (Ctrl+C to stop)`);
  if (args.open) openBrowser(handle.url);
  const stop = () => void handle.close().finally(() => process.exit(0));
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
