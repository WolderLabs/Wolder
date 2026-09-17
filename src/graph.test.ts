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
  it("makes every un-derived agent with an .act() a node", () => {
    const { registry, layer } = setup();
    layer.scopedAgent().canWrite("README.md").act("readme");
    layer.scopedAgent().canWrite("package.json").act("deps");

    const graph = assembleGraph(registry);
    expect(graph.nodes.map((n) => n.id).sort()).toEqual(["README.md", "package.json"]);
  });

  it("ids a node by its region, so reordering a program does not rename it", () => {
    const first = setup();
    first.layer.scopedAgent().canWrite("README.md").act("a");
    first.layer.scopedAgent().canWrite("src/services/").act("b");

    const second = setup();
    second.layer.scopedAgent().canWrite("src/services/").act("b");
    second.layer.scopedAgent().canWrite("README.md").act("a");

    expect(assembleGraph(first.registry).nodes.map((n) => n.id).sort()).toEqual(
      assembleGraph(second.registry).nodes.map((n) => n.id).sort(),
    );
  });

  it("treats an agent with no .act() as an unused template, not a node", () => {
    const { registry, layer } = setup();
    layer.scopedAgent().canWrite("src/services/");
    layer.scopedAgent().canWrite("README.md").act("readme");

    expect(assembleGraph(registry).nodes.map((n) => n.id)).toEqual(["README.md"]);
  });

  it("refuses a program with nothing to run", () => {
    const { registry, layer } = setup();
    layer.scopedAgent().canWrite("README.md");
    expect(() => assembleGraph(registry)).toThrow(/declares no agents to run/);
  });

  it("refuses an agent with an instruction but nowhere to write", () => {
    const { registry, layer } = setup();
    layer.scopedAgent().act("do something");
    expect(() => assembleGraph(registry)).toThrow(/no \.canWrite\(\) region/);
  });
});

