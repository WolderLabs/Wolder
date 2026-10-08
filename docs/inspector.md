# Inspector

`wolder inspect` loads a program, assembles its graph without running it, and serves a
local UI over the run record kept under `.wolder`.

```bash
npx wolder inspect [program] [--port 4747] [--no-open]
```

## Three panes

- **Graph**: every agent, its region, and the `after` / `asks` edges, with pre-flight
  diagnostics shown on the agents involved.
- **Project**: the files in the project, attributed to the agent that owns each region,
  with the contents at the selected point in time.
- **Editor**: the program source itself. Saves re-assemble the graph immediately.

The **Program / Graph / Project** buttons in the top bar show and hide each pane. As many
panes are shown as fit: three on a wide window, two below 1200px (showing a third replaces
the one you used least recently) and one below 800px, where the buttons act as tabs. A
hidden pane keeps its state, including unsaved edits and the chat.

Selecting a node or contract opens its detail under the graph, and opening a file shows
it under the project tree; drag the divider between them to resize. The chat collapses
to its title bar. Pane sizes are remembered per browser.

## Freshness

Node colour (fresh, stale, never run) and the reasons in the node and contract panels
come from a dry-run plan the program computes itself (`w.plan()`, requested by the
inspector with `WOLDER_PLAN=1`). It builds every cache key exactly as `run` does,
including upstream output hashes and contract hashes, and compares against the manifest,
without calling a model or writing anything. Reasons read like "goal, context or layer
changed", "src/x.ts changed", "upstream `api` is stale" or "contract
`contract:src/services` must be renegotiated". A stale upstream makes everything after it
stale; a real run may still skip a downstream node if the regenerated upstream output
turns out identical, so "stale" is an upper bound.

## Scrubber

Each run is recorded with prompts, turns, gates and file snapshots. The time scrubber
moves the graph and project panes back through those runs and through the steps within
a run, so you can see what each agent saw and wrote.

## Chat

The chat agent edits the program. It is fenced the same way generation agents are: its
writable region is the program's own files (not the directory), reads are limited to the
project root, and it has no shell and no network. The fence is enforced at the tool
layer.

The chat model is `model` from the config, unless `inspectorModel` is set.

## MCP

The same inspection API is available to Claude Code:

```bash
claude mcp add wolder -- npx wolder inspect --mcp
```

`--mcp` speaks MCP on stdio only. The HTTP server also exposes it at its MCP route.
