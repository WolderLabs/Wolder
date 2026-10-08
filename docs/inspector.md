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
