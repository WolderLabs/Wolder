import { wolder } from "../../src/index.js"

const w = wolder({
  root: import.meta.dirname,
  model: "claude-sonnet-4-6",
})

// Developer-owned input file — never touched by the generator
const todoItem = w.input("src/models/TodoItem.ts")

// Step 1: Generate the service
const todoService = await w
  .scope("src/services/todoService.ts")
  .act(`
    Create a TodoService class that provides CRUD operations for TodoItem objects.
    Use an in-memory Map<string, TodoItem> for storage.
    Generate UUIDs using crypto.randomUUID().
    Import TodoItem from "../models/TodoItem.js".
  `)
  .withInput(todoItem)
  .expectFile("src/services/todoService.ts")
  .expectClass("TodoService")
  .withFunction("getAllItems")
  .withFunction("getItem")
  .withFunction("addItem")
  .withFunction("updateItem")
  .withFunction("deleteItem")
  .expectCompiles()
  .build()

console.log("Generated TodoService artifact:", todoService.id)
console.log("Files:", todoService.generatedFiles)
console.log("Members:", Object.keys(todoService.members))

// Step 2: Generate a controller that uses the service
const todoController = await w
  .scope("src/controllers/todoController.ts")
  .act(`
    Create a TodoController class that wraps TodoService and provides
    a simple API: list(), get(id), create(title), toggle(id), remove(id).
    Import TodoService from "../services/todoService.js".
    Import TodoItem from "../models/TodoItem.js".
  `)
  .withInput(todoItem)
  .withInput(todoService)
  .expectFile("src/controllers/todoController.ts")
  .expectClass("TodoController")
  .withFunction("list")
  .withFunction("get")
  .withFunction("create")
  .withFunction("toggle")
  .withFunction("remove")
  .expectCompiles()
  .build()

console.log("\nGenerated TodoController artifact:", todoController.id)
console.log("Files:", todoController.generatedFiles)
console.log("Members:", Object.keys(todoController.members))
