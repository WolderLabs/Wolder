# Implementing PLAN-v4 — step-by-step guide

The working guide for `PLAN-v4.md` (the inspector). Read `CLAUDE.md`, `PLAN-v4.md`,
then this. **`PLAN-v3` must be implemented first**; everything below uses the v3
vocabulary (`agent`, `owns`, `goal`, `after`, `asks`, `run`).

Each step is one commit, ends with `npx vitest run` and `npm run typecheck` passing,
and leaves `wolder run` working headless. Steps 1 and 2 are in `@wolder/core`. Steps
3 onward are in a new package `packages/inspector`.

## Decisions the plan left open, settled here

Do not revisit these while implementing. If one turns out to be wrong, finish the
step, then raise it.

| Question                    | Decision                                                                 |
|-----------------------------|--------------------------------------------------------------------------|
| Snapshot granularity        | Per `node:done`. Not per write.                                          |
| Retention                   | Keep the last 20 runs. `WolderConfig.keepRuns?: number`, default 20.     |
| Server                      | Node built-in `http` + `ws` for the websocket. No framework.             |
| MCP                         | `@modelcontextprotocol/sdk`, stdio transport, and the same server mounted on the HTTP server at `/mcp` via its streamable HTTP transport. |
| UI                          | Vite + React 18 + TypeScript. Graph drawn as SVG laid out with `@dagrejs/dagre`. Editor is `@uiw/react-codemirror`. No CSS framework; one `app.css`. |
| Chat agent model            | `config.model` by default; `WolderConfig.inspectorModel?: string` overrides. |
| Program load protocol       | Child `tsx` process with env vars (see Step 2). No IPC channel.          |
| Run start protocol          | Spawn `tsx <program>`; the child records; the server tails the record. No IPC. |
| Record location             | `<root>/.wolder/`. `root` is the generated project root (`WolderOptions.root`). |
| Ignored when snapshotting   | `.wolder/`, `node_modules/`, `.git/`, `wolder.manifest.json`, `.env`.     |

## Step 1 — The run record (`@wolder/core`)

### 1a. Event shapes

In `src/types.ts`:

```ts
/** A raw conversation turn, kept in full for inspection. The console ignores it. */
export type AgentTurn =
  | { readonly kind: "turn"; readonly role: "assistant"; readonly message: unknown }
  | { readonly kind: "turn"; readonly role: "tool"; readonly message: unknown };

export type AgentEvent =
  | AgentTurn
  | { readonly kind: "text"; ... }   // existing variants unchanged
  ...;

export interface GateReport {
  readonly name: string;
  readonly command: string;
  readonly pass: boolean;
  readonly output: string;
  readonly attempt: number;
}

export interface Reporter {
  // existing methods unchanged, plus these, all optional so fakes keep compiling:
  nodePrompt?(id: string, prompt: { system: string; user: string; attempt: number }): void;
  gate?(id: string, report: GateReport): void;
  failed?(error: Error): void;
}
```

Reporter consumers that switch on `event.kind` (`src/reporter.ts` `formatEvent`)
must handle `"turn"` by returning `""` so nothing prints.

### 1b. Emit the new events

- `src/runner.ts` `createSdkRunner`: inside the `for await`, before the existing
  `describeAssistantTurn` call, `emit({ kind: "turn", role: "assistant", message: message.message })`.
  Add a branch for `message.type === "user"` (the SDK delivers tool results as user
  messages) that emits `{ kind: "turn", role: "tool", message: message.message }`.
  Check the SDK's message union in `node_modules/@anthropic-ai/claude-agent-sdk` for
  the exact field names before writing this; do not guess.
- `src/build.ts` `executeNode`: call `reporter.nodePrompt?.(node.id, { system, user: prompt, attempt })`
  immediately before each `services.runner.run(...)`. After `runGates`, call
  `reporter.gate?.(node.id, …)` once per gate that ran. `runGates` currently stops at
  the first failure and returns only that one; change it to return every result
  (`GateResult[]`) and let `executeNode` find the first failure. Update
  `gates.test.ts` accordingly.
- `src/build.ts` `runProgram`: wrap the body after `reporter.phase("Checking the graph")`
  in `try/catch`; in `catch`, call `reporter.failed?.(err)` and rethrow.
