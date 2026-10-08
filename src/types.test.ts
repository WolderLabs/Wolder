import { describe, it, expectTypeOf } from "vitest";
import type {
  AgentDoesNotProvideAnything,
  AgentProvides,
  Artifact,
  Layer,
  Agent,
} from "./types.js";
import { LayerImpl } from "./layer.js";
import { Registry } from "./program.js";

// A real layer, so these assertions are checked by the compiler *and* exercise the
// implementation rather than a declared shape that could drift from it.
const layer: Layer = new LayerImpl(new Registry());

describe("Layer types", () => {
  it("returns a Layer from every method, so composition never narrows", () => {
    expectTypeOf(layer.context("x")).toEqualTypeOf<Layer>();
    expectTypeOf(layer.include("x.ts")).toEqualTypeOf<Layer>();
    expectTypeOf(layer.gate("npx tsc --noEmit")).toEqualTypeOf<Layer>();
    expectTypeOf(layer.apply((l) => l.context("x"))).toEqualTypeOf<Layer>();
  });

  it("takes a plain layer→layer function in apply, so shipped layers are just functions", () => {
    const conventions = (l: Layer): Layer => l.context("conventions");
    expectTypeOf(layer.apply(conventions)).toEqualTypeOf<Layer>();
  });
});

describe("Agent types", () => {
  it("starts out providing nothing", () => {
    expectTypeOf(layer.agent()).toEqualTypeOf<
      Agent<AgentDoesNotProvideAnything>
    >();
  });

  it("is synchronous — a declaration is not a promise", () => {
    expectTypeOf(layer.agent().owns("a.ts").goal("go")).not.toMatchTypeOf<
      Promise<unknown>
    >();
  });

  it("carries the provides state forward through later builder calls", () => {
    const provider = layer.agent().goal("go").provides("Docs");
    expectTypeOf(provider).toEqualTypeOf<Agent<AgentProvides>>();
    expectTypeOf(provider.owns("README.md")).toEqualTypeOf<Agent<AgentProvides>>();
    expectTypeOf(provider.context("more")).toEqualTypeOf<Agent<AgentProvides>>();
  });

  it("gives back a plain runtime Artifact — v2 has no typed members", () => {
    expectTypeOf<Agent["artifact"]>().toEqualTypeOf<Artifact>();
    expectTypeOf<Artifact>().toHaveProperty("files");
    expectTypeOf<Artifact>().not.toHaveProperty("members");
  });
});

describe(".asks() requires .provides()", () => {
  it("accepts a provider", () => {
    const provider = layer.agent().owns("README.md").goal("readme").provides("Docs");
    expectTypeOf(layer.agent().asks(provider, "cover me")).toEqualTypeOf<
      Agent<AgentDoesNotProvideAnything>
    >();
  });

  it("is a compile error against an agent that provides nothing", () => {
    const notAProvider = layer.agent().owns("README.md").goal("readme");
    // @ts-expect-error — "agent does not provide anything — call .provides(label) on it first"
    layer.agent().asks(notAProvider, "cover me");
  });

  it("is a compile error against a value taken before .provides()", () => {
    const beforeProvides = layer.agent().owns("README.md").goal("readme");
    beforeProvides.provides("Docs");
    // @ts-expect-error — immutability means the earlier value still provides nothing
    layer.agent().asks(beforeProvides, "cover me");
  });

  it("accepts any agent in .after(), provider or not", () => {
    const plain = layer.agent().owns("a.ts").goal("a");
    expectTypeOf(layer.agent().after(plain)).toEqualTypeOf<
      Agent<AgentDoesNotProvideAnything>
    >();
  });
});
