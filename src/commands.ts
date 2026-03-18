import { readFileSync, existsSync, unlinkSync, rmdirSync, readdirSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { createHash } from "node:crypto"
import { readManifest, computeOutputHash } from "./manifest.js"

export interface NodeStatus {
  nodeId: string
  status: "fresh" | "drifted" | "missing"
  generatedFiles: string[]
  details?: string
}

/**
 * wolder check — compare current file hashes against manifest.
 * Reports which nodes are fresh, drifted (manually edited), or missing files.
 */
export function check(root: string): NodeStatus[] {
  const manifest = readManifest(root)
  const results: NodeStatus[] = []

  for (const [nodeId, node] of Object.entries(manifest.nodes)) {
    const missingFiles: string[] = []
    const files: Array<{ path: string; content: string }> = []

    for (const file of node.generatedFiles) {
      const absPath = resolve(root, file)
      if (!existsSync(absPath)) {
        missingFiles.push(file)
      } else {
        files.push({ path: file, content: readFileSync(absPath, "utf-8") })
      }
    }

    if (missingFiles.length > 0) {
      results.push({
        nodeId,
        status: "missing",
        generatedFiles: node.generatedFiles,
        details: `Missing files: ${missingFiles.join(", ")}`,
      })
      continue
    }

    const currentHash = computeOutputHash(files)

    if (currentHash === node.outputHash) {
      results.push({
        nodeId,
        status: "fresh",
        generatedFiles: node.generatedFiles,
      })
    } else {
      results.push({
        nodeId,
        status: "drifted",
        generatedFiles: node.generatedFiles,
        details:
          `Files have been manually modified.\n` +
          `  Expected hash: ${node.outputHash.slice(0, 12)}...\n` +
          `  Current hash:  ${currentHash.slice(0, 12)}...\n` +
          `  Run 'wolder regen ${nodeId}' to regenerate\n` +
          `  Run 'wolder accept ${nodeId}' to accept current state`,
      })
    }
  }

  return results
}

/**
 * wolder clean — remove all generated files tracked in the manifest.
 * Preserves inputs, the program file, and the manifest itself.
 * Returns the list of deleted files.
 */
export function clean(root: string): string[] {
  const manifest = readManifest(root)
  const deleted: string[] = []

  for (const node of Object.values(manifest.nodes)) {
    for (const file of node.generatedFiles) {
      const absPath = resolve(root, file)
      if (existsSync(absPath)) {
        unlinkSync(absPath)
        deleted.push(file)

        // Remove empty parent directories
        let dir = dirname(absPath)
        while (dir !== root && dir !== resolve(root)) {
          try {
            const entries = readdirSync(dir)
            if (entries.length === 0) {
              rmdirSync(dir)
              dir = dirname(dir)
            } else {
              break
            }
          } catch {
            break
          }
        }
      }
    }
  }

  return deleted
}