describe("boundary pre-flight", () => {
  it("rejects overlapping regions and points at the edges instead", () => {
    const { registry, layer } = setup();
    layer.scopedAgent().canWrite("src/").act("everything");
    layer.scopedAgent().canWrite("src/services/").act("services");

    expect(() => assembleGraph(registry)).toThrow(GraphError);
    expect(() => assembleGraph(registry)).toThrow(/\.requests\(owner/);
    expect(() => assembleGraph(registry)).toThrow(/canWrite\("src\/"\) is usually the culprit/);
  });

  it("rejects two agents claiming the same file", () => {
    const { registry, layer } = setup();
    layer.scopedAgent().canWrite("README.md").act("one");
    layer.scopedAgent().canWrite("README.md").act("two");
    expect(() => assembleGraph(registry)).toThrow(/overlap/);
  });

  it("allows disjoint regions", () => {
    const { registry, layer } = setup();
    layer.scopedAgent().canWrite("src/services/").act("services");
    layer.scopedAgent().canWrite("src/controllers/").act("controllers");
    expect(assembleGraph(registry).nodes).toHaveLength(2);
  });
});

describe("edges", () => {
  it("resolves uses and requests to node ids", () => {
    const { registry, layer } = setup();
    const readme = layer.scopedAgent().canWrite("README.md").act("readme").provides("Docs");
    layer
      .scopedAgent()
      .canWrite("src/services/")
      .uses(readme)
      .requests(readme, "Document usage")
      .act("service");

    const graph = assembleGraph(registry);
    const service = graph.byId.get("src/services/**")!;
    expect(service.uses).toEqual(["README.md"]);
    expect(service.requests).toEqual([{ targetId: "README.md", ask: "Document usage" }]);
  });

  it("orders on uses edges, dependencies first", () => {
    const { registry, layer } = setup();
    const a = layer.scopedAgent().canWrite("a.ts").act("a");
    const b = layer.scopedAgent().canWrite("b.ts").uses(a).act("b");
    layer.scopedAgent().canWrite("c.ts").uses(b).act("c");

    expect(assembleGraph(registry).order).toEqual(["a.ts", "b.ts", "c.ts"]);
  });

  it("does not let a requests edge imply an order", () => {
    const { registry, layer } = setup();
    const readme = layer.scopedAgent().canWrite("README.md").act("readme").provides("Docs");
    layer.scopedAgent().canWrite("src/services/").requests(readme, "document me").act("svc");

    // Both nodes are independent under `uses`, so neither constrains the other.
    const graph = assembleGraph(registry);
    expect(graph.byId.get("src/services/**")!.uses).toEqual([]);
    expect(graph.byId.get("README.md")!.uses).toEqual([]);
  });

  it("catches a cycle in uses", () => {
    // Immutability makes a cycle very hard to express — every edge points at a
    // value that already existed — but the guard stays, so exercise it directly.
    const node = (id: string, uses: string[]): AgentNode => ({
      id,
      label: id,
      layer: { contexts: [], includedFiles: [], gates: [] },
      regions: [id],
      instruction: id,
      contexts: [],
      uses,
      requests: [],
      chainHash: id,
    });

    expect(() =>
      topologicalOrder([node("a.ts", ["b.ts"]), node("b.ts", ["a.ts"])]),
    ).toThrow(/Dependency cycle in \.uses\(\)/);
    expect(() => topologicalOrder([node("a.ts", ["a.ts"])])).toThrow(
      /Dependency cycle in \.uses\(\)/,
    );
  });

  it("explains an edge that points at a value which was extended afterwards", () => {
    const { registry, layer } = setup();
    const readme = layer.scopedAgent().canWrite("README.md").act("readme");
    const finished = readme.provides("Docs");
    // Deliberately point at the pre-.provides() value.
    layer.scopedAgent().canWrite("src/services/").uses(readme).act("svc");
    expect(finished).toBeDefined();

    expect(() => assembleGraph(registry)).toThrow(/template rather than a node/);
  });

  it("explains an edge to an agent that never runs", () => {
    const { registry, layer } = setup();
    const unused = layer.scopedAgent().canWrite("docs/");
    layer.scopedAgent().canWrite("src/services/").uses(unused).act("svc");

    expect(() => assembleGraph(registry)).toThrow(/no \.act\(\) instruction/);
  });
});

describe("chain hashing", () => {
  it("gives identical programs identical node hashes", () => {
    const build = () => {
      const { registry, layer } = setup();
      layer.context("shared").scopedAgent().canWrite("README.md").act("readme");
      return assembleGraph(registry).nodes[0]!.chainHash;
    };
    expect(build()).toBe(build());
  });

  it("changes when the act instruction changes", () => {
    const build = (instruction: string) => {
      const { registry, layer } = setup();
      layer.scopedAgent().canWrite("README.md").act(instruction);
      return assembleGraph(registry).nodes[0]!.chainHash;
    };
    expect(build("one")).not.toBe(build("two"));
  });

  it("changes when the layer beneath it changes", () => {
    const build = (context: string) => {
      const { registry, layer } = setup();
      layer.context(context).scopedAgent().canWrite("README.md").act("readme");
      return assembleGraph(registry).nodes[0]!.chainHash;
    };
    expect(build("one")).not.toBe(build("two"));
  });

  it("is stable when an unrelated agent is declared before it", () => {
    const withoutOther = () => {
      const { registry, layer } = setup();
      layer.scopedAgent().canWrite("README.md").act("readme");
      return assembleGraph(registry).byId.get("README.md")!.chainHash;
    };
    const withOther = () => {
      const { registry, layer } = setup();
      layer.scopedAgent().canWrite("package.json").act("deps");
      layer.scopedAgent().canWrite("README.md").act("readme");
      return assembleGraph(registry).byId.get("README.md")!.chainHash;
    };
    expect(withoutOther()).toBe(withOther());
  });
});
