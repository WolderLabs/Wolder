import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import { createHash } from "node:crypto"
import type { Expectation } from "./types.js"

export interface ManifestNode {
  nodeId: string
  inputHashes: Record<string, string>
  outputHash: string
  generatedFiles: string[]
  expectations: Expectation[]
  compiledAssertions: Record<string, string>
  lastRun: string
}

export interface Manifest {
  version: number
  nodes: Record<string, ManifestNode>
}

const MANIFEST_VERSION = 1

export function createEmptyManifest(): Manifest {
  return { version: MANIFEST_VERSION, nodes: {} }
}

export function readManifest(root: string, manifestPath = "wolder.manifest.json"): Manifest {
  const absPath = resolve(root, manifestPath)
  if (!existsSync(absPath)) {
    return createEmptyManifest()
  }
  const raw = readFileSync(absPath, "utf-8")
  return JSON.parse(raw) as Manifest
}

export function writeManifest(
  manifest: Manifest,
  root: string,
  manifestPath = "wolder.manifest.json",
): void {
  const absPath = resolve(root, manifestPath)
  writeFileSync(absPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8")
}

export function computeOutputHash(files: Array<{ path: string; content: string }>): string {
  const hash = createHash("sha256")
  for (const file of files.sort((a, b) => a.path.localeCompare(b.path))) {
    hash.update(file.path)
    hash.update(file.content)
  }
  return hash.digest("hex")
}

export function updateManifestNode(
  manifest: Manifest,
  nodeId: string,
  data: {
    inputHashes: Record<string, string>
    outputHash: string
    generatedFiles: string[]
    expectations: Expectation[]
  },
): void {
  manifest.nodes[nodeId] = {
    nodeId,
    inputHashes: data.inputHashes,
    outputHash: data.outputHash,
    generatedFiles: data.generatedFiles,
    expectations: data.expectations,
    compiledAssertions: manifest.nodes[nodeId]?.compiledAssertions ?? {},
    lastRun: new Date().toISOString(),
  }
}
