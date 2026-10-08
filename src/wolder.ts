import { writeFileSync } from "node:fs";
import type {
  AssembleOutcome,
  PlanOutcome,
  RunOptions,
  RunResult,
  Layer,
  WolderInstance,
  WolderOptions,
  WolderServices,
} from "./types.js";
import { Registry } from "./program.js";
import { LayerImpl } from "./layer.js";
import { mergeConfig } from "./config.js";
import { assembleGraph } from "./graph.js";
import { GraphError } from "./errors.js";
import { serializeGraph } from "./serialize.js";
import { planGraph, runProgram } from "./build.js";
import { createSdkRunner } from "./runner.js";
import { createNegotiator } from "./negotiate.js";
import { createAnthropicChat } from "./chat.js";

export function wolder(options: WolderOptions): WolderInstance {
  const config = mergeConfig(options.config, { model: options.model });
  const registry = new Registry();

  const services: WolderServices = {
    runner: options.services?.runner ?? createSdkRunner(),
    negotiator:
      options.services?.negotiator ??
      createNegotiator(createAnthropicChat(config.model, config.apiKey)),
  };

  function assemble(): AssembleOutcome {
    try {
      return { ok: true, graph: serializeGraph(assembleGraph(registry), options.root) };
    } catch (err) {
      if (err instanceof GraphError) return { ok: false, diagnostic: err.diagnostic };
      throw err;
    }
  }

  function plan(planOptions?: { force?: boolean }): PlanOutcome {
    try {
      const graph = assembleGraph(registry);
      return {
        ok: true,
        graph: serializeGraph(graph, options.root),
        plan: planGraph(
          graph,
          { root: options.root, model: config.model, config, registry, services },
          planOptions,
        ),
      };
    } catch (err) {
      if (err instanceof GraphError) return { ok: false, diagnostic: err.diagnostic };
      throw err;
    }
  }

  return {
    assemble,
    plan,
    layer(): Layer {
      return new LayerImpl(registry);
    },
    async run(runOptions?: RunOptions): Promise<RunResult> {
      // Assemble-only mode: a parent process (the inspector) wants the checked graph
      // as data. No manifest, no recorder, no model.
      if (process.env.WOLDER_ASSEMBLE_ONLY === "1") {
        const out = process.env.WOLDER_ASSEMBLE_OUT;
        if (!out) {
          throw new Error(
            "WOLDER_ASSEMBLE_ONLY=1 is set but WOLDER_ASSEMBLE_OUT is not. " +
              "Set WOLDER_ASSEMBLE_OUT to the file the assembled graph should be written to.",
          );
        }
        writeFileSync(out, JSON.stringify(assemble()), "utf-8");
        return { artifacts: [], contracts: [], skipped: [], durationMs: 0 };
      }
      // Plan mode: the same hand-off with freshness added. Still no model, no writes.
      if (process.env.WOLDER_PLAN === "1") {
        const out = process.env.WOLDER_PLAN_OUT;
        if (!out) {
          throw new Error(
            "WOLDER_PLAN=1 is set but WOLDER_PLAN_OUT is not. " +
              "Set WOLDER_PLAN_OUT to the file the plan should be written to.",
          );
        }
        writeFileSync(out, JSON.stringify(plan()), "utf-8");
        return { artifacts: [], contracts: [], skipped: [], durationMs: 0 };
      }
      return runProgram(
        { root: options.root, model: config.model, config, registry, services },
        runOptions,
      );
    },
  };
}
