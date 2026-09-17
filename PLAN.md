# Wolder v2 — DSL Revamp Plan

**Status:** ready to implement. All design questions are closed; §9 is the handoff.

**North star:** `samples/todo-service/wolder.program.terse.example.ts`

**v2 is a breaking replacement.** `w.scope()/.act()/.expect()/.build()` is removed, not
deprecated alongside. One DSL.

## 1. What changes

Today a program is a list of *file generations*: you name the exact file, write the
prompt, and hand-assert the AST shape. The terse example is a list of *agents with
boundaries*: you name a writable region, say what you want, and declare how the agents
relate. Wolder stops being a templating layer and becomes an orchestrator.

| Concept | v1 (removed) | v2 |
|---|---|---|
| Unit of work | `w.scope(file).act().build()` | `layer.scopedAgent()...` |
| Output location | exact path, declared up front | writable region; agent picks files |
| Shared context | repeated `.withInput()` | layers — context + files, composed |
| Correctness | hand-written AST expectations | back-burnered (§3) |
| Dependencies | `.withInput(artifact)` | `.uses()`, `.provides()`, `.requests()` |
| Execution | eager, per `.build()` | deferred; one `await w.build()` (§4) |

## 2. Layers are immutable values

A layer is not a builder you configure and finish — it is a persistent value, and every
method returns a **new** layer. Composition is ordinary functional reuse: hold a layer,
derive from it as many times as you like, the original never moves.

So the callback form goes away. `w.layer(l => l.context(...))` reads as "mutate `l`";
the chain reads as what it is:

```ts
const project = w
  .layer()
  .apply(typescriptConventions)                // a layer→layer function (§6)
  .context(`A simple Todo service in TypeScript.`)
  .includeFile("src/models/TodoItem.ts")       // developer-owned, never written

// derive — `project` is untouched
const backend = project
  .context(`Backend code. Prefer async/await over callbacks.`)
  .includeFile("src/config.ts")

const frontend = project.context(`React 19, function components only.`)
```

Semantics of derivation:

- `.context()` **accumulates** — a derived layer carries parent prose plus its own, in
  declaration order. Narrowing is additive: a child specialises without restating the
  parent, and **there is no way to remove inherited context**. That is the point, not a
  limitation — composition only stays predictable if derivation is monotonic.
- `.includeFile()` accumulates as a set.
- `.apply(fn)` takes a `(Layer) => Layer` and returns its result. Pure sugar for
  `fn(layer)`, but it keeps a long composition reading left-to-right, and it makes
  shipped layers (§6) look like part of the chain.
- Layers are structurally hashable — accumulated context is part of every descendant
  agent's cache key (§5).

Agents spawn from a layer and inherit its whole accumulated state. The same immutability
rule applies to the agent builder, so partially-applied agent templates fall out free:

```ts
const inServices = backend.scopedAgent().canWrite("src/services/")
```

## 3. Expectations: back-burnered

v2 ships with **no** expectation API. `.expect()`, the plugin builders, and the AST
assertion machinery do not carry over. Some expect-and-test pattern is wanted again
later; designing it is explicitly **out of scope for this rewrite**, and it should
arrive as a plugin on top of a working v2 rather than as a constraint on its design.

Correctness in the meantime comes from the agent verifying its own work in-loop — it has
the Agent SDK and can read compiler and test output directly — plus ambient gates on the
writable region (§7, step 7).

Two consequences, both accepted:

- **`Artifact<TMembers>` loses typed `.members`.** Compile-time member names came from
  the expectation chain, and "the agent decides what exists" is incompatible with
  knowing those names before it runs. `Artifact` becomes a plain runtime handle: id,
  output hash, files actually written, the `provides` label. `ExtractMembers`,
  `MemberRef`, and the phantom `TMembers` tuple threading come out of `types.ts`.
- **`packages/ts-plugin` is retired.** `wolder.artifacts.d.ts` was generated from
  declared expectations; with those gone it has no input. Work is preserved on a branch
  and may return once there is something to describe types *from*.

## 4. Execution: deferred, one `await w.build()`

**Declaring a node does not run it, and declarations are synchronous — there is no
`await` on a `scopedAgent`.** Building the chain registers a node and returns a handle.
Nothing executes until `w.build()`, when the complete graph is known.

