import { describe, it, expect } from "vitest";
import { wolder } from "./wolder.js";
import { GraphError } from "./errors.js";
import { assembleGraph } from "./graph.js";
import { Registry } from "./program.js";
import { LayerImpl } from "./layer.js";
import { serializeGraph } from "./serialize.js";

/** The shape of the todo-service reference program: four agents, two `asks`, one `after`. */
function acceptanceProgram() {
  const w = wolder({ root: "/proj", model: "test-model" });
  const project = w.layer().context("A todo service.").include("src/models/TodoItem.ts");
  const readme = project.agent().owns("README.md").goal("readme").provides("Documentation");
  const deps = project
    .agent()
    .owns("package.json")
    .owns("tsconfig.json")
    .goal("deps")
    .provides("NPM dependencies");
  const service = project
    .agent()
    .owns("src/services/")
    .asks(readme, "document usage")
    .goal("service")
    .provides("Todo Service");
  project
    .agent()
    .owns("src/controllers/")
    .asks(deps, "express")
    .after(service)
    .goal("controller")
    .context("controller only")
    .provides("Todo API");
  return w;
}

describe("serializeGraph", () => {
  it("serialises the acceptance graph to four nodes with their edges", () => {
    const outcome = acceptanceProgram().assemble();
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const { graph } = outcome;

    expect(graph.root).toBe("/proj");
    expect(graph.nodes.map((n) => n.id).sort()).toEqual([
      "README.md",
      "package.json+tsconfig.json",
      "src/controllers/**",
      "src/services/**",
    ]);

    const controller = graph.nodes.find((n) => n.id === "src/controllers/**")!;
    expect(controller.after).toEqual(["src/services/**"]);
    expect(controller.asks).toEqual([{ targetId: "package.json+tsconfig.json", ask: "express" }]);
    expect(controller.contexts).toEqual(["controller only"]);
    expect(controller.layerContexts).toEqual(["A todo service."]);
    expect(controller.includedFiles).toEqual(["src/models/TodoItem.ts"]);
    expect(controller.provides).toBe("Todo API");

    const service = graph.nodes.find((n) => n.id === "src/services/**")!;
    expect(service.asks).toEqual([{ targetId: "README.md", ask: "document usage" }]);
    expect(graph.order.indexOf("src/services/**")).toBeLessThan(
      graph.order.indexOf("src/controllers/**"),
    );
  });

  it("groups contracts per provider", () => {
    const outcome = acceptanceProgram().assemble();
    if (!outcome.ok) throw new Error("expected ok");
    expect(outcome.graph.contracts).toEqual([
      {
        id: "contract:package.json+tsconfig.json",
        provider: "package.json+tsconfig.json",
        requesters: ["src/controllers/**"],
      },
      {
        id: "contract:README.md",
        provider: "README.md",
        requesters: ["src/services/**"],
      },
    ]);
  });

  it("round-trips through JSON", () => {
    const registry = new Registry();
    new LayerImpl(registry).agent().owns("a.ts").goal("a");
    const serialized = serializeGraph(assembleGraph(registry), "/r");
    expect(JSON.parse(JSON.stringify(serialized))).toEqual(
      JSON.parse(JSON.stringify(serialized)),
    );
    expect(serialized.nodes[0]!.gates).toEqual([]);
  });
});

describe("GraphError.diagnostic", () => {
  it("splits the message at the first line and keeps the full text", () => {
    const err = new GraphError("first line\nsecond\nthird", { agents: ["x"] });
    expect(err.message).toBe("first line\nsecond\nthird");
    expect(err.diagnostic).toEqual({
      message: "first line",
      agents: ["x"],
      hint: "second\nthird",
    });
  });
});
