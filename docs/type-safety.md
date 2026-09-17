# Type Safety

v2 has one compile-time guarantee, and it is the one that matters: **you cannot ask an
agent for a contract it never offered to hold up.**

## `requests` requires `provides`

```typescript
const readme = project
  .scopedAgent()
  .canWrite("README.md")
  .act(`Generate a README.md.`)
  .provides("Documentation")          // ← makes it a valid target

const service = project
  .scopedAgent()
  .canWrite("src/services/")
  .requests(readme, "Document Todo Service usage")   // ✓
```

Without `.provides()`:

```typescript
const readme = project.scopedAgent().canWrite("README.md").act(`…`)

service.requests(readme, "Document usage")
// ✗ Type '"agent does not provide anything — call .provides(label) on it first"'
//   is not assignable to type '"provides"'.
```

This is a compile-time constraint, not a build-time one. The handle carries its provided
state in a phantom type parameter — `ScopedAgent<TProvides>` — which `.provides()` sets and
`.requests()` demands. The brand is a string literal so the error reads as an instruction
rather than a raw type mismatch.

## Immutability makes it sound

Agents are immutable, so a handle passed to `.requests()` is already a finished value.
There is no "provides comes later" case to reason about — and the type system catches the
mistake of pointing at an earlier value in a chain:

```typescript
const draft = project.scopedAgent().canWrite("README.md").act(`…`)
const readme = draft.provides("Documentation")

service.requests(draft, "…")    // ✗ `draft` still provides nothing
service.requests(readme, "…")   // ✓
```

The runtime catches the same mistake for `.uses()`, where there is no type to catch it
with: passing a value that was later derived from is a pre-flight `GraphError` naming the
agent and telling you to pass the end of its chain.

## What the type system deliberately does not do

v1 threaded generated member names through a phantom tuple, so `artifact.members.getUser`
was typed. That came from the expectation chain, and "the agent decides what exists" is
incompatible with knowing those names before it runs. `Artifact` is now a plain runtime
handle:

```typescript
interface Artifact {
  kind: "artifact"
  id: string
  outputHash: string
  files: readonly string[]
  provides?: string
}
```

`ExtractMembers`, `MemberRef` and the `wolder.artifacts.d.ts` language-service plugin are
all gone. Some expect-and-test pattern is wanted again later; it should arrive as a plugin
on top of a working v2 rather than as a constraint on its design.

## Everything else is a pre-flight error

The rest of what could be wrong with a program is caught by `build()` before a generation
token is spent — which is what deferred execution buys, since the whole graph is known:

| Mistake | Caught by |
|---|---|
| `requests` against a non-provider | The compiler |
| Two agents claiming overlapping regions | `GraphError` |
| A cycle in `uses` | `GraphError` |
| An edge pointing at a template | `GraphError` |
| An agent with an `.act()` but no `.canWrite()` | `GraphError` |
| Reading `.artifact` before `build()` | A throw that explains why |
| An agent writing outside its region | `RegionViolationError`, at the tool layer |
