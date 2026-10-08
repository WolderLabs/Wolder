import { resolve } from "node:path"
import { wolder } from "@wolder/core"
import { typescriptConventions } from "@wolder/typescript"

// The generated project is ./project. The program, its config and the API key live
// outside it — otherwise the agent that owns package.json would overwrite the very
// manifest used to run the sample.
const w = wolder({
  root: resolve(import.meta.dirname, "project"),
  model: "claude-sonnet-4-6",
})

const project = w
  .layer()
  // A shipped layer — TypeScript best practices and code style, composed in
  .apply(typescriptConventions)
  .context(`
    This project is a simple Todo service implemented in TypeScript.
    It includes models, services, and controllers for managing Todo items.
  `)
  // Developer-owned input file — never touched by the generator
  .include("src/models/TodoItem.ts")

const readme = project
  .agent()
  .owns("README.md")
  .goal(`
    Generate a README.md file for the project.
  `)
  .provides("Documentation")

// Project setup owns both files that configure the project. One agent rather than
// two, because package.json and tsconfig.json have to agree with each other — the
// module system, the target, and the type packages are one decision, not two.
const dependencies = project
  .agent()
  .owns("package.json")
  .owns("tsconfig.json")
  .goal(`
    Initialize an NPM project with the necessary dependencies,
    make assumptions about library selection as needed.

    Write a matching tsconfig.json: strict, ESM with Node16 module resolution,
    a modern ES target, compiling src/ to dist/. It must be consistent with the
    "type" field and the dependencies you choose in package.json.
  `)
  .provides("NPM dependencies and TypeScript config")

// Step 1: Generate the service.
// It owns src/services/ outright, and asks the README agent to cover its usage.
// The two settle a contract before either generates, so the README is written
// knowing what it has to document — and the service knowing what it promised.
const todoService = project
  .agent()
  .owns("src/services/")
  .asks(readme, "Document Todo Service usage")
  .goal(`
    Create a TodoService class that provides CRUD operations for TodoItem objects.
    Use an in-memory Map<string, TodoItem> for storage.
    Generate UUIDs randomly.
  `)
  .provides("Todo Service")

// Step 2: Generate a controller that uses the service.
// It never writes package.json — it negotiates with the agent that does. That is
// where "a framework like Express.js" becomes one specific dependency that one
// agent installs and the other imports. Two agents, one contract, no shared region.
const todoController = project
  .agent()
  .owns("src/controllers/")
  .asks(dependencies, "A framework like Express.js for handling HTTP requests")
  .after(todoService)
  .goal(`
    Create a TodoController class that wraps TodoService and provides a simple API.
  `)
  .provides("Todo API")

// Nothing above has run. The graph is assembled, checked, then executed here.
await w.run()
