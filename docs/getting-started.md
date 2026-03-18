# Getting Started

Wolder is a code-first agentic software generation framework. You write TypeScript programs that describe *what to build* and *what to expect*, and the framework generates code using LLMs, validates the output, and caches results so only stale steps are re-run.

## Installation

```bash
npm install @wolder/core
```

## Quick Start

### 1. Create a project

```
my-project/
├── wolder.config.ts       # Optional configuration
├── wolder.program.ts      # Your generation program
├── src/
│   └── models/
│       └── TodoItem.ts    # Hand-written input file
└── tsconfig.json
```

### 2. Write an input file

Input files are developer-owned — Wolder will never modify them. They serve as context for generation.

```typescript
// src/models/TodoItem.ts
export interface TodoItem {
  id: string
  title: string
  completed: boolean
  createdAt: Date
}
```

### 3. Write a generation program

```typescript
// wolder.program.ts
import { wolder } from "@wolder/core"

const w = wolder({
  root: import.meta.dirname,
  model: "claude-sonnet-4-6",
})

const todoItem = w.input("src/models/TodoItem.ts")

const todoService = await w
  .scope("src/services/todoService.ts")
  .act(`
    Create a TodoService class with CRUD operations for TodoItem.
    Use an in-memory Map for storage.
  `)
  .withInput(todoItem)
  .expectClass("TodoService")
  .withFunction("getAllItems")
  .withFunction("addItem")
  .withFunction("deleteItem")
  .expectCompiles()
  .build()

// todoService.members.getAllItems is typed as MemberRef<"getAllItems">
```

### 4. Set your API key

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

Or create a `.env` file:

```
ANTHROPIC_API_KEY=sk-ant-...
```

### 5. Run it

```bash
npx tsx wolder.program.ts
```

Or with the CLI:

```bash
npx wolder run
```

On the first run, Wolder calls the LLM, writes the generated files, validates expectations (class exists, methods exist, compiles), and saves the result to `wolder.manifest.json`. On subsequent runs, if nothing changed, generation is skipped.

## What happens during `build()`

1. **Cache check** — Computes a hash of the act instruction + input file contents + model. If it matches the manifest, returns the cached artifact immediately.
2. **LLM call** — Sends a prompt with scope files, input context, instruction, and expectations.
3. **File parsing** — Extracts `=== FILE: path ===` blocks from the response and writes them to disk.
4. **Expectation validation** — Runs checks in order: file existence → compilation → AST queries → semantic checks.
5. **Retry** — If expectations fail, appends error feedback and retries (up to `maxRetries`).
6. **Manifest update** — Records hashes and metadata for future cache hits.

## Next steps

- [Core Concepts](./core-concepts.md) — Scope vs Input, Artifacts, the DAG
- [API Reference](./api-reference.md) — Complete DSL documentation
- [Configuration](./configuration.md) — `wolder.config.ts` options
- [CLI](./cli.md) — Command reference
