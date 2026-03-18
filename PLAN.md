# Wolder Implementation Plan

## Phase 0: Skeleton + Proof of Concept

**Goal:** Can a developer write a Wolder program, run it, and get a generated file back? Does the syntax feel right?

- [ ] **0.1 Project scaffolding**
  - Initialize `@wolder/core` package (package.json, tsconfig.json)
  - Install core deps: typescript, ts-morph
  - Install dev deps: vitest
  - Create src/ directory structure, pick build tooling (tsup or tsc)
  - **Output:** A buildable, empty package that compiles and can be imported

- [ ] **0.2 DSL fluent chain stubs**
  - `wolder({ root, model })` → WolderInstance
  - `w.input(path)` → InputRef
  - `w.scope(path)` → ScopeBuilder, chainable `.scope()`
  - `.act(instruction)` → ActBuilder
  - `.withInput(ref)` — accepts InputRef | Artifact | MemberRef
  - `.expectFile(path)`, `.expectClass(name)` → ClassExpectationBuilder
  - `.withFunction(name)`, `.expectInterface(name)`, `.withMethod(name)`
  - `.expectCompiles()`, `.build()` → stub Artifact with metadata
  - Unit tests verifying chain captures all metadata correctly
  - **Output:** Full DSL is writable/chainable, build() resolves with stub artifact
  - **Blocked by:** 0.1

- [ ] **0.3 LLM integration**
  - Prompt construction per spec section 6.1
  - Anthropic SDK integration (@anthropic-ai/sdk)
  - Parse `=== FILE: path ===` / `=== END FILE ===` response format
  - Write parsed files to disk
  - **Output:** build() calls LLM and writes real files
  - **Blocked by:** 0.2

- [ ] **0.4 Basic expectations (expectFile + expectClass + withFunction)**
  - expectFile: fs.existsSync check
  - expectClass: ts-morph AST query
  - withFunction: classDecl.getMethod(name) check
  - expectInterface + withMethod: same pattern
  - Validation runs in order per spec section 6.3
  - Unit tests with fixture .ts files
  - **Output:** Expectations validate generated code with clear pass/fail results
  - **Blocked by:** 0.2

- [ ] **0.5 Retry loop**
  - On failure, append feedback to conversation context
  - Retry up to maxRetries (default 3)
  - Throw GenerationError if all retries exhausted
  - Structured logging per attempt
  - Test with mocked LLM (bad first try, correct second)
  - **Output:** Generation self-heals on structural failures
  - **Blocked by:** 0.3, 0.4

- [ ] **0.6 Minimal CLI (`wolder run`)**
  - `wolder run [program]` — executes wolder.program.ts via tsx
  - Basic error reporting
  - bin entry in package.json
  - **Output:** `npx wolder run` works end-to-end
  - **Blocked by:** 0.5

---

## Phase 1: Caching + DAG

**Goal:** Incremental regeneration — only re-run stale nodes.

- [ ] **1.1 Manifest read/write**
  - ManifestSchema type matching spec section 5.1
  - Read on init, create empty if absent
  - Write after successful build()
  - Store nodeId, inputHashes, outputHash, generatedFiles, expectations, lastRun
  - **Output:** wolder.manifest.json persists after run
  - **Blocked by:** 0.6

- [ ] **1.2 Cache key computation + freshness check**
  - sha256 of act + input hashes + artifact hashes + model
  - Compare against manifest on build()
  - Fresh → skip generation, return cached artifact
  - Stale → generate, update manifest
  - **Output:** Second run skips generation; changing inputs triggers regen
  - **Blocked by:** 1.1

- [ ] **1.3 Multi-step DAG with dependency tracking**
  - withInput(artifact) creates dependency edges
  - Topological sort for execution order
  - Staleness propagation through the graph
  - Execute only stale subgraph
  - **Output:** Multi-step programs chain correctly, minimal re-runs
  - **Blocked by:** 1.2

---

## Phase 2: Type Safety

**Goal:** artifact.members is fully typed at compile time.

- [ ] **2.1 Runtime generic types for Artifact members**
  - ScopeBuilder<TMembers> accumulates names via withFunction/withMethod
  - build() returns Promise<Artifact<ExtractMembers<TMembers>>>
  - MemberRef carries file path, member name, member kind
  - **Output:** Single-expression chains have full autocomplete + type errors
  - **Blocked by:** 0.2

- [ ] **2.2 TypeScript language service plugin**
  - Separate package: @wolder/ts-plugin
  - Intercept property access on artifact.members
  - Walk back to build() call, collect withFunction/withMethod names
  - Provide completions + emit diagnostics
  - Register via tsconfig.json plugins
  - **Output:** IDE autocomplete and error squiggles for member access
  - **Blocked by:** 2.1

---

## Phase 3: Advanced Expectations

- [ ] **3.1 expectCompiles()**
  - Run tsc --noEmit scoped to generated files
  - Feed compiler errors back as retry context
  - **Output:** Non-compiling code triggers retry with error feedback
  - **Blocked by:** 0.4

- [ ] **3.2 expectImplements()**
  - ts-morph type checker: classDecl.getImplements() includes interface
  - Semantic check, not just structural
  - **Output:** Missing interface implementations trigger retry
  - **Blocked by:** 0.4

- [ ] **3.3 expectWebPage()**
  - Start dev server (config.devCommand), wait for ready
  - Playwright headless browser opens route
  - First run: accessibility tree snapshot → LLM compiles Playwright assertion
  - Store compiled assertion in manifest
  - Subsequent runs: execute stored assertion directly
  - Invalidate on description change
  - **Output:** Browser-level behavioral validation works
  - **Blocked by:** 0.6

---

## Phase 4: CLI + Polish

- [ ] **4.1 Remaining CLI commands**
  - `wolder check` — report stale/drifted nodes
  - `wolder regen [nodeId]` — force re-generation
  - `wolder accept [nodeId]` — accept manual edits
  - `wolder status` — DAG status per node
  - `wolder clean` — remove generated files
  - **Output:** Full CLI for generation lifecycle management
  - **Blocked by:** 1.3

- [ ] **4.2 Config file loading**
  - defineConfig() helper
  - Load wolder.config.ts from project root
  - All config options from spec section 7
  - CLI flags > config > defaults merging
  - Protected patterns validation
  - **Output:** Typed config file support
  - **Blocked by:** 0.6

- [ ] **4.3 Error reporting and DX polish**
  - Clear, actionable error messages
  - Colored terminal output
  - Progress indicators during generation
  - Manual edit detection warnings
  - Helpful suggestions
  - **Output:** Pleasant developer experience
  - **Blocked by:** 4.1, 4.2
