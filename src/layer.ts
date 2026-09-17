import type {
  GateOptions,
  Layer,
  LayerState,
  LayerTransform,
  ScopedAgent,
} from "./types.js";
import { appendUnique, dedent } from "./util.js";
import { hashJson } from "./util.js";
import type { Registry } from "./program.js";
import { ScopedAgentImpl } from "./scoped-agent.js";

export const EMPTY_LAYER_STATE: LayerState = {
  contexts: [],
  includedFiles: [],
  gates: [],
};

/**
 * A layer is a persistent value — every method returns a new one and the receiver
 * is never touched. Derivation is monotonic: context accumulates, nothing can be
 * removed, so a child specialises a parent without restating or contradicting it.
 */
export class LayerImpl implements Layer {
  constructor(
    private readonly registry: Registry,
    readonly state: LayerState = EMPTY_LAYER_STATE,
  ) {}

  context(text: string): Layer {
    return new LayerImpl(this.registry, {
      ...this.state,
      contexts: [...this.state.contexts, dedent(text)],
    });
  }

  includeFile(path: string): Layer {
    return new LayerImpl(this.registry, {
      ...this.state,
      includedFiles: appendUnique(this.state.includedFiles, path),
    });
  }

  gate(command: string, options: GateOptions = {}): Layer {
    const gate = { command, name: options.name ?? command };
    if (this.state.gates.some((g) => g.command === gate.command && g.name === gate.name)) {
      return this;
    }
    return new LayerImpl(this.registry, {
      ...this.state,
      gates: [...this.state.gates, gate],
    });
  }

  apply(fn: LayerTransform): Layer {
    return fn(this);
  }

  scopedAgent(): ScopedAgent {
    return new ScopedAgentImpl(this.registry, this.registry.create(this.state));
  }
}

/** Layers are structurally hashable — this is part of every descendant's cache key. */
export function hashLayer(state: LayerState): string {
  return hashJson({
    contexts: state.contexts,
    includedFiles: [...state.includedFiles].sort(),
    gates: state.gates.map((g) => g.command).sort(),
  });
}

/** The accumulated prose a layer hands to an agent, in declaration order. */
export function layerContext(state: LayerState): string {
  return state.contexts.join("\n\n");
}
