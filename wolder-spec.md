# Wolder TypeScript Framework — Base Implementation Specification

**Version:** 0.1 (Pre-release)  
**Status:** Design Specification  
**Language:** TypeScript

---

## 1. Overview

Wolder is a code-first agentic software generation framework. Developers write generation
programs in TypeScript that describe *what to build* and *what to expect*, and the framework
executes those programs using LLMs, validates the output, and manages an incremental
DAG-based cache so only stale steps are re-run.

The framework has three layers:

- **Runtime** — the fluent DSL (`scope`, `act`, `expect*`, `input`) and execution engine
- **Compiler Plugin** — a TypeScript language service plugin that gives `artifact.members.*`
  compile-time type safety without a code generation step
- **Vocabulary Library** — composable higher-level wrappers (`createExpressApp`,
  `createReactComponent`, etc.) built on top of the primitives

---

## 2. Core Concepts

### 2.1 Scope vs Input

Every file in a Wolder project is classified as one of two things:

| Concept | Description | Ownership | Can LLM write? |
|---------|-------------|-----------|----------------|
| `scope` | Files the agent generates or modifies | Framework | Yes |
| `input` | Files the developer writes and maintains | Developer | No |

This boundary is the mechanism that makes manual edits safe. Developers never annotate
regions within files. They simply put their hand-authored code in input files and reference
those files as context. The LLM receives them as read-only context and cannot modify them.

### 2.2 Artifacts

An **artifact** is the typed return value of a generation step. It carries:

1. **Identity** — which files were generated
2. **Expectations** — what structural promises were made about those files
3. **Members** — named references to specific code elements (classes, functions,
   interfaces) that downstream steps can consume as typed inputs

```typescript
// Conceptual artifact shape
interface Artifact<TMembers extends MemberMap> {
  readonly id: string
  readonly generatedFiles: string[]
  readonly expectations: Expectation[]
  readonly members: TMembers
}
```

The `members` property is where the compiler plugin provides value. At runtime,
`members.getItem` is a `MemberRef` object. At compile time (via the plugin), its *existence*
is statically verified against the `expectFunction("getItem")` calls in the chain.

### 2.3 The DAG

Every generation program implicitly defines a DAG:

- **Nodes** — individual `scope().act().expect*()` chains
- **Edges** — `withInput(artifact)` and `withInput(inputFile)` calls
- **Cache keys** — content hashes of all inputs to a node (act string + scope file contents
  + all input artifact outputHashes + model version)

When a node's cache key matches what's recorded in the manifest, the node is considered
fresh and its generation step is skipped.

---

## 3. Runtime API

### 3.1 Entry Points

```typescript
import { wolder } from "@wolder/core"

// Create a workspace bound to a project root
const w = wolder({ root: process.cwd(), model: "claude-sonnet-4-6" })
```

### 3.2 `input(path)` — Declare a developer-owned file

```typescript
const authHelpers = w.input("src/auth/helpers.ts")
// Returns: InputRef — a typed reference to this file used in withInput()
```

`input()` registers the file as framework-read-only. Its content hash is tracked in the
manifest. If it changes, downstream nodes that declared it as an input are marked stale.

### 3.3 `scope(path | glob)` — Begin a generation chain

```typescript
w.scope("src/services/todoService.ts")
 .scope("src/services/todoService.test.ts")  // multiple files, same step
```

Returns a `ScopeBuilder`. The files named here are owned by the framework. They are the
outputs this step will generate or overwrite.

### 3.4 `.act(instruction: string)` — Provide the generation instruction

```typescript
.act("Create a TodoService class with in-memory CRUD operations for TodoItem objects")
```

The instruction string is:
1. Included verbatim in the LLM prompt alongside the scope context
2. Hashed as part of the node's cache key

### 3.5 `.withInput(ref: InputRef | ArtifactMemberRef | Artifact)` — Provide read-only context

