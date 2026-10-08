# Implementing PLAN-v3 — step-by-step guide

This is the working guide for `PLAN-v3.md`. The plan says *what* and *why*; this
file says *where* and *in what order*. Read `CLAUDE.md`, then `PLAN-v3.md`, then this.
Do the steps in order. Each step ends with `npx vitest run` and `npm run typecheck`
passing, and is one commit.

## Ground rules

- **No aliases, no deprecation shims.** The old names are deleted. If a test or doc
  still uses an old name after a step, that is a bug in the step.
- **Every behaviour change has a test.** Renames are covered by the existing tests
  once they are updated; new behaviour (`Agent.apply`, the recipe error message) gets
  new tests.
- **Never call a real LLM in a test.** Use the `fakeRunner` / `fakeNegotiator` pattern
  at the top of `src/build.test.ts`.
- **Do not touch `wolder.manifest.json` compatibility by hand.** Step 1 invalidates
  every manifest (explained below). Bump `MANIFEST_VERSION`, do not try to migrate.
- When unsure what a name should be, the table in `PLAN-v3.md` §1 is the answer.
  Do not invent a third name.

## Step 1 — Vocabulary rename

### Why this invalidates every manifest

`src/program.ts` records every builder call verbatim in `AgentSpec.chain` as
`{ method: "canWrite", args }`, and `src/graph.ts` hashes that chain into
`chainHash`, which is a cache input. Renaming the methods therefore changes every
node's cache key. That is acceptable and expected. Bump `MANIFEST_VERSION` in
`src/manifest.ts` from `2` to `3`. `readManifest` already returns an empty manifest
on a version mismatch, so old files are discarded cleanly rather than reporting every
node as stale for a confusing reason. Update the test in `manifest.test.ts` that
asserts the version number.

### Public API renames (`src/types.ts`)

| Old                                   | New                                    |
|---------------------------------------|----------------------------------------|
| `interface ScopedAgent<TProvides>`    | `interface Agent<TProvides>`           |
| `Layer.scopedAgent()`                 | `Layer.agent()`                        |
| `Layer.includeFile(path)`             | `Layer.include(path)`                  |
| `Agent.canWrite(region)`              | `Agent.owns(region)`                   |
| `Agent.act(instruction)`              | `Agent.goal(instruction)`              |
| `Agent.uses(target)`                  | `Agent.after(target)`                  |
| `Agent.requests(target, ask)`         | `Agent.asks(target, ask)`              |
| `WolderInstance.build(options)`       | `WolderInstance.run(options)`          |
| `BuildOptions` / `BuildResult`        | `RunOptions` / `RunResult`             |
| `AgentNode.instruction`               | `AgentNode.goal`                       |
| `AgentNode.uses` / `AgentNode.requests` | `AgentNode.after` / `AgentNode.asks` |
| `RequestEdge`                         | `AskEdge`                              |

`provides`, `context`, `gate`, `apply`, `layer`, `artifact` are unchanged.
`AgentProvides`, `AgentDoesNotProvideAnything`, `ProvidesState` are unchanged. The
message string inside `AgentDoesNotProvideAnything` stays as is.

### Internal renames

| Old                                              | New                                   |
|--------------------------------------------------|---------------------------------------|
| `src/scoped-agent.ts`, `class ScopedAgentImpl`   | `src/agent.ts`, `class AgentImpl`     |
| `src/agent.ts` (the `/wolder` skill installer)   | `src/skill.ts`, export `runSkill`     |
| `src/scoped-agent.test.ts`                       | `src/agent.test.ts`                   |
| `AgentSpec.instruction` / `.uses` / `.requests`  | `.goal` / `.after` / `.asks`          |
| `Registry.nodes()` doc comment "has an .act()"   | update to `.goal()`                   |
| `runBuild` in `src/build.ts`                     | `runProgram`                          |
| `BuildInputs`                                    | `RunInputs`                           |
| chain entry method strings in `agent.ts`         | the new method names                  |
| `ManifestNode.dependsOn`                         | unchanged (it is data, not DSL)       |

