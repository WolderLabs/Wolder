import { describe, it, expect } from "vitest";
import { DEFAULTS, defineConfig, mergeConfig } from "./config.js";

describe("mergeConfig", () => {
  it("returns the defaults when nothing is supplied", () => {
    expect(mergeConfig()).toEqual(DEFAULTS);
  });

  it("lets user config win over the defaults", () => {
    expect(mergeConfig({ maxRetries: 7 }).maxRetries).toBe(7);
    expect(mergeConfig({ maxRetries: 7 }).model).toBe(DEFAULTS.model);
  });

  it("lets an override win over user config", () => {
    expect(mergeConfig({ model: "a" }, { model: "b" }).model).toBe("b");
  });

  it("ignores an undefined override", () => {
    expect(mergeConfig({ model: "a" }, { model: undefined }).model).toBe("a");
  });

  it("carries the v2-only settings", () => {
    const merged = mergeConfig({ negotiationRounds: 5, maxTurns: 10 });
    expect(merged.negotiationRounds).toBe(5);
    expect(merged.maxTurns).toBe(10);
  });
});

describe("defineConfig", () => {
  it("passes the config straight through, typed", () => {
    const config = defineConfig({ model: "claude-sonnet-4-6" });
    expect(config).toEqual({ model: "claude-sonnet-4-6" });
  });
});
