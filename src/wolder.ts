import type {
  BuildOptions,
  BuildResult,
  Layer,
  WolderInstance,
  WolderOptions,
  WolderServices,
} from "./types.js";
import { Registry } from "./program.js";
import { LayerImpl } from "./layer.js";
import { mergeConfig } from "./config.js";
import { runBuild } from "./build.js";
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
    build(buildOptions?: BuildOptions): Promise<BuildResult> {
      return runBuild(
        { root: options.root, model: config.model, config, registry, services },
        buildOptions,
      );
    },
  };
}
