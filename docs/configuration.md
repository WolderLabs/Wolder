# Configuration

## `wolder.config.ts`

```typescript
import { defineConfig } from "@wolder/core"

export default defineConfig({
  model: "claude-sonnet-4-6",
  maxRetries: 3,
  negotiationRounds: 3,
  maxTurns: 40,
})
```

| Key | Default | Description |
|---|---|---|
| `model` | `"claude-sonnet-4-6"` | Model id used for generation and for negotiation. |
| `apiKey` | `""` | Falls back to `ANTHROPIC_API_KEY` in the environment. |
| `maxRetries` | `3` | Attempts per agent when a layer gate keeps failing. |
| `manifestPath` | `"wolder.manifest.json"` | Where the manifest lives, relative to the root. |
| `negotiationRounds` | `3` | Offer/reply exchanges before a contract is abandoned. |
| `maxTurns` | `40` | Agent turns per generation run. |

## Passing config to a program

`wolder.config.ts` is not loaded implicitly — pass it, so a program says what it depends on:

```typescript
import { wolder } from "@wolder/core"
import config from "./wolder.config.js"

const w = wolder({ root: import.meta.dirname, model: config.model!, config })
```

Or inline it:

```typescript
const w = wolder({
  root: import.meta.dirname,
  model: "claude-sonnet-4-6",
  config: { negotiationRounds: 5 },
})
```

`options.model` always wins over `config.model`.

`loadConfig(root)` reads and merges `wolder.config.ts` if you would rather do it at runtime.

## The API key

Wolder never puts a key in the manifest or a prompt. Resolution order:

1. `config.apiKey`
2. `ANTHROPIC_API_KEY` in the environment

For a sample or a local project, an `.env` file plus `tsx --env-file=.env` is the usual
route:

```json
{ "scripts": { "generate": "tsx --env-file=.env wolder.program.ts" } }
```

## Tuning

**`negotiationRounds`** bounds how long two agents bargain before wolder gives up. Raise it
when asks are open-ended ("a framework like Express.js"); lower it when they are narrow and
you want to fail fast. Negotiation spends tokens before any generation does, so this is a
real cost dial. Failing is deliberate: generating against a non-agreement is the worst
available outcome.

**`maxRetries`** bounds gate retries. A gate that fails three times usually means the
`.act()` instruction is underspecified, not that the agent needs another go.

**`maxTurns`** bounds one agent's run. Raise it for agents that own a large region.

## Why a build takes as long as it does

Independent work already runs concurrently — nodes with no `uses` edge between them, and
every contract negotiation. What remains is inherently serial:

- Each negotiation is `2 x negotiationRounds + 1` model calls at worst, and they are
  sequential *within* one contract because each turn answers the last. Lower
  `negotiationRounds` to cap it.
- A `uses` edge is a barrier by design. A long chain of them is a long build; prefer
  `requests` where two agents only need to *agree*, since that settles up front and
  leaves both free to run in parallel.
- Each gate failure costs another full agent run. A gate that fails twice usually means
  the `.act()` instruction is underspecified.
