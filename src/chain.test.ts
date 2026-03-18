import { describe, it, expect, vi } from "vitest"
import { wolder } from "./wolder.js"
import { ActBuilderImpl } from "./chain.js"
import { typescript } from "../packages/typescript/src/index.js"

// Mock generate so tests don't call the LLM
vi.mock("./generate.js", () => ({
  generate: vi.fn(async (node: { scopeFiles: string[] }) => ({
    files: node.scopeFiles.map((p: string) => ({ path: p, content: "" })),
    rawResponse: "",
    attempts: 1,
  })),
}))

// Mock manifest so tests don't write to disk
vi.mock("./manifest.js", () => ({
  readManifest: vi.fn(() => ({ version: 1, nodes: {} })),
  writeManifest: vi.fn(),
  updateManifestNode: vi.fn(),
  computeOutputHash: vi.fn(() => "fakehash"),
  computeInputHashes: vi.fn(() => ({ "act:sha256": "fake", model: "test" })),
  isFresh: vi.fn(() => false),
}))

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

  it("captures expectations via expect(typescript, fn) callback", () => {
    const builder = w
      .scope("src/services/todoService.ts")
      .act("Create a TodoService class")
      .expectFile("src/services/todoService.ts")
      .expect(typescript, (e) =>
        e
          .hasClass("TodoService")
          .withFunction("getAllItems")
          .withFunction("addItem")
          .withFunction("deleteItem")
          .compiles(),
      )

    const node = (builder as unknown as ActBuilderImpl).getNodeDefinition()

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

  it("captures interface expectations via expect(typescript, fn)", () => {
    const builder = w
      .scope("src/interfaces/ITodoService.ts")
      .act("Create ITodoService interface")
      .expect(typescript, (e) =>
        e.hasInterface("ITodoService").withMethod("getAllItems").withMethod("addItem"),
      )

    const node = (builder as unknown as ActBuilderImpl).getNodeDefinition()

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
      .expect(typescript, (e) => e.hasClass("TodoService").withFunction("getAllItems"))
      .build()

    const builder = w
      .scope("src/controllers/todoController.ts")
      .act("Create controller")
      .withInput(todoModel)
      .withInput(serviceArtifact)
      .withInput(serviceArtifact.members.getAllItems!)

    const node = (builder as unknown as ActBuilderImpl).getNodeDefinition()

    expect(node.inputs).toHaveLength(3)
    expect(node.inputs[0]).toEqual({ path: "src/models/Todo.ts", kind: "input" })
    expect(node.inputs[1]).toHaveProperty("id", "src/services/todoService.ts")
    expect(node.inputs[2]).toHaveProperty("kind", "member")
  })

  it("build() returns artifact with typed members from expect(typescript, fn)", async () => {
    const artifact = await w
      .scope("src/services/todoService.ts")
      .act("Create TodoService")
      .expect(typescript, (e) =>
        e.hasClass("TodoService").withFunction("getAllItems").withFunction("addItem"),
      )
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

  it("withArtifactTrait registers a member without any expectation", async () => {
    const artifact = await w
      .scope("src/services/myService.ts")
      .act("Create service")
      .withArtifactTrait("doThing")
      .build()

    expect(artifact.members.doThing).toMatchObject({ name: "doThing", kind: "member" })
    const node = (
      w
        .scope("src/services/myService.ts")
        .act("x")
        .withArtifactTrait("doThing") as unknown as ActBuilderImpl
    ).getNodeDefinition()
    expect(node.expectations).toHaveLength(0)
    expect(node.memberNames).toEqual(["doThing"])
  })

  it("scopes withFunction to the preceding hasClass", () => {
    const builder = w
      .scope("src/services/combo.ts")
      .act("Create two classes")
      .expect(typescript, (e) =>
        e
          .hasClass("ClassA")
          .withFunction("methodA")
          .hasClass("ClassB")
          .withFunction("methodB"),
      )

    const node = (builder as unknown as ActBuilderImpl).getNodeDefinition()

    expect(node.expectations).toEqual([
      { type: "class", name: "ClassA" },
      { type: "function", name: "methodA", className: "ClassA" },
      { type: "class", name: "ClassB" },
      { type: "function", name: "methodB", className: "ClassB" },
    ])
  })

  it("registers plugin on the node", () => {
    const builder = w
      .scope("src/svc.ts")
      .act("create")
      .expect(typescript, (e) => e.hasClass("Svc").compiles())

    const node = (builder as unknown as ActBuilderImpl).getNodeDefinition()
    expect(node.plugins).toHaveLength(1)
    expect(node.plugins[0]!.name).toBe("typescript")
  })
})
