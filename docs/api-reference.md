# API Reference

## `wolder(options)`

Creates a WolderInstance bound to a project root.

```typescript
import { wolder } from "@wolder/core"

const w = wolder({
  root: process.cwd(),  // or import.meta.dirname
  model: "claude-sonnet-4-6",
})
```

**Parameters:**
- `root` — absolute path to the project root. All file paths are resolved relative to this.
- `model` — Anthropic model ID for generation.

**Returns:** `WolderInstance`

---

## `w.input(path)`

Declares a developer-owned file. The file is read-only context — the LLM sees its contents but cannot modify it.

```typescript
const todoModel = w.input("src/models/TodoItem.ts")
```

**Returns:** `InputRef`

---

## `w.scope(path)`

Begins a generation chain. The file at `path` is owned by the framework and will be generated or overwritten.

```typescript
w.scope("src/services/todoService.ts")
```

Multiple scope files can be chained for a single generation step:

```typescript
w.scope("src/services/todoService.ts")
 .scope("src/services/todoService.test.ts")
```

**Returns:** `ScopeBuilder`

---

## `.act(instruction)`

Provides the generation instruction. This is included verbatim in the LLM prompt and hashed as part of the cache key.

```typescript
.act("Create a TodoService class with CRUD operations for TodoItem")
```

**Returns:** `ActBuilder`

---

## `.withInput(ref)`

Provides read-only context to the generation step. Accepts:

- `InputRef` — an entire input file
- `Artifact` — all generated files from a previous step
- `MemberRef` — a specific member from a previous artifact

```typescript
.withInput(todoModel)                         // InputRef
.withInput(serviceArtifact)                   // Artifact
.withInput(serviceArtifact.members.getAllItems) // MemberRef
```

When given an Artifact, its `outputHash` becomes part of this node's cache key. If the upstream regenerates with different output, this node becomes stale.

**Returns:** `ActBuilder`

---

## `.expectFile(path)`

Asserts that a file exists after generation.

```typescript
.expectFile("src/services/todoService.ts")
```

**Validation:** `fs.existsSync(path)` — cheapest check, runs first.

**Returns:** `ActBuilder`

---

## `.expectClass(name)`

Asserts that a class with the given name exists in the scope files.

```typescript
.expectClass("TodoService")
```

**Validation:** ts-morph `sourceFile.getClass(name) !== undefined`

**Returns:** `ClassExpectationBuilder` — enables `.withFunction()` chaining.

---

## `.withFunction(name)`

Asserts that a method exists on the preceding class. Also registers the name as a typed member on the artifact.

```typescript
.expectClass("TodoService")
.withFunction("getAllItems")
.withFunction("addItem")
```

**Validation:** ts-morph `classDecl.getMethod(name) !== undefined`

The function name is available on the returned artifact as `artifact.members.getAllItems` with type `MemberRef<"getAllItems">`.

**Returns:** `ClassExpectationBuilder`

---

## `.expectInterface(name)`

Asserts that an interface with the given name exists in the scope files.

```typescript
.expectInterface("ITodoService")
```

**Returns:** `InterfaceExpectationBuilder` — enables `.withMethod()` chaining.

---

## `.withMethod(name)`

Asserts that a method exists on the preceding interface.

```typescript
.expectInterface("ITodoService")
.withMethod("getAllItems")
.withMethod("addItem")
```

**Returns:** `InterfaceExpectationBuilder`

---

## `.expectImplements(interfaceRef)`

Asserts that a generated class implements an interface from the given input file.

```typescript
const iface = w.input("src/interfaces/ITodoService.ts")

w.scope("src/services/todoService.ts")
 .act("Implement ITodoService")
 .withInput(iface)
 .expectImplements(iface)
```

**Validation:** ts-morph type checker verifies the class satisfies the interface contract. Missing methods produce specific error messages.

**Returns:** same builder type (preserves chaining context)

---

## `.expectCompiles()`

Asserts that the scope files compile without TypeScript errors.

```typescript
.expectCompiles()
```

**Validation:** ts-morph `project.getPreEmitDiagnostics()` scoped to generated files. Errors include file name, line number, and compiler message — all fed back to the LLM on retry.

**Returns:** `ActBuilder`

---

## `.expectWebPage(route, description)`

Asserts that a page renders correctly in a browser.

```typescript
.expectWebPage("/todos", "shows a list of todo items with checkboxes")
```

**Validation:**
1. Starts the dev server (`config.devCommand`)
2. Opens the route with Playwright
3. First run: takes ARIA snapshot, asks LLM to compile a Playwright assertion
4. Stores compiled assertion in manifest (no LLM call on subsequent runs)
5. Executes the assertion

The compiled assertion is invalidated if the description string changes.

Requires `devCommand`, `devPort`, and `devReadyPattern` in config.

**Returns:** `ActBuilder`

---

## `.build()`

Finalizes the chain and returns an Artifact.

```typescript
const artifact = await w
  .scope("src/services/todoService.ts")
  .act("Create TodoService")
  .expectClass("TodoService")
  .withFunction("getAllItems")
  .build()
```

**Behavior:**
1. Checks the manifest cache — returns immediately if fresh
2. Calls the LLM, parses output, writes files
3. Validates expectations (with retries on failure)
4. Updates the manifest

**Returns:** `Promise<Artifact<ExtractMembers<TMembers>>>` where `TMembers` is inferred from `withFunction`/`withMethod` calls.

---

## `defineConfig(config)`

Helper for creating a typed configuration object. See [Configuration](./configuration.md).

```typescript
import { defineConfig } from "@wolder/core"

export default defineConfig({
  model: "claude-sonnet-4-6",
  maxRetries: 5,
})
```
