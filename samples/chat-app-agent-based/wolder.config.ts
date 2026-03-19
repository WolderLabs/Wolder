import { defineConfig } from "@wolder/typescript-testing"

export default defineConfig({
  model: "claude-sonnet-4-6",
  maxRetries: 3,
  devCommand: "tsx src/server.ts",
  devPort: 3000,
  devReadyPattern: "listening on port",
})
