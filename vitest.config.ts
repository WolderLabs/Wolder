import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The inspector UI's tests are type-checked by its own tsconfig (`npm run typecheck`).
    include: ["src/**/*.test.ts", "packages/*/src/**/*.test.ts", "packages/inspector/ui/src/**/*.test.ts"],
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
