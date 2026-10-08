import { describe, it, expect } from "vitest";
import { LayerImpl } from "./layer.js";
import { Registry } from "./program.js";
import { assembleGraph } from "./graph.js";
import type { Agent, AgentProvides, Layer } from "./types.js";

/**
 * The graph of `samples/recipes/wolder.program.ts`, rebuilt here so the test does not
 * depend on sample paths: a `crudFeature` recipe instantiated for Todo and Note, plus
 * one `deps` agent passed into both.
 */

const crudGoal = (entity: string) => `Create a ${entity}Service with CRUD operations.`;

const pages =
  (p: { entity: string; route: string; region: string; api: Agent<AgentProvides> }) =>
  (layer: Layer) =>
    layer
      .agent()
      .owns(p.region)
      .after(p.api)
      .asks(p.api, `A typed client for the ${p.entity} API`)
      .goal(`Create the pages for ${p.entity} at ${p.route}.`)
      .provides(`${p.entity} pages`);

const crudFeature =
  (p: { entity: string; deps: Agent<AgentProvides> }) => (layer: Layer) => {
    const name = p.entity.toLowerCase();
    const service = layer
      .agent()
      .owns(`src/services/${p.entity}Service.ts`)
      .goal(crudGoal(p.entity))
      .provides(`${p.entity} service`);
    const controller = layer
      .agent()
      .owns(`src/controllers/${p.entity}Controller.ts`)
      .after(service)
      .asks(p.deps, "An HTTP framework")
      .goal(`Create a ${p.entity}Controller.`)
      .provides(`${p.entity} API`);
    const ui = pages({
      entity: p.entity,
      route: `/${name}s`,
      region: `src/pages/${name}/`,
      api: controller,
    })(layer);
    return { service, controller, ui };
  };

function program() {
  const registry = new Registry();
  const project: Layer = new LayerImpl(registry).context("A small web app.");
  const deps = project
    .agent()
    .owns("package.json")
    .owns("tsconfig.json")
    .goal("Set up the project.")
    .provides("NPM dependencies");
  const todo = crudFeature({ entity: "Todo", deps })(project);
  const note = crudFeature({ entity: "Note", deps })(project);
  return { registry, todo, note };
}

describe("the recipes program", () => {
  it("assembles six recipe agents plus deps", () => {
    const { registry } = program();
    expect(assembleGraph(registry).nodes).toHaveLength(7);
  });

  it("gives the two pages agents different regions", () => {
    const { registry } = program();
    const nodes = assembleGraph(registry).nodes;
    const pageNodes = nodes.filter((n) => n.label.endsWith(" pages"));
    expect(pageNodes).toHaveLength(2);
    expect(new Set(pageNodes.map((n) => n.regions.join(","))).size).toBe(2);
  });

  it("orders each pages agent after its own controller", () => {
    const { registry } = program();
    const nodes = assembleGraph(registry).nodes;
    const byLabel = (label: string) => nodes.find((n) => n.label === label)!;
    for (const entity of ["Todo", "Note"]) {
      const pageNode = byLabel(`${entity} pages`);
      expect(pageNode.after).toEqual([byLabel(`${entity} API`).id]);
    }
  });
});
