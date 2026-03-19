import { describe, it, expect, vi, expectTypeOf } from "vitest"
import { wolder } from "./wolder.js"
import type { MemberRef, ExtractMembers } from "./types.js"
import { typescript } from "../packages/typescript/src/index.js"

// Mock generate + manifest so tests don't call LLM or write to disk
vi.mock("./generate.js", () => ({
  generate: vi.fn(async (node: { scopeFiles: string[] }) => ({
    files: node.scopeFiles.map((p: string) => ({ path: p, content: "" })),
    rawResponse: "",
    attempts: 1,
  })),
}))
vi.mock("./manifest.js", () => ({
  readManifest: vi.fn(() => ({ version: 1, nodes: {} })),
  writeManifest: vi.fn(),
  updateManifestNode: vi.fn(),
  computeOutputHash: vi.fn(() => "fakehash"),
  computeInputHashes: vi.fn(() => ({ "act:sha256": "fake", model: "test" })),
  isFresh: vi.fn(() => false),
  isOutputFresh: vi.fn(() => true),
}))

describe("type-level member inference", () => {
  const w = wolder({ root: "/tmp/test", model: "test" })

  it("artifact.members is typed from withFunction calls in expect(typescript, fn)", async () => {
    const artifact = await w
      .scope("svc.ts")
      .act("Create service")
      .expect(typescript, (e) => e.hasClass("Svc").withFunction("getAllItems").withFunction("addItem"))
      .build()

    // Runtime checks
    expect(artifact.members.getAllItems.name).toBe("getAllItems")
    expect(artifact.members.addItem.name).toBe("addItem")

    // Type-level checks
    expectTypeOf(artifact.members.getAllItems).toEqualTypeOf<MemberRef<"getAllItems">>()
    expectTypeOf(artifact.members.addItem).toEqualTypeOf<MemberRef<"addItem">>()
  })

  it("artifact.members is typed from withMethod calls in expect(typescript, fn)", async () => {
    const artifact = await w
      .scope("iface.ts")
      .act("Create interface")
      .expect(typescript, (e) => e.hasInterface("ISvc").withMethod("getAll").withMethod("create"))
      .build()

    expectTypeOf(artifact.members.getAll).toEqualTypeOf<MemberRef<"getAll">>()
    expectTypeOf(artifact.members.create).toEqualTypeOf<MemberRef<"create">>()
  })

  it("mixed hasClass + hasInterface accumulates all members", async () => {
    const artifact = await w
      .scope("combo.ts")
      .act("Create combo")
      .expect(typescript, (e) =>
        e.hasClass("Impl").withFunction("run").hasInterface("IRunner").withMethod("execute"),
      )
      .build()

    expectTypeOf(artifact.members.run).toEqualTypeOf<MemberRef<"run">>()
    expectTypeOf(artifact.members.execute).toEqualTypeOf<MemberRef<"execute">>()
  })

  it("empty chain produces empty members", async () => {
    const artifact = await w.scope("empty.ts").act("Create something").build()

    expectTypeOf(artifact.members).toEqualTypeOf<ExtractMembers<[]>>()
  })

  it("withArtifactTrait produces typed member without plugin callback", async () => {
    const artifact = await w
      .scope("svc.ts")
      .act("Create service")
      .withArtifactTrait("doThing")
      .build()

    expectTypeOf(artifact.members.doThing).toEqualTypeOf<MemberRef<"doThing">>()
  })

  it("member refs from artifacts are typed for withInput", async () => {
    const svc = await w
      .scope("svc.ts")
      .act("Create service")
      .expect(typescript, (e) => e.hasClass("Svc").withFunction("getAllItems"))
      .build()

    const ref = svc.members.getAllItems
    expectTypeOf(ref.kind).toEqualTypeOf<"member">()
    expectTypeOf(ref.name).toEqualTypeOf<"getAllItems">()

    const _controller = await w
      .scope("ctrl.ts")
      .act("Create controller")
      .withInput(svc.members.getAllItems)
      .build()
  })
})
