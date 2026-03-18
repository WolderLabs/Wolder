import { describe, it, expect, vi, beforeEach } from "vitest"
import { runWebPageExpectations } from "./web-page.js"
import type { Expectation, WebPageConfig } from "./types.js"

// Mock playwright
const mockGoto = vi.fn()
const mockClose = vi.fn()
const mockNewPage = vi.fn(() => ({
  goto: mockGoto,
  close: mockClose,
  locator: vi.fn(() => ({
    ariaSnapshot: vi.fn(() => '- heading "Test Page"\n- list: items'),
  })),
}))
const mockBrowserClose = vi.fn()

vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn(() => ({
      newPage: mockNewPage,
      close: mockBrowserClose,
    })),
  },
}))

// Mock Anthropic SDK
const mockCreate = vi.fn()
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockCreate }
  },
}))

// Mock playwright/test
vi.mock("playwright/test", () => ({
  expect: vi.fn(),
}))

// Mock startDevServer
vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => {
    const proc = {
      stdout: {
        on: vi.fn((event: string, cb: (data: Buffer) => void) => {
          if (event === "data") {
            // Simulate server ready
            setTimeout(() => cb(Buffer.from("listening on port 3000")), 10)
          }
        }),
      },
      stderr: { on: vi.fn() },
      on: vi.fn(),
      kill: vi.fn(),
    }
    return proc
  }),
}))

const config: WebPageConfig = {
  devCommand: "npm run dev",
  devPort: 3000,
  devReadyPattern: "listening on port",
  model: "test-model",
}

describe("runWebPageExpectations", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("compiles assertion on first run when not cached", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: 'await expect(page.locator("h1")).toBeVisible()' }],
    })

    // Mock executeAssertion to succeed
    mockGoto.mockResolvedValue(undefined)

    const expectations: Expectation[] = [
      { type: "webPage", route: "/", description: "shows a heading" },
    ]

    const { results, updatedAssertions } = await runWebPageExpectations(
      expectations,
      {},
      config,
    )

    expect(results).toHaveLength(1)
    // LLM was called to compile the assertion
    expect(mockCreate).toHaveBeenCalledTimes(1)
    // Assertion was stored
    const key = "/::" + "shows a heading"
    expect(updatedAssertions[key]).toContain("expect")
  })

  it("uses cached assertion on subsequent run", async () => {
    mockGoto.mockResolvedValue(undefined)

    const cachedAssertions = {
      "/::shows a heading": 'await expect(page.locator("h1")).toBeVisible()',
    }

    const expectations: Expectation[] = [
      { type: "webPage", route: "/", description: "shows a heading" },
    ]

    const { results } = await runWebPageExpectations(
      expectations,
      cachedAssertions,
      config,
    )

    expect(results).toHaveLength(1)
    // LLM was NOT called — used cached assertion
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it("fails with error for missing route", async () => {
    const expectations: Expectation[] = [
      { type: "webPage", description: "shows something" },
    ]

    const { results } = await runWebPageExpectations(expectations, {}, config)

    expect(results).toHaveLength(1)
    expect(results[0]!.pass).toBe(false)
    expect(results[0]!.error).toContain("missing route or description")
  })

  it("handles multiple web page expectations", async () => {
    mockCreate
      .mockResolvedValueOnce({
        content: [{ type: "text", text: 'await expect(page.locator("h1")).toBeVisible()' }],
      })
      .mockResolvedValueOnce({
        content: [{ type: "text", text: 'await expect(page.locator("ul")).toBeVisible()' }],
      })

    mockGoto.mockResolvedValue(undefined)

    const expectations: Expectation[] = [
      { type: "webPage", route: "/", description: "shows a heading" },
      { type: "webPage", route: "/todos", description: "shows a list" },
    ]

    const { results, updatedAssertions } = await runWebPageExpectations(
      expectations,
      {},
      config,
    )

    expect(results).toHaveLength(2)
    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(Object.keys(updatedAssertions)).toHaveLength(2)
  })
})