```typescript
.withInput(authHelpers)                      // entire input file
.withInput(todoItemArtifact)                 // entire artifact (all generated files)
.withInput(todoItemArtifact.members.TodoItem) // single member reference
```

When given an `Artifact`, the framework includes the generated file content as read-only
context in the LLM prompt and records the artifact's outputHash as part of this node's
cache key. When given a single `MemberRef`, only that member's definition is included.

### 3.6 `.expectFile(path: string)` — Assert a file was created

```typescript
.expectFile("src/services/todoService.ts")
```

Validated by: checking the file exists after generation. Causes re-try with error feedback
if absent.

### 3.7 `.expectClass(name: string)` — Assert a class exists in the scope

```typescript
.expectClass("TodoService")
```

Validated by: `ts-morph` AST query — `sourceFile.getClass(name) !== undefined`.

Returns a `ClassExpectationBuilder` for chaining member expectations. The class name is
registered on the artifact's `members` map.

### 3.8 `.withFunction(name: string)` — Assert a method exists on the preceding class

```typescript
.expectClass("TodoService")
.withFunction("getAllItems")
.withFunction("addItem")
.withFunction("deleteItem")
```

Validated by: `ts-morph` — `classDecl.getMethod(name) !== undefined`.

Each function name is registered as a named member on the artifact. Accessible at runtime
as `artifact.members.getAllItems`, etc. Statically typed via the compiler plugin.

### 3.9 `.expectInterface(name: string)` — Assert an interface exists

```typescript
.expectInterface("ITodoService")
.withMethod("getAllItems")
.withMethod("addItem")
```

Same pattern as `expectClass`. Validates the interface declaration and its methods.

### 3.10 `.expectImplements(inputRef: InputRef)` — Assert a class implements an interface

```typescript
const iface = w.input("src/interfaces/ITodoService.ts")

w.scope("src/services/todoService.ts")
 .act("implement ITodoService")
 .withInput(iface)
 .expectImplements(iface)
```

Validated by: `ts-morph` type checker — `classDecl.getImplements()` includes the named
interface. This is a semantic check, not just structural.

### 3.11 `.expectWebPage(route: string, description: string)` — Assert a page renders correctly

```typescript
.expectWebPage("/", "displays the text hello world")
.expectWebPage("/todos", "shows a list of todo items with checkboxes")
```

Validated by:

1. The framework starts the application (using the `devCommand` in config)
2. Playwright opens the route in a headless browser
3. The `description` string is compiled to a DOM/text assertion on first run (LLM-assisted,
   then cached as a concrete Playwright assertion)
4. The compiled assertion is stored in the manifest alongside the node

The compiled Playwright assertion is a committed artifact — it is human-readable, diffable,
and version-controlled. It is NOT regenerated unless the description string changes.

### 3.12 `.expectCompiles()` — Assert the scope files compile without errors

```typescript
.expectCompiles()
```

Validated by: running `tsc --noEmit` scoped to the generated files. Errors are fed back to
the LLM as context for a retry.

### 3.13 `.build()` — Finalize the chain and return an Artifact

```typescript
const todoServiceArtifact = await w
  .scope("src/services/todoService.ts")
  .act("Create a TodoService class...")
  .expectClass("TodoService")
  .withFunction("getAllItems")
  .withFunction("addItem")
  .build()
```

`build()` returns a `Promise<Artifact<TMembers>>` where `TMembers` is inferred from all
`expectClass/expectInterface` + `withFunction/withMethod` calls in the chain.

If the node's cache key is fresh, generation is skipped and the cached artifact is returned
immediately. If stale, generation runs, expectations are validated (with retries), and the
manifest is updated.

### 3.14 Complete chain example

