import { defineConfig } from "@wolder/typescript"

export default defineConfig({
  model: "claude-sonnet-4-6",
  maxRetries: 3,
  protectedPatterns: ["src/models/**"],
})
