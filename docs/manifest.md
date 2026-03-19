# Manifest

`wolder.manifest.json` is the cache and state file for your project. It should be committed to version control.

## Why commit it?

- PRs show what changed in the generation cache
- No build step needed after cloning — generated files are already on disk
- CI can run `wolder check` to verify generated files are fresh
- Compiled Playwright assertions are auditable and diffable

## Structure

```jsonc
{
  "version": 1,
  "nodes": {
    "src/services/todoService.ts": {
      "nodeId": "src/services/todoService.ts",
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
      "dependsOn": [],
      "lastRun": "2026-03-18T10:00:00.000Z"
    }
  }
}
```

## Fields

### Node ID

Derived from the scope file paths joined with `+`. A single-file scope uses the file path directly.

### Input Hashes

A record of all inputs that contribute to the cache key:

- `act:sha256` — hash of the `.act()` instruction string
- `model` — the model ID
- `scope:sha256` — hash of the scope file path list
- `expectations:sha256` — hash of the full expectations array
- File paths — hash of each `.withInput()` file's content
- `artifact:<id>` — the `outputHash` of upstream artifacts passed via `.withInput()`
- `member:<path>:<name>` — hash of files containing referenced members

### Output Hash

SHA256 of all generated file contents (sorted by path for determinism). Used to detect manual edits between runs.

### Dependencies

`dependsOn` lists the node IDs of upstream artifacts passed via `withInput()`. This enables staleness propagation — if an upstream node regenerates with a different `outputHash`, downstream nodes become stale.

## What Triggers Regeneration

A node regenerates if **any** of the following are true:

**Inputs changed**
- The `.act()` instruction text changed
- The model name changed
- The scope file list changed (added, removed, or reordered `.scope()` calls)
- The `.expect()` chain changed
- A `.withInput(file)` content changed on disk
- An upstream `.withInput(artifact)` was regenerated (its `outputHash` changed)

**Output drifted**
- A generated file was manually edited
- A generated file was deleted from disk

## Drift Detection

`wolder check` compares the current hash of each generated file against the stored `outputHash` and reports nodes as `fresh`, `drifted`, or `missing` — without regenerating anything.

`wolder run` does the same check and regenerates any drifted or missing nodes automatically.
