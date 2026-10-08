import { describe, it, expect } from "vitest";
import { LayerImpl } from "../../../src/layer.js";
import { Registry } from "../../../src/program.js";
import { moduleConventions } from "./index.js";

function contextsAfter(imports: "js" | "bare"): readonly string[] {
  const layer = new LayerImpl(new Registry()).apply(moduleConventions({ imports }));
  return (layer as LayerImpl).state.contexts;
}

describe("moduleConventions", () => {
  it("adds exactly one context entry telling agents to use the .js extension", () => {
    const contexts = contextsAfter("js");
    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toContain('"./x.js"');
    expect(contexts[0]).toContain("Node16");
  });

  it("adds exactly one context entry telling agents to omit the extension", () => {
    const contexts = contextsAfter("bare");
    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toContain("no file extension");
    expect(contexts[0]).not.toContain("./x.js");
  });
});
