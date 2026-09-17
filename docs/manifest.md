# The Manifest

`wolder.manifest.json` records what ran, what it wrote, and what it agreed to — so a second
run of an unchanged program does no work.

```json
{
  "version": 2,
  "nodes": {
    "src/services/**": {
      "nodeId": "src/services/**",
      "inputHashes": {
        "chain": "9f2c…",
        "model": "claude-sonnet-4-6",
        "include:src/models/TodoItem.ts": "4a1b…",
        "uses:package.json": "77de…",
        "contract:README.md": "0c31…"
      },
      "outputHash": "c4e8…",
      "files": ["src/services/todoService.ts"],
      "dependsOn": [],
      "lastRun": "2026-09-16T21:48:00.000Z"
    }
  },
  "contracts": {
    "contract:README.md": {
      "id": "contract:README.md",
      "provider": "README.md",
      "requesters": ["src/services/**"],
      "label": "Documentation",
      "hash": "0c31…",
      "inputHash": "8ba2…",
      "summary": "The README documents TodoService's CRUD surface…",
      "terms": [{ "name": "Usage section", "detail": "…" }],
      "files": ["README.md"],
      "lastRun": "2026-09-16T21:47:12.000Z"
    }
  }
}
```

## Node ids

A node's id is its writable region — `README.md`, `src/services/**`. Regions are provably
non-overlapping, so this is unique, and unlike a declaration counter it is stable when you
reorder the program.

## What a node is keyed on

| Key | Source |
|---|---|
| `chain` | The **entire builder chain** plus the layer it spawned from |
| `model` | The model id |
| `include:<path>` | The contents of each file the layer includes |
| `uses:<id>` | The output hash of each agent this one uses |
| `contract:<id>` | The settled content of each contract it is party to |

`chain` covers every builder call in order — `canWrite`, `context`, `act`, `provides`, and
the edges, with edge targets written as node ids so reordering the program does not
invalidate them.

Change one `.act()` and that node is stale. Its output hash then changes, which makes
everything that `.uses()` it stale, and nothing else.

## Discovered outputs

Because the agent decides what it writes, the output set is not known up front. `files`
records what was **actually** written, discovered after the run — including any files the
provider committed to during the contract phase. That is what lets the next run detect a
hand edit or a deletion.

A node re-runs when either its inputs changed (`inputHashes`) or its outputs no longer
match what was recorded (`outputHash` against the files on disk).

## Contracts

A contract is a first-class entry, not a side note.

- `inputHash` covers what went into the negotiation — the participants' chains and their
  asks. An unchanged contract is restored from the manifest instead of re-settling, so a
  settled agreement does not churn.
- `hash` covers the settled content, and appears in every participant's `inputHashes`. A
  changed contract invalidates everyone party to it.
- `files` records paths only; the content lives on disk, in the provider's region. If one
  of those files is missing, the contract re-settles.

Contract files written during the contract phase are **not** rolled back if the provider's
own run later fails. They are the agreement, already recorded — the next attempt should
build on them, not rediscover them.

## Pruning

Nodes and contracts the current program no longer declares are dropped from the manifest at
the end of every build. The files they wrote are left on disk; `wolder clean` removes those
that are still tracked.

## Version

A v1 manifest is discarded on read. v1 keyed on declared expectations and fixed scopes,
neither of which survives into v2.
