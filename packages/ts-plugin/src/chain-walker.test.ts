import { describe, it, expect } from "vitest"
import ts from "typescript"
import { extractArtifactDeclarations } from "./chain-walker"

function parse(code: string) {
  const sourceFile = ts.createSourceFile(
    "test.ts",
    code,
    ts.ScriptTarget.Latest,
    true,
  )
  return extractArtifactDeclarations(ts as any, sourceFile)
}

describe("extractArtifactDeclarations", () => {
  it("extracts withFunction names from a simple chain", () => {
    const decls = parse(`
      const svc = await w
        .scope("svc.ts")
        .act("Create service")
        .expectClass("TodoService")
        .withFunction("getAllItems")
        .withFunction("addItem")
        .build()
    `)

    expect(decls).toHaveLength(1)
    expect(decls[0]!.variableName).toBe("svc")
    expect(decls[0]!.memberNames).toEqual(["addItem", "getAllItems"])
  })

  it("extracts withMethod names", () => {
    const decls = parse(`
      const iface = await w
        .scope("iface.ts")
        .act("Create interface")
        .expectInterface("ISvc")
        .withMethod("getAll")
        .withMethod("create")
        .build()
    `)

    expect(decls).toHaveLength(1)
    expect(decls[0]!.variableName).toBe("iface")
    expect(decls[0]!.memberNames).toEqual(["create", "getAll"])
  })

  it("extracts from multiple chains in one file", () => {
    const decls = parse(`
      const svc = await w.scope("svc.ts").act("Go")
        .expectClass("Svc").withFunction("run").build()

      const ctrl = await w.scope("ctrl.ts").act("Go")
        .expectClass("Ctrl").withFunction("handle").build()
    `)

    expect(decls).toHaveLength(2)
    expect(decls[0]!.variableName).toBe("svc")
    expect(decls[0]!.memberNames).toEqual(["run"])
    expect(decls[1]!.variableName).toBe("ctrl")
    expect(decls[1]!.memberNames).toEqual(["handle"])
  })

  it("returns empty members when no withFunction/withMethod", () => {
    const decls = parse(`
      const app = await w.scope("app.ts").act("Create app").build()
    `)

    expect(decls).toHaveLength(1)
    expect(decls[0]!.variableName).toBe("app")
    expect(decls[0]!.memberNames).toEqual([])
  })

  it("ignores non-build chains", () => {
    const decls = parse(`
      const x = await fetch("/api")
      const y = someFunction()
    `)

    expect(decls).toEqual([])
  })

  it("handles mixed withFunction and withMethod", () => {
    const decls = parse(`
      const combo = await w.scope("combo.ts").act("Go")
        .expectClass("Impl").withFunction("run")
        .expectInterface("IRunner").withMethod("execute")
        .build()
    `)

    expect(decls).toHaveLength(1)
    expect(decls[0]!.memberNames).toEqual(["execute", "run"])
  })

  it("handles chain with withInput and expectFile", () => {
    const decls = parse(`
      const svc = await w
        .scope("svc.ts")
        .act("Create service")
        .withInput(model)
        .expectFile("svc.ts")
        .expectClass("Svc")
        .withFunction("get")
        .expectCompiles()
        .build()
    `)

    expect(decls).toHaveLength(1)
    expect(decls[0]!.memberNames).toEqual(["get"])
  })

  it("handles parenthesized await", () => {
    const decls = parse(`
      async function main() {
        const svc = (await (w.scope("svc.ts").act("Go").withFunction("x").build()))
      }
    `)

    expect(decls).toHaveLength(1)
    expect(decls[0]!.memberNames).toEqual(["x"])
  })
})
