# Configuration

Wolder loads configuration from `wolder.config.ts` at your project root.

## Setup

```typescript
// wolder.config.ts
import { defineConfig } from "@wolder/core"

export default defineConfig({
  model: "claude-sonnet-4-6",
  apiKey: process.env.ANTHROPIC_API_KEY,
  temperature: 0,
  maxRetries: 3,
  manifestPath: "wolder.manifest.json",
  protectedPatterns: ["src/models/**", "src/interfaces/**"],

  // For expectWebPage() — only needed if using browser validation
  devCommand: "npm run dev",
  devPort: 3000,
  devReadyPattern: "listening on port",
})
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `model` | `string` | `"claude-sonnet-4-6"` | Anthropic model ID |
| `apiKey` | `string` | `""` | API key. Falls back to `ANTHROPIC_API_KEY` env var |
| `temperature` | `number` | `0` | LLM temperature. 0 = deterministic |
| `maxRetries` | `number` | `3` | Retry attempts on expectation failure |
| `manifestPath` | `string` | `"wolder.manifest.json"` | Path to the cache manifest |
| `protectedPatterns` | `string[]` | `[]` | Glob patterns for files that should never be generated |
| `devCommand` | `string` | `"npm run dev"` | Command to start dev server for `expectWebPage()` |
| `devPort` | `number` | `3000` | Port the dev server listens on |
| `devReadyPattern` | `string` | `"listening on port"` | Stdout string indicating server is ready |

## Precedence

Configuration merges with this priority:

1. **CLI flags** (highest) — not yet implemented, reserved for future use
2. **Config file** — `wolder.config.ts`
3. **Defaults** (lowest)

## API Key

The API key is resolved in this order:

1. `apiKey` in config file
2. `ANTHROPIC_API_KEY` environment variable

For local development, use a `.env` file:

```
ANTHROPIC_API_KEY=sk-ant-...
```

And load it when running:

```bash
npx tsx --env-file=.env wolder.program.ts
```

## Protected Patterns

Files matching `protectedPatterns` globs are treated as inputs even if referenced in `scope()`. This is a safety net to prevent accidental overwriting of hand-authored code.

```typescript
defineConfig({
  protectedPatterns: ["src/models/**", "src/interfaces/**"],
})
```

## TypeScript Plugin

The `@wolder/ts-plugin` generates a `wolder.artifacts.d.ts` file with typed artifact exports. Configure it in your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "plugins": [
      {
        "name": "@wolder/ts-plugin",
        "outputPath": "wolder.artifacts.d.ts",
        "programFiles": ["wolder.program.ts"]
      }
    ]
  }
}
```

| Plugin Option | Default | Description |
|---------------|---------|-------------|
| `outputPath` | `"wolder.artifacts.d.ts"` | Where to write the generated types |
| `programFiles` | `["wolder.program.ts"]` | Which files to scan for `build()` chains |
