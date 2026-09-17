## Project overview

Wolder is a code-first agentic software generation framework for TypeScript. Developers write generation programs that declare **agents with boundaries**: a fluent DSL (`layer`, `scopedAgent`, `canWrite`, `act`, `uses`, `requests`, `provides`, `build`) names a writable region an agent owns, says what to generate, and declares how the agents relate. The framework checks the whole graph before spending a token, settles contracts between agents that need to agree on something, runs them in dependency order with independent nodes in parallel, enforces write boundaries at the agent's tool layer, and caches results in a manifest so only stale nodes re-run.

This is **v2**. The v1 DSL (`scope`/`act`/`expect*`/`build` per file, AST expectations, typed artifact members, the ts-plugin) was removed wholesale, not deprecated alongside. There is one DSL. `PLAN.md` records the design and the reasoning; `samples/todo-service/wolder.program.ts` is the reference program.

### Package structure

- `src/` — `@wolder/core` runtime: layers, agents, graph, contracts, caching, CLI
- `packages/typescript/` — `@wolder/typescript`, a **shipped layer** (`Layer => Layer` functions), not a plugin
- `packages/cli/` — `wolder` binary shim
- `samples/` — three reference programs; see `samples/README.md`
- `docs/` — user-facing documentation

`@wolder/core` is the repository root, not a workspace member. Packages depend on it via `file:../..`; samples resolve it through the hoisted root `node_modules`.

### Key modules

- `types.ts` — every public interface and the `provides` phantom-type branding
- `layer.ts` — the immutable `Layer` value, accumulation, structural hashing
- `scoped-agent.ts` — the immutable agent builder
- `program.ts` — the declaration-time `Registry`; the leaf rule that separates nodes from templates
- `region.ts` — region normalisation, glob matching, exact glob intersection
- `graph.ts` — graph assembly and every pre-flight check
- `build.ts` — the orchestrator: contract phase, then parallel execution
- `negotiate.ts` — the bounded agent-to-agent exchange that settles a contract
- `runner.ts` — the Claude Agent SDK session, fenced by a permission guard
- `gates.ts` — layer-configured checks run over a region after generation
- `manifest.ts` — cache keys, freshness, contracts as first-class entries
- `prompt.ts` — the prompt an agent receives
- `cli.ts` / `commands.ts` — CLI entry point (run, check, clean, init, agent)

### Design invariants

These are load-bearing. Changing one changes the framework.

- **Layers and agents are immutable values.** Every builder method returns a new value; the receiver never changes. Derivation is monotonic — context accumulates and nothing can remove it.
- **Declaring is synchronous.** There is no `await` on a `scopedAgent`, and no `.build()` on a node. An awaited declaration could only resolve to a placeholder.
- **A region has exactly one owner.** Overlap is a pre-flight error. Cross-region needs are edges (`uses`, `requests`), never a wider `canWrite`.
- **`requests` is a content edge, not an ordering one.** Only `uses` orders execution.
- **No expectation API.** Correctness comes from the agent's own loop plus layer gates. Do not reintroduce expectations to make gates configurable.
- **Boundaries are enforced at the tool layer**, not requested in the prompt. Agents get no shell — gates are run by wolder.

## Build and test commands

```bash
# Run all tests (runtime + type-level assertions)
npx vitest run

# Watch mode
npx vitest

# Type check the core package
npx tsc --noEmit

# Type check core, packages and every sample program
npm run typecheck

# Run a sample (needs ANTHROPIC_API_KEY in that sample's .env)
npm run sample:todo
```

There is no build step during development — everything runs via `tsx`. `npm run build` produces `dist/` for publishing but is not needed.

## Code style guidelines

- TypeScript strict mode, ESM (`"type": "module"`)
- Use `.js` extensions in imports (Node16 module resolution)
- Semicolons throughout — follow suit
- Prefer `const` over `let`, never use `var`
- Use `import type` for type-only imports
- Generic type parameters use descriptive names: `TProvides`, not `T`
- Keep files focused — one primary export per module
- No unnecessary abstractions or premature generalization
- `any` is acceptable in generic constraint positions (e.g. `ScopedAgent<any>`) but avoid elsewhere
- **Error messages teach.** A pre-flight error names the agents involved and points at the DSL feature that expresses what the developer meant. Match that standard.

## Testing instructions

**Every bug fix and new feature must include tests.** After making any changes, always run `npx vitest run` and confirm all tests pass before considering the work done.

Tests use **vitest** and live alongside source files as `*.test.ts`. `vitest.config.ts` enables type-level checking, so `npx vitest run` covers both runtime behaviour and the DSL's compile-time guarantees.

- **Never call a real LLM in a test.** Inject fakes through `wolder({ services })` — `runner` for generation, `negotiator` for contracts — or a scripted `ChatFn` into `createNegotiator`.
- A fake runner should route its writes through `createPermissionGuard`, so boundary enforcement is exercised rather than assumed.
- Use `mkdtempSync` for tests that need a real filesystem (build, manifest, commands, gates)
- Use `expectTypeOf` and `@ts-expect-error` for type-level assertions (see `types.test.ts`)
- `acceptance.test.ts` mirrors the reference program in `samples/todo-service/wolder.program.ts` — keep the two in step
- All tests should pass with `npx vitest run` from the project root

## Commit conventions

- Do not include Co-Authored-By lines in commit messages.
