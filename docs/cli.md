# CLI

```
wolder init [--local]      Set up a new wolder project in the current directory
wolder agent               Install the /wolder Claude Code skill into .claude/commands/
wolder run [program]       Execute a generation program (default: wolder.program.ts)
wolder check               Compare generated files against the manifest
wolder clean               Remove all generated files
wolder help                Show help
```

## `wolder run [program]`

Executes a generation program with `tsx`. Defaults to `wolder.program.ts` in the current
directory.

```bash
npx wolder run
npx wolder run programs/backend.ts
```

Output follows the build's phases — graph checks, contract settlement, generation — and
ends with a summary:

```
[wolder] 3 generated  ·  1 cached  ·  2 contract(s)  ·  41.7s
```

The process exits non-zero if the build throws. A `GraphError` means the program is wrong
and nothing ran; a `GateError` or `NegotiationError` means work was attempted.

To regenerate everything, pass `force` in the program:

```typescript
await w.build({ force: true })
```

## `wolder check`

Compares the files on disk against what the manifest recorded, without running anything.

```
  OK  README.md
  !!  src/services/** — drifted
       Files have been modified by hand since the agent wrote them.
       Recorded: c4e8a1b93f02...  Current: 7ab3009fe1cc...
       Run 'wolder run' to regenerate.
```

| Status | Meaning |
|---|---|
| `fresh` | Every recorded file is present and unchanged |
| `drifted` | A file was edited by hand since the agent wrote it |
| `missing` | A recorded file is gone |

Exits non-zero if anything is drifted or missing — useful in CI to catch edits that the
next `wolder run` would silently overwrite.

## `wolder clean`

Deletes every file the manifest attributes to an agent, and removes directories it empties.
Developer-owned files, the program, and the manifest itself are untouched.

## `wolder init [--local]`

Scaffolds `package.json`, `tsconfig.json` and `wolder.config.ts`, then installs. Refuses to
run if any of those already exist.

`--local` wires the dependencies to this repository instead of the registry, for working on
wolder itself, and skips the install.

## `wolder agent`

Writes `.claude/commands/wolder.md` — a Claude Code skill that reads a requirements
document and writes the `wolder.program.ts` for it.

```bash
npx wolder agent
# then, in Claude Code:
/wolder requirements.md
```