- `src/negotiate.ts`: no change. The transcript is already returned in full; the
  recorder gets it from the contract (Step 1d).

### 1c. The recorder

New file `src/record.ts`. Exports:

```ts
export const RECORD_DIR = ".wolder";

export interface RunEvent {
  readonly seq: number;        // 0-based, monotonic within a run
  readonly t: number;          // ms since run start
  readonly kind:
    | "phase" | "note" | "warn"
    | "node:start" | "node:event" | "node:skipped" | "node:done"
    | "contract:settled"
    | "gate" | "snapshot"
    | "run:done" | "run:failed";
  readonly node?: string;
  readonly contract?: string;
  readonly data: unknown;
}

export interface RunMeta {
  readonly id: string;             // ISO timestamp with ':' replaced by '-'
  readonly root: string;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly status: "running" | "ok" | "failed";
  readonly error?: string;
  readonly graph: SerializedGraph; // from Step 2; in Step 1 write `null` here
}

export interface Recorder extends Reporter {
  readonly runDir: string;
}

export function createRecorder(root: string, options?: { keepRuns?: number }): Recorder;
export function composeReporters(...reporters: Reporter[]): Reporter;
export function listRuns(root: string): RunMeta[];
export function readEvents(runDir: string): RunEvent[];
export function snapshotTree(root: string): Record<string, string>;   // path -> sha256
```

Behaviour of `createRecorder`:

- On creation: make `<root>/.wolder/runs/<id>/`, write `run.json` with status
  `running`, prune older run directories beyond `keepRuns`, update the `latest` file
  (write the run id into `<root>/.wolder/latest` as text; do not use a symlink, it
  needs privileges on Windows).
- Every `Reporter` method appends one line to `events.jsonl` with `JSON.stringify`.
  `nodeEvent` maps to `node:event` with the `AgentEvent` as `data`.
- `nodePrompt` writes `nodes/<id>/prompt-<attempt>.md` containing a `# System`
  section and a `# User` section, and appends a `node:start`-adjacent event
  `{ kind: "note", node: id, data: { prompt: "nodes/<id>/prompt-<attempt>.md" } }`.
- `gate` appends `{ kind: "gate", node, data: GateReport }`.
- `nodeDone` appends `node:done`, then takes a snapshot: `snapshotTree(root)`, writes
  every blob not already in `objects/<sha>` (content as-is, UTF-8 files only; skip
  files larger than 2 MB and record them as `"<skipped>"`), then appends
  `{ kind: "snapshot", node, data: { tree: Record<string,string> } }`.
- `summary(result)` appends `run:done` with `{ skipped, contracts: ids, durationMs }`
  and rewrites `run.json` with status `ok` and `finishedAt`.
- `failed(err)` appends `run:failed` with `{ message, name }` and rewrites `run.json`
  with status `failed`.

`composeReporters` calls each method on each reporter in order, skipping optional
methods that are absent.

### 1d. Contract transcripts

In `src/build.ts` `settleOne`, after the negotiator returns, call
`reporter.nodeEvent(id, { kind: "note", text: ... })` as now, **and** add a new
optional reporter method `contractSettled?(contract: Contract, transcript: readonly NegotiationTurn[]): void`.
Call it for fresh contracts only. The recorder writes
`contracts/<id>/transcript.json` (the turns) and appends `contract:settled` with
`{ summary, terms, files: paths, requesters, provider }`.

Contract ids contain a colon (`contract:src/services`); replace `:` and `/` with `_`
when building directory names. Do the same for node ids (they contain `/` and `+`).
Put that in one helper `safeDirName(id)` and use it everywhere.

### 1e. Wire it in

`src/build.ts` `runProgram`: the reporter becomes
`composeReporters(options.reporter ?? createConsoleReporter(), createRecorder(root, { keepRuns: config.keepRuns }))`
unless `options.record === false`. Add `record?: boolean` to `RunOptions` and
`keepRuns?: number` to `WolderConfig` and `DEFAULTS` in `src/config.ts`.

`src/commands.ts` `clean`: also `rmSync(resolve(root, RECORD_DIR), { recursive: true, force: true })`
and report it. `wolder check` is unchanged.

Export from `src/index.ts`: `createRecorder`, `composeReporters`, `listRuns`,
`readEvents`, `snapshotTree`, `RECORD_DIR`, and the types `RunEvent`, `RunMeta`,
`GateReport`, `AgentTurn`.

