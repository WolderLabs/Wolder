# Getting Started

## Install

```bash
npx wolder init          # scaffolds package.json, tsconfig.json, wolder.config.ts
```

Set an API key — wolder reads `ANTHROPIC_API_KEY` from the environment, or `apiKey` from
config:

```bash
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
```

## Your first program

Create `wolder.program.ts`:

```typescript
import { wolder } from "@wolder/core"
import { typescriptConventions } from "@wolder/typescript"

const w = wolder({
  root: import.meta.dirname,   // always this — resolves relative to the program file
  model: "claude-sonnet-4-6",
})

const project = w
  .layer()
  .apply(typescriptConventions)
  .context(`
    This project is a simple Todo service implemented in TypeScript.
    It includes models, services, and controllers for managing Todo items.
  `)
  .include("src/models/TodoItem.ts")
  .gate("npx tsc --noEmit", { name: "typecheck" })

const readme = project
  .agent()
  .owns("README.md")
  .goal(`Generate a README.md file for the project.`)
  .provides("Documentation")

const dependencies = project
  .agent()
  .owns("package.json")
  .goal(`
    Initialize an NPM project with the necessary dependencies,
    make assumptions about library selection as needed.
  `)
  .provides("NPM dependencies")

const todoService = project
  .agent()
  .owns("src/services/TodoService.ts")
  .asks(readme, "Document Todo Service usage")
  .goal(`
    Create a TodoService class that provides CRUD operations for TodoItem objects.
    Use an in-memory Map<string, TodoItem> for storage.
    Generate UUIDs randomly.
  `)
  .provides("Todo Service")

project
  .agent()
  .owns("src/controllers/TodoController.ts")
  .asks(dependencies, "A framework like Express.js for handling HTTP requests")
  .after(todoService)
  .goal(`Create a TodoController class that wraps TodoService and provides a simple API.`)
  .provides("Todo API")

// Nothing above has run. The graph is assembled, checked, then executed here.
await w.run()
```

Write the developer-owned model it references:

```typescript
// src/models/TodoItem.ts
export interface TodoItem {
  id: string
  title: string
  done: boolean
}
```

## Run it

```bash
npx wolder run
```

You will see four phases:

```
[wolder] Checking the graph
[wolder] 4 agent(s), 3 edge(s) — boundaries and dependencies check out

[wolder] Settling contracts
[wolder] contract:README.md  Documentation <-> src/services/TodoService.ts
[wolder] contract:package.json  NPM dependencies <-> src/controllers/TodoController.ts

[wolder] Generating
[wolder] package.json provides "NPM dependencies"
[wolder] README.md provides "Documentation"
[wolder] src/services/TodoService.ts provides "Todo Service"
[wolder] src/controllers/TodoController.ts provides "Todo API"

[wolder] 4 generated  ·  0 cached  ·  2 contract(s)  ·  38.2s
```

Run it again and nothing happens — every node is cached. Change one `.goal()` and only that
node and its dependents re-run.

## What to reach for

| You want to… | Use |
|---|---|
| Say something true of the whole project | `.context()` on a root layer |
| Give agents a file you maintain yourself | `.include()` |
| Check the generated code compiles | `.gate("npx tsc --noEmit")` |
| Make one agent read another's output | `.after(other)` |
| Make two agents agree on a shape | `.asks(other, ask)` + `.provides()` |
| Reuse a half-built agent | Assign it to a variable and derive from it |

## Next

- [Core Concepts](./core-concepts.md) — layers, regions, contracts, deferred execution
- [API Reference](./api-reference.md)
- [Configuration](./configuration.md)
- [CLI](./cli.md)
