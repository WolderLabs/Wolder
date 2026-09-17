# API Reference

Everything is exported from `@wolder/core`.

## `wolder(options)`

```typescript
const w = wolder({
  root: import.meta.dirname,
  model: "claude-sonnet-4-6",
  config: { maxRetries: 3 },
})
```

| Option | Type | Description |
|---|---|---|
| `root` | `string` | Project root. Always `import.meta.dirname`. |
| `model` | `string` | Model id. Overrides `config.model`. |
| `config` | `WolderConfig` | See [Configuration](./configuration.md). |
| `services` | `Partial<WolderServices>` | Replaces the machinery that talks to models. For tests. |

Returns a `WolderInstance` with `.layer()` and `.build()`.

## `Layer`

A persistent value. Every method returns a **new** layer.

### `.context(text): Layer`

Appends prose. Accumulates in declaration order; a derived layer carries the parent's
context plus its own. Template-literal indentation is stripped.

### `.includeFile(path): Layer`

Declares a developer-owned file. Agents receive its contents as read-only context and can
never write it. Accumulates as a set. Its contents are part of every descendant agent's
cache key.

### `.gate(command, options?): Layer`

Declares a check run over an agent's writable region after it generates. A non-zero exit
sends the output back to the agent, up to `maxRetries`.

```typescript
.gate("npx tsc --noEmit", { name: "typecheck" })
.gate("npx vitest run {files}", { name: "tests" })
```

`{files}` expands to the node's written files; `{regions}` to its claimed regions.
`options.name` labels it in output and in feedback to the agent; it defaults to the command.

### `.apply(fn): Layer`

Applies a `(Layer) => Layer`. Exactly `fn(layer)`, but it keeps a long composition reading
left-to-right and makes shipped layers look like part of the chain.

### `.scopedAgent(): ScopedAgent`

Spawns an agent inheriting the layer's whole accumulated state.

## `ScopedAgent`

Immutable. Every method returns a new value; a value that is derived from becomes a
template rather than a node. Declaring is synchronous — there is no `await`.

### `.canWrite(region): ScopedAgent`

Claims a writable region. A file (`README.md`), a directory (`src/services/`, trailing
slash optional when the last segment has no extension), or a glob (`src/**/*.test.ts`).
Accumulates as a set. Writes outside every claimed region are refused at the tool layer, as
are reads above the project root — an agent may read the whole project and nothing beyond
it. Agents are given no shell and no network access.

Regions must be relative to the root and may not contain `..`. Two agents claiming
overlapping regions is a pre-flight error.

### `.context(text): ScopedAgent`

Extra prose for this agent only, on top of its layer's context.

### `.act(instruction): ScopedAgent`

The generation instruction. An agent without one is treated as an unused template rather
than a node.

### `.uses(target): ScopedAgent`

A hard dependency. `target` runs first and its files become this agent's read-only context.
Its output hash is part of this node's cache key.

### `.requests(target, ask): ScopedAgent`

Asks a provider for something it owns. The two negotiate a contract before either
generates, and the settled contract is injected into both. A content edge — it does not
imply an order, so `target` may be declared later in the program.

`target` must have declared `.provides()`; otherwise it is a compile error.

### `.provides(label): ScopedAgent<AgentProvides>`

Labels what this agent holds up for others, and makes it a valid `.requests()` target.
Labels need not be unique — edges are drawn against the handle, not resolved by name.

### `.artifact: Artifact`

The result of this node's run. Throws with an explanation if read before `build()`.

## `w.build(options?): Promise<BuildResult>`

Assembles the graph, checks it, settles contracts, and executes. The one await in a
program.

```typescript
const result = await w.build({ force: true })
```

| Option | Type | Description |
|---|---|---|
| `reporter` | `Reporter` | Progress output. Defaults to the console reporter. |
| `force` | `boolean` | Ignore the manifest and regenerate everything. |

### Progress

Generation takes minutes, so a build narrates itself. The default console reporter
prints every tool an agent reaches for, stamped with how long that node has been
running, plus each negotiation round and any API retry:

```
[wolder] src/services/** provides "Todo Service"
       +2s Read src/models/TodoItem.ts
       +9s Writing the service and its error type.
      +11s Write src/services/TodoService.ts
[wolder] src/services/** wrote 2 file(s) in 14.3s
```

`createConsoleReporter({ verbose: false })` keeps only the lines you would act on —
refusals and retries. `createSilentReporter()` prints nothing.

A custom reporter receives the same stream through `nodeEvent(id, event)`:

```typescript
type AgentEvent =
  | { kind: "text"; text: string }
  | { kind: "tool"; name: string; detail?: string }
  | { kind: "denied"; name: string; detail?: string; reason: string }
  | { kind: "retry"; attempt: number; maxAttempts: number; delayMs: number; reason: string }
  | { kind: "note"; text: string }
```

Events are advisory — nothing in a build depends on them being consumed. Contract
events arrive under the contract's id (`contract:package.json`), node events under
the node's.

```typescript
interface BuildResult {
  artifacts: readonly Artifact[]
  contracts: readonly Contract[]
  skipped: readonly string[]   // node ids served from cache
  durationMs: number
}
```

## `Artifact`

```typescript
interface Artifact {
  kind: "artifact"
  id: string                    // the node's region(s)
  outputHash: string
  files: readonly string[]      // paths actually written, discovered after the run
  provides?: string
}
```

## `Contract`

```typescript
interface Contract {
  id: string                    // "contract:<provider node id>"
  provider: string
  label: string
  requesters: readonly string[]
  summary: string
  terms: readonly { name: string; detail: string }[]
  files: readonly { path: string; content: string }[]
  hash: string
}
```

Recorded in the manifest and a cache input to every participant. A settled contract that
does not change does not force regeneration; a changed one invalidates its participants.

## `defineConfig(config)`

Identity, typed. See [Configuration](./configuration.md).

## Errors

| Error | Raised when |
|---|---|
| `GraphError` | A pre-flight problem: overlapping regions, a `uses` cycle, an edge pointing at a template, a `requests` against a non-provider, an agent with no region. |
| `RegionViolationError` | An agent — or a contract — tried to write outside its region. |
| `NegotiationError` | Two agents could not settle within `negotiationRounds`. Names the participants and quotes the last exchange. |
| `GateError` | A gate kept failing after `maxRetries`. |

## Testing hooks

`services` replaces everything that reaches a model, so a program's graph, caching and
boundaries can be exercised end to end without one:

```typescript
const w = wolder({
  root,
  model: "test-model",
  services: {
    runner: { async run(request) { /* … */ return { files: [], text: "" } } },
    negotiator: { async negotiate(request) { /* … */ } },
  },
})
```

`createPermissionGuard(request)` is the same region check the real runner uses — call it
from a fake runner so boundary enforcement is exercised rather than assumed.

## Shipped layers

`@wolder/typescript` exports layers, not plugins:

```typescript
import { typescriptConventions, vitestConventions } from "@wolder/typescript"

w.layer().apply(typescriptConventions)
w.layer().apply(vitestConventions)   // composes typescriptConventions plus testing prose
```

A shipped layer is just a `(Layer) => Layer` function. Write your own the same way.
