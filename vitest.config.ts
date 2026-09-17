import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "packages/*/src/**/*.test.ts"],
    // The DSL's compile-time guarantees — `requests` needing `provides`, the
    // immutable builder returns — are part of the contract, so `vitest run`
    // checks them alongside the runtime behaviour.
    typecheck: {
      enabled: true,
      include: ["src/**/*.test.ts", "packages/*/src/**/*.test.ts"],
      tsconfig: "tsconfig.test.json",
    },
  },
});
