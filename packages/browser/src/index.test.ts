import { describe, it, expect, vi } from "vitest"
import { webPage } from "./index.js"

describe("webPage plugin", () => {
  it("has the correct name and expectation types", () => {
    expect(webPage.name).toBe("webPage")
    expect(webPage.expectationTypes).toContain("webPage")
  })

  it("createBuilder registers hasPage expectations", () => {
    const collected: any[] = []
    const builder = webPage.createBuilder((exp) => collected.push(exp), () => {})
    builder.hasPage("/", "shows a heading")
    builder.hasPage("/about", "shows about content")

    expect(collected).toEqual([
      { type: "webPage", route: "/", description: "shows a heading" },
      { type: "webPage", route: "/about", description: "shows about content" },
    ])
  })

  it("formatExpectations returns human-readable strings", () => {
    const lines = webPage.formatExpectations([
      { type: "webPage", route: "/todos", description: "shows todo list" },
    ])
    expect(lines[0]).toContain("/todos")
    expect(lines[0]).toContain("shows todo list")
  })

  it("has no defaultExpectations (requires fn callback)", () => {
    expect(webPage.defaultExpectations).toBeUndefined()
  })
})
