import { describe, it, expect, beforeEach } from "vitest"
import { mkdtempSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { defineConfig, loadConfig, mergeConfig } from "./config.js"
import type { WolderConfig } from "./types.js"

describe("defineConfig", () => {
  it("passes through the config object", () => {
    const config = defineConfig({ model: "claude-opus-4-6", maxRetries: 5 })
    expect(config.model).toBe("claude-opus-4-6")
    expect(config.maxRetries).toBe(5)
  })
})

describe("mergeConfig", () => {
  it("uses defaults when no overrides", () => {
    const result = mergeConfig({})
    expect(result.model).toBe("claude-sonnet-4-6")
    expect(result.maxRetries).toBe(3)
    expect(result.temperature).toBe(0)
    expect(result.manifestPath).toBe("wolder.manifest.json")
    expect(result.protectedPatterns).toEqual([])
  })

  it("user config overrides defaults", () => {
    const result = mergeConfig({ model: "claude-opus-4-6", maxRetries: 5 })
    expect(result.model).toBe("claude-opus-4-6")
    expect(result.maxRetries).toBe(5)
    expect(result.temperature).toBe(0) // still default
  })

  it("CLI overrides take precedence over user config", () => {
    const result = mergeConfig(
      { model: "claude-opus-4-6", maxRetries: 5 },
      { model: "claude-haiku-4-5", maxRetries: 1 },
    )
    expect(result.model).toBe("claude-haiku-4-5")
    expect(result.maxRetries).toBe(1)
  })

  it("CLI overrides take precedence over defaults", () => {
    const result = mergeConfig({}, { temperature: 0.5 })
    expect(result.temperature).toBe(0.5)
  })

  it("merges all config fields", () => {
    const full: WolderConfig = {
      model: "test",
      apiKey: "sk-test",
      temperature: 0.7,
      devCommand: "yarn dev",
      devPort: 8080,
      devReadyPattern: "ready",
      maxRetries: 10,
      manifestPath: "custom.json",
      protectedPatterns: ["src/models/**"],
    }
    const result = mergeConfig(full)
    expect(result).toEqual(full)
  })
})

describe("loadConfig", () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "wolder-config-"))
  })

  it("returns defaults when no config file exists", async () => {
    const config = await loadConfig(root)
    expect(config.model).toBe("claude-sonnet-4-6")
    expect(config.maxRetries).toBe(3)
  })
})
