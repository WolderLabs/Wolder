# Type Safety

Wolder provides two layers of type safety for artifact members.

## Layer 1: Generic Inference (built-in)

The DSL uses TypeScript generics to track member names through the chain. When you write a chain in a single expression, the return type is fully typed:

```typescript
const svc = await w
  .scope("svc.ts")
  .act("Create service")
  .expectClass("Svc")
  .withFunction("getAllItems")   // TMembers = ["getAllItems"]
  .withFunction("addItem")      // TMembers = ["getAllItems", "addItem"]
  .build()
// typeof svc = Artifact<{
//   getAllItems: MemberRef<"getAllItems">
//   addItem: MemberRef<"addItem">
// }>

svc.members.getAllItems  // MemberRef<"getAllItems"> — autocomplete works
svc.members.addItem     // MemberRef<"addItem">
svc.members.oops        // Compile error
```

This works with TypeScript 4.7+ and requires no plugin. The `withFunction<N>` and `withMethod<N>` methods use generic parameter inference to accumulate member names as a type-level tuple.

### How it works

```typescript
interface ClassExpectationBuilder<TMembers extends readonly string[]> {
  withFunction<N extends string>(name: N): ClassExpectationBuilder<[...TMembers, N]>
  build(): Promise<Artifact<ExtractMembers<TMembers>>>
}

type ExtractMembers<T extends readonly string[]> = {
  [K in T[number]]: MemberRef<K>
}
```

Each `withFunction("name")` call produces a new type with `name` appended to the tuple. `build()` converts the tuple to a members record.

## Layer 2: TypeScript Plugin (for cross-file use)

Generic inference only works within a single expression. If you pass an artifact to another module or assign it to an intermediate variable, TypeScript may widen the type and lose member information.

The `@wolder/ts-plugin` solves this by generating a `wolder.artifacts.d.ts` file with explicit types:

```typescript
// wolder.artifacts.d.ts (auto-generated)
import type { Artifact, MemberRef } from "@wolder/core"

export type TodoServiceArtifact = Artifact<{
  getAllItems: MemberRef<"getAllItems">
  addItem: MemberRef<"addItem">
}>
```

### Setup

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

### How it works

The plugin:
1. Parses your `wolder.program.ts` file
2. Walks the AST to find all `await ...build()` expressions
3. Extracts `withFunction`/`withMethod` string literals from the chain
4. Generates a `.d.ts` file with typed exports
5. Regenerates when the program file changes

Since it outputs a real `.d.ts` file, it works with `tsc`, all editors, and CI — no runtime magic.

## Using Member Refs

Members are used with `withInput()` to pass specific code elements as context to downstream steps:

```typescript
const svc = await w
  .scope("svc.ts")
  .act("Create service")
  .expectClass("Svc")
  .withFunction("getAllItems")
  .build()

// Pass a specific member as context
const ctrl = await w
  .scope("ctrl.ts")
  .act("Create controller")
  .withInput(svc.members.getAllItems)  // only this member's file is included
  .build()
```

A `MemberRef` carries the member's name, class name, and file path — enough information for the prompt builder to include the relevant source code.
