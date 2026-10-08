# Wolder v4 — The inspector

Status: **proposal**. Implementation guide: `PLAN-v4-impl.md`. Builds on `PLAN-v3.md` (vocabulary, recipes) and uses the v3
terms throughout. Nothing here is implemented.

## 1. What it is

A local app that opens a wolder program and shows, side by side:

- the **program files** (`wolder.program.ts`, its config, any recipe modules);
- the **generation graph** assembled from them — agents, regions, `after` and `asks`
  edges, contracts;
- the **generated project** as it is now, and as it was at any point during any run.

Every part of the generation process is inspectable from the graph: the prompt an
agent received, every tool call it made, every negotiation turn, the contract that
came out, the cache key and why a node was or was not fresh, and the state of the
generated tree the moment that node finished.

The inspector is also the **primary way to change the program**. Out of the gate it
has a chat panel: the developer describes a change, an agent edits the program files,
the graph re-assembles live, and the developer runs it. The same inspection surface is
exposed as an **MCP server**, so an agent in the chat panel, or any external agent such
as Claude Code, can read the generation process the way the developer does.

## 2. What exists and what is missing

The runtime already produces most of the facts, but it throws them away.

| Fact                                   | Today                                            | Needed                              |
|----------------------------------------|--------------------------------------------------|-------------------------------------|
| Graph (nodes, regions, edges)          | In memory during `run()`; `check` reports status | Assemble without running; serialise |
| Cache keys, input hashes, file lists   | `wolder.manifest.json`                           | Keep; link from run record          |
| Contract summary, terms, files         | Manifest                                         | Keep                                |
| Negotiation transcript                 | In `NegotiationOutcome`, dropped unless it fails | Persist every turn                  |
| Agent prompt                           | Built in `prompt.ts`, sent, dropped              | Persist                             |
| Agent events (tool calls, retries)     | Streamed to `Reporter`, dropped                  | Persist, with timestamps            |
| Agent conversation (full turns)        | Summarised to one line each, results dropped     | Emit raw turns; persist             |
| Generated files at a point in time     | Nowhere                                          | Snapshot per node completion        |
| Gate output                            | Reporter only                                    | Persist                             |

So the work splits cleanly: first make the runtime **record** a run, then build the
thing that **reads** the record. The recording half is useful on its own, is testable
without a browser, and is the contract the UI and the MCP server both sit on.

## 3. The run record

### Location

A `.wolder/` directory beside `wolder.manifest.json` in the generated project's root.
The manifest stays where it is and keeps its role: *what is fresh*. The run record is
*what happened*. They reference each other by node id and contract id.

```
.wolder/
  runs/
    2026-10-07T18-22-10Z/           # one directory per run()
      run.json                      # graph as assembled, options, start/end, outcome
      events.jsonl                  # the whole run as an ordered event log
      nodes/<id>/prompt.md          # exactly what the agent received
      nodes/<id>/events.jsonl       # that node's slice of the log
      nodes/<id>/gates.json         # gate command, exit code, stdout/stderr
      contracts/<id>/transcript.json
  objects/<sha>                     # content-addressed file blobs, shared across runs
  latest -> runs/...                # the most recent run
```

### Events

One event type, one log, so the inspector's timeline is a single scan:

```ts
interface RunEvent {
  t: number;                 // ms since run start
  kind: "phase" | "node:start" | "node:event" | "node:done" | "node:skipped"
      | "contract:turn" | "contract:settled" | "gate" | "snapshot" | "warn" | "error";
  node?: string;             // agent id, where applicable
  contract?: string;
  data: unknown;             // the AgentEvent, NegotiationTurn, gate result, etc.
}
```

The existing `Reporter` interface already receives every one of these. The recorder is
a `Reporter` implementation that appends to `events.jsonl`; the console reporter and
the recorder are composed, so `run()` gains no new call sites. Negotiation turns reach
the reporter through `NegotiationRequest.onEvent`, which exists; `prompt.ts` output is
handed to the reporter at `node:start` as `detail`, which also exists. The new plumbing
is the gate result, the snapshot, and the conversation turn below.

### Conversation turns

The inspector must show a node's whole conversation: every assistant turn in full,
every tool call with its complete input, every tool result, every denial. The runner
today emits a progress feed, not a transcript — assistant text is cut to its first
line, tool calls keep one truncated path, and tool results are never surfaced. That
is right for a console line and wrong for inspection.

`AgentEvent` gains one variant that carries the raw SDK message:

```ts
| { readonly kind: "turn"; readonly role: "assistant" | "tool"; readonly message: unknown }
```

