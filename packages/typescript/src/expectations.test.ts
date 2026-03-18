import { describe, it, expect } from "vitest"
import { resolve } from "node:path"
import { typescript } from "./index.js"
import type { Expectation, PluginRunContext } from "./index.js"

const fixturesRoot = resolve(import.meta.dirname, ".")

function makeContext(scopeFiles: string[]): PluginRunContext {
  return {
    allExpectations: [],
    scopeFiles,
    root: fixturesRoot,
    model: "test",
  }
}

async function run(expectations: Expectation[], scopeFiles: string[]) {
  return typescript.runExpectations(expectations, makeContext(scopeFiles))
}

describe("typescript plugin expectations", () => {
  describe("hasClass", () => {
    it("passes when class exists", async () => {
      const results = await run([{ type: "class", name: "TodoService" }], ["fixtures/valid-class.ts"])
      expect(results[0]!.pass).toBe(true)
    })

    it("fails when class is missing", async () => {
      const results = await run([{ type: "class", name: "NonExistent" }], ["fixtures/valid-class.ts"])
      expect(results[0]!.pass).toBe(false)
      expect(results[0]!.error).toContain("NonExistent")
    })
  })

  describe("withFunction (class method)", () => {
    it("passes when method exists on class", async () => {
      const expectations: Expectation[] = [
        { type: "class", name: "TodoService" },
        { type: "function", name: "getAllItems", className: "TodoService" },
        { type: "function", name: "addItem", className: "TodoService" },
      ]
      const results = await run(expectations, ["fixtures/valid-class.ts"])
      expect(results).toHaveLength(3)
      expect(results.every((r) => r.pass)).toBe(true)
    })

    it("fails when method is missing from class", async () => {
      const expectations: Expectation[] = [
        { type: "class", name: "TodoService" },
        { type: "function", name: "addItem", className: "TodoService" },
      ]
      const results = await run(expectations, ["fixtures/missing-method.ts"])
      expect(results[0]!.pass).toBe(true)
      expect(results[1]!.pass).toBe(false)
      expect(results[1]!.error).toContain("addItem")
    })
  })

  describe("hasInterface + withMethod", () => {
    it("passes when interface and methods exist", async () => {
      const expectations: Expectation[] = [
        { type: "interface", name: "ITodoService" },
        { type: "method", name: "getAllItems", className: "ITodoService" },
        { type: "method", name: "addItem", className: "ITodoService" },
      ]
      const results = await run(expectations, ["fixtures/valid-interface.ts"])
      expect(results).toHaveLength(3)
      expect(results.every((r) => r.pass)).toBe(true)
    })

    it("fails when interface is missing", async () => {
      const results = await run([{ type: "interface", name: "INotHere" }], ["fixtures/valid-interface.ts"])
      expect(results[0]!.pass).toBe(false)
      expect(results[0]!.error).toContain("INotHere")
    })
  })

  describe("compiles", () => {
    it("passes when file compiles cleanly", async () => {
      const results = await run([{ type: "compiles" }], ["fixtures/compiles-ok.ts"])
      expect(results[0]!.pass).toBe(true)
    })

    it("fails when file has type errors", async () => {
      const results = await run([{ type: "compiles" }], ["fixtures/compiles-fail.ts"])
      expect(results[0]!.pass).toBe(false)
      expect(results[0]!.error).toContain("TypeScript compilation failed")
    })

    it("error message includes file and line info", async () => {
      const results = await run([{ type: "compiles" }], ["fixtures/compiles-fail.ts"])
      expect(results[0]!.error).toMatch(/compiles-fail\.ts:\d+/)
    })

    it("runs before AST queries (compile errors stop further checks)", async () => {
      const results = await run(
        [{ type: "compiles" }, { type: "class", name: "Broken" }],
        ["fixtures/compiles-fail.ts"],
      )
      expect(results).toHaveLength(1)
      expect(results[0]!.pass).toBe(false)
      expect(results[0]!.expectation.type).toBe("compiles")
    })
  })

  describe("implements", () => {
    it("passes when class correctly implements interface", async () => {
      const results = await run(
        [{ type: "implements", interfacePath: "fixtures/i-counter.ts" }],
        ["fixtures/implements-ok.ts"],
      )
      expect(results[0]!.pass).toBe(true)
    })

    it("fails when class does not satisfy interface", async () => {
      const results = await run(
        [{ type: "implements", interfacePath: "fixtures/i-counter.ts" }],
        ["fixtures/implements-fail.ts"],
      )
      expect(results[0]!.pass).toBe(false)
      expect(results[0]!.error).toContain("does not correctly implement")
    })

    it("fails when no class implements the interface", async () => {
      const results = await run(
        [{ type: "implements", interfacePath: "fixtures/i-counter.ts" }],
        ["fixtures/no-implements.ts"],
      )
      expect(results[0]!.pass).toBe(false)
      expect(results[0]!.error).toContain("No class in scope files implements")
    })

    it("fails when interface file is missing", async () => {
      const results = await run(
        [{ type: "implements", interfacePath: "fixtures/nonexistent.ts" }],
        ["fixtures/implements-ok.ts"],
      )
      expect(results[0]!.pass).toBe(false)
      expect(results[0]!.error).toContain("not found")
    })
  })
})
