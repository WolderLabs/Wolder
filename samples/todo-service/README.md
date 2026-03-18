# Todo Service Sample

A minimal Wolder sample that generates a TodoService and TodoController from a hand-written TodoItem model.

## Setup

1. Copy `.env.example` to `.env` and add your Anthropic API key:

```
cp .env.example .env
```

2. Run the generation program:

```
cd samples/todo-service
npx tsx --env-file=.env wolder.program.ts
```

## What it does

- `src/models/TodoItem.ts` — **Input** (hand-written, never modified)
- `src/services/todoService.ts` — **Generated** by step 1
- `src/controllers/todoController.ts` — **Generated** by step 2, depends on step 1

The second run will skip generation if nothing changed (cache hit).