The per-node awaits are gone for a structural reason, not a stylistic one. For the build
to run, the program body must finish; for the body to finish, every `await` must return.
An awaited node could therefore only ever resolve immediately to a placeholder — never
to a real result. That is a promise that cannot keep its promise, so it should not look
like one. Nothing is lost: mid-program control flow off a generated result was already
impossible under deferred execution.

```ts
const readme = project.scopedAgent()
  .canWrite("README.md")
  .act(`Generate a README.md.`)
  .provides("Documentation")

const todoService = project.scopedAgent()
  .canWrite("src/services/")
  .requests(readme, "Document Todo Service usage")
  .act(`Create a TodoService class...`)
  .provides("Todo Service")

await w.build()   // the one await in the program
```

`build()` is explicit, not implicit-on-exit: with sync declarations it is the single
honest await in the file, the natural home for progress reporting and the run summary,
and far easier to test than an exit hook. It also reuses the verb developers already
associate with "now the work happens" — it has simply moved from per-node to per-program.

Sync declarations are what make `.requests()` work. `todoService.requests(readme,
"Document Todo Service usage")` is a **backward** edge — readme is declared before the
service exists, yet must absorb an ask only knowable afterward. Declaration order is not
execution order, so at build:

1. Collect all nodes and all edges — `uses` (hard dependency; the artifact's files
   become context) and `requests` (an ask folded into the target's instruction).
2. Settle every `requests` edge into a **contract** (§5) and inject that contract into
   *both* endpoints' instructions.
3. Topologically order on `uses` edges only. A `requests` edge is a *content* edge, not
   an ordering one — and the content flows both ways, so neither endpoint has to run
   first. Readme runs whenever its `uses` deps allow; it just runs already knowing what
   it agreed to document.
4. Execute; independent nodes in parallel.

Payoff: the whole program is statically analysable before a generation token is spent.
Boundary problems, dependency cycles, and requests against a non-provider are all
pre-flight errors — the last one at compile time (§5).

Costs to handle:

- Nothing streams during program-body execution. Progress reporting belongs to
  `build()`, not to the declaration sites. Worth building that reporter early.
- A handle read before `build()` must throw with a real explanation, not yield
  `undefined`.

## 5. Boundaries are contracts, not fences

**`.canWrite(glob)` replaces `scope()` as the ownership mechanism.** Inside the region is
that agent's to own; outside is off-limits — enforced at the agent's tool layer, not by
asking nicely in the prompt.

Overlapping regions across agents are rejected at build time (closing `TODO.md`'s
*"boundary protection so that scopes don't collide"*), and nesting counts: `src/` and
`src/services/` overlap. Deferred execution is what makes the check total — every region
is known before the first agent starts.

**But the error is a signpost, not the goal.** The interesting problem was never two
agents scribbling on one file; it is two agents needing to agree on something. v2's
answer is that they *communicate their way to a mutual contract* rather than share a
region:

- The controller needs Express in `package.json`. It does not write `package.json`. It
  `.requests(dependencies, "A framework like Express.js...")` — the owner of that file
  satisfies the need, and stays the only writer.
- The service wants its usage documented. It does not write the README. It
  `.requests(readme, "Document Todo Service usage")`.

Each agent keeps a region it exclusively owns; every cross-region need becomes an
explicit edge. So the overlap error should not say "regions collide" — it should name the
two agents and point at `.requests()` / `.uses()` as the way to express what was actually
meant. Broad grabby regions like `canWrite("src/")` are the smell this catches.

### A request is a negotiation, not an injection

`.requests()` does not staple a sentence onto the target's prompt. The two agents **talk
to each other** — a bounded exchange, before either generates, in which the requester
states what it needs and the provider states what it can offer, until they settle on a
**contract**. That contract is then injected into *both* agents' instructions, so both
generate against the same agreed shape.

This is the part that makes the boundary story work. The controller cannot write
`package.json`, so on its own it would be guessing which HTTP framework it may import;
the `package.json` agent, on its own, would be guessing what the controller needs. The
negotiation is where "a framework like Express.js" becomes a specific dependency at a
specific version that one agent installs and the other imports. Neither could have
reached that alone, and neither had to cross into the other's region to get there.

**A contract is a structured shape, and it may be files.** Not free prose. The minimum
is a structured record — names, signatures, versions — because that is what diffs cheaply
for caching and what injects unambiguously into two prompts. But the stronger form is
that the **provider emits the contract as real files in its own region**: the
`package.json` agent writes `package.json`; a service agent writes the `.d.ts` or
interface its consumer will import. The contract stops being a side document describing
the agreement and becomes the agreement, already on disk, already the provider's output.

The requester then receives those files as context exactly like a `uses` edge — which is
the point: `requests` is how you get a `uses` relationship with something that does not
exist yet.

**Both sides see everything during negotiation, to start.** Each agent's full accumulated
layer context, its `act` instruction, its writable region, and the ask. Cheaper, narrower
framings are an optimisation for later, once there is evidence about what contracts
actually get wrong; starting narrow risks contracts that are confidently incompatible.

**Contracts fan out.** One provider can negotiate with several requesters at once and
settle a single contract covering all of them — the README case, where several agents each
want coverage and the outcome is one document. Pairwise-only would produce conflicting
agreements about one file. So negotiation is per-provider over the set of inbound
requests, not per-edge.

Consequences to design for:

- A contract is a **first-class artifact**: recorded in the manifest, inspectable, a
  cache input to every participant. A settled contract that doesn't change must not force
  regeneration; a changed one invalidates all its participants.
- Contracts settle in their own phase, after graph checks and before execution, so the
  full set is known before the first non-contract file is written. When a contract
  materialises as files, that phase writes them — the provider's own generation step then
  treats those files as decisions already made, not as things to redo. This is the one
  place the phase ordering gets subtle: a contract file lands in the provider's region
  before the provider's main run, so write-enforcement and rollback must both account
  for it.
- Negotiation spends tokens before any generation does. It needs a **round cap** and a
  defined failure mode when the parties cannot agree — a build error naming the
  participants and the last exchange, since silently generating against a non-agreement
  is the worst available outcome.

### `requests` is type-safe

`.requests(target, ask)` requires `target` to have declared `.provides()` — you cannot
ask something for a contract it never offered to hold up. That is a compile-time
constraint, not a build-time one: the scoped-agent handle carries its provided label in a
phantom type parameter (`ScopedAgent<TProvides>`), `.provides()` sets it, and `.requests()`
accepts only a handle whose parameter is set.

Immutability makes this sound — a handle passed to `.requests()` is already a finished
value, so there is no "provides comes later" case to worry about. Brand the type so the
failure reads as *"agent does not provide anything"* rather than a raw `string` vs
`never` mismatch (§8.4).

`provides` labels **do not need to be unique**. The label is tied to its scoped agent,
and edges are drawn against the handle, not resolved by name — the string is for humans
reading the program and for the negotiation prompt.

Caching keys a node on the **entire builder chain** (closes another `TODO.md` item),
plus its layer's accumulated context and included-file hashes, plus its `uses` artifacts'
output hashes and any folded-in `requests` text. Because the output file set isn't known
up front, the manifest records the files **actually written** per node, discovered
post-run, so the next run can compute staleness. Expectations leave the manifest
entirely (third `TODO.md` item) — they no longer exist.

## 6. Packaging

- `@wolder/core` owns `wolder()`. `@wolder/typescript` and `@wolder/typescript-testing`
  re-export it today — stop (`TODO.md`).
- **`@wolder/typescript` becomes a shipped layer**, not a plugin: a `Layer => Layer`
  function carrying TypeScript development best practices and code style guidance, used
  as `w.layer().apply(typescriptConventions)`. With expectations gone this is what is
  left in the package, and it is a better advert anyway — a small, readable demonstration
  that layers are reusable *values* a library can publish. `@wolder/typescript-testing`
  folds away with the expectation API.
- **`@wolder/browser` / `expectWebPage` / Playwright: deleted.** It only existed to serve
  expectations. Whatever replaces it arrives with the future expect-and-test pattern (§3).

## 7. Sequencing

1. **Types spike** — v2 signatures in `types.ts`, no implementation: immutable `Layer`
   (incl. `.apply`), sync `ScopedAgent<TProvides>`, plain `Artifact`, `w.build()`, and
   the `requests`-needs-`provides` constraint. Strip `MemberRef`/`ExtractMembers`.
   Cheapest place to find out the DSL doesn't typecheck.
2. **Layers** — immutable value, accumulating context, `.apply`, structural hashing.
3. **`scopedAgent` + `canWrite`** — real write enforcement at the tool layer.
4. **Graph + `build()`** — node registration, `uses`/`provides`, topological execution,
   overlap and cycle pre-flight checks, progress reporting.
5. **`.requests()` + contract negotiation** — the backward edge; the bounded
   agent-to-agent exchange, its round cap and failure mode, and injection of the settled
   contract into both endpoints.
6. **Caching** — chain-based keys, discovered output sets, contracts as manifest
   entries and cache inputs, slimmed manifest.
7. **Ambient gates** — compile/test over the writable region, configured on the layer.
8. **Teardown** — delete the v1 chain, expectations, plugin machinery, `@wolder/browser`,
   `@wolder/typescript-testing`, and their tests; retire `packages/ts-plugin` to its
   branch; rebuild `@wolder/typescript` as the conventions layer.
9. **Migration** — port the three samples onto v2.

## 8. Remaining questions

None blocking. Decide each in the step that reaches it:

1. Overlap detection for globs that intersect without nesting (`src/**/*.test.ts` vs
   `src/services/**`) — same error, but fiddlier than prefix nesting. (Step 3.)
2. Negotiation round cap and the exact structured-contract schema. (Step 5.)
3. Whether contract files written during the contract phase roll back if the provider's
   main run later fails. (Step 5.)
4. Branding the `provides` phantom type so the compile error reads as *"agent does not
   provide anything"* rather than a raw type mismatch. (Step 1.)

## 9. Handoff

For an agent picking this up cold. Read `CLAUDE.md` first, then this file, then
`samples/todo-service/wolder.program.terse.example.ts` — that example **is** the
acceptance criterion. When it runs as written, v2 is done.

### Ground rules from CLAUDE.md that bite here

- Every change ships with tests. `npx vitest run` from the root must pass before any step
  is considered finished. `npx tsc --noEmit` too.
- Never call a real LLM in a test. Mock `@anthropic-ai/sdk` / the Agent SDK. This matters
  most for step 5 — contract negotiation is an LLM conversation and must be testable
  without one.
- No build step during development; everything runs via `tsx`.
- ESM, `.js` extensions in imports, strict mode, `import type` for types.
- No Co-Authored-By lines in commits.

### Where the v1 code lives

| Area | Files |
|---|---|
| Entry / DSL | `src/wolder.ts`, `src/chain.ts`, `src/types.ts`, `src/index.ts` |
| Execution | `src/generate.ts`, `src/agent.ts`, `src/prompt.ts`, `src/parser.ts` |
| Caching | `src/manifest.ts` |
| Validation (all removed) | `src/expectations.ts`, `packages/typescript/`, `packages/typescript-testing/`, `packages/browser/` |
| CLI | `src/cli.ts`, `src/commands.ts`, `packages/cli/` |
| Retiring | `packages/ts-plugin/` |

`src/chain.ts` (`ScopeBuilderImpl`, `ActBuilderImpl`) is what §2–§4 replace. `src/types.ts`
is where step 1 happens.

### Suggested order of attack

Steps 1–4 in §7 are the spine and should land before anything else — they are the whole
DSL minus negotiation, and they are testable without an LLM. Step 5 is the research-y
one; do not start it until `build()` can execute a `uses`-only graph end to end.

Step 1 is done when `types.ts` compiles with the v2 signatures and the terse example
typechecks against them with no implementation behind it. Expect to discover there that
one of these does not express cleanly in TypeScript — better now than in step 5.

### What "done" means per step

- **1** Terse example typechecks. `requests` against a non-provider is a compile error.
- **2** Layers compose; derivation is provably non-mutating; context accumulates in order.
- **3** An agent physically cannot write outside its region. Overlap is a pre-flight error.
- **4** A `uses`-only program runs end to end: graph assembled, cycles caught, independent
  nodes parallel, progress reported from `build()`.
- **5** The terse example's two `requests` edges settle contracts that visibly change both
  sides' output.
- **6** Second run of an unchanged program does no work. Changing one `act` re-runs that
  node and its dependents only.
- **7** Compile/test gates run over the writable region.
- **8** No expectation code remains anywhere in the tree.
- **9** All three samples run on v2.

### Things that will be tempting and are wrong

- Keeping `.build()` on the node builder "for compatibility". v2 is a breaking
  replacement; two execution models is the one outcome worth avoiding.
- Making `scopedAgent` thenable so `await` still works. §4 explains why that promise
  cannot be kept.
- Letting a `requests` edge imply ordering. It is a content edge; the contract phase is
  what removes the need to order it.
- Re-introducing expectations to make step 7's gates configurable. Gates live on the
  layer. The expect-and-test pattern is a later, separate design.
