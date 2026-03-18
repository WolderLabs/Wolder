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
- File paths — hash of each input file's content
- `artifact:<id>` — the `outputHash` of upstream artifacts
- `member:<path>:<name>` — hash of files containing referenced members

### Output Hash

SHA256 of all generated file contents (sorted by path for determinism).

### Dependencies

`dependsOn` lists the node IDs of upstream artifacts passed via `withInput()`. This enables staleness propagation — if an upstream node regenerates with a different `outputHash`, downstream nodes become stale.

### Compiled Assertions

For `expectWebPage()`, the `compiledAssertions` record stores LLM-compiled Playwright assertions keyed by `route::description`. These are reused on subsequent runs without an LLM call.

## Drift Detection

`wolder check` computes the current hash of each generated file and compares it to the manifest's `outputHash`. If they differ, the file has been manually edited (drifted).

The recommended workflow is to not manually edit generated files — instead, move logic into input files and re-run generation. If you do edit a generated file, `wolder run` will regenerate it on the next run (since the output hash won't match what the LLM would produce).
