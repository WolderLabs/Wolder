import type { AgentEvent, BuildResult, Reporter } from "./types.js";
import * as log from "./log.js";

/**
 * Nothing streams while a program body runs — declarations are synchronous and do
 * no work. Progress belongs to `build()`, which is exactly why `build()` is
 * explicit rather than an exit hook.
 *
 * Generation takes minutes, so the console reporter narrates it: every tool an
 * agent reaches for, stamped with how long that node has been going, and every
 * API retry, which is usually what a stall actually is.
 */
export function createConsoleReporter(options: { verbose?: boolean } = {}): Reporter {
  const started = new Map<string, number>();
  const verbose = options.verbose ?? true;

  const elapsed = (id: string): string => {
    const start = started.get(id);
    if (start === undefined) return "";
    const seconds = Math.round((Date.now() - start) / 1000);
    return log.dim(`+${seconds}s`.padStart(6));
  };

  return {
    phase(name) {
      console.log("");
      log.info(log.bold(name));
    },
    nodeStart(id, detail) {
      started.set(id, Date.now());
      log.info(`${log.bold(id)}${detail ? ` ${log.dim(detail)}` : ""}`);
    },
    nodeEvent(id, event) {
      if (!verbose && event.kind !== "retry" && event.kind !== "denied") return;
      const line = formatEvent(event);
      if (line) console.log(`    ${elapsed(id)} ${line}`);
    },
    nodeSkipped(id, reason) {
      log.success(`${log.bold(id)} ${log.dim(reason)}`);
    },
    nodeDone(id, files) {
      log.success(
        `${log.bold(id)} wrote ${files.length} file(s) ${log.dim(`in ${since(started.get(id))}`)}`,
      );
      for (const file of files) console.log(`    ${log.cyan(file)}`);
    },
    note(message) {
      log.info(message);
    },
    warn(message) {
      log.warn(message);
    },
    summary(result: BuildResult) {
      console.log("");
      const ran = result.artifacts.length - result.skipped.length;
      log.success(
        [
          `${ran} generated`,
          `${result.skipped.length} cached`,
          `${result.contracts.length} contract(s)`,
          `${(result.durationMs / 1000).toFixed(1)}s`,
        ].join("  ·  "),
      );
    },
  };
}

function formatEvent(event: AgentEvent): string {
  switch (event.kind) {
    case "tool":
      return `${log.cyan(event.name)}${event.detail ? ` ${log.dim(event.detail)}` : ""}`;
    case "text":
      return log.dim(event.text);
    case "denied":
      return log.yellow(
        `refused ${event.name}${event.detail ? ` ${event.detail}` : ""} — outside its region`,
      );
    case "retry":
      return log.yellow(
        `API retry ${event.attempt}/${event.maxAttempts} after ${event.reason}` +
          ` — waiting ${Math.round(event.delayMs / 1000)}s`,
      );
    case "note":
      return log.dim(event.text);
  }
}

function since(start: number | undefined): string {
  if (start === undefined) return "?";
  return `${((Date.now() - start) / 1000).toFixed(1)}s`;
}

export function createSilentReporter(): Reporter {
  return {
    phase() {},
    nodeStart() {},
    nodeEvent() {},
    nodeSkipped() {},
    nodeDone() {},
    note() {},
    warn() {},
    summary() {},
  };
}