```typescript
import { wolder } from "@wolder/core"

const w = wolder({ root: process.cwd(), model: "claude-sonnet-4-6" })

// Developer-owned files — never touched by the generator
const todoItemModel = w.input("src/models/TodoItem.ts")

// Step 1: Generate the service
const todoService = await w
  .scope("src/services/todoService.ts")
  .act(`
    Create a TodoService class that provides CRUD operations for TodoItem objects.
    Use an in-memory Map for storage. Each item should have a generated UUID.
  `)
  .withInput(todoItemModel)
  .expectClass("TodoService")
  .withFunction("getAllItems")
  .withFunction("getItem")
  .withFunction("addItem")
  .withFunction("updateItem")
  .withFunction("deleteItem")
  .expectCompiles()
  .build()

// Step 2: Generate the controller — uses typed member refs from step 1
const controller = await w
  .scope("src/controllers/todoController.ts")
  .act("Create an Express router that exposes RESTful endpoints for TodoService")
  .withInput(todoService.members.getAllItems)   // typed: MemberRef<"getAllItems">
  .withInput(todoService.members.addItem)       // typed: MemberRef<"addItem">
  .withInput(todoService)
  .expectClass("TodoController")
  .withFunction("register")
  .expectCompiles()
  .build()

// Step 3: Generate the app shell with behavioral validation
await w
  .scope("src/app.ts")
  .act("Wire up Express app with TodoController")
  .withInput(controller)
  .expectFile("src/app.ts")
  .expectCompiles()
  .expectWebPage("/todos", "renders a list of todo items")
  .build()
```

---

## 4. Compiler Plugin

### 4.1 Problem

At runtime, `todoService.members.getAllItems` works because `members` is populated
dynamically. But TypeScript does not know at compile time which member names are valid.
Without the plugin:

```typescript
todoService.members.getAllItems  // ✅ runtime OK
todoService.members.doesntExist  // ✅ TypeScript OK (no error) — BAD
```

### 4.2 Approach: TypeScript Language Service Plugin

The plugin is a standard TypeScript language service plugin (`ts-plugin`), compatible with
`ts-node`, `ts-jest`, Vite's `vite-tsconfig-paths`, and IDEs without any patching.

It does NOT use `ts-patch` or compiler transforms. It operates as a language service plugin,
which means:

- It provides enhanced **completions** and **diagnostics** in IDEs and type checking
- It does NOT affect emitted JavaScript — runtime behavior is unchanged
- It works with `tsc`, `ts-node`, Vitest, and all standard tooling without patches

### 4.3 Plugin Mechanism

The plugin intercepts property access on objects with the internal brand type
`__WolderArtifact__`. When it sees `someArtifact.members.X`, it:

1. Walks back to the variable declaration of `someArtifact`
2. Finds the `build()` call that produced it
3. Walks the chain to collect all `withFunction(name)` and `withMethod(name)` calls
4. Emits a diagnostic if `X` is not in the collected set
5. Provides completions from the collected set

This is entirely static — the plugin reads source text and symbol information without
executing any code.

### 4.4 Plugin Registration

```json
// tsconfig.json
{
  "compilerOptions": {
    "plugins": [
      { "name": "@wolder/ts-plugin" }
    ]
  }
}
```

VS Code and other LSP-based editors pick this up automatically. `tsc --noEmit` will
respect the plugin's diagnostics when run via `ts-node` or similar wrappers that load
language service plugins.

> **Note on limitation:** TypeScript language service plugins provide diagnostics in
> the IDE and in type-checking flows that load plugins (ts-node, ts-jest, ts-server).
> They do NOT produce errors in a plain `tsc` invocation without a wrapper. For CI
> enforcement, use `ts-node --project tsconfig.json -e "require('./wolder.program.ts')"` 
> or add a `wolder check` command that runs the language service programmatically.

### 4.5 Plugin Implementation Sketch

