import { describe, it, expect, beforeEach } from "vitest"
import { mkdtempSync, writeFileSync, existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { check, clean } from "./commands.js"
import { createEmptyManifest, writeManifest, updateManifestNode, computeOutputHash } from "./manifest.js"

describe("check", () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "wolder-cmd-"))
  })

  it("returns empty array when manifest has no nodes", () => {
    const results = check(root)
    expect(results).toEqual([])
  })

  it("reports fresh when file hashes match", () => {
    const content = "export class Svc {}"
    mkdirSync(join(root, "src"), { recursive: true })
    writeFileSync(join(root, "src/svc.ts"), content)

    const m = createEmptyManifest()
    const hash = computeOutputHash([{ path: "src/svc.ts", content }])
    updateManifestNode(m, "svc", {
      inputHashes: {},
      outputHash: hash,
      generatedFiles: ["src/svc.ts"],
      expectations: [],
      dependsOn: [],
    })
    writeManifest(m, root)

    const results = check(root)
    expect(results).toHaveLength(1)
    expect(results[0]!.status).toBe("fresh")
  })

  it("reports drifted when file has been modified", () => {
    mkdirSync(join(root, "src"), { recursive: true })
    writeFileSync(join(root, "src/svc.ts"), "original content")

    const m = createEmptyManifest()
    updateManifestNode(m, "svc", {
      inputHashes: {},
      outputHash: computeOutputHash([{ path: "src/svc.ts", content: "original content" }]),
      generatedFiles: ["src/svc.ts"],
      expectations: [],
      dependsOn: [],
    })
    writeManifest(m, root)

    // Simulate manual edit
    writeFileSync(join(root, "src/svc.ts"), "modified content")

    const results = check(root)
    expect(results).toHaveLength(1)
    expect(results[0]!.status).toBe("drifted")
    expect(results[0]!.details).toContain("manually modified")
    expect(results[0]!.details).toContain("wolder run")
    expect(results[0]!.details).not.toContain("accept")
  })

  it("reports missing when generated file was deleted", () => {
    const m = createEmptyManifest()
    updateManifestNode(m, "svc", {
      inputHashes: {},
      outputHash: "abc",
      generatedFiles: ["src/svc.ts"],
      expectations: [],
      dependsOn: [],
    })
    writeManifest(m, root)

    const results = check(root)
    expect(results).toHaveLength(1)
    expect(results[0]!.status).toBe("missing")
    expect(results[0]!.details).toContain("src/svc.ts")
  })

  it("reports multiple nodes independently", () => {
    mkdirSync(join(root, "src"), { recursive: true })
    writeFileSync(join(root, "src/a.ts"), "a")
    writeFileSync(join(root, "src/b.ts"), "modified")

    const m = createEmptyManifest()
    updateManifestNode(m, "a", {
      inputHashes: {},
      outputHash: computeOutputHash([{ path: "src/a.ts", content: "a" }]),
      generatedFiles: ["src/a.ts"],
      expectations: [],
      dependsOn: [],
    })
    updateManifestNode(m, "b", {
      inputHashes: {},
      outputHash: computeOutputHash([{ path: "src/b.ts", content: "original" }]),
      generatedFiles: ["src/b.ts"],
      expectations: [],
      dependsOn: [],
    })
    writeManifest(m, root)

    const results = check(root)
    expect(results).toHaveLength(2)

    const a = results.find((r) => r.nodeId === "a")!
    const b = results.find((r) => r.nodeId === "b")!
    expect(a.status).toBe("fresh")
    expect(b.status).toBe("drifted")
  })
})

describe("clean", () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "wolder-clean-"))
  })

  it("returns empty array when no generated files exist", () => {
    const m = createEmptyManifest()
    writeManifest(m, root)

    const deleted = clean(root)
    expect(deleted).toEqual([])
  })

  it("deletes generated files", () => {
    mkdirSync(join(root, "src"), { recursive: true })
    writeFileSync(join(root, "src/svc.ts"), "content")

    const m = createEmptyManifest()
    updateManifestNode(m, "svc", {
      inputHashes: {},
      outputHash: "hash",
      generatedFiles: ["src/svc.ts"],
      expectations: [],
      dependsOn: [],
    })
    writeManifest(m, root)

    const deleted = clean(root)
    expect(deleted).toEqual(["src/svc.ts"])
    expect(existsSync(join(root, "src/svc.ts"))).toBe(false)
  })

  it("removes empty parent directories", () => {
    mkdirSync(join(root, "src/services"), { recursive: true })
    writeFileSync(join(root, "src/services/svc.ts"), "content")

    const m = createEmptyManifest()
    updateManifestNode(m, "svc", {
      inputHashes: {},
      outputHash: "hash",
      generatedFiles: ["src/services/svc.ts"],
      expectations: [],
      dependsOn: [],
    })
    writeManifest(m, root)

    clean(root)
    expect(existsSync(join(root, "src/services"))).toBe(false)
  })

  it("preserves non-empty parent directories", () => {
    mkdirSync(join(root, "src/services"), { recursive: true })
    writeFileSync(join(root, "src/services/svc.ts"), "generated")
    writeFileSync(join(root, "src/services/other.ts"), "keep me")

    const m = createEmptyManifest()
    updateManifestNode(m, "svc", {
      inputHashes: {},
      outputHash: "hash",
      generatedFiles: ["src/services/svc.ts"],
      expectations: [],
      dependsOn: [],
    })
    writeManifest(m, root)

    clean(root)
    expect(existsSync(join(root, "src/services/svc.ts"))).toBe(false)
    expect(existsSync(join(root, "src/services/other.ts"))).toBe(true)
    expect(existsSync(join(root, "src/services"))).toBe(true)
  })

  it("handles multiple nodes", () => {
    mkdirSync(join(root, "src"), { recursive: true })
    writeFileSync(join(root, "src/a.ts"), "a")
    writeFileSync(join(root, "src/b.ts"), "b")

    const m = createEmptyManifest()
    updateManifestNode(m, "a", {
      inputHashes: {},
      outputHash: "h1",
      generatedFiles: ["src/a.ts"],
      expectations: [],
      dependsOn: [],
    })
    updateManifestNode(m, "b", {
      inputHashes: {},
      outputHash: "h2",
      generatedFiles: ["src/b.ts"],
      expectations: [],
      dependsOn: [],
    })
    writeManifest(m, root)

    const deleted = clean(root)
    expect(deleted).toHaveLength(2)
    expect(deleted).toContain("src/a.ts")
    expect(deleted).toContain("src/b.ts")
  })

  it("skips already-deleted files gracefully", () => {
    const m = createEmptyManifest()
    updateManifestNode(m, "svc", {
      inputHashes: {},
      outputHash: "hash",
      generatedFiles: ["src/gone.ts"],
      expectations: [],
      dependsOn: [],
    })
    writeManifest(m, root)

    const deleted = clean(root)
    expect(deleted).toEqual([])
  })
})
