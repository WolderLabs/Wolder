import { describe, it, expect } from "vitest"
import { parseGeneratedFiles } from "./parser.js"

describe("parseGeneratedFiles", () => {
  it("parses a single file block", () => {
    const output = `=== FILE: src/services/todoService.ts ===
export class TodoService {
  getAllItems() { return [] }
}
=== END FILE ===`

    const files = parseGeneratedFiles(output)
    expect(files).toHaveLength(1)
    expect(files[0]!.path).toBe("src/services/todoService.ts")
    expect(files[0]!.content).toContain("export class TodoService")
  })

  it("parses multiple file blocks", () => {
    const output = `=== FILE: src/a.ts ===
const a = 1
=== END FILE ===
=== FILE: src/b.ts ===
const b = 2
=== END FILE ===`

    const files = parseGeneratedFiles(output)
    expect(files).toHaveLength(2)
    expect(files[0]!.path).toBe("src/a.ts")
    expect(files[1]!.path).toBe("src/b.ts")
  })

  it("handles missing END FILE marker", () => {
    const output = `=== FILE: src/a.ts ===
const a = 1`

    const files = parseGeneratedFiles(output)
    expect(files).toHaveLength(1)
    expect(files[0]!.content).toBe("const a = 1")
  })

  it("ignores text outside file blocks", () => {
    const output = `Here is your code:
=== FILE: src/a.ts ===
const a = 1
=== END FILE ===
Hope that helps!`

    const files = parseGeneratedFiles(output)
    expect(files).toHaveLength(1)
    expect(files[0]!.path).toBe("src/a.ts")
  })

  it("returns empty array for no file blocks", () => {
    const files = parseGeneratedFiles("Just some text with no files.")
    expect(files).toEqual([])
  })

  it("preserves blank lines within file content", () => {
    const output = `=== FILE: src/a.ts ===
line1

line3
=== END FILE ===`

    const files = parseGeneratedFiles(output)
    expect(files[0]!.content).toBe("line1\n\nline3")
  })
})