```typescript
// packages/ts-plugin/src/index.ts
import type ts from "typescript/lib/tsserverlibrary"

function init(modules: { typescript: typeof ts }) {
  const ts = modules.typescript

  function create(info: ts.server.PluginCreateInfo) {
    const proxy = Object.create(info.languageService)

    proxy.getCompletionsAtPosition = (fileName, position, options) => {
      const prior = info.languageService.getCompletionsAtPosition(
        fileName, position, options
      )
      const members = getWolderMembersAtPosition(info, fileName, position)
      if (!members) return prior

      // Inject member names as completions
      return {
        ...prior,
        entries: [
          ...(prior?.entries ?? []),
          ...members.map(m => ({
            name: m,
            kind: ts.ScriptElementKind.memberVariableElement,
            sortText: "0",
          }))
        ]
      }
    }

    proxy.getSemanticDiagnostics = (fileName) => {
      const prior = info.languageService.getSemanticDiagnostics(fileName)
      return [...prior, ...getWolderDiagnostics(info, fileName)]
    }

    return proxy
  }

  function getWolderMembersAtPosition(
    info: ts.server.PluginCreateInfo,
    fileName: string,
    position: number
  ): string[] | null {
    // 1. Get source file and node at position
    // 2. Check if we're accessing .members.X on a Wolder artifact
    // 3. Walk back to the build() call site
    // 4. Collect all withFunction()/withMethod() string literals in the chain
    // 5. Return them as valid member names
    return null // full implementation in packages/ts-plugin
  }

  return { create }
}

export = init
```

### 4.6 Type-level Artifact Shape (Runtime)

The runtime types use template literal inference so the artifact's members are typed
even without the plugin, at the cost of requiring TypeScript 4.7+ inference features:

```typescript
type ExtractMembers<T extends readonly string[]> = {
  [K in T[number]]: MemberRef<K>
}

// The chain builder accumulates member names as a type-level tuple
interface ScopeBuilder<TMembers extends readonly string[] = []> {
  withFunction<N extends string>(name: N): ScopeBuilder<[...TMembers, N]>
  build(): Promise<Artifact<ExtractMembers<TMembers>>>
}
```

This means `artifact.members` IS statically typed through inference alone, without the
plugin, for chains defined in a single expression. The plugin adds:

- Cross-file validation (when artifact is imported from another module)
- Better error messages ("'doesntExist' is not a declared member of this artifact")
- Completions in IDEs that don't support complex generic inference display

---

## 5. Manifest and Caching

### 5.1 Manifest File

`wolder.manifest.json` is committed to the repository. It is the source of truth for
cache validity.

```jsonc
{
  "version": 1,
  "nodes": {
    "todoService": {
      "nodeId": "todoService",
      "inputHashes": {
        "act:sha256": "abc123...",
        "src/models/TodoItem.ts": "def456...",
        "model": "claude-sonnet-4-6"
      },
      "outputHash": "789abc...",
      "generatedFiles": ["src/services/todoService.ts"],
      "expectations": [
        { "type": "class", "name": "TodoService" },
        { "type": "function", "className": "TodoService", "name": "getAllItems" },
        { "type": "compiles" }
      ],
      "compiledAssertions": {},
      "lastRun": "2026-03-14T10:00:00Z"
    },
    "app": {
      "nodeId": "app",
      "inputHashes": { ... },
      "outputHash": "...",
      "generatedFiles": ["src/app.ts"],
      "expectations": [
        {
          "type": "webPage",
          "route": "/todos",
          "description": "renders a list of todo items",
          "compiledAssertion": "await expect(page.locator('[data-testid=\"todo-list\"]')).toBeVisible()"
        }
      ],
      "lastRun": "2026-03-14T10:05:00Z"
    }
  }
}
```

### 5.2 Cache Key Computation

```typescript
function computeCacheKey(node: NodeDefinition): string {
  const parts = {
    act: sha256(node.actInstruction),
    inputs: Object.fromEntries(
      node.inputs.map(i => [i.path, sha256(readFileSync(i.path))])
    ),
    inputArtifacts: Object.fromEntries(
      node.inputArtifacts.map(a => [a.id, a.outputHash])
    ),
    model: node.modelId,
  }
  return sha256(JSON.stringify(parts, null, 0))
}
```

