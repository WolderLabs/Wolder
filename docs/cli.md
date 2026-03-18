# CLI Reference

## `wolder run [program]`

Execute a generation program.

```bash
wolder run                    # runs wolder.program.ts (default)
wolder run my-program.ts      # runs a specific file
```

The program is executed via `tsx`. Output, errors, and exit codes pass through directly.

## `wolder check`

Compare generated files against the manifest and report status.

```bash
wolder check
```

Output:

```
  OK  src/services/todoService.ts
  !!  src/controllers/todoController.ts — drifted
       Files have been manually modified.
       Expected: 789abc012def...  Current: 345678abcdef...
       Run 'wolder run' to regenerate
```

**Statuses:**
- **OK** (fresh) — generated files match manifest hashes
- **!!** (drifted) — files have been manually edited since last generation
- **??** (missing) — generated files were deleted

**Exit code:** 0 if all fresh, 1 if any drifted or missing.

Use this in CI to detect drift:

```bash
npx wolder check || echo "Generated files are out of date"
```

## `wolder clean`

Remove all generated files tracked in the manifest.

```bash
wolder clean
```

Output:

```
  x  src/services/todoService.ts
  x  src/controllers/todoController.ts

Removed 2 generated file(s).
```

This deletes files and cleans up empty parent directories. It preserves:
- Input files
- The manifest itself
- Your program file
- Configuration

After cleaning, run `wolder run` to regenerate everything from scratch.

## `wolder help`

Show available commands.

```bash
wolder help
```