Do the file rename of `src/agent.ts` → `src/skill.ts` **first**, then
`src/scoped-agent.ts` → `src/agent.ts`, so there is never a collision. `src/cli.ts`
imports `runAgent` from `./agent.js`; point it at `./skill.js` and the `agent`
CLI subcommand keeps its name.

### Where the names appear

Run this before and after; it must return nothing after:

```bash
grep -rn "scopedAgent\|canWrite\|\.act(\|\.uses(\|\.requests(\|includeFile\|w\.build()\|ScopedAgent\|RequestEdge\|BuildOptions\|BuildResult" \
  --include=*.ts --include=*.md . | grep -v node_modules | grep -v "^./PLAN"
```

The hit list at time of writing, so nothing is forgotten:

- `src/`: `types.ts`, `layer.ts`, `scoped-agent.ts`, `program.ts`, `graph.ts`,
  `build.ts`, `wolder.ts`, `prompt.ts` (one doc comment), `negotiate.ts` (one doc
  comment), `errors.ts` (`RegionViolationError` message mentions `.uses()`,
  `.requests()`, `.canWrite()`), `index.ts`, `agent.ts` (the skill text — it is a
  DSL reference, rewrite every example), `init.ts` (the template program).
- Every `*.test.ts` in `src/`. `acceptance.test.ts` mirrors the todo-service sample
  and must be changed together with it.
- `packages/typescript/src/index.ts` (doc comment only).
- `samples/*/wolder.program.ts`, `samples/README.md`.
- `docs/*.md` — every file. `docs/api-reference.md` is the largest.
- `CLAUDE.md` — the project overview and the invariants list name the methods.
  Update them. Do not change the invariants' meaning.
- `README.md` at the root if it exists.

### Error messages

`src/graph.ts` and `src/errors.ts` build the teaching messages. Update every one so
it names the new method. Read each message after editing and make sure it still
reads as a sentence; a find-and-replace will leave "the .goal() instruction" where
"its goal" reads better. The tests in `graph.test.ts` assert on message substrings;
update them to the new wording.

### Tests for this step

No new test files. Every existing test updated. `types.test.ts` must still show, via
`@ts-expect-error`, that `.asks()` rejects a target without `.provides()`. Confirm the
assertion still fails to compile for the right reason by temporarily removing the
`@ts-expect-error` line and checking the error text mentions "agent does not provide
anything".

### Done when

- the grep above returns nothing outside `PLAN*.md`;
- `npx vitest run` and `npm run typecheck` pass;
- `samples/todo-service/wolder.program.ts` reads exactly like the listing in
  `PLAN-v3.md` §1 (modulo the goal text, which is unchanged).

## Step 2 — `Agent.apply`

### Signature

In `src/types.ts`, next to `LayerTransform`:

```ts
export type AgentTransform<
  TIn extends ProvidesState = ProvidesState,
  TOut extends ProvidesState = TIn,
> = (agent: Agent<TIn>) => Agent<TOut>;
```

On `Agent<TProvides>`:

```ts
/** Apply an agent→agent function. Sugar for `fn(agent)` that keeps a chain reading left-to-right. */
apply<TOut extends ProvidesState = TProvides>(fn: AgentTransform<TProvides, TOut>): Agent<TOut>;
```

### Implementation

In `src/agent.ts`:

```ts
apply<TOut extends ProvidesState = TProvides>(fn: AgentTransform<TProvides, TOut>): Agent<TOut> {
  return fn(this);
}
```

**Do not record `apply` in the chain.** The function it receives calls ordinary
builder methods, and each of those records itself. Recording `apply` as well would
hash a function value, which cannot be done stably. Compare `LayerImpl.apply`, which
has the same shape and the same reason.

### Tests (`src/agent.test.ts`)

1. `apply(fn)` returns exactly what `fn` returned (identity check with a transform
   that calls `.context("x")`).
2. The receiver is unchanged after `apply` (immutability).
3. A transform that calls `.provides("x")` changes the type: assert with
   `expectTypeOf(agent.apply(withProvides)).toEqualTypeOf<Agent<AgentProvides>>()`.
