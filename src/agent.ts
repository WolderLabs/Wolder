import type {
  AgentDoesNotProvideAnything,
  AgentProvides,
  Artifact,
  ProvidesState,
  Agent,
  AgentTransform,
} from "./types.js";
import type { AgentSpec, Registry } from "./program.js";
import { appendUnique, dedent } from "./util.js";
import { normalizeRegion } from "./region.js";

/**
 * An immutable agent specification.
 *
 * Declaring one registers a spec and returns a handle — synchronously. Nothing
 * runs until `w.run()`, so there is deliberately no `await` here: an awaited
 * declaration could only ever resolve to a placeholder, and a promise that cannot
 * keep its promise should not look like one.
 */
export class AgentImpl<TProvides extends ProvidesState = AgentDoesNotProvideAnything>
  implements Agent<TProvides>
{
  /** Phantom — never read at runtime, only used by TypeScript's type system. */
  declare readonly _provides: TProvides;

  constructor(
    private readonly registry: Registry,
    readonly spec: AgentSpec,
  ) {}

  private next<T extends ProvidesState>(
    patch: Partial<AgentSpec>,
    method: string,
    args: readonly unknown[],
  ): AgentImpl<T> {
    return new AgentImpl<T>(
      this.registry,
      this.registry.derive(this.spec, patch, { method, args }),
    );
  }

  owns(region: string): Agent<TProvides> {
    const normalized = normalizeRegion(region);
    return this.next<TProvides>(
      { regions: appendUnique(this.spec.regions, normalized) },
      "owns",
      [normalized],
    );
  }

  context(text: string): Agent<TProvides> {
    const trimmed = dedent(text);
    return this.next<TProvides>(
      { contexts: [...this.spec.contexts, trimmed] },
      "context",
      [trimmed],
    );
  }

  goal(instruction: string): Agent<TProvides> {
    const trimmed = dedent(instruction);
    return this.next<TProvides>({ goal: trimmed }, "goal", [trimmed]);
  }

  after(target: Agent<any>): Agent<TProvides> {
    const targetSpec = specOf(target, "after");
    return this.next<TProvides>(
      { after: appendUnique(this.spec.after, targetSpec.id) },
      "after",
      [{ target: targetSpec.id }],
    );
  }

  asks(target: Agent<AgentProvides>, ask: string): Agent<TProvides> {
    const targetSpec = specOf(target, "asks");
    return this.next<TProvides>(
      { asks: [...this.spec.asks, { targetId: targetSpec.id, ask: dedent(ask) }] },
      "asks",
      [{ target: targetSpec.id, ask: dedent(ask) }],
    );
  }

  provides(label: string): Agent<AgentProvides> {
    return this.next<AgentProvides>({ provides: label }, "provides", [label]);
  }

  /** Not recorded in the chain: the function calls builder methods that record themselves. */
  apply<TOut extends ProvidesState = TProvides>(fn: AgentTransform<TProvides, TOut>): Agent<TOut> {
    return fn(this);
  }

  get artifact(): Artifact {
    return this.registry.artifact(this.spec);
  }
}

function specOf(target: Agent<any>, method: string): AgentSpec {
  if (!(target instanceof AgentImpl)) {
    throw new Error(`.${method}() expects an agent, but got ${describeValue(target)}`);
  }
  return target.spec;
}

function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  return typeof value;
}