### 1f. Tests

`src/record.test.ts`, using `mkdtempSync` and the fake runner from `build.test.ts`
(copy the helper; do not import from a test file):

1. A run writes `run.json` with status `ok`, and `events.jsonl` whose first event is
   `phase` and last is `run:done`.
2. `seq` is contiguous from 0.
3. Each node has a `prompt-1.md` with both sections.
4. A failing gate on the first attempt produces a `gate` event with `pass: false`
   and a `prompt-2.md` whose user section contains the gate feedback.
5. A snapshot event follows every `node:done`, its tree contains every file the
   node wrote, and `objects/<sha>` exists for each with matching content.
6. A second run that is fully cached still writes a run directory, with
   `node:skipped` events and no snapshots.
7. `keepRuns: 2` leaves two run directories after three runs, and `latest` names
   the newest.
8. A thrown `GateError` produces `run:failed` and `run.json` status `failed`.
9. A contract run with a fake negotiator that returns a non-empty transcript
   produces `contracts/<safe id>/transcript.json` with those turns.
10. `composeReporters` forwards every call and tolerates a reporter without the
    optional methods.
11. `clean` removes `.wolder/`.

`src/runner.test.ts`: add a test that `describeAssistantTurn` is unaffected, and one
for the `turn` emission using whatever fake session shape that file already uses.

## Step 2 — Assemble-only mode and structured diagnostics (`@wolder/core`)

### 2a. Serialised graph

`src/serialize.ts`:

```ts
export interface SerializedNode {
  id: string; label: string; regions: string[]; goal: string;
  contexts: string[];            // the agent's own
  layerContexts: string[];       // from its layer, in order
  includedFiles: string[]; gates: Gate[];
  after: string[]; asks: AskEdge[]; provides?: string; chainHash: string;
}
export interface SerializedGraph {
  root: string;
  nodes: SerializedNode[];
  order: string[];
  contracts: Array<{ id: string; provider: string; requesters: string[] }>; // derived from asks, grouped per provider like settleContracts
}
export interface GraphDiagnostic {
  message: string;
  agents: string[];      // node ids or spec descriptions involved
  regions?: string[];
  hint?: string;         // the "what you probably want" paragraph
}
export function serializeGraph(graph: Graph, root: string): SerializedGraph;
```

### 2b. Structured `GraphError`

`src/errors.ts`: `GraphError` gains a constructor
`(message: string, info: Omit<GraphDiagnostic, "message"> = { agents: [] })` and a
`readonly diagnostic: GraphDiagnostic`. Update each `throw new GraphError(...)` in
`src/graph.ts` to pass `agents` (and `regions` for the overlap case). Split each
existing message at the first `\n` into `message` and `hint`. The thrown
`.message` must remain the full text so CLI output is unchanged; tests assert on it.

### 2c. `assemble()`

`WolderInstance` gains:

```ts
/** Assemble and check the graph without running it. Never touches a model. */
assemble(): { ok: true; graph: SerializedGraph } | { ok: false; diagnostic: GraphDiagnostic };
```

Implemented in `src/wolder.ts` by calling `assembleGraph(registry)` inside
`try/catch`, catching only `GraphError`.

`run()` checks `process.env.WOLDER_ASSEMBLE_ONLY === "1"` first. If set, it calls
`assemble()`, writes the JSON result to the path in `process.env.WOLDER_ASSEMBLE_OUT`
(required when the flag is set; throw a clear error if missing), and resolves with
an empty `RunResult` (`artifacts: [], contracts: [], skipped: [], durationMs: 0`)
without reading the manifest or creating a recorder. The program's `await w.run()`
then returns and the process exits normally.

### 2d. Record the graph

Step 1 wrote `graph: null` in `run.json`. Now `runProgram` passes
`serializeGraph(graph, root)` to the recorder via a new optional reporter method
`graphAssembled?(graph: SerializedGraph): void`, called right after `assembleGraph`.
The recorder rewrites `run.json` with it.

### 2e. Tests

`src/serialize.test.ts`: the acceptance graph serialises to four nodes with the
expected `after`/`asks`, and `contracts` has two entries grouped by provider.

