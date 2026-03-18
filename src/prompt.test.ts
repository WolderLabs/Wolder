import { describe, it, expect } from "vitest"
import { buildSystemPrompt, buildUserPrompt } from "./prompt.js"
import type { NodeDefinition } from "./types.js"

describe("buildSystemPrompt", () => {
  it("includes file format instructions", () => {
    const prompt = buildSystemPrompt()
    expect(prompt).toContain("=== FILE:")
    expect(prompt).toContain("=== END FILE ===")
  })
})

describe("buildUserPrompt", () => {
  it("includes scope files, instruction, and expectations", () => {
    const node: NodeDefinition = {
      scopeFiles: ["src/services/todoService.ts"],
      actInstruction: "Create a TodoService class",
      inputs: [],
      expectations: [
        { type: "class", name: "TodoService" },
        { type: "function", name: "getAllItems", className: "TodoService" },
        { type: "compiles" },
      ],
      memberNames: ["getAllItems"],
    }

    const prompt = buildUserPrompt(node, "/tmp/test")

    expect(prompt).toContain("src/services/todoService.ts")
    expect(prompt).toContain("Create a TodoService class")
    expect(prompt).toContain('A class named "TodoService" must exist')
    expect(prompt).toContain('TodoService must have a method named "getAllItems"')
    expect(prompt).toContain("compile without TypeScript errors")
  })

  it("includes input file content when file exists", () => {
    const node: NodeDefinition = {
      scopeFiles: ["src/out.ts"],
      actInstruction: "Generate output",
      inputs: [{ path: "package.json", kind: "input" }],
      expectations: [],
      memberNames: [],
    }

    // Use the actual project root so package.json exists
    const prompt = buildUserPrompt(node, process.cwd())

    expect(prompt).toContain("INPUT FILES")
    expect(prompt).toContain("package.json")
  })
})
