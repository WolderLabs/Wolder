import { existsSync, readdirSync, rmdirSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { hashFiles, readManifest } from "./manifest.js";

export interface NodeStatus {
  nodeId: string;
  status: "fresh" | "drifted" | "missing";
  files: string[];
  details?: string;
}

/**
 * `wolder check` — compare what is on disk against the manifest.
 *
 * v2 records the files an agent *actually* wrote, discovered after the run, since
 * the output set is not known up front.
 */
export function check(root: string): NodeStatus[] {
  const manifest = readManifest(root);
  const results: NodeStatus[] = [];

  for (const [nodeId, node] of Object.entries(manifest.nodes)) {
    const missing = node.files.filter((file) => !existsSync(resolve(root, file)));

    if (missing.length > 0) {
      results.push({
        nodeId,
        status: "missing",
        files: node.files,
        details: `Missing files: ${missing.join(", ")}`,
      });
      continue;
    }

    const current = hashFiles(node.files, root);
    if (current === node.outputHash) {
      results.push({ nodeId, status: "fresh", files: node.files });
    } else {
      results.push({
        nodeId,
        status: "drifted",
        files: node.files,
        details:
          `Files have been modified by hand since the agent wrote them.\n` +
          `  Recorded: ${node.outputHash.slice(0, 12)}...  Current: ${current.slice(0, 12)}...\n` +
          `  Run 'wolder run' to regenerate.`,
      });
    }
  }

  return results;
}

/**
 * `wolder clean` — remove every file the manifest attributes to an agent.
 * Developer-owned files, the program, and the manifest itself are untouched.
 */
export function clean(root: string): string[] {
  const manifest = readManifest(root);
  const deleted: string[] = [];

  for (const node of Object.values(manifest.nodes)) {
    for (const file of node.files) {
      const abs = resolve(root, file);
      if (!existsSync(abs)) continue;
      unlinkSync(abs);
      deleted.push(file);
      removeEmptyParents(dirname(abs), resolve(root));
    }
  }

  return deleted;
}

function removeEmptyParents(dir: string, root: string): void {
  let current = dir;
  while (current !== root && current.startsWith(root)) {
    try {
      if (readdirSync(current).length > 0) return;
      rmdirSync(current);
      current = dirname(current);
    } catch {
      return;
    }
  }
}
