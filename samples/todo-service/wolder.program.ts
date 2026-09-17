import { wolder } from "@wolder/core"
import { typescriptConventions } from "@wolder/typescript"

const w = wolder({
  root: import.meta.dirname,
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
  .includeFile("src/models/TodoItem.ts")

const readme = project
  .scopedAgent()
  .canWrite("README.md")
  .act(`
    Generate a README.md file for the project.
  `)
  .provides("Documentation")

const dependencies = project
  .scopedAgent()
  .canWrite("package.json")
  .act(`
    Initialize an NPM project with the necessary dependencies,
    make assumptions about library selection as needed.
  `)
  .provides("NPM dependencies")

// Step 1: Generate the service.
// It owns src/services/ outright, and asks the README agent to cover its usage.
// The two settle a contract before either generates, so the README is written
// knowing what it has to document — and the service knowing what it promised.
const todoService = project
  .scopedAgent()
  .canWrite("src/services/")
  .requests(readme, "Document Todo Service usage")
  .act(`
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
  .scopedAgent()
  .canWrite("src/controllers/")
  .requests(dependencies, "A framework like Express.js for handling HTTP requests")
  .uses(todoService)
  .act(`
    Create a TodoController class that wraps TodoService and provides a simple API.
  `)
  .provides("Todo API")

// Nothing above has run. The graph is assembled, checked, then executed here.
await w.build()
