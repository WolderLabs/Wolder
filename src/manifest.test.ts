import { describe, it, expect, beforeEach } from "vitest"
import { mkdtempSync, existsSync } from "node:fs"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  createEmptyManifest,
  readManifest,
  writeManifest,
  updateManifestNode,
  computeOutputHash,
  computeInputHashes,
  computeCacheKey,
  isFresh,
  getDependents,
  topologicalSort,
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
      dependsOn: [],
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
    expect(loaded.nodes.todoService!.dependsOn).toEqual([])
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
      dependsOn: [],
      lastRun: "2026-01-01T00:00:00Z",
    }

    updateManifestNode(m, "app", {
      inputHashes: {},
      outputHash: "new",
      generatedFiles: ["src/app.ts"],
      expectations: [],
      dependsOn: [],
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
      dependsOn: [],
    })
    updateManifestNode(m, "b", {
      inputHashes: {},
      outputHash: "hash-b",
      generatedFiles: ["b.ts"],
      expectations: [],
      dependsOn: ["a"],
    })

    expect(Object.keys(m.nodes)).toEqual(["a", "b"])
    expect(m.nodes.b!.dependsOn).toEqual(["a"])
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

describe("cache key + freshness", () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "wolder-cache-"))
  })

  it("computeInputHashes includes act hash and model", () => {
    const hashes = computeInputHashes("Create a service", [], "claude-sonnet-4-6", root)
    expect(hashes["act:sha256"]).toMatch(/^[a-f0-9]{64}$/)
    expect(hashes.model).toBe("claude-sonnet-4-6")
  })

  it("computeInputHashes includes input file hashes", () => {
    writeFileSync(join(root, "input.ts"), "export const x = 1")
    const hashes = computeInputHashes(
      "Generate",
      [{ path: "input.ts", kind: "input" }],
      "test",
      root,
    )
    expect(hashes["input.ts"]).toMatch(/^[a-f0-9]{64}$/)
  })

  it("computeInputHashes includes artifact outputHash", () => {
    const hashes = computeInputHashes(
      "Generate",
      [{ kind: "artifact", id: "svc", outputHash: "abc123", generatedFiles: ["svc.ts"], members: {} }],
      "test",
      root,
    )
    expect(hashes["artifact:svc"]).toBe("abc123")
  })

  it("computeInputHashes changes when input file content changes", () => {
    writeFileSync(join(root, "input.ts"), "v1")
    const h1 = computeInputHashes("Go", [{ path: "input.ts", kind: "input" }], "test", root)

    writeFileSync(join(root, "input.ts"), "v2")
    const h2 = computeInputHashes("Go", [{ path: "input.ts", kind: "input" }], "test", root)

    expect(h1["input.ts"]).not.toBe(h2["input.ts"])
  })

  it("computeInputHashes changes when act instruction changes", () => {
    const h1 = computeInputHashes("Create a service", [], "test", root)
    const h2 = computeInputHashes("Create a controller", [], "test", root)
    expect(h1["act:sha256"]).not.toBe(h2["act:sha256"])
  })

  it("computeCacheKey is deterministic regardless of key insertion order", () => {
    const a = { "act:sha256": "abc", model: "test", "input.ts": "def" }
    const b = { model: "test", "input.ts": "def", "act:sha256": "abc" }
    expect(computeCacheKey(a)).toBe(computeCacheKey(b))
  })

  it("isFresh returns false when node not in manifest", () => {
    const m = createEmptyManifest()
    expect(isFresh(m, "missing", { "act:sha256": "abc" })).toBe(false)
  })

  it("isFresh returns true when input hashes match", () => {
    const hashes = { "act:sha256": "abc", model: "test" }
    const m = createEmptyManifest()
    updateManifestNode(m, "svc", {
      inputHashes: hashes,
      outputHash: "out",
      generatedFiles: ["svc.ts"],
      expectations: [],
      dependsOn: [],
    })

    expect(isFresh(m, "svc", hashes)).toBe(true)
  })

  it("isFresh returns false when act hash changes", () => {
    const m = createEmptyManifest()
    updateManifestNode(m, "svc", {
      inputHashes: { "act:sha256": "old", model: "test" },
      outputHash: "out",
      generatedFiles: ["svc.ts"],
      expectations: [],
      dependsOn: [],
    })

    expect(isFresh(m, "svc", { "act:sha256": "new", model: "test" })).toBe(false)
  })

  it("isFresh returns false when input file hash changes", () => {
    const m = createEmptyManifest()
    updateManifestNode(m, "svc", {
      inputHashes: { "act:sha256": "abc", model: "test", "input.ts": "hash1" },
      outputHash: "out",
      generatedFiles: ["svc.ts"],
      expectations: [],
      dependsOn: [],
    })

    expect(
      isFresh(m, "svc", { "act:sha256": "abc", model: "test", "input.ts": "hash2" }),
    ).toBe(false)
  })

  it("isFresh returns false when model changes", () => {
    const m = createEmptyManifest()
    updateManifestNode(m, "svc", {
      inputHashes: { "act:sha256": "abc", model: "claude-sonnet-4-6" },
      outputHash: "out",
      generatedFiles: ["svc.ts"],
      expectations: [],
      dependsOn: [],
    })

    expect(
      isFresh(m, "svc", { "act:sha256": "abc", model: "claude-opus-4-6" }),
    ).toBe(false)
  })

  it("isFresh returns false when upstream artifact outputHash changes", () => {
    const m = createEmptyManifest()
    updateManifestNode(m, "controller", {
      inputHashes: { "act:sha256": "abc", model: "test", "artifact:svc": "hash-v1" },
      outputHash: "out",
      generatedFiles: ["controller.ts"],
      expectations: [],
      dependsOn: ["svc"],
    })

    // Upstream re-ran and produced a new outputHash
    expect(
      isFresh(m, "controller", { "act:sha256": "abc", model: "test", "artifact:svc": "hash-v2" }),
    ).toBe(false)
  })
})