A node is stale if `computeCacheKey(node) !== manifest.nodes[nodeId].inputHashes["act:sha256"]`.
Technically the entire `inputHashes` object is the cache key — the split into named parts
is for human readability in the manifest.

### 5.3 Staleness Propagation

When node N is stale and re-runs, its `outputHash` changes. All downstream nodes that list
N's artifact in their `inputArtifacts` are therefore also stale. Staleness is transitive
through the DAG.

The execution engine performs a topological sort and processes nodes in dependency order,
re-running only the stale subgraph.

### 5.4 Non-determinism Handling

LLM outputs are not deterministic. Two runs with identical inputs may produce different
code. This is expected and handled as follows:

- **Temperature** is set to `0` by default. Can be overridden per-step for exploratory use.
- **If output differs despite fresh cache key** — this is drift (model update, prompt
  change, etc.). Wolder will NOT automatically re-run on drift detection. It reports:
  `"Generated output has changed since last run despite identical inputs. Run wolder regen
  [nodeId] to accept new output."`
- **Accepting drift** — `wolder regen` re-runs a specific node, updates the manifest, and
  stages the changed files for review.

### 5.5 Manual Edit Detection

Because the manifest records `outputHash` for each node's generated files:

```
wolder check
```

Computes the current hash of each generated file and compares to `manifest.outputHash`.
If they differ, it reports:

```
⚠  src/services/todoService.ts has been manually modified
   Expected hash: 789abc...  Current hash: 012def...
   Run 'wolder regen todoService' to regenerate (overwrites manual changes)
   Run 'wolder accept todoService' to accept current state as the new baseline
```

`wolder accept` updates the manifest's `outputHash` to match the current file without
re-generating. This is the explicit acknowledgment that "yes, I intentionally edited this."

The preferred pattern is to NOT manually edit generated files and instead move logic into
`input()` files, but `accept` exists as a pragmatic escape hatch.

---

## 6. Execution Engine

### 6.1 LLM Prompt Construction

For each stale node, the engine constructs a prompt:

```
System:
  You are a TypeScript code generator. You will generate or modify files within a specified 
  scope. Files listed as INPUT are read-only context — do not modify them. Files listed as 
  SCOPE are your output targets.

  Output ONLY the content of each scoped file, formatted as:
  === FILE: <path> ===
  <content>
  === END FILE ===

User:
  SCOPE FILES (you will generate these):
  - src/services/todoService.ts

  INPUT FILES (read-only context):
  === FILE: src/models/TodoItem.ts ===
  [content of TodoItem.ts]
  === END FILE ===

  INSTRUCTION:
  Create a TodoService class that provides CRUD operations for TodoItem objects.
  Use an in-memory Map for storage. Each item should have a generated UUID.

  EXPECTATIONS (your output must satisfy these):
  - A class named "TodoService" must exist
  - TodoService must have a method named "getAllItems"
  - TodoService must have a method named "addItem"
  - The files must compile without TypeScript errors
```

### 6.2 Retry Loop

```
MAX_RETRIES = 3

for attempt in 1..MAX_RETRIES:
  output = llm.generate(prompt)
  files = parseOutputFiles(output)
  writeFiles(files)
  
  failures = runExpectations(files)
  if failures.isEmpty:
    break
  
  prompt = prompt + buildFailureFeedback(failures)
  
if failures.isNotEmpty:
  throw GenerationError(failures)
```

Failure feedback is appended to the conversation context so the LLM has full history of
what was tried and why it failed.

### 6.3 Expectation Validation Order

Expectations are evaluated in this order, stopping at first failure:

1. `expectFile` — file existence (cheapest, fail fast)
2. `expectCompiles` — TypeScript compilation
3. `expectClass` / `expectInterface` / `withFunction` / `withMethod` — AST queries via ts-morph
4. `expectImplements` — semantic type checking via ts-morph type checker
5. `expectWebPage` — headless browser validation (most expensive, runs last)