4. A transform that does not call `.provides` keeps `AgentDoesNotProvideAnything`, and
   `.asks()` on the result is still a compile error (`@ts-expect-error`).
5. Two applied transforms both appear in the node's `contexts`, in order, when the
   graph is assembled.
6. `chainHash` of `agent().owns("a").apply(a => a.context("x"))` equals `chainHash`
   of `agent().owns("a").context("x")`. This pins the "apply is not recorded" rule.

Export `AgentTransform` from `src/index.ts`.

## Step 3 — Overlap error in recipe terms

`checkRegionOverlap` in `src/graph.ts` throws the overlap `GraphError`. Append one
paragraph to the message:

```
If both agents come from the same recipe — a function that returns an agent —
give each call its own region. A recipe's region is a parameter, not a constant.
```

Keep the rest of the message intact. Add a test to `graph.test.ts` that defines a
recipe `(region: string) => (layer: Layer) => layer.agent().owns(region).goal("x")`,
calls it twice with the same region, and asserts the error contains the word
"recipe".

## Step 4 — Recipes sample, docs, shipped layer

### `packages/typescript/src/index.ts`

Add one parameterised tier-2 export beside the two existing ones:

```ts
export interface ModuleConventionsOptions {
  /** How relative imports are written. `"js"` adds the extension; `"bare"` omits it. */
  imports: "js" | "bare";
}

export const moduleConventions =
  ({ imports }: ModuleConventionsOptions) =>
  (layer: Layer): Layer =>
    layer.context(`...`);
```

The text explains the import style chosen. Add a test file
`packages/typescript/src/index.test.ts` asserting that applying it with each option
adds exactly one context entry containing the right phrase. (The vitest config already
includes `packages/*/src/**/*.test.ts`.)

### `samples/recipes/`

A fourth sample. Layout matches `samples/todo-service`: `wolder.program.ts`,
`wolder.config.ts`, `project/` with one developer-owned model file per entity
(`project/src/models/Todo.ts`, `project/src/models/Note.ts`), and a `.env` ignored by
git. The program:

- defines `crudGoal` (tier 1), `pageConventions` (tier 2), `pages` and `crudFeature`
  (tier 3) in `samples/recipes/recipes/*.ts`;
- instantiates `crudFeature` for `Todo` and for `Note`;
- has one `deps` agent owning `package.json` and `tsconfig.json`, passed into both;
- ends with `await w.run()`.

Add `"sample:recipes"` to `package.json` scripts, add the sample to
`tsconfig.check.json` (the glob already covers `samples/*/wolder.program.ts`; the
recipe modules under `samples/recipes/recipes/` need adding to `include`), and
describe it in `samples/README.md`.

Add `src/recipes.test.ts`: assemble the recipes sample's graph with a fake runner and
assert six agents plus `deps`, that the two `pages` agents own different regions,
and that each `after`s its own controller. Model it on `acceptance.test.ts` — build
the same graph in the test rather than importing the sample, so the test does not
depend on sample paths.

### `docs/recipes.md`

Sections, in this order: the principle (one paragraph), tier 1, tier 2, tier 3, the
feature-slice example, "what the framework does not do". Lift the code from
`PLAN-v3.md` §2; it is already in the final vocabulary. Link it from
`docs/core-concepts.md` and from `docs/api-reference.md` under `Agent.apply`.

Update the `/wolder` skill text in `src/skill.ts` with a short "Recipes" section
that shows the tier-3 shape, since that skill is what an agent reads when it writes
a program.

## Commit messages

One commit per step:

```
feat!: rename the DSL to agent/owns/goal/after/asks and build to run
feat: Agent.apply for composable agent transforms
feat: overlap error explains recipes
feat: recipes sample, docs, and parameterised typescript conventions
```

## What "done" means

`PLAN-v3.md` §3 sequencing is complete when all four commits are in, the grep in
Step 1 is clean, `npm run typecheck` covers the new sample, and `docs/recipes.md`
exists. Then update `CLAUDE.md`'s overview sentence that lists the DSL methods, and
move `PLAN-v3.md`'s status line from "proposal" to "implemented".
