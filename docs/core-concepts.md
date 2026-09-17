# Core Concepts

A Wolder program is not a list of file generations. It is a list of **agents with
boundaries**: you name a region an agent may write, say what you want, and declare how the
agents relate. Wolder checks the graph, settles the contracts between agents, and runs them.

## Layers

A layer carries context and developer-owned files. It is a **persistent value** — every
method returns a *new* layer and the one you called it on never changes.

```typescript
const project = w
  .layer()
  .apply(typescriptConventions)          // a Layer => Layer function
  .context(`A simple Todo service in TypeScript.`)
  .includeFile("src/models/TodoItem.ts") // developer-owned, never written

// Derive — `project` is untouched
const backend  = project.context(`Backend code. Prefer async/await over callbacks.`)
const frontend = project.context(`React 19, function components only.`)
```

`backend` and `frontend` each carry the project's prose plus their own. Neither can see
the other's.

| Method | Behaviour |
|---|---|
| `.context(text)` | **Accumulates**, in declaration order |
| `.includeFile(path)` | Accumulates as a set |
| `.gate(command, opts?)` | Accumulates; a check run over an agent's region after it generates |
| `.apply(fn)` | Exactly `fn(layer)`, but keeps a chain reading left-to-right |
| `.scopedAgent()` | Spawns an agent inheriting the whole accumulated state |

Derivation is **monotonic**: a child specialises a parent without restating it, and there
is no way to remove inherited context. That is the point, not a limitation — composition
only stays predictable if derivation cannot subtract.

## Agents and regions

`.canWrite(region)` is the ownership mechanism. Inside the region is that agent's to own;
outside is off-limits, enforced at the agent's tool layer rather than asked for in the
prompt.

```typescript
.canWrite("README.md")          // one file
.canWrite("src/services/")      // a directory, at any depth
.canWrite("src/**/*.test.ts")   // a glob
```

**Two agents may not claim overlapping regions**, and nesting counts — `src/` and
`src/services/` overlap. Wolder rejects that before the first agent starts.

But the error is a signpost, not the goal. The interesting problem was never two agents
scribbling on one file; it is two agents needing to *agree* on something. Each agent keeps
a region it owns outright, and every cross-region need becomes an explicit edge.

## Edges

```typescript
.uses(other)              // hard dependency: other runs first, its files become context
.requests(other, ask)     // an ask against something that does not exist yet
```

`.uses()` is an ordering edge. `.requests()` is a **content** edge — it does not imply an
order, because the contract phase settles the content before either side runs, and the
content flows both ways.

`.requests()` requires the target to have declared `.provides("<label>")`. Asking an agent
for a contract it never offered is a compile error. See [type-safety.md](./type-safety.md).

## Contracts

`.requests()` does not staple a sentence onto the target's prompt. The two agents **talk**
— a bounded exchange in which the requester states what it needs and the provider states
what it can offer — until they settle on a contract. That contract is injected into *both*
agents' instructions, so both generate against the same agreed shape.

```typescript
const dependencies = project
  .scopedAgent()
  .canWrite("package.json")
  .act(`Initialise an NPM project with the necessary dependencies.`)
  .provides("NPM dependencies")

const controller = project
  .scopedAgent()
  .canWrite("src/controllers/")
  .requests(dependencies, "A framework like Express.js for handling HTTP requests")
  .act(`Create a TodoController class that provides a simple HTTP API.`)
  .provides("Todo API")
```

The controller cannot write `package.json`, so alone it would be guessing which framework
it may import; the `package.json` agent, alone, would be guessing what the controller
needs. The negotiation is where "a framework like Express.js" becomes a specific dependency
at a specific version that one agent installs and the other imports.

A contract may **be files**. The provider writes them into its own region during the
contract phase, before it generates; the requester then receives them as context exactly
like a `uses` edge. That is the point — `requests` is how you get a `uses` relationship
with something that does not exist yet.

**Contracts fan out.** One provider negotiates once over *all* its inbound requests and
settles a single contract covering them — several agents each wanting README coverage
produces one document, not several conflicting agreements about one file.

## Deferred execution

Declaring an agent registers it and returns a handle — **synchronously**. There is no
`await` on a `scopedAgent`. Nothing executes until `w.build()`, when the whole graph is
known.

```typescript
const readme = project.scopedAgent().canWrite("README.md").act(`...`).provides("Docs")
const service = project.scopedAgent().canWrite("src/services/").requests(readme, `...`).act(`...`)

await w.build()   // the one await in the program
```

The per-node awaits are gone for a structural reason. For the build to run, the program
body must finish; for the body to finish, every `await` must return. An awaited node could
therefore only resolve to a placeholder, never a real result — a promise that cannot keep
its promise should not look like one.

`build()` does four things:

1. Collects every node and edge, and checks them: boundary overlaps, dependency cycles,
   edges pointing at templates, and requests against a non-provider are all **pre-flight
   errors**, before a generation token is spent.
2. Settles every `requests` edge into a contract and injects it into both endpoints.
3. Orders on `uses` edges only.
4. Executes, running independent nodes in parallel.

## Templates

Agents are immutable too, so a partially-applied agent is a reusable template:

```typescript
const inServices = backend.scopedAgent().canWrite("src/services/")
const a = inServices.act(`...`)   // a node
const b = inServices.act(`...`)   // a different node
```

A value that has been derived from is a template; a value nothing was derived from, and
that has an `.act()`, is a node. Always pass the value at the **end** of a chain to
`.uses()` / `.requests()`.

## Artifacts

An artifact is a plain runtime handle on what a node produced, readable after the build:

```typescript
await w.build()
service.artifact.files       // paths actually written, discovered after the run
service.artifact.outputHash
service.artifact.provides
```

Because the agent decides what to write, the output set is not known up front — the
manifest records what was *actually* written so the next run can compute staleness. Reading
`.artifact` before `build()` throws with an explanation rather than yielding `undefined`.

## Gates

v2 ships with no expectation API. Correctness comes from the agent verifying its own work
in-loop, plus **ambient gates** declared on the layer:

```typescript
const project = w.layer()
  .gate("npx tsc --noEmit", { name: "typecheck" })
  .gate("npx vitest run", { name: "tests" })
```

Wolder runs gates over an agent's region after it generates. A non-zero exit sends the
output back to the agent to fix, up to `maxRetries`. Gates are run by wolder rather than by
the agent because an agent with a shell could write anywhere — and the boundary is the point.

`{files}` and `{regions}` in a gate command expand to the node's written files and its
regions.
