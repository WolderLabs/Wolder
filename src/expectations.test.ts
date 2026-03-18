import { describe, it, expect } from "vitest"
import { resolve } from "node:path"
import { runExpectations } from "./expectations.js"
import type { Expectation } from "./types.js"

const fixturesRoot = resolve(import.meta.dirname, ".")

describe("runExpectations", () => {
  describe("expectFile", () => {
    it("passes when file exists", () => {
      const results = runExpectations(
        [{ type: "file", path: "fixtures/valid-class.ts" }],
        [],
        fixturesRoot,
      )
      expect(results).toHaveLength(1)
      expect(results[0]!.pass).toBe(true)
    })

    it("fails when file is missing", () => {
      const results = runExpectations(
        [{ type: "file", path: "fixtures/nonexistent.ts" }],
        [],
        fixturesRoot,
      )
      expect(results).toHaveLength(1)
      expect(results[0]!.pass).toBe(false)
      expect(results[0]!.error).toContain("does not exist")
    })

    it("fails fast — stops at first missing file", () => {
      const results = runExpectations(
        [
          { type: "file", path: "fixtures/nonexistent.ts" },
          { type: "file", path: "fixtures/valid-class.ts" },
        ],
        [],
        fixturesRoot,
      )
      expect(results).toHaveLength(1)
      expect(results[0]!.pass).toBe(false)
    })
  })

  describe("expectClass", () => {
    it("passes when class exists", () => {
      const results = runExpectations(
        [{ type: "class", name: "TodoService" }],
        ["fixtures/valid-class.ts"],
        fixturesRoot,
      )
      expect(results).toHaveLength(1)
      expect(results[0]!.pass).toBe(true)
    })

    it("fails when class is missing", () => {
      const results = runExpectations(
        [{ type: "class", name: "NonExistentClass" }],
        ["fixtures/valid-class.ts"],
        fixturesRoot,
      )
      expect(results).toHaveLength(1)
      expect(results[0]!.pass).toBe(false)
      expect(results[0]!.error).toContain("NonExistentClass")
    })
  })

  describe("withFunction (class method)", () => {
    it("passes when method exists on class", () => {
      const expectations: Expectation[] = [
        { type: "class", name: "TodoService" },
        { type: "function", name: "getAllItems", className: "TodoService" },
        { type: "function", name: "addItem", className: "TodoService" },
      ]
      const results = runExpectations(
        expectations,
        ["fixtures/valid-class.ts"],
        fixturesRoot,
      )
      expect(results).toHaveLength(3)
      expect(results.every((r) => r.pass)).toBe(true)
    })

    it("fails when method is missing from class", () => {
      const expectations: Expectation[] = [
        { type: "class", name: "TodoService" },
        { type: "function", name: "addItem", className: "TodoService" },
      ]
      const results = runExpectations(
        expectations,
        ["fixtures/missing-method.ts"],
        fixturesRoot,
      )
      expect(results).toHaveLength(2)
      expect(results[0]!.pass).toBe(true) // class exists
      expect(results[1]!.pass).toBe(false) // method missing
      expect(results[1]!.error).toContain("addItem")
    })
  })

  describe("expectInterface + withMethod", () => {
    it("passes when interface and methods exist", () => {
      const expectations: Expectation[] = [
        { type: "interface", name: "ITodoService" },
        { type: "method", name: "getAllItems", className: "ITodoService" },
        { type: "method", name: "addItem", className: "ITodoService" },
      ]
      const results = runExpectations(
        expectations,
        ["fixtures/valid-interface.ts"],
        fixturesRoot,
      )
      expect(results).toHaveLength(3)
      expect(results.every((r) => r.pass)).toBe(true)
    })

    it("fails when interface is missing", () => {
      const results = runExpectations(
        [{ type: "interface", name: "INotHere" }],
        ["fixtures/valid-interface.ts"],
        fixturesRoot,
      )
      expect(results).toHaveLength(1)
      expect(results[0]!.pass).toBe(false)
      expect(results[0]!.error).toContain("INotHere")
    })
  })

  describe("mixed expectations", () => {
    it("validates file existence before AST queries", () => {
      const expectations: Expectation[] = [
        { type: "file", path: "fixtures/valid-class.ts" },
        { type: "class", name: "TodoService" },
        { type: "function", name: "getAllItems", className: "TodoService" },
      ]
      const results = runExpectations(
        expectations,
        ["fixtures/valid-class.ts"],
        fixturesRoot,
      )
      expect(results).toHaveLength(3)
      expect(results.every((r) => r.pass)).toBe(true)
    })

    it("fails fast on file check, never runs AST queries", () => {
      const expectations: Expectation[] = [
        { type: "file", path: "fixtures/nonexistent.ts" },
        { type: "class", name: "TodoService" },
      ]
      const results = runExpectations(
        expectations,
        ["fixtures/valid-class.ts"],
        fixturesRoot,
      )
      expect(results).toHaveLength(1) // only file check ran
      expect(results[0]!.pass).toBe(false)
    })
  })
})
