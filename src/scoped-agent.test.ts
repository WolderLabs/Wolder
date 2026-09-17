import { describe, it, expect } from "vitest";
import { LayerImpl } from "./layer.js";
import { Registry } from "./program.js";
import { ScopedAgentImpl } from "./scoped-agent.js";
import type { ScopedAgent } from "./types.js";

function setup() {
  const registry = new Registry();
  return { registry, layer: new LayerImpl(registry) };
}

function specOf(agent: ScopedAgent<any>) {
  return (agent as ScopedAgentImpl<any>).spec;
}

describe("ScopedAgent immutability", () => {
  it("returns a new value from every builder call", () => {
    const { layer } = setup();
    const base = layer.scopedAgent();
    const scoped = base.canWrite("src/services/");

    expect(scoped).not.toBe(base);
    expect(specOf(base).regions).toEqual([]);
    expect(specOf(scoped).regions).toEqual(["src/services/**"]);
  });

  it("makes a partially-applied agent a reusable template", () => {
    const { registry, layer } = setup();
    const inServices = layer.scopedAgent().canWrite("src/services/a.ts");

    const one = inServices.act("one");
    const two = inServices.canWrite("src/services/b.ts").act("two");

    expect(specOf(one).instruction).toBe("one");
    expect(specOf(two).instruction).toBe("two");
    // The template was derived from twice, so it is not a node — both leaves are.
    expect(registry.wasDerivedFrom(specOf(inServices).id)).toBe(true);
    expect(registry.nodes().map((s) => s.id).sort()).toEqual(
      [specOf(one).id, specOf(two).id].sort(),
    );
  });

  it("inherits the whole accumulated layer state", () => {
    const { layer } = setup();
    const agent = layer.context("shared").includeFile("x.ts").scopedAgent().act("go");
    expect(specOf(agent).layer.contexts).toEqual(["shared"]);
    expect(specOf(agent).layer.includedFiles).toEqual(["x.ts"]);
  });
});

describe("ScopedAgent declarations", () => {
  it("normalises regions and keeps them a set", () => {
    const { layer } = setup();
    const agent = layer
      .scopedAgent()
      .canWrite("src/services/")
      .canWrite("src/services")
      .canWrite("README.md");
    expect(specOf(agent).regions).toEqual(["src/services/**", "README.md"]);
  });

  it("dedents act and context prose", () => {
    const { layer } = setup();
    const agent = layer.scopedAgent().act(`
      Do the thing.
        Carefully.
    `);
    expect(specOf(agent).instruction).toBe("Do the thing.\n  Carefully.");
  });

  it("records uses and requests against the value it was handed", () => {
    const { layer } = setup();
    const readme = layer.scopedAgent().canWrite("README.md").act("readme").provides("Docs");
    const service = layer
      .scopedAgent()
      .canWrite("src/services/")
      .uses(readme)
      .requests(readme, "Document usage")
      .act("service");

    expect(specOf(service).uses).toEqual([specOf(readme).id]);
    expect(specOf(service).requests).toEqual([
      { targetId: specOf(readme).id, ask: "Document usage" },
    ]);
  });

  it("rejects a non-agent passed to an edge", () => {
    const { layer } = setup();
    const agent = layer.scopedAgent();
    expect(() => agent.uses(null as never)).toThrow(/expects a scoped agent/);
  });

  it("is not thenable — declaring is synchronous", () => {
    const { layer } = setup();
    const agent = layer.scopedAgent().canWrite("README.md").act("go");
    expect((agent as unknown as { then?: unknown }).then).toBeUndefined();
  });
});

describe("reading .artifact", () => {
  it("throws with a real explanation before the build", () => {
    const { layer } = setup();
    const agent = layer.scopedAgent().canWrite("README.md").act("go").provides("Docs");
    expect(() => agent.artifact).toThrow(/nothing runs until "await w\.build\(\)"/);
  });

  it("explains that a template never ran", () => {
    const { registry, layer } = setup();
    const template = layer.scopedAgent().canWrite("README.md").act("go");
    template.provides("Docs");
    registry.markBuilt();
    expect(() => template.artifact).toThrow(/is a template, not a node/);
  });

  it("explains that an agent with no .act() never ran", () => {
    const { registry, layer } = setup();
    const agent = layer.scopedAgent().canWrite("README.md");
    registry.markBuilt();
    expect(() => agent.artifact).toThrow(/no \.act\(\) instruction/);
  });

  it("returns the artifact once the build has set it", () => {
    const { registry, layer } = setup();
    const agent = layer.scopedAgent().canWrite("README.md").act("go");
    registry.setArtifact(specOf(agent).id, {
      kind: "artifact",
      id: "README.md",
      outputHash: "abc",
      files: ["README.md"],
    });
    registry.markBuilt();
    expect(agent.artifact.files).toEqual(["README.md"]);
  });
});
