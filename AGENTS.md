## Project overview

Wolder is a code-first agentic software generation framework for TypeScript. Developers write generation programs using a fluent DSL (`scope`, `act`, `expect*`, `build`) that describe what code to generate and what structural expectations it must meet. The framework calls an LLM, validates the output via ts-morph AST queries and TypeScript compilation, retries on failure, and caches results in a manifest so only stale steps re-run.

### Package structure

- `src/` — `@wolder/core` runtime: DSL chain, LLM integration, expectations, caching, CLI
- `packages/ts-plugin/` — `@wolder/ts-plugin` TypeScript language service plugin that generates `wolder.artifacts.d.ts`
- `samples/todo-service/` — reference sample with a two-step generation program
- `docs/` — user-facing documentation

### Key modules

- `types.ts` — all interfaces and generic types
- `chain.ts` — fluent chain builders (ScopeBuilderImpl, ActBuilderImpl)
- `generate.ts` — LLM call, retry loop, expectation validation
- `expectations.ts` — file existence, compilation, AST, implements checks
- `manifest.ts` — cache key computation, freshness, DAG operations
- `config.ts` — `defineConfig()`, config loading and merging
- `cli.ts` — CLI entry point (run, check, clean)
- `web-page.ts` — Playwright-based browser validation for `expectWebPage()`

## Build and test commands

```bash
# Type check (root package)
npx tsc --noEmit

# Run all tests (root package — includes ts-plugin via vitest workspace)
npx vitest run

# Run tests in watch mode
npx vitest

# Run ts-plugin tests only
cd packages/ts-plugin && npx vitest run

# Run the sample (requires ANTHROPIC_API_KEY in .env)
cd samples/todo-service && npm run generate
```

There is no build step required for development — all source is executed directly via `tsx`. The `tsc` build (`npm run build`) produces `dist/` for publishing but is not needed during development.

## Code style guidelines

- TypeScript strict mode, ESM (`"type": "module"`)
- Use `.js` extensions in imports (Node16 module resolution)
- No semicolons are enforced but the codebase uses them consistently — follow suit
- Prefer `const` over `let`, never use `var`
- Use `import type` for type-only imports
- Generic type parameters use descriptive names: `TMembers`, not `T`
- Keep files focused — one primary export per module
- No unnecessary abstractions or premature generalization
- `any` is acceptable in generic constraint positions (e.g., `Artifact<any>`) but avoid elsewhere

## Testing instructions

Tests use **vitest** and live alongside source files as `*.test.ts`.

- Mock external dependencies (Anthropic SDK, fs operations on fake roots) — never call the real LLM in tests
- Use `vi.mock()` for module-level mocks
- Use `mkdtempSync` for tests that need a real filesystem (manifest, expectations, commands)
- Test fixtures go in `src/fixtures/` — these are excluded from `tsc` via tsconfig
- Use `expectTypeOf` from vitest for type-level assertions (see `types.test.ts`)
- The chain tests mock both `generate.js` and `manifest.js` to isolate chain logic
- The generate tests mock `@anthropic-ai/sdk` and pass `apiKey: "test-key"` to bypass the key check
- All tests should pass with `npx vitest run` from the project root

## Commit conventions

- Do not include Co-Authored-By lines in commit messages.
