import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import type { WolderConfig } from "./types.js"

const DEFAULTS: Required<WolderConfig> = {
  model: "claude-sonnet-4-6",
  apiKey: "",
  temperature: 0,
  devCommand: "npm run dev",
  devPort: 3000,
  devReadyPattern: "listening on port",
  maxRetries: 3,
  manifestPath: "wolder.manifest.json",
  protectedPatterns: [],
}

export function defineConfig(config: WolderConfig): WolderConfig {
  return config
}

export async function loadConfig(root: string): Promise<Required<WolderConfig>> {
  const configPath = resolve(root, "wolder.config.ts")

  if (!existsSync(configPath)) {
    return { ...DEFAULTS }
  }

  // Dynamic import of the config file via tsx
  const fileUrl = pathToFileURL(configPath).href
  const mod = await import(fileUrl)
  const userConfig: WolderConfig = mod.default ?? mod

  return mergeConfig(userConfig)
}

export function mergeConfig(
  userConfig: WolderConfig,
  cliOverrides: Partial<WolderConfig> = {},
): Required<WolderConfig> {
  return {
    model: cliOverrides.model ?? userConfig.model ?? DEFAULTS.model,
    apiKey: cliOverrides.apiKey ?? userConfig.apiKey ?? DEFAULTS.apiKey,
    temperature: cliOverrides.temperature ?? userConfig.temperature ?? DEFAULTS.temperature,
    devCommand: cliOverrides.devCommand ?? userConfig.devCommand ?? DEFAULTS.devCommand,
    devPort: cliOverrides.devPort ?? userConfig.devPort ?? DEFAULTS.devPort,
    devReadyPattern: cliOverrides.devReadyPattern ?? userConfig.devReadyPattern ?? DEFAULTS.devReadyPattern,
    maxRetries: cliOverrides.maxRetries ?? userConfig.maxRetries ?? DEFAULTS.maxRetries,
    manifestPath: cliOverrides.manifestPath ?? userConfig.manifestPath ?? DEFAULTS.manifestPath,
    protectedPatterns: cliOverrides.protectedPatterns ?? userConfig.protectedPatterns ?? DEFAULTS.protectedPatterns,
  }
}
