import { describe, it, expect, vi, expectTypeOf } from "vitest"
import { wolder } from "./wolder.js"
import type { MemberRef, Artifact, ExtractMembers } from "./types.js"

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
}))

describe("type-level member inference", () => {
  const w = wolder({ root: "/tmp/test", model: "test" })

  it("artifact.members is typed from withFunction calls", async () => {
    const artifact = await w
      .scope("svc.ts")
      .act("Create service")
      .expectClass("Svc")
      .withFunction("getAllItems")
      .withFunction("addItem")
      .build()

    // Runtime checks
    expect(artifact.members.getAllItems.name).toBe("getAllItems")
    expect(artifact.members.addItem.name).toBe("addItem")

    // Type-level checks
    expectTypeOf(artifact.members.getAllItems).toEqualTypeOf<MemberRef<"getAllItems">>()
    expectTypeOf(artifact.members.addItem).toEqualTypeOf<MemberRef<"addItem">>()
  })

  it("artifact.members is typed from withMethod calls", async () => {
    const artifact = await w
      .scope("iface.ts")
      .act("Create interface")
      .expectInterface("ISvc")
      .withMethod("getAll")
      .withMethod("create")
      .build()

    expectTypeOf(artifact.members.getAll).toEqualTypeOf<MemberRef<"getAll">>()
    expectTypeOf(artifact.members.create).toEqualTypeOf<MemberRef<"create">>()
  })

  it("mixed expectClass + expectInterface accumulates all members", async () => {
    const artifact = await w
      .scope("combo.ts")
      .act("Create combo")
      .expectClass("Impl")
      .withFunction("run")
      .expectInterface("IRunner")
      .withMethod("execute")
      .build()

    expectTypeOf(artifact.members.run).toEqualTypeOf<MemberRef<"run">>()
    expectTypeOf(artifact.members.execute).toEqualTypeOf<MemberRef<"execute">>()
  })

  it("empty chain produces empty members", async () => {
    const artifact = await w
      .scope("empty.ts")
      .act("Create something")
      .build()

    // Should be an empty record type — no known keys
    expectTypeOf(artifact.members).toEqualTypeOf<ExtractMembers<[]>>()
  })

  it("member refs from artifacts are typed for withInput", async () => {
    const svc = await w
      .scope("svc.ts")
      .act("Create service")
      .expectClass("Svc")
      .withFunction("getAllItems")
      .build()

    // svc.members.getAllItems should be usable as withInput
    const ref = svc.members.getAllItems
    expectTypeOf(ref.kind).toEqualTypeOf<"member">()
    expectTypeOf(ref.name).toEqualTypeOf<"getAllItems">()

    // This should compile — downstream can use typed member ref
    const _controller = await w
      .scope("ctrl.ts")
      .act("Create controller")
      .withInput(svc.members.getAllItems)
      .build()
  })
})
