import { describe, it, expect } from "vitest"
import { wolder } from "./wolder.js"
import { ActBuilderImpl } from "./chain.js"

describe("wolder()", () => {
  const w = wolder({ root: "/tmp/test", model: "claude-sonnet-4-6" })

  it("creates an InputRef", () => {
    const ref = w.input("src/models/Todo.ts")
    expect(ref).toEqual({ path: "src/models/Todo.ts", kind: "input" })
  })

  it("chains scope → act → build and returns artifact metadata", async () => {
    const artifact = await w
      .scope("src/services/todoService.ts")
      .act("Create a TodoService class")
      .build()

    expect(artifact.id).toBe("src/services/todoService.ts")
    expect(artifact.generatedFiles).toEqual(["src/services/todoService.ts"])
  })

  it("chains multiple scope files", async () => {
    const artifact = await w
      .scope("src/services/todoService.ts")
      .scope("src/services/todoService.test.ts")
      .act("Create TodoService and its tests")
      .build()

    expect(artifact.generatedFiles).toEqual([
      "src/services/todoService.ts",
      "src/services/todoService.test.ts",
    ])
  })

  it("captures expectations from a full chain", async () => {
    const builder = w
      .scope("src/services/todoService.ts")
      .act("Create a TodoService class")
      .expectFile("src/services/todoService.ts")
      .expectClass("TodoService")
      .withFunction("getAllItems")
      .withFunction("addItem")
      .withFunction("deleteItem")
      .expectCompiles()

    // Access internal node definition
    const node = (builder as ActBuilderImpl).getNodeDefinition()

    expect(node.scopeFiles).toEqual(["src/services/todoService.ts"])
    expect(node.actInstruction).toBe("Create a TodoService class")
    expect(node.expectations).toEqual([
      { type: "file", path: "src/services/todoService.ts" },
      { type: "class", name: "TodoService" },
      { type: "function", name: "getAllItems", className: "TodoService" },
      { type: "function", name: "addItem", className: "TodoService" },
      { type: "function", name: "deleteItem", className: "TodoService" },
      { type: "compiles" },
    ])
    expect(node.memberNames).toEqual(["getAllItems", "addItem", "deleteItem"])
  })

  it("captures interface expectations", async () => {
    const builder = w
      .scope("src/interfaces/ITodoService.ts")
      .act("Create ITodoService interface")
      .expectInterface("ITodoService")
      .withMethod("getAllItems")
      .withMethod("addItem")

    const node = (builder as ActBuilderImpl).getNodeDefinition()

    expect(node.expectations).toEqual([
      { type: "interface", name: "ITodoService" },
      { type: "method", name: "getAllItems", className: "ITodoService" },
      { type: "method", name: "addItem", className: "ITodoService" },
    ])
  })

  it("captures withInput refs", async () => {
    const todoModel = w.input("src/models/Todo.ts")
    const serviceArtifact = await w
      .scope("src/services/todoService.ts")
      .act("Create TodoService")
      .expectClass("TodoService")
      .withFunction("getAllItems")
      .build()

    const builder = w
      .scope("src/controllers/todoController.ts")
      .act("Create controller")
      .withInput(todoModel)
      .withInput(serviceArtifact)
      .withInput(serviceArtifact.members.getAllItems!)

    const node = (builder as ActBuilderImpl).getNodeDefinition()

    expect(node.inputs).toHaveLength(3)
    expect(node.inputs[0]).toEqual({ path: "src/models/Todo.ts", kind: "input" })
    expect(node.inputs[1]).toHaveProperty("id", "src/services/todoService.ts")
    expect(node.inputs[2]).toHaveProperty("kind", "member")
  })

  it("build() returns artifact with typed members", async () => {
    const artifact = await w
      .scope("src/services/todoService.ts")
      .act("Create TodoService")
      .expectClass("TodoService")
      .withFunction("getAllItems")
      .withFunction("addItem")
      .build()

    expect(artifact.members.getAllItems).toEqual({
      name: "getAllItems",
      kind: "member",
      className: "",
      filePath: "src/services/todoService.ts",
    })
    expect(artifact.members.addItem).toEqual({
      name: "addItem",
      kind: "member",
      className: "",
      filePath: "src/services/todoService.ts",
    })
  })

  it("scopes withFunction to the preceding expectClass", async () => {
    const builder = w
      .scope("src/services/combo.ts")
      .act("Create two classes")
      .expectClass("ClassA")
      .withFunction("methodA")
      .expectClass("ClassB")
      .withFunction("methodB")

    const node = (builder as ActBuilderImpl).getNodeDefinition()

    expect(node.expectations).toEqual([
      { type: "class", name: "ClassA" },
      { type: "function", name: "methodA", className: "ClassA" },
      { type: "class", name: "ClassB" },
      { type: "function", name: "methodB", className: "ClassB" },
    ])
  })
})