describe("DAG operations", () => {
  it("getDependents returns direct dependents", () => {
    const m = createEmptyManifest()
    updateManifestNode(m, "svc", {
      inputHashes: {},
      outputHash: "h1",
      generatedFiles: ["svc.ts"],
      expectations: [],
      dependsOn: [],
    })
    updateManifestNode(m, "controller", {
      inputHashes: {},
      outputHash: "h2",
      generatedFiles: ["controller.ts"],
      expectations: [],
      dependsOn: ["svc"],
    })

    expect(getDependents(m, "svc")).toEqual(["controller"])
    expect(getDependents(m, "controller")).toEqual([])
  })

  it("getDependents returns transitive dependents", () => {
    const m = createEmptyManifest()
    updateManifestNode(m, "model", {
      inputHashes: {},
      outputHash: "h1",
      generatedFiles: ["model.ts"],
      expectations: [],
      dependsOn: [],
    })
    updateManifestNode(m, "svc", {
      inputHashes: {},
      outputHash: "h2",
      generatedFiles: ["svc.ts"],
      expectations: [],
      dependsOn: ["model"],
    })
    updateManifestNode(m, "controller", {
      inputHashes: {},
      outputHash: "h3",
      generatedFiles: ["controller.ts"],
      expectations: [],
      dependsOn: ["svc"],
    })
    updateManifestNode(m, "app", {
      inputHashes: {},
      outputHash: "h4",
      generatedFiles: ["app.ts"],
      expectations: [],
      dependsOn: ["controller"],
    })

    expect(getDependents(m, "model")).toEqual(["svc", "controller", "app"])
    expect(getDependents(m, "svc")).toEqual(["controller", "app"])
    expect(getDependents(m, "controller")).toEqual(["app"])
  })

  it("topologicalSort returns nodes in dependency order", () => {
    const m = createEmptyManifest()
    // Insert in reverse order to verify sorting
    updateManifestNode(m, "app", {
      inputHashes: {},
      outputHash: "h3",
      generatedFiles: ["app.ts"],
      expectations: [],
      dependsOn: ["controller"],
    })
    updateManifestNode(m, "controller", {
      inputHashes: {},
      outputHash: "h2",
      generatedFiles: ["controller.ts"],
      expectations: [],
      dependsOn: ["svc"],
    })
    updateManifestNode(m, "svc", {
      inputHashes: {},
      outputHash: "h1",
      generatedFiles: ["svc.ts"],
      expectations: [],
      dependsOn: [],
    })

    const sorted = topologicalSort(m)
    const svcIdx = sorted.indexOf("svc")
    const ctrlIdx = sorted.indexOf("controller")
    const appIdx = sorted.indexOf("app")

    expect(svcIdx).toBeLessThan(ctrlIdx)
    expect(ctrlIdx).toBeLessThan(appIdx)
  })

  it("topologicalSort handles diamond dependencies", () => {
    const m = createEmptyManifest()
    updateManifestNode(m, "base", {
      inputHashes: {},
      outputHash: "h1",
      generatedFiles: ["base.ts"],
      expectations: [],
      dependsOn: [],
    })
    updateManifestNode(m, "left", {
      inputHashes: {},
      outputHash: "h2",
      generatedFiles: ["left.ts"],
      expectations: [],
      dependsOn: ["base"],
    })
    updateManifestNode(m, "right", {
      inputHashes: {},
      outputHash: "h3",
      generatedFiles: ["right.ts"],
      expectations: [],
      dependsOn: ["base"],
    })
    updateManifestNode(m, "top", {
      inputHashes: {},
      outputHash: "h4",
      generatedFiles: ["top.ts"],
      expectations: [],
      dependsOn: ["left", "right"],
    })

    const sorted = topologicalSort(m)
    const baseIdx = sorted.indexOf("base")
    const leftIdx = sorted.indexOf("left")
    const rightIdx = sorted.indexOf("right")
    const topIdx = sorted.indexOf("top")

    expect(baseIdx).toBeLessThan(leftIdx)
    expect(baseIdx).toBeLessThan(rightIdx)
    expect(leftIdx).toBeLessThan(topIdx)
    expect(rightIdx).toBeLessThan(topIdx)
  })

  it("topologicalSort detects cycles", () => {
    const m = createEmptyManifest()
    updateManifestNode(m, "a", {
      inputHashes: {},
      outputHash: "h1",
      generatedFiles: ["a.ts"],
      expectations: [],
      dependsOn: ["b"],
    })
    updateManifestNode(m, "b", {
      inputHashes: {},
      outputHash: "h2",
      generatedFiles: ["b.ts"],
      expectations: [],
      dependsOn: ["a"],
    })

    expect(() => topologicalSort(m)).toThrow(/Cycle detected/)
  })

  it("getDependents with no dependents returns empty array", () => {
    const m = createEmptyManifest()
    updateManifestNode(m, "standalone", {
      inputHashes: {},
      outputHash: "h1",
      generatedFiles: ["standalone.ts"],
      expectations: [],
      dependsOn: [],
    })

    expect(getDependents(m, "standalone")).toEqual([])
  })
})
