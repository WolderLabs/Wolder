import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import { createHash } from "node:crypto"
import type { Expectation, InputRef, Artifact, MemberRef } from "./types.js"

export interface ManifestNode {
  nodeId: string
  inputHashes: Record<string, string>
  outputHash: string
  generatedFiles: string[]
  expectations: Expectation[]
  compiledAssertions: Record<string, string>
  dependsOn: string[]
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

function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex")
}

export function computeInputHashes(
  actInstruction: string,
  inputs: Array<InputRef | Artifact | MemberRef>,
  model: string,
  root: string,
  scopeFiles: string[],
  expectations: Expectation[],
): Record<string, string> {
  const hashes: Record<string, string> = {
    "act:sha256": sha256(actInstruction),
    model,
    "scope:sha256": sha256(JSON.stringify(scopeFiles)),
    "expectations:sha256": sha256(JSON.stringify(expectations)),
  }

  for (const input of inputs) {
    if (input.kind === "input") {
      const absPath = resolve(root, input.path)
      if (existsSync(absPath)) {
        hashes[input.path] = sha256(readFileSync(absPath, "utf-8"))
      }
    } else if (input.kind === "member") {
      const absPath = resolve(root, input.filePath)
      if (existsSync(absPath)) {
        hashes[`member:${input.filePath}:${input.name}`] = sha256(
          readFileSync(absPath, "utf-8"),
        )
      }
    } else {
      // Artifact — use its outputHash directly as the cache key component
      const artifact = input as Artifact
      hashes[`artifact:${artifact.id}`] = artifact.outputHash
    }
  }

  return hashes
}

export function computeCacheKey(inputHashes: Record<string, string>): string {
  return sha256(JSON.stringify(inputHashes, Object.keys(inputHashes).sort(), 0))
}

export function isFresh(
  manifest: Manifest,
  nodeId: string,
  currentInputHashes: Record<string, string>,
): boolean {
  const existing = manifest.nodes[nodeId]
  if (!existing) return false

  const existingKey = computeCacheKey(existing.inputHashes)
  const currentKey = computeCacheKey(currentInputHashes)
  return existingKey === currentKey
}

export function updateManifestNode(
  manifest: Manifest,
  nodeId: string,
  data: {
    inputHashes: Record<string, string>
    outputHash: string
    generatedFiles: string[]
    expectations: Expectation[]
    dependsOn: string[]
  },
): void {
  manifest.nodes[nodeId] = {
    nodeId,
    inputHashes: data.inputHashes,
    outputHash: data.outputHash,
    generatedFiles: data.generatedFiles,
    expectations: data.expectations,
    compiledAssertions: manifest.nodes[nodeId]?.compiledAssertions ?? {},
    dependsOn: data.dependsOn,
    lastRun: new Date().toISOString(),
  }
}

/**
 * Get all downstream node IDs that depend (directly or transitively) on the given node.
 */
export function getDependents(manifest: Manifest, nodeId: string): string[] {
  const result: string[] = []
  const visited = new Set<string>()

  function walk(id: string) {
    for (const [candidateId, node] of Object.entries(manifest.nodes)) {
      if (!visited.has(candidateId) && node.dependsOn.includes(id)) {
        visited.add(candidateId)
        result.push(candidateId)
        walk(candidateId)
      }
    }
  }

  walk(nodeId)
  return result
}

/**
 * Return node IDs in topological order (dependencies before dependents).
 */
export function topologicalSort(manifest: Manifest): string[] {
  const sorted: string[] = []
  const visited = new Set<string>()
  const visiting = new Set<string>()

  function visit(id: string) {
    if (visited.has(id)) return
    if (visiting.has(id)) throw new Error(`Cycle detected involving node "${id}"`)
    visiting.add(id)

    const node = manifest.nodes[id]
    if (node) {
      for (const dep of node.dependsOn) {
        visit(dep)
      }
    }

    visiting.delete(id)
    visited.add(id)
    sorted.push(id)
  }

  for (const id of Object.keys(manifest.nodes)) {
    visit(id)
  }

  return sorted
}
