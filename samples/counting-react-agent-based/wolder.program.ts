import { wolder } from "@wolder/core"
import { vitestConventions } from "@wolder/typescript"

const w = wolder({
  root: import.meta.dirname,
  model: "claude-sonnet-4-6",
})

const project = w
  .layer()
  .apply(vitestConventions)
  .context(`
    A tiny counter written in TypeScript, exercised by vitest.
  `)
  // A gate is how correctness is checked in v2 — wolder runs it over the region
  // after the agent finishes, and a failure goes back to the agent to fix.
  .gate("npx tsc --noEmit", { name: "typecheck" })

// The counter owns src/ outright, and asks the test agent to cover it. The two
// settle what the public surface is before either writes a line.
const counter = project
  .agent()
  .owns("src/Counter.ts")
  .goal(`
    Create a Counter class that manages an integer counter value, starting at 0.
    Provide increment(), decrement() and getCount(): number.
    Export it as a named export. No external dependencies.
  `)
  .provides("Counter")

project
  .agent()
  .owns("src/Counter.test.ts")
  .asks(counter, "The exact public surface of Counter, so the tests compile against it")
  .goal(`
    Write a vitest suite covering the counter's behaviour: its initial value,
    incrementing, decrementing, and the two composed.
  `)

await w.run()