The SDK runner emits it for each assistant message and each tool result as they pass
through the `for await` loop it already has, before the summarised `text` and `tool`
events it emits now. The console reporter ignores `turn`; the recorder writes it to
`nodes/<id>/events.jsonl`. Nothing is fetched that was not already streaming through
the process. Negotiations already keep full turns in `NegotiationOutcome.transcript`,
so contracts need only the persistence change in §8.

### Snapshots

After every `node:done`, the recorder hashes each file in the node's regions, writes
unseen blobs to `objects/`, and appends a `snapshot` event whose data is a
`{ path: sha }` map of the whole generated tree. Point-in-time state is then: take the
last snapshot at or before event N, resolve paths through `objects/`. Blobs are shared
across runs, so a project that regenerates one node costs one node's worth of storage.
Files the agent did not touch are still in the map, because the map is of the tree,
not the diff. Diffs between any two snapshots are a map comparison.

Everything under `.wolder/` is derived and safe to delete. `wolder clean` removes it.

## 4. Architecture

```
packages/inspector/
  server/       Node. Opens a program, serves the API, hosts MCP, runs the chat agent.
  ui/           Browser. Static bundle served by the server.
  mcp/          The MCP server. Same handlers as the HTTP API, different transport.
```

One process: `wolder inspect [program]` starts the server, opens the browser. The
server is the only thing that touches the filesystem or an LLM; the UI is a client.

### Loading the program

Declaring is synchronous and `run()` is the one await, which is exactly what the
inspector needs: import the program with `tsx` in a child process, with an environment
variable that makes `run()` resolve immediately with the assembled, checked graph
instead of executing it. Pre-flight errors come back as structured data rather than a
thrown error, so the UI can draw the broken graph and point at the offending agents.
This is a small change to `program.ts` and `build.ts`: `run()` already assembles and
checks before executing; the flag stops it between the two.

A file watcher on the program files re-imports on change. The graph diff (nodes added,
regions changed, edges moved) is pushed to the UI over a websocket. The same channel
streams `RunEvent`s while a run is in progress, so the UI's live view and its
historical view read the same shape.

### API

Read-only, over HTTP and over MCP, from one set of handlers:

| Handler                | Returns                                                            |
|------------------------|--------------------------------------------------------------------|
| `program.files`        | Program source files                                               |
| `graph`                | Assembled graph, pre-flight diagnostics, freshness per node        |
| `runs`                 | List of runs with outcome and duration                             |
| `run(id)`              | `run.json` plus the event log                                      |
| `node(run, id)`        | Prompt, events, gate results, cache inputs, files written          |
| `contract(run, id)`    | Transcript, terms, files, which requester asked for what           |
| `snapshot(run, at)`    | Tree at event index `at`                                           |
| `file(run, at, path)`  | One file's content at that point                                   |
| `diff(run, a, b)`      | Paths added, removed, changed between two points                   |

Two mutating handlers, both gated by the same mechanism (see §6):

| Handler                | Does                                                               |
|------------------------|--------------------------------------------------------------------|
| `program.edit`         | Write to a program file                                            |
| `run.start(options)`   | Start `run()` in the child, stream events                          |

## 5. The UI

Three panes, resizable, with the graph in the middle because everything else is
reached from it.

**Left: program.** A file tree of the program files and an editor. Selecting an agent
in the graph highlights its declaration; editing the file re-assembles the graph. The
chat panel lives at the bottom of this pane since its output is edits to these files.

**Centre: graph.** Agents as nodes laid out in dependency order, `after` edges solid,
`asks` edges dashed and pointing at the provider, contracts as small nodes on `asks`
edges. Each node carries its freshness (fresh, stale, never run, running, failed) and,
during a run, its live event count. Clicking a node opens its detail: goal, context
stack (which layer contributed which paragraph), regions, prompt as sent, the full
conversation as turns (assistant text, tool call with input, tool result, denials
inline where they happened), gate output, cache key with each input hash and whether it changed since the
previous run. Clicking a contract opens the transcript as a conversation.

**Right: project.** The generated tree with a **time scrubber** along the top. The
scrubber is the run's event log; dragging it moves the tree to the snapshot at that
point, and the graph node that was running then is highlighted. Files changed by the
selected node are marked; opening one shows its content at that point with a diff
against the previous snapshot. "Now" is the live filesystem.

A run selector above the graph switches which run the scrubber and the node details
read from. Pre-flight errors render as a banner over the graph with the involved
agents outlined, using the same teaching message the CLI prints.

## 6. The chat panel and program edits