### 6.4 Web Page Assertion Compilation

On first encounter of a new `expectWebPage(route, description)`:

1. Start the dev server (`config.devCommand`)
2. Open the route with Playwright
3. Take an accessibility tree snapshot
4. Ask the LLM: *"Given this accessibility tree snapshot and the description `{description}`,
   write a single Playwright assertion that verifies this description. Output only the
   assertion code."*
5. Store the compiled assertion in `manifest.nodes[id].expectations[n].compiledAssertion`
6. Commit the manifest

On subsequent runs:
1. Start the dev server
2. Open the route
3. Execute the stored assertion directly — no LLM call

If the description string changes → the compiled assertion is invalidated and recompiled.

---

## 7. Configuration

```typescript
// wolder.config.ts
import { defineConfig } from "@wolder/core"

export default defineConfig({
  // LLM configuration
  model: "claude-sonnet-4-6",
  
  // API key (prefer env var)
  apiKey: process.env.ANTHROPIC_API_KEY,
  
  // Temperature (0 = deterministic, recommended)
  temperature: 0,
  
  // Command to start the dev server for expectWebPage validation
  devCommand: "npm run dev",
  devPort: 3000,
  devReadyPattern: "listening on port",  // string to wait for in stdout
  
  // Retry configuration
  maxRetries: 3,
  
  // Manifest path (default: wolder.manifest.json at project root)
  manifestPath: "wolder.manifest.json",
  
  // Files to always treat as inputs (glob patterns)
  // These are never generated even if referenced in scope()
  protectedPatterns: ["src/models/**", "src/interfaces/**"],
})
```

---

## 8. CLI

```
wolder run [program]     Execute a generation program (default: wolder.program.ts)
wolder check             Check manifest consistency and report stale/drifted nodes  
wolder regen [nodeId]    Force re-generation of a specific node and its dependents
wolder accept [nodeId]   Accept current file state as the baseline (update manifest)
wolder status            Show DAG status: fresh / stale / drifted for each node
wolder clean             Remove all generated files (preserves inputs and program)
```

---

## 9. Package Structure

```
@wolder/core          Runtime DSL, execution engine, manifest management
@wolder/ts-plugin     TypeScript language service plugin for member type safety
@wolder/testing       Utilities for testing generation programs
@wolder/express       Vocabulary: createExpressApp, createExpressRoute, etc.
@wolder/react         Vocabulary: createReactComponent, createReactPage, etc.
@wolder/nextjs        Vocabulary: createNextJsApp, createApiRoute, etc.
```

### 9.1 Vocabulary Package Example

```typescript
// @wolder/express

import type { WolderInstance } from "@wolder/core"

export function createExpressApp(w: WolderInstance, options: {
  port?: number
  middleware?: string[]
} = {}) {
  return w
    .scope("src/app.ts")
    .act(`
      Create an Express.js application.
      Port: ${options.port ?? 3000}
      ${options.middleware?.length ? `Middleware: ${options.middleware.join(", ")}` : ""}
    `)
    .expectFile("src/app.ts")
    .expectCompiles()
}

export function createExpressRoute(w: WolderInstance, options: {
  path: string
  description: string
  inputs?: Array<InputRef | Artifact<any>>
}) {
  let chain = w
    .scope(`src/routes${options.path}.ts`)
    .act(`Create an Express router for the route ${options.path}. ${options.description}`)

  for (const input of options.inputs ?? []) {
    chain = chain.withInput(input)
  }

  return chain
    .expectCompiles()
    .expectWebPage(options.path, options.description)
}
```

Usage:

