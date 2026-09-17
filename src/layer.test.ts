import { describe, it, expect } from "vitest";
import type { Layer } from "./types.js";
import { LayerImpl, hashLayer, layerContext } from "./layer.js";
import { Registry } from "./program.js";
import { dedent } from "./util.js";

function emptyLayer(): LayerImpl {
  return new LayerImpl(new Registry());
}

describe("Layer immutability", () => {
  it("returns a new layer from every method and never touches the receiver", () => {
    const base = emptyLayer();
    const derived = base
      .context("child prose")
      .includeFile("src/models/TodoItem.ts")
      .gate("npx tsc --noEmit");

    expect(derived).not.toBe(base);
    expect(base.state.contexts).toEqual([]);
    expect(base.state.includedFiles).toEqual([]);
    expect(base.state.gates).toEqual([]);
  });

  it("lets one layer be derived from many times without the branches seeing each other", () => {
    const project = emptyLayer().context("shared");
    const backend = project.context("backend") as LayerImpl;
    const frontend = project.context("frontend") as LayerImpl;

    expect(backend.state.contexts).toEqual(["shared", "backend"]);
    expect(frontend.state.contexts).toEqual(["shared", "frontend"]);
    expect((project as LayerImpl).state.contexts).toEqual(["shared"]);
  });
});

describe("Layer accumulation", () => {
  it("accumulates context in declaration order", () => {
    const layer = emptyLayer().context("first").context("second").context("third");
    expect(layerContext((layer as LayerImpl).state)).toBe("first\n\nsecond\n\nthird");
  });

  it("dedents prose written inside an indented chain", () => {
    const layer = emptyLayer().context(`
      A todo service.
        Indented detail.
    `) as LayerImpl;
    expect(layer.state.contexts[0]).toBe("A todo service.\n  Indented detail.");
  });

  it("accumulates included files as a set, first-seen order", () => {
    const layer = emptyLayer()
      .includeFile("a.ts")
      .includeFile("b.ts")
      .includeFile("a.ts") as LayerImpl;
    expect(layer.state.includedFiles).toEqual(["a.ts", "b.ts"]);
  });

  it("does not add a gate twice", () => {
    const layer = emptyLayer().gate("npx tsc --noEmit").gate("npx tsc --noEmit") as LayerImpl;
    expect(layer.state.gates).toHaveLength(1);
    expect(layer.state.gates[0]).toEqual({
      command: "npx tsc --noEmit",
      name: "npx tsc --noEmit",
    });
  });

  it("names a gate when asked", () => {
    const layer = emptyLayer().gate("npx vitest run", { name: "tests" }) as LayerImpl;
    expect(layer.state.gates[0]!.name).toBe("tests");
  });
});

describe("Layer.apply", () => {
  it("applies a layer→layer function and keeps the chain going", () => {
    const conventions = (layer: Layer): Layer => layer.context("conventions");
    const layer = emptyLayer().apply(conventions).context("project") as LayerImpl;
    expect(layer.state.contexts).toEqual(["conventions", "project"]);
  });

  it("is exactly fn(layer)", () => {
    const fn = (layer: Layer): Layer => layer.context("x");
    const base = emptyLayer();
    expect(hashLayer((base.apply(fn) as LayerImpl).state)).toBe(
      hashLayer((fn(base) as LayerImpl).state),
    );
  });
});

describe("hashLayer", () => {
  it("is structural — same content, same hash", () => {
    const a = emptyLayer().context("one").includeFile("x.ts");
    const b = emptyLayer().context("one").includeFile("x.ts");
    expect(hashLayer((a as LayerImpl).state)).toBe(hashLayer((b as LayerImpl).state));
  });

  it("changes when accumulated context changes", () => {
    const a = emptyLayer().context("one");
    const b = emptyLayer().context("one").context("two");
    expect(hashLayer((a as LayerImpl).state)).not.toBe(hashLayer((b as LayerImpl).state));
  });

  it("is sensitive to context order, because the model reads it in order", () => {
    const a = emptyLayer().context("one").context("two");
    const b = emptyLayer().context("two").context("one");
    expect(hashLayer((a as LayerImpl).state)).not.toBe(hashLayer((b as LayerImpl).state));
  });
});

describe("dedent", () => {
  it("strips common indentation and trims blank edges", () => {
    expect(dedent("\n    a\n      b\n\n")).toBe("a\n  b");
  });

  it("leaves a single line alone", () => {
    expect(dedent("hello")).toBe("hello");
  });

  it("survives an all-blank string", () => {
    expect(dedent("\n   \n")).toBe("");
  });
});
