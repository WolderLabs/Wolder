import { existsSync, readFileSync, readdirSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { RECORD_DIR, listRuns, readEvents, safeDirName } from "@wolder/core";
import type { RunEvent, RunMeta } from "@wolder/core";

export function runDirOf(root: string, runId: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(runId) || runId.includes("..")) {
    throw new Error(`"${runId}" is not a run id`);
  }
  const dir = join(root, RECORD_DIR, "runs", runId);
  if (!existsSync(dir)) throw new Error(`No recorded run "${runId}"`);
  return dir;
}

export function runsOf(root: string): RunMeta[] {
  return listRuns(root);
}

export function eventsOf(root: string, runId: string): RunEvent[] {
  return readEvents(runDirOf(root, runId));
}

export function metaOf(root: string, runId: string): RunMeta {
  return JSON.parse(readFileSync(join(runDirOf(root, runId), "run.json"), "utf-8")) as RunMeta;
}

/** The tree of the last snapshot event with `seq <= at`, or empty. */
export function treeAt(
  events: readonly RunEvent[],
  at: number,
): { tree: Record<string, string>; seq: number } {
  let found: { tree: Record<string, string>; seq: number } = { tree: {}, seq: -1 };
  for (const event of events) {
    if (event.seq > at) break;
    if (event.kind === "snapshot") {
      found = { tree: (event.data as { tree: Record<string, string> }).tree, seq: event.seq };
    }
  }
  return found;
}

export function readBlob(root: string, sha: string): string | null {
  if (!/^[0-9a-f]{64}$/.test(sha)) return null;
  const path = join(root, RECORD_DIR, "objects", sha);
  return existsSync(path) ? readFileSync(path, "utf-8") : null;
}

/** Resolve a project-relative path, refusing anything that escapes the root. */
export function insideRoot(root: string, path: string): string {
  const abs = resolve(root, path);
  const rel = relative(resolve(root), abs);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`"${path}" is outside the project root`);
  }
  return abs;
}

export function readPrompts(
  runDir: string,
  nodeId: string,
): Array<{ attempt: number; system: string; user: string }> {
  const dir = join(runDir, "nodes", safeDirName(nodeId));
  if (!existsSync(dir)) return [];
  const prompts: Array<{ attempt: number; system: string; user: string }> = [];
  for (const name of readdirSync(dir)) {
    const match = /^prompt-(\d+)\.md$/.exec(name);
    if (!match) continue;
    const text = readFileSync(join(dir, name), "utf-8");
    const marker = "\n\n# User\n\n";
    const split = text.indexOf(marker);
    const system = text.slice("# System\n\n".length, split === -1 ? undefined : split);
    const user = split === -1 ? "" : text.slice(split + marker.length).replace(/\n$/, "");
    prompts.push({ attempt: Number(match[1]), system, user });
  }
  return prompts.sort((a, b) => a.attempt - b.attempt);
}
