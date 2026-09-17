import { resolve } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import * as log from "./log.js";

const SKILL = `---
description: Generate a wolder.program.ts from a requirements document
argument-hint: [requirements-file]
allowed-tools: Read, Write, Glob, Grep, Bash
---

You are an expert Wolder programmer. Wolder is a TypeScript framework for orchestrating
code-generating agents. A developer writes a program that declares *agents with
boundaries*; wolder checks the graph, settles the contracts between agents, and runs them.

Your job is to read a requirements document and write the \`wolder.program.ts\` that
orchestrates generation of the described software.

## The shape of a program

\`\`\`typescript
import { wolder } from "@wolder/core"
import { typescriptConventions } from "@wolder/typescript"

const w = wolder({
  root: import.meta.dirname,   // always this — resolves relative to the program file
  model: "claude-sonnet-4-6",
})

const project = w
  .layer()
  .apply(typescriptConventions)
  .context(\`What this project is, in prose.\`)
  .includeFile("src/models/TodoItem.ts")   // developer-owned, never written

const readme = project
  .scopedAgent()
  .canWrite("README.md")
  .act(\`Generate a README.md file for the project.\`)
  .provides("Documentation")

const service = project
  .scopedAgent()
  .canWrite("src/services/")
  .requests(readme, "Document Todo Service usage")
  .act(\`Create a TodoService class...\`)
  .provides("Todo Service")

await w.build()   // the one await in the program
\`\`\`

## Layers are immutable values

\`w.layer()\` returns a layer. Every method on it returns a **new** layer — the one you
called it on never changes. So you hold a layer and derive from it as many times as you
like:

\`\`\`typescript
const project = w.layer().context(\`A chat app.\`)
const backend  = project.context(\`Backend code. Prefer async/await.\`)
const frontend = project.context(\`React 19, function components only.\`)
// \`project\` is untouched; backend and frontend cannot see each other's context
\`\`\`

- \`.context(text)\` **accumulates** — a derived layer carries the parent's prose plus its
  own, in declaration order. There is no way to remove inherited context. Write parent
  layers you are happy for every descendant to inherit.
- \`.includeFile(path)\` accumulates as a set. These are developer-owned files: agents read
  them and must never write them.
- \`.gate(command, { name })\` declares a check wolder runs over an agent's region after it
  generates. A non-zero exit sends the output back to the agent to fix. \`npx tsc --noEmit\`
  and \`npx vitest run\` are the usual two.
- \`.apply(fn)\` applies a \`Layer => Layer\` function. Shipped layers are just such functions.

## Agents own regions, and only their region

\`.canWrite(region)\` claims a writable region — a file (\`README.md\`), a directory
(\`src/services/\`), or a glob (\`src/**/*.test.ts\`). Writes outside it are refused at the
tool layer, not merely discouraged.

**Two agents may not claim overlapping regions.** Nesting counts: \`src/\` and
\`src/services/\` overlap, and wolder rejects that before it spends a token. Broad grabby
regions are the mistake this catches — give each agent the narrowest region that is
genuinely its own.

When an agent needs something that lives in another agent's region, that is an **edge**,
not a reason to widen the region:

- \`.uses(other)\` — a hard dependency. \`other\` runs first and its files become this
  agent's read-only context. Use it when the other agent's output must already exist.
- \`.requests(provider, ask)\` — an ask against something that does not exist yet. The two
  agents negotiate a **contract** before either generates, and the settled contract is
  injected into both. Use it when both sides need to agree on a shape.

\`.requests()\` requires the target to have declared \`.provides("<label>")\` — asking an
agent for a contract it never offered is a compile error.

The canonical case: a controller needs Express, but does not own \`package.json\`.

\`\`\`typescript
const dependencies = project
  .scopedAgent()
  .canWrite("package.json")
  .act(\`Initialise an NPM project with the necessary dependencies.\`)
  .provides("NPM dependencies")

const controller = project
  .scopedAgent()
  .canWrite("src/controllers/")
  .requests(dependencies, "A framework like Express.js for handling HTTP requests")
  .uses(todoService)
  .act(\`Create a TodoController class that wraps TodoService.\`)
  .provides("Todo API")
\`\`\`

The negotiation is where "a framework like Express.js" becomes one specific dependency at
one specific version that one agent installs and the other imports. Neither could have
reached that alone, and neither crossed into the other's region.

## Nothing runs until build()

Declaring an agent registers it and returns a handle — **synchronously**. There is no
\`await\` on a \`scopedAgent\`. The whole graph is assembled, checked and executed by the
single \`await w.build()\` at the end.

Declaration order is not execution order, so \`.requests()\` may point at an agent declared
*later* in the file. \`.uses()\` may too.

Agents are immutable, so every builder call returns a new value. Always pass the value at
the **end** of a chain to \`.uses()\` / \`.requests()\` — the one you assigned to a variable.

Read results after the build:

\`\`\`typescript
await w.build()
console.log(service.artifact.files)
\`\`\`

## Writing a good program

1. Explore the project first — existing source, \`package.json\`, \`tsconfig.json\` — so the
   program matches its conventions.
2. Put everything true of the whole project in one root layer. Derive narrower layers for
   areas (backend, frontend) rather than repeating prose per agent.
3. \`.includeFile()\` anything the developer owns. Never give an agent a region over it.
4. Carve regions so no two agents overlap. One owner per file, always.
5. Prefer \`.uses()\` when one thing must exist before another, \`.requests()\` when two
   agents must agree on a shape.
6. Be specific in \`.act()\` — class names, method signatures, storage strategy, key
   behaviours. It is the instruction, not a summary.
7. Put \`.gate("npx tsc --noEmit")\` on the root layer for any TypeScript project, and
   \`.gate("npx vitest run")\` where there are tests. Gates are how correctness is checked
   in v2 — there is no expectation API.
8. Import \`wolder\` from \`@wolder/core\`. Import shipped layers from \`@wolder/typescript\`.

## Generated TypeScript

Generated files use ESM with \`.js\` extensions in relative imports
(\`import { TodoService } from "../services/todoService.js"\`). \`typescriptConventions\`
already tells agents this; say it again in \`.act()\` if a specific import path matters.

## wolder.config.ts (optional)

\`\`\`typescript
import { defineConfig } from "@wolder/core"

export default defineConfig({
  model: "claude-sonnet-4-6",
  maxRetries: 3,          // gate retries per agent
  negotiationRounds: 3,   // exchanges before a contract is abandoned
  maxTurns: 40,           // agent turns per generation run
})
\`\`\`

## Task

Read the requirements document at \`$ARGUMENTS\`. Explore the current directory to
understand the existing project. Write \`wolder.program.ts\` in the current directory. Then
run \`npx wolder run\` and fix errors until it completes:

- **Graph errors** (overlapping regions, an edge pointing at a template, an agent with no
  region) are reported before anything runs — fix the program.
- **Negotiation errors** mean two agents could not agree — loosen the ask or raise
  \`negotiationRounds\`.
- **Gate errors** mean the generated code did not compile or its tests failed after all
  retries — tighten the \`.act()\` instruction.

Only report success once \`npx wolder run\` exits cleanly.
`;

export function runAgent(): void {
  const commandsDir = resolve(process.cwd(), ".claude", "commands");
  mkdirSync(commandsDir, { recursive: true });
  writeFileSync(resolve(commandsDir, "wolder.md"), SKILL);
  log.success("Wrote .claude/commands/wolder.md");
  log.info("In Claude Code, run: /wolder <requirements-file>");
}
