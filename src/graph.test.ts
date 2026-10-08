import { describe, it, expect } from "vitest";
import { LayerImpl } from "./layer.js";
import { Registry } from "./program.js";
import { assembleGraph, topologicalOrder } from "./graph.js";
import { GraphError } from "./errors.js";
import type { AgentNode, Layer } from "./types.js";

function setup(): { registry: Registry; layer: Layer } {
  const registry = new Registry();
  return { registry, layer: new LayerImpl(registry) };
}

describe("node discovery", () => {
  it("makes every un-derived agent with an .goal() a node", () => {
    const { registry, layer } = setup();
    layer.agent().owns("README.md").goal("readme");
    layer.agent().owns("package.json").goal("deps");

    const graph = assembleGraph(registry);
    expect(graph.nodes.map((n) => n.id).sort()).toEqual(["README.md", "package.json"]);
  });

  it("ids a node by its region, so reordering a program does not rename it", () => {
    const first = setup();
    first.layer.agent().owns("README.md").goal("a");
    first.layer.agent().owns("src/services/").goal("b");

    const second = setup();
    second.layer.agent().owns("src/services/").goal("b");
    second.layer.agent().owns("README.md").goal("a");

    expect(assembleGraph(first.registry).nodes.map((n) => n.id).sort()).toEqual(
      assembleGraph(second.registry).nodes.map((n) => n.id).sort(),
    );
  });

  it("treats an agent with no .goal() as an unused template, not a node", () => {
    const { registry, layer } = setup();
    layer.agent().owns("src/services/");
    layer.agent().owns("README.md").goal("readme");

    expect(assembleGraph(registry).nodes.map((n) => n.id)).toEqual(["README.md"]);
  });

  it("refuses a program with nothing to run", () => {
    const { registry, layer } = setup();
    layer.agent().owns("README.md");
    expect(() => assembleGraph(registry)).toThrow(/declares no agents to run/);
  });

  it("refuses an agent with a goal but nowhere to write", () => {
    const { registry, layer } = setup();
    layer.agent().goal("do something");
    expect(() => assembleGraph(registry)).toThrow(/owns no region/);
  });
});

describe("boundary pre-flight", () => {
  it("rejects overlapping regions and points at the edges instead", () => {
    const { registry, layer } = setup();
    layer.agent().owns("src/").goal("everything");
    layer.agent().owns("src/services/").goal("services");

    expect(() => assembleGraph(registry)).toThrow(GraphError);
    expect(() => assembleGraph(registry)).toThrow(/\.asks\(owner/);
    expect(() => assembleGraph(registry)).toThrow(/owns\("src\/"\) is usually the culprit/);
  });

  it("rejects two agents claiming the same file", () => {
    const { registry, layer } = setup();
    layer.agent().owns("README.md").goal("one");
    layer.agent().owns("README.md").goal("two");
    expect(() => assembleGraph(registry)).toThrow(/overlap/);
  });

  it("allows disjoint regions", () => {
    const { registry, layer } = setup();
    layer.agent().owns("src/services/").goal("services");
    layer.agent().owns("src/controllers/").goal("controllers");
    expect(assembleGraph(registry).nodes).toHaveLength(2);
  });
});

describe("edges", () => {
  it("resolves after and asks to node ids", () => {
    const { registry, layer } = setup();
    const readme = layer.agent().owns("README.md").goal("readme").provides("Docs");
    layer
      .agent()
      .owns("src/services/")
      .after(readme)
      .asks(readme, "Document usage")
      .goal("service");

    const graph = assembleGraph(registry);
    const service = graph.byId.get("src/services/**")!;
    expect(service.after).toEqual(["README.md"]);
    expect(service.asks).toEqual([{ targetId: "README.md", ask: "Document usage" }]);
  });

  it("orders on after edges, dependencies first", () => {
    const { registry, layer } = setup();
    const a = layer.agent().owns("a.ts").goal("a");
    const b = layer.agent().owns("b.ts").after(a).goal("b");
    layer.agent().owns("c.ts").after(b).goal("c");

    expect(assembleGraph(registry).order).toEqual(["a.ts", "b.ts", "c.ts"]);
  });

  it("does not let an asks edge imply an order", () => {
    const { registry, layer } = setup();
    const readme = layer.agent().owns("README.md").goal("readme").provides("Docs");
    layer.agent().owns("src/services/").asks(readme, "document me").goal("svc");

    // Both nodes are independent under `after`, so neither constrains the other.
    const graph = assembleGraph(registry);
    expect(graph.byId.get("src/services/**")!.after).toEqual([]);
    expect(graph.byId.get("README.md")!.after).toEqual([]);
  });

  it("catches a cycle in after", () => {
    // Immutability makes a cycle very hard to express — every edge points at a
    // value that already existed — but the guard stays, so exercise it directly.
    const node = (id: string, after: string[]): AgentNode => ({
      id,
      label: id,
      layer: { contexts: [], includedFiles: [], gates: [] },
      regions: [id],
      goal: id,
      contexts: [],
      after,
      asks: [],
      chainHash: id,
    });

    expect(() =>
      topologicalOrder([node("a.ts", ["b.ts"]), node("b.ts", ["a.ts"])]),
    ).toThrow(/Dependency cycle among \.after\(\) edges/);
    expect(() => topologicalOrder([node("a.ts", ["a.ts"])])).toThrow(
      /Dependency cycle among \.after\(\) edges/,
    );
  });

  it("explains an edge that points at a value which was extended afterwards", () => {
    const { registry, layer } = setup();
    const readme = layer.agent().owns("README.md").goal("readme");
    const finished = readme.provides("Docs");
    // Deliberately point at the pre-.provides() value.
    layer.agent().owns("src/services/").after(readme).goal("svc");
    expect(finished).toBeDefined();

    expect(() => assembleGraph(registry)).toThrow(/template rather than a node/);
  });

  it("explains an edge to an agent that never runs", () => {
    const { registry, layer } = setup();
    const unused = layer.agent().owns("docs/");
    layer.agent().owns("src/services/").after(unused).goal("svc");

    expect(() => assembleGraph(registry)).toThrow(/no \.goal\(\)/);
  });
});

describe("chain hashing", () => {
  it("gives identical programs identical node hashes", () => {
    const build = () => {
      const { registry, layer } = setup();
      layer.context("shared").agent().owns("README.md").goal("readme");
      return assembleGraph(registry).nodes[0]!.chainHash;
    };
    expect(build()).toBe(build());
  });

  it("changes when the goal changes", () => {
    const build = (instruction: string) => {
      const { registry, layer } = setup();
      layer.agent().owns("README.md").goal(instruction);
      return assembleGraph(registry).nodes[0]!.chainHash;
    };
    expect(build("one")).not.toBe(build("two"));
  });

  it("changes when the layer beneath it changes", () => {
    const build = (context: string) => {
      const { registry, layer } = setup();
      layer.context(context).agent().owns("README.md").goal("readme");
      return assembleGraph(registry).nodes[0]!.chainHash;
    };
    expect(build("one")).not.toBe(build("two"));
  });

  it("is stable when an unrelated agent is declared before it", () => {
    const withoutOther = () => {
      const { registry, layer } = setup();
      layer.agent().owns("README.md").goal("readme");
      return assembleGraph(registry).byId.get("README.md")!.chainHash;
    };
    const withOther = () => {
      const { registry, layer } = setup();
      layer.agent().owns("package.json").goal("deps");
      layer.agent().owns("README.md").goal("readme");
      return assembleGraph(registry).byId.get("README.md")!.chainHash;
    };
    expect(withoutOther()).toBe(withOther());
  });
});
