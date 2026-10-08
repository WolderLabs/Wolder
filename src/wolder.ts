import type {
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
import { runProgram } from "./build.js";
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

  return {
    layer(): Layer {
      return new LayerImpl(registry);
    },
    run(runOptions?: RunOptions): Promise<RunResult> {
      return runProgram(
        { root: options.root, model: config.model, config, registry, services },
        runOptions,
      );
    },
  };
}