```typescript
import { createExpressApp, createExpressRoute } from "@wolder/express"
import { wolder } from "@wolder/core"

const w = wolder({ root: process.cwd(), model: "claude-sonnet-4-6" })

const app = await createExpressApp(w, { port: 3000 }).build()

const todoRoute = await createExpressRoute(w, {
  path: "/todos",
  description: "shows a list of todo items",
  inputs: [todoService],
}).build()
```

---

## 10. File Layout of a Wolder Project

```
my-project/
├── wolder.config.ts          # Framework configuration
├── wolder.program.ts         # The generation program (run with `wolder run`)
├── wolder.manifest.json      # Committed — cache/contract state
│
├── src/
│   ├── models/               # Developer-owned input files
│   │   └── TodoItem.ts
│   ├── interfaces/           # Developer-owned input files  
│   │   └── ITodoService.ts
│   │
│   ├── services/             # Generated by Wolder
│   │   └── todoService.ts
│   ├── controllers/          # Generated by Wolder
│   │   └── todoController.ts
│   └── app.ts                # Generated by Wolder
│
└── tsconfig.json             # Includes @wolder/ts-plugin
```

The distinction between `models/` and `services/` is not enforced by directory structure —
it's enforced by whether files are declared with `w.input()` or `w.scope()`. Directory
convention is recommended but not required.

---

## 11. Key Design Decisions and Rationale

### Why language service plugin instead of ts-patch?

ts-patch requires patching the TypeScript compiler binary itself. This creates fragile
build setups and breaks with TypeScript version updates. Language service plugins are
the officially supported extension point. The tradeoff is that `tsc --noEmit` alone won't
surface member errors — a `wolder check` or ts-node/ts-jest wrapper is needed. This is
acceptable given that most teams use IDE-based feedback and don't rely solely on `tsc`.

If stronger `tsc` enforcement is required in future, a companion `wolder typecheck` command
will run the language service programmatically and exit non-zero on violations.

### Why commit generated files instead of gitignoring them?

Committing generated files means:
- PRs show diffs of generated code — reviewers can see what changed and why
- No build step required to use the project after cloning
- Generated files are searchable and navigable in the repo
- CI doesn't need to run generation to validate

The cost is repo size and merge conflicts in generated files. For most projects this is
a good trade. Teams that disagree can gitignore generated files and add `wolder run` to
their setup scripts.

### Why is `withFunction` chained after `expectClass` instead of separate?

```typescript
.expectClass("TodoService")
.withFunction("getAllItems")  // belongs to TodoService
.withFunction("addItem")      // belongs to TodoService
.expectClass("AnotherClass")
.withFunction("otherMethod")  // belongs to AnotherClass
```

The chain naturally scopes `withFunction` to the preceding `expectClass`. This mirrors
how developers read and write class definitions — first the class, then its methods. It
also enables the compiler plugin to attribute member refs correctly without needing a
separate argument.

### Why store compiled Playwright assertions in the manifest?

Compiled assertions are deterministic — the same description always compiles to the same
assertion (given the same accessibility tree). Storing them means:
- No LLM call on re-validation runs
- The assertion is auditable and reviewable in the manifest diff
- The assertion can be manually corrected if the LLM compiled it incorrectly
- Changing the description string invalidates and recompiles — no stale assertions

---

## 12. Out of Scope for Base Implementation

The following are deferred to future versions:

- **Parallel node execution** — nodes with no dependency relationship can run concurrently.
  Base implementation runs sequentially in topological order.
- **Remote cache** — sharing the cache across team members / CI. Base implementation is
  local-only. Remote cache (S3, Redis) is a future extension.
- **Multi-model routing** — using different models for different expectation types
  (e.g., cheap model for structural expectations, expensive model for semantic ones).
- **Watch mode** — automatically re-running stale nodes when input files change.
- **wolder.artifacts.ts generation** — auto-generating a typed artifact manifest file as an
  alternative to the compiler plugin for teams that prefer explicit over implicit.
- **Python / Go bindings** — the runtime is TypeScript-first. Other language bindings
  are possible but not in scope.
