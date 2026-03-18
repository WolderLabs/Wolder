import { describe, it, expect, vi, beforeEach } from "vitest"
import { mkdtempSync, existsSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { generate, GenerationError } from "./generate.js"
import type { NodeDefinition } from "./types.js"
import { typescript } from "../packages/typescript/src/index.js"

// Mock the Anthropic SDK
const mockCreate = vi.fn()
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockCreate }
  },
}))

function makeResponse(text: string) {
  return { content: [{ type: "text", text }] }
}

describe("generate (retry loop)", () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "wolder-test-"))
    mockCreate.mockReset()
  })

  it("succeeds on first attempt when output meets expectations", async () => {
    const goodOutput = `=== FILE: svc.ts ===
export class TodoService {
  getAllItems() { return [] }
}
=== END FILE ===`

    mockCreate.mockResolvedValueOnce(makeResponse(goodOutput))

    const node: NodeDefinition = {
      scopeFiles: ["svc.ts"],
      actInstruction: "Create TodoService",
      inputs: [],
      expectations: [
        { type: "class", name: "TodoService" },
        { type: "function", name: "getAllItems", className: "TodoService" },
      ],
      memberNames: ["getAllItems"],
      plugins: [typescript],
    }

    const result = await generate(node, { root, model: "test", apiKey: "test-key" })
    expect(result.attempts).toBe(1)
    expect(result.files).toHaveLength(1)
    expect(existsSync(join(root, "svc.ts"))).toBe(true)
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it("retries and succeeds on second attempt", async () => {
    const badOutput = `=== FILE: svc.ts ===
export class TodoService {
}
=== END FILE ===`

    const goodOutput = `=== FILE: svc.ts ===
export class TodoService {
  getAllItems() { return [] }
}
=== END FILE ===`

    mockCreate
      .mockResolvedValueOnce(makeResponse(badOutput))
      .mockResolvedValueOnce(makeResponse(goodOutput))

    const node: NodeDefinition = {
      scopeFiles: ["svc.ts"],
      actInstruction: "Create TodoService",
      inputs: [],
      expectations: [
        { type: "class", name: "TodoService" },
        { type: "function", name: "getAllItems", className: "TodoService" },
      ],
      memberNames: ["getAllItems"],
      plugins: [typescript],
    }

    const result = await generate(node, { root, model: "test", apiKey: "test-key" })
    expect(result.attempts).toBe(2)
    expect(mockCreate).toHaveBeenCalledTimes(2)

    // Verify retry included failure feedback
    const secondCall = mockCreate.mock.calls[1]![0]
    expect(secondCall.messages).toHaveLength(3) // user, assistant, user (feedback)
    expect(secondCall.messages[2].content).toContain("getAllItems")
  })

  it("throws GenerationError after exhausting retries", async () => {
    const badOutput = `=== FILE: svc.ts ===
export class WrongName {}
=== END FILE ===`

    mockCreate.mockResolvedValue(makeResponse(badOutput))

    const node: NodeDefinition = {
      scopeFiles: ["svc.ts"],
      actInstruction: "Create TodoService",
      inputs: [],
      expectations: [{ type: "class", name: "TodoService" }],
      memberNames: [],
      plugins: [typescript],
    }

    await expect(
      generate(node, { root, model: "test", apiKey: "test-key", maxRetries: 2 }),
    ).rejects.toThrow(GenerationError)

    expect(mockCreate).toHaveBeenCalledTimes(2)
  })

  it("skips expectations when none are declared", async () => {
    const output = `=== FILE: svc.ts ===
anything
=== END FILE ===`

    mockCreate.mockResolvedValueOnce(makeResponse(output))

    const node: NodeDefinition = {
      scopeFiles: ["svc.ts"],
      actInstruction: "Just create something",
      inputs: [],
      expectations: [],
      memberNames: [],
      plugins: [],
    }

    const result = await generate(node, { root, model: "test", apiKey: "test-key" })
    expect(result.attempts).toBe(1)
  })
})
