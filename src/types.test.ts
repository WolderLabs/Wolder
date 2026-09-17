import { describe, it, expectTypeOf } from "vitest";
import type {
  AgentDoesNotProvideAnything,
  AgentProvides,
  Artifact,
  Layer,
  ScopedAgent,
} from "./types.js";
import { LayerImpl } from "./layer.js";
import { Registry } from "./program.js";

// A real layer, so these assertions are checked by the compiler *and* exercise the
// implementation rather than a declared shape that could drift from it.
const layer: Layer = new LayerImpl(new Registry());

describe("Layer types", () => {
  it("returns a Layer from every method, so composition never narrows", () => {
    expectTypeOf(layer.context("x")).toEqualTypeOf<Layer>();
    expectTypeOf(layer.includeFile("x.ts")).toEqualTypeOf<Layer>();
    expectTypeOf(layer.gate("npx tsc --noEmit")).toEqualTypeOf<Layer>();
    expectTypeOf(layer.apply((l) => l.context("x"))).toEqualTypeOf<Layer>();
  });

  it("takes a plain layer→layer function in apply, so shipped layers are just functions", () => {
    const conventions = (l: Layer): Layer => l.context("conventions");
    expectTypeOf(layer.apply(conventions)).toEqualTypeOf<Layer>();
  });
});

describe("ScopedAgent types", () => {
  it("starts out providing nothing", () => {
    expectTypeOf(layer.scopedAgent()).toEqualTypeOf<
      ScopedAgent<AgentDoesNotProvideAnything>
    >();
  });

  it("is synchronous — a declaration is not a promise", () => {
    expectTypeOf(layer.scopedAgent().canWrite("a.ts").act("go")).not.toMatchTypeOf<
      Promise<unknown>
    >();
  });

  it("carries the provides state forward through later builder calls", () => {
    const provider = layer.scopedAgent().act("go").provides("Docs");
    expectTypeOf(provider).toEqualTypeOf<ScopedAgent<AgentProvides>>();
    expectTypeOf(provider.canWrite("README.md")).toEqualTypeOf<ScopedAgent<AgentProvides>>();
    expectTypeOf(provider.context("more")).toEqualTypeOf<ScopedAgent<AgentProvides>>();
  });

  it("gives back a plain runtime Artifact — v2 has no typed members", () => {
    expectTypeOf<ScopedAgent["artifact"]>().toEqualTypeOf<Artifact>();
    expectTypeOf<Artifact>().toHaveProperty("files");
    expectTypeOf<Artifact>().not.toHaveProperty("members");
  });
});

describe(".requests() requires .provides()", () => {
  it("accepts a provider", () => {
    const provider = layer.scopedAgent().canWrite("README.md").act("readme").provides("Docs");
    expectTypeOf(layer.scopedAgent().requests(provider, "cover me")).toEqualTypeOf<
      ScopedAgent<AgentDoesNotProvideAnything>
    >();
  });

  it("is a compile error against an agent that provides nothing", () => {
    const notAProvider = layer.scopedAgent().canWrite("README.md").act("readme");
    // @ts-expect-error — "agent does not provide anything — call .provides(label) on it first"
    layer.scopedAgent().requests(notAProvider, "cover me");
  });

  it("is a compile error against a value taken before .provides()", () => {
    const beforeProvides = layer.scopedAgent().canWrite("README.md").act("readme");
    beforeProvides.provides("Docs");
    // @ts-expect-error — immutability means the earlier value still provides nothing
    layer.scopedAgent().requests(beforeProvides, "cover me");
  });

  it("accepts any agent in .uses(), provider or not", () => {
    const plain = layer.scopedAgent().canWrite("a.ts").act("a");
    expectTypeOf(layer.scopedAgent().uses(plain)).toEqualTypeOf<
      ScopedAgent<AgentDoesNotProvideAnything>
    >();
  });
});
