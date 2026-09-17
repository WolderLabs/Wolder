import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { WolderConfig } from "./types.js";
import { DEFAULT_MANIFEST_PATH } from "./manifest.js";

export const DEFAULTS: Required<WolderConfig> = {
  model: "claude-sonnet-4-6",
  apiKey: "",
  maxRetries: 3,
  manifestPath: DEFAULT_MANIFEST_PATH,
  negotiationRounds: 3,
  maxTurns: 40,
};

export function defineConfig(config: WolderConfig): WolderConfig {
  return config;
}

export async function loadConfig(root: string): Promise<Required<WolderConfig>> {
  const configPath = resolve(root, "wolder.config.ts");
  if (!existsSync(configPath)) return { ...DEFAULTS };

  const mod = await import(pathToFileURL(configPath).href);
  return mergeConfig((mod.default ?? mod) as WolderConfig);
}

export function mergeConfig(
  userConfig: WolderConfig = {},
  overrides: WolderConfig = {},
): Required<WolderConfig> {
  const pick = <K extends keyof WolderConfig>(key: K): Required<WolderConfig>[K] =>
    (overrides[key] ?? userConfig[key] ?? DEFAULTS[key]) as Required<WolderConfig>[K];

  return {
    model: pick("model"),
    apiKey: pick("apiKey"),
    maxRetries: pick("maxRetries"),
    manifestPath: pick("manifestPath"),
    negotiationRounds: pick("negotiationRounds"),
    maxTurns: pick("maxTurns"),
  };
}
