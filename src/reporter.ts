import type { BuildResult, Reporter } from "./types.js";
import * as log from "./log.js";

/**
 * Nothing streams while a program body runs — declarations are synchronous and
 * do no work. Progress belongs to `build()`, which is exactly why `build()` is
 * explicit rather than an exit hook.
 */
export function createConsoleReporter(): Reporter {
  return {
    phase(name) {
      console.log("");
      log.info(log.bold(name));
    },
    nodeStart(id, detail) {
      log.info(`${log.bold(id)}${detail ? ` ${log.dim(detail)}` : ""}`);
    },
    nodeSkipped(id, reason) {
      log.success(`${log.bold(id)} ${log.dim(reason)}`);
    },
    nodeDone(id, files) {
      log.success(`${log.bold(id)} wrote ${files.length} file(s)`);
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
      const bits = [
        `${ran} generated`,
        `${result.skipped.length} cached`,
        `${result.contracts.length} contract(s)`,
        `${(result.durationMs / 1000).toFixed(1)}s`,
      ];
      log.success(bits.join("  ·  "));
    },
  };
}

export function createSilentReporter(): Reporter {
  return {
    phase() {},
    nodeStart() {},
    nodeSkipped() {},
    nodeDone() {},
    note() {},
    warn() {},
    summary() {},
  };
}
