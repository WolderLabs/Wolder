import { describe, it, expect } from "vitest";
import { LayerImpl } from "./layer.js";
import { Registry } from "./program.js";
import { AgentImpl } from "./agent.js";
import type { Agent } from "./types.js";

function setup() {
  const registry = new Registry();
  return { registry, layer: new LayerImpl(registry) };
}

function specOf(agent: Agent<any>) {
  return (agent as AgentImpl<any>).spec;
}

describe("Agent immutability", () => {
  it("returns a new value from every builder call", () => {
    const { layer } = setup();
    const base = layer.agent();
    const scoped = base.owns("src/services/");

    expect(scoped).not.toBe(base);
    expect(specOf(base).regions).toEqual([]);
    expect(specOf(scoped).regions).toEqual(["src/services/**"]);
  });

  it("makes a partially-applied agent a reusable template", () => {
    const { registry, layer } = setup();
    const inServices = layer.agent().owns("src/services/a.ts");

    const one = inServices.goal("one");
    const two = inServices.owns("src/services/b.ts").goal("two");

    expect(specOf(one).goal).toBe("one");
    expect(specOf(two).goal).toBe("two");
    // The template was derived from twice, so it is not a node — both leaves are.
    expect(registry.wasDerivedFrom(specOf(inServices).id)).toBe(true);
    expect(registry.nodes().map((s) => s.id).sort()).toEqual(
      [specOf(one).id, specOf(two).id].sort(),
    );
  });

  it("inherits the whole accumulated layer state", () => {
    const { layer } = setup();
    const agent = layer.context("shared").include("x.ts").agent().goal("go");
    expect(specOf(agent).layer.contexts).toEqual(["shared"]);
    expect(specOf(agent).layer.includedFiles).toEqual(["x.ts"]);
  });
});

describe("Agent declarations", () => {
  it("normalises regions and keeps them a set", () => {
    const { layer } = setup();
    const agent = layer
      .agent()
      .owns("src/services/")
      .owns("src/services")
      .owns("README.md");
    expect(specOf(agent).regions).toEqual(["src/services/**", "README.md"]);
  });

  it("dedents goal and context prose", () => {
    const { layer } = setup();
    const agent = layer.agent().goal(`
      Do the thing.
        Carefully.
    `);
    expect(specOf(agent).goal).toBe("Do the thing.\n  Carefully.");
  });

  it("records after and asks against the value it was handed", () => {
    const { layer } = setup();
    const readme = layer.agent().owns("README.md").goal("readme").provides("Docs");
    const service = layer
      .agent()
      .owns("src/services/")
      .after(readme)
      .asks(readme, "Document usage")
      .goal("service");

    expect(specOf(service).after).toEqual([specOf(readme).id]);
    expect(specOf(service).asks).toEqual([
      { targetId: specOf(readme).id, ask: "Document usage" },
    ]);
  });

  it("rejects a non-agent passed to an edge", () => {
    const { layer } = setup();
    const agent = layer.agent();
    expect(() => agent.after(null as never)).toThrow(/expects an agent/);
  });

  it("is not thenable — declaring is synchronous", () => {
    const { layer } = setup();
    const agent = layer.agent().owns("README.md").goal("go");
    expect((agent as unknown as { then?: unknown }).then).toBeUndefined();
  });
});

describe("reading .artifact", () => {
  it("throws with a real explanation before the build", () => {
    const { layer } = setup();
    const agent = layer.agent().owns("README.md").goal("go").provides("Docs");
    expect(() => agent.artifact).toThrow(/nothing runs until "await w\.run\(\)"/);
  });

  it("explains that a template never ran", () => {
    const { registry, layer } = setup();
    const template = layer.agent().owns("README.md").goal("go");
    template.provides("Docs");
    registry.markBuilt();
    expect(() => template.artifact).toThrow(/is a template, not a node/);
  });

  it("explains that an agent with no .goal() never ran", () => {
    const { registry, layer } = setup();
    const agent = layer.agent().owns("README.md");
    registry.markBuilt();
    expect(() => agent.artifact).toThrow(/no \.goal\(\)/);
  });

  it("returns the artifact once the build has set it", () => {
    const { registry, layer } = setup();
    const agent = layer.agent().owns("README.md").goal("go");
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