`src/wolder.test.ts` (new): `assemble()` returns `ok: false` with `agents` of length
2 and `regions` set for an overlapping program; `ok: true` for the acceptance program.
With `WOLDER_ASSEMBLE_ONLY=1` and `WOLDER_ASSEMBLE_OUT` set to a temp path, `run()`
writes the file, returns an empty result, and the fake runner is never called.
Restore `process.env` in `afterEach`.

## Step 3 — Inspector server and read API (`packages/inspector`)

### Package

`packages/inspector/package.json`: name `@wolder/inspector`, private, ESM,
dependencies `@wolder/core` (`file:../..`), `ws`, `@modelcontextprotocol/sdk`,
`chokidar`; dev dependency `@types/ws`. `main` is `./src/index.ts`. Add
`packages/inspector/src` to `tsconfig.check.json` and `tsconfig.test.json`
`include` if the glob does not already cover it (it does: `packages/*/src`).

### Layout

```
packages/inspector/src/
  index.ts          createInspector(options) — starts everything, returns { close }
  program.ts        loadProgram(programPath): Promise<AssembleOutcome>  (child tsx)
  record.ts         thin readers over @wolder/core's record: runs, events, snapshots, files, diffs
  api.ts            the handlers, pure functions over a `Store`
  http.ts           routes handlers at /api/<name> as JSON, serves ui/dist, upgrades /ws
  watch.ts          chokidar on program files + .wolder/runs/*/events.jsonl → websocket broadcast
  mcp.ts            (Step 4)
  chat.ts           (Step 6)
```

### `program.ts`

```ts
export async function loadProgram(programPath: string): Promise<
  | { ok: true; graph: SerializedGraph; programFiles: string[] }
  | { ok: false; diagnostic: GraphDiagnostic; programFiles: string[] }
  | { ok: false; crash: string; programFiles: string[] }>
```

Spawn `npx tsx <programPath>` with `cwd` = the program's directory and env
`WOLDER_ASSEMBLE_ONLY=1`, `WOLDER_ASSEMBLE_OUT=<tmpfile>`. Read and delete the temp
file. A non-zero exit without an output file is `crash` with the captured stderr.
`programFiles` is the program path plus every local `.ts` file it imports, found by
a regex over `import ... from "./..."` lines, one level deep, resolved relative to
the program. Good enough for the first version; say so in a comment.

### `api.ts`

One `Store` object holding `programPath`, the last `loadProgram` result, and
`root` (from the graph, or `null` if the program did not assemble). Handlers, all
`(store, params) => result | Promise<result>`:

| Name              | Params                          | Result                                                      |
|-------------------|---------------------------------|-------------------------------------------------------------|
| `program.files`   | —                               | `{ files: Array<{ path, content }> }`                       |
| `graph`           | —                               | the `loadProgram` result plus `freshness: Record<id, "fresh" \| "stale" \| "never">` computed from the manifest with `isFresh` + `isOutputFresh` |
| `runs`            | —                               | `RunMeta[]`, newest first                                   |
| `run`             | `{ id }`                        | `{ meta: RunMeta; events: RunEvent[] }`                     |
| `node`            | `{ run, id }`                   | `{ prompts: Array<{ attempt, system, user }>; events: RunEvent[] (this node's); gates: GateReport[]; files: string[]; inputHashes: Record<string,string> }` |
| `contract`        | `{ run, id }`                   | `{ settled: ...; transcript: NegotiationTurn[] }`           |
| `snapshot`        | `{ run, at }`                   | `{ tree: Record<path, sha>; seq: number }` — last snapshot with `seq <= at`, or `{}` |
| `file`            | `{ run, at, path }`             | `{ content: string } \| { skipped: true }`; `at: "now"` reads disk |
| `diff`            | `{ run, a, b }`                 | `{ added: string[]; removed: string[]; changed: string[] }` |
| `program.edit`    | `{ path, content }`             | `{ ok: true }` — refuses any path not in `programFiles`     |
| `run.start`       | `{ force?: boolean }`           | `{ runId }` — spawns `tsx <program>` (with `--force` passed through if the program's CLI supports it; otherwise env `WOLDER_FORCE=1`, which `runProgram` must honour — add that to Step 2c) |

`inputHashes` for `node` come from `wolder.manifest.json` for the latest run only;
for older runs return `{}` and let the UI say "not recorded". Note it in the handler.

### `http.ts`

`POST /api/<name>` with a JSON body, JSON response, `500` with `{ error }` on throw.
`GET /` and any non-API path serve `packages/inspector/ui/dist`. `GET /ws` upgrades to
a websocket; messages are `{ type: "graph", ... }` on program reload and
`{ type: "event", runId, event }` on each new line in the active run's `events.jsonl`.
Bind to `127.0.0.1` only, port from options (default `4747`).

### Tests

`packages/inspector/src/api.test.ts`: build a recorded run in a temp dir with the
fake runner (same pattern as core), point a `Store` at it, and call each read
handler directly. Assert `snapshot` picks the right tree for an `at` between two
nodes, `file` returns blob content, `diff` between the two snapshots lists the
second node's files as `added`, and `program.edit` refuses `../outside.ts`.

`packages/inspector/src/program.test.ts`: `loadProgram` on
`samples/todo-service/wolder.program.ts` returns `ok: true` with four nodes. This
spawns `tsx`; mark it with a 30 s timeout. A fixture program with an overlap returns
`ok: false` with a diagnostic.

## Step 4 — MCP server

`packages/inspector/src/mcp.ts`:

```ts
export function createMcpServer(store: Store): McpServer;
```

One MCP tool per handler, named with underscores (`graph`, `runs`, `run`, `node`,
`contract`, `snapshot`, `file`, `diff`, `program_files`, `program_edit`,
`run_start`), each with a zod input schema matching the params table, each returning
the handler's JSON as a text content block. Plus `wolder_explain` with no params that
returns the DSL reference text (reuse the markdown from `src/skill.ts`; export the
string from core as `DSL_REFERENCE`).

Tool descriptions are two sentences: what it returns, and when to call it. Example
for `node`: *"The prompt an agent received, every conversation turn, gate results and
cache inputs for one node in one run. Call this before editing an agent's goal."*

Entry points: `wolder inspect --mcp` runs stdio transport only; the HTTP server from
Step 3 also mounts it at `/mcp` with the streamable HTTP transport.

Test with the SDK's `InMemoryTransport` pair: list tools, call `runs` and `node`
against the temp-dir fixture from Step 3's tests.

## Step 5 — UI: graph, project, scrubber

`packages/inspector/ui/` is a Vite app. `npm run build` there writes `ui/dist`, which
the server serves. Add a root script `"inspector:ui": "npm --prefix packages/inspector/ui run build"`.
Commit `ui/dist`? **No.** `wolder inspect` builds it on first use if missing, and
says so.

State: one `useInspector()` hook that owns the websocket, the selected run, the
scrubber position (`at`), the selected node or contract, and caches API responses by
key. All components read from it. No global state library.

Layout: three columns with draggable dividers (`react-resizable-panels`). Left column
is a placeholder in this step ("Program — step 6"). Centre: `<GraphView>`. Right:
`<ProjectView>` with `<Scrubber>` on top.

`<GraphView>`: dagre layout, rank direction left-to-right, `after` edges solid,
`asks` edges dashed with a small contract node at the midpoint. Node fill by
freshness; during a run, a node whose last event is `node:start` pulses and shows
its event count. Click selects. `<NodeDetail>` renders as a drawer over the graph:
goal, context stack (layer contexts then own contexts, each in a collapsible block),
regions, prompts per attempt, the event timeline with `turn` events rendered as a
conversation (assistant text in full, tool calls as name plus pretty-printed input,
tool results as collapsible blocks, denials in a warning colour inline), gates, and
cache inputs with a "changed since previous run" marker when the previous run's
`run.json` has a different hash. `<ContractDetail>` renders the transcript as
alternating turns and the terms as a table.

`<Scrubber>`: a range input over `0 .. events.length - 1`, with tick marks at
`node:done` events and a label showing the event kind and node at the thumb.
"Now" is the position past the end, which reads the live disk.

`<ProjectView>`: tree from the snapshot at `at`, files changed by the selected node
marked, click opens `<FileView>` showing content at `at` and a line diff against the
previous snapshot (use `diff` from npm, `diffLines`).

Diagnostics: when `graph` returns `ok: false`, render the message as a banner with
`hint` beneath, and draw whatever nodes can be drawn from `agents`.

No tests for React components in this version. The API tests in Step 3 are the
contract. Do a manual check against `samples/todo-service` after a real run and
record what you saw in the commit message.

## Step 6 — UI: program pane and chat

### Program pane

`<ProgramView>`: file tabs for `programFiles`, CodeMirror with the TypeScript
language package, save on Ctrl/Cmd+S through `program.edit`. After a save the server's
watcher reloads the program and pushes `graph`; the graph re-renders. Selecting a
node in the graph scrolls the editor to the first line containing `.owns("<region>")`
for one of its regions; good enough, note it.

### Chat agent

`packages/inspector/src/chat.ts`:

```ts
export function createChatSession(store: Store, options: { model: string; apiKey?: string }): {
  send(text: string, onEvent: (e: AgentEvent) => void): Promise<string>;
};
```

Uses `query` from `@anthropic-ai/claude-agent-sdk` the same way `createSdkRunner`
does, with:

- `cwd` = the program's directory;
- `canUseTool` = `createPermissionGuard({ root: programDir, regions: programFiles })`
  from core, so writes outside the program files are denied and reads are fenced to
  the project root. `allowedTools` stays empty (see `CLAUDE.md`).
- `mcpServers`: the inspector's own MCP server from Step 4 over an in-process
  transport, so the agent can call `node`, `contract`, `runs` and the rest. Do not
  expose `run_start` or `program_edit` to the chat agent: it edits through the SDK's
  `Edit`/`Write` tools behind the guard, and it does not start runs (plan §9).
- system prompt: `DSL_REFERENCE` + a short paragraph: "You edit the wolder program
  files only. Inspect before you edit. Explain each edit in one sentence."
- `maxTurns` from config.

Conversation history is kept in memory per server process; one session.

`<ChatView>` sits under the editor: message list, input, streaming of `AgentEvent`s
as a compact activity line while the agent works. After the agent's turn ends, the
program pane refreshes its file contents.

HTTP: `POST /api/chat` with `{ text }` streams newline-delimited JSON events then a
final `{ done: true, text }`.

Test `chat.ts` with a fake `query` injected through an options field
(`options.query?: typeof query`) the same way core injects services: assert that a
scripted tool call writing to `project/src/x.ts` is denied and one writing to
`wolder.program.ts` is allowed.

## Step 7 — `wolder inspect`

`src/cli.ts`: new case `"inspect"`. Flags: `[program]` (default `wolder.program.ts`),
`--port <n>`, `--mcp` (stdio MCP only, no HTTP, no browser), `--no-open`. Import
`createInspector` from `@wolder/inspector` lazily (dynamic `import()`), so core does
not depend on the inspector at load time. Add `@wolder/inspector` as a workspace
dependency of `packages/cli`. Open the browser with `open`/`start`/`xdg-open` per
platform via `child_process.exec`; ignore failures.

Update `docs/cli.md` and add `docs/inspector.md`: what it shows, the three panes, the
scrubber, the chat fence, how to connect Claude Code to the MCP endpoint (`claude
mcp add wolder -- npx wolder inspect --mcp`).

## Commit messages

```
feat: record every run under .wolder with prompts, turns, gates and snapshots
feat: assemble-only mode and structured graph diagnostics
feat(inspector): server and read API over the run record
feat(inspector): MCP server exposing the inspection API
feat(inspector): graph, project and time-scrubber UI
feat(inspector): program editor and fenced chat agent
feat: wolder inspect command
```

## Pitfalls

- **Windows paths.** Node ids contain `/`. Never use an id as a path segment without
  `safeDirName`. Snapshot trees use forward slashes regardless of platform; normalise
  with `path.posix`.
- **The SDK message shapes** are not stable across versions. Read the installed
  type definitions for `SDKMessage` before writing the `turn` emission and the chat
  session. Pin what you find in a comment with the SDK version.
- **Do not let the recorder throw.** A failing snapshot (unreadable file) must
  `warn` and continue; an inspector bug must never fail a generation run. Wrap every
  filesystem write in the recorder with a try/catch that reports through `warn`.
- **The chat agent's region is the program files, not the program directory.** A
  directory region would let it write `wolder.config.ts`'s neighbours and, for
  samples, the whole repo. Pass the explicit file list.
- **`allowedTools` must stay empty** for both the generation runner and the chat
  agent. Listed tools skip `canUseTool` and bypass the fence.
- **Do not read `.wolder/` in `wolder check`.** Freshness is the manifest's job; the
  record is history.