The chat agent is a Claude Agent SDK session, built with the same `runner.ts`
machinery that generation agents use, and fenced the same way: **it may write only
the program files**, reads are limited to the project root, no shell, no network. The
fence is `createPermissionGuard` with the program files as the region. This is the
boundary invariant from `CLAUDE.md` applied to the one agent that is allowed to touch
the program, and it is why the inspector can be "the primary means of updating the
program" without being a way to bypass the framework.

The agent's system prompt is the DSL reference plus the recipe pattern from
`PLAN-v3.md`. Its tools are the inspector's MCP tools, so when the developer says *"the
controller keeps importing from the service directly, fix it"*, the agent can read the
controller's last prompt, its events and the contract it settled before it edits the
goal. Edits go through `program.edit`; the watcher re-assembles the graph; the UI
shows the diff in the program pane and the before/after graph. The developer runs when
ready. The agent does not start runs on its own in the first version.

Two more fences that cost nothing: the chat agent cannot write under the generated
project, and it cannot write `wolder.manifest.json` or `.wolder/`. Both fall out of the
region.

## 7. The MCP server

`wolder inspect --mcp` serves the handlers from §4 as MCP tools over stdio, with no
browser. The HTTP server also mounts the same MCP server, so one running inspector can
serve the browser, its own chat agent and an external Claude Code session at once.

Tools are the read handlers one-to-one, plus `program_edit` and `run_start`. Tool
descriptions carry the same teaching register as the pre-flight errors, because the
consumer is an agent that has not read the docs. A `wolder_explain` tool that returns
the DSL reference as text means an external agent needs no prior knowledge of wolder
to make a sensible edit.

Nothing an MCP client can do exceeds what the chat agent can do; they are the same
handlers behind the same fence.

## 8. Changes to `@wolder/core`

Small, and each useful without the inspector:

1. `run()` accepts `{ assembleOnly: true }` (or an env var the CLI sets) and resolves
   with the graph and diagnostics instead of executing.
2. Pre-flight errors carry structured data (`agents`, `regions`, `hint`) alongside the
   message.
3. A `createRecorder(root)` reporter and the snapshot step after `node:done`.
   The `turn` event variant in `AgentEvent`, emitted by the SDK runner for every
   assistant message and tool result.
4. `Reporter.gate(id, result)` so gate output is reported, not only logged.
5. Negotiation transcripts are always surfaced through `onEvent`, not only on failure.
6. `wolder clean` removes `.wolder/`.

## 9. Non-goals for the first version

- **Editing generated files in the inspector.** They are the agents' output; editing
  them by hand is the thing the framework exists to avoid. The project pane is read-only.
- **The chat agent starting runs.** The developer presses run. Revisit once the record
  shows what an unattended edit-run loop would need.
- **Multi-project workspaces.** One program per inspector process.
- **Remote or hosted mode.** Local only; the server binds to localhost.
- **Replacing the CLI.** `wolder run` still works headless and still records, so CI
  runs are inspectable afterwards.

## 10. Sequencing

Each step ships something inspectable on its own.

1. **Run record.** Recorder reporter, event log, prompt persistence, transcript
   persistence, gate results, snapshots, `clean`. Tests use the fake runner and assert
   on the files under `.wolder/`. Headless, no UI.
2. **Assemble-only mode and structured diagnostics.** Tests: the todo-service program
   assembles to the expected graph; a deliberately overlapping program yields a
   structured error.
3. **Server and read API.** HTTP handlers over the run record and the assembled
   graph. Tests hit the handlers directly against a recorded run from step 1.
4. **MCP server.** Same handlers, stdio transport. Test with the MCP SDK's in-memory
   client.
5. **UI: graph and project panes, time scrubber.** Reads only.
6. **UI: program pane and chat.** Fenced chat agent, `program.edit`, live re-assembly.
7. **`wolder inspect`** CLI command tying it together.

## 11. Open questions

1. **Snapshot granularity.** Per node completion is the minimum. Per tool write would
   let the scrubber move inside a node's run, at the cost of many more snapshot
   events. Start with per node; the event log already has every write as a
   `node:event`, so finer snapshots can be reconstructed later if the blobs are kept.
2. **Record size.** Prompts include the full context stack and can be large across
   many runs. A retention setting (keep last N runs) is probably enough.
3. **UI stack.** Not decided here. Whatever is chosen, the server must serve a static
   bundle and the UI must be a pure client of the API, so that the MCP server and the
   browser never diverge in what they can see.
4. **Where the chat agent's model and key come from.** `wolder.config.ts` has a model
   already; the chat agent should default to it and allow an override, since a
   stronger model for editing the program than for generating code is a reasonable
   choice.
