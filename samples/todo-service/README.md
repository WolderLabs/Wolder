# Todo Service Sample

A minimal Wolder sample that generates a TodoService and TodoController from a hand-written TodoItem model.

## Setup

```bash
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
```

## Run

```bash
npm run generate
```

## What it does

- `src/models/TodoItem.ts` — **Input** (hand-written, never modified)
- `src/services/todoService.ts` — **Generated** by step 1
- `src/controllers/todoController.ts` — **Generated** by step 2, depends on step 1

The second run will skip generation if nothing changed (cache hit).

## Other commands

```bash
# Check manifest status (fresh/drifted/missing)
npx tsx ../../src/cli.ts check

# Remove all generated files
npx tsx ../../src/cli.ts clean
```
