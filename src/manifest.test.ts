import { describe, it, expect, beforeEach } from "vitest"
import { mkdtempSync, readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  createEmptyManifest,
  readManifest,
  writeManifest,
  updateManifestNode,
  computeOutputHash,
} from "./manifest.js"

describe("manifest", () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "wolder-manifest-"))
  })

  it("createEmptyManifest returns version 1 with no nodes", () => {
    const m = createEmptyManifest()
    expect(m.version).toBe(1)
    expect(m.nodes).toEqual({})
  })

  it("readManifest returns empty manifest when file does not exist", () => {
    const m = readManifest(root)
    expect(m.version).toBe(1)
    expect(m.nodes).toEqual({})
  })

  it("writeManifest then readManifest round-trips", () => {
    const m = createEmptyManifest()
    updateManifestNode(m, "todoService", {
      inputHashes: { "act:sha256": "abc123", model: "claude-sonnet-4-6" },
      outputHash: "def456",
      generatedFiles: ["src/services/todoService.ts"],
      expectations: [{ type: "class", name: "TodoService" }],
    })

    writeManifest(m, root)

    expect(existsSync(join(root, "wolder.manifest.json"))).toBe(true)

    const loaded = readManifest(root)
    expect(loaded.version).toBe(1)
    expect(loaded.nodes.todoService).toBeDefined()
    expect(loaded.nodes.todoService!.nodeId).toBe("todoService")
    expect(loaded.nodes.todoService!.outputHash).toBe("def456")
    expect(loaded.nodes.todoService!.generatedFiles).toEqual([
      "src/services/todoService.ts",
    ])
    expect(loaded.nodes.todoService!.expectations).toEqual([
      { type: "class", name: "TodoService" },
    ])
    expect(loaded.nodes.todoService!.lastRun).toBeDefined()
  })

  it("updateManifestNode preserves existing compiledAssertions", () => {
    const m = createEmptyManifest()
    m.nodes.app = {
      nodeId: "app",
      inputHashes: {},
      outputHash: "old",
      generatedFiles: ["src/app.ts"],
      expectations: [],
      compiledAssertions: { "/todos": "await expect(page).toHaveTitle('Todos')" },
      lastRun: "2026-01-01T00:00:00Z",
    }

    updateManifestNode(m, "app", {
      inputHashes: {},
      outputHash: "new",
      generatedFiles: ["src/app.ts"],
      expectations: [],
    })

    expect(m.nodes.app!.outputHash).toBe("new")
    expect(m.nodes.app!.compiledAssertions).toEqual({
      "/todos": "await expect(page).toHaveTitle('Todos')",
    })
  })

  it("updateManifestNode adds multiple nodes", () => {
    const m = createEmptyManifest()
    updateManifestNode(m, "a", {
      inputHashes: {},
      outputHash: "hash-a",
      generatedFiles: ["a.ts"],
      expectations: [],
    })
    updateManifestNode(m, "b", {
      inputHashes: {},
      outputHash: "hash-b",
      generatedFiles: ["b.ts"],
      expectations: [],
    })

    expect(Object.keys(m.nodes)).toEqual(["a", "b"])
  })

  it("computeOutputHash is deterministic and order-independent", () => {
    const files = [
      { path: "b.ts", content: "const b = 2" },
      { path: "a.ts", content: "const a = 1" },
    ]
    const hash1 = computeOutputHash(files)
    const hash2 = computeOutputHash([...files].reverse())
    expect(hash1).toBe(hash2)
    expect(hash1).toMatch(/^[a-f0-9]{64}$/)
  })

  it("computeOutputHash changes when content changes", () => {
    const hash1 = computeOutputHash([{ path: "a.ts", content: "v1" }])
    const hash2 = computeOutputHash([{ path: "a.ts", content: "v2" }])
    expect(hash1).not.toBe(hash2)
  })

  it("writeManifest uses custom path", () => {
    const m = createEmptyManifest()
    writeManifest(m, root, "custom.manifest.json")
    expect(existsSync(join(root, "custom.manifest.json"))).toBe(true)

    const loaded = readManifest(root, "custom.manifest.json")
    expect(loaded.version).toBe(1)
  })
})
