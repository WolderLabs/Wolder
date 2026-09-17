import type {
  AgentDoesNotProvideAnything,
  AgentProvides,
  Artifact,
  ProvidesState,
  ScopedAgent,
} from "./types.js";
import type { AgentSpec, Registry } from "./program.js";
import { appendUnique, dedent } from "./util.js";
import { normalizeRegion } from "./region.js";

/**
 * An immutable agent specification.
 *
 * Declaring one registers a spec and returns a handle — synchronously. Nothing
 * runs until `w.build()`, so there is deliberately no `await` here: an awaited
 * declaration could only ever resolve to a placeholder, and a promise that cannot
 * keep its promise should not look like one.
 */
export class ScopedAgentImpl<TProvides extends ProvidesState = AgentDoesNotProvideAnything>
  implements ScopedAgent<TProvides>
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
  ): ScopedAgentImpl<T> {
    return new ScopedAgentImpl<T>(
      this.registry,
      this.registry.derive(this.spec, patch, { method, args }),
    );
  }

  canWrite(region: string): ScopedAgent<TProvides> {
    const normalized = normalizeRegion(region);
    return this.next<TProvides>(
      { regions: appendUnique(this.spec.regions, normalized) },
      "canWrite",
      [normalized],
    );
  }

  context(text: string): ScopedAgent<TProvides> {
    const trimmed = dedent(text);
    return this.next<TProvides>(
      { contexts: [...this.spec.contexts, trimmed] },
      "context",
      [trimmed],
    );
  }

  act(instruction: string): ScopedAgent<TProvides> {
    const trimmed = dedent(instruction);
    return this.next<TProvides>({ instruction: trimmed }, "act", [trimmed]);
  }

  uses(target: ScopedAgent<any>): ScopedAgent<TProvides> {
    const targetSpec = specOf(target, "uses");
    return this.next<TProvides>(
      { uses: appendUnique(this.spec.uses, targetSpec.id) },
      "uses",
      [{ target: targetSpec.id }],
    );
  }

  requests(target: ScopedAgent<AgentProvides>, ask: string): ScopedAgent<TProvides> {
    const targetSpec = specOf(target, "requests");
    return this.next<TProvides>(
      { requests: [...this.spec.requests, { targetId: targetSpec.id, ask: dedent(ask) }] },
      "requests",
      [{ target: targetSpec.id, ask: dedent(ask) }],
    );
  }

  provides(label: string): ScopedAgent<AgentProvides> {
    return this.next<AgentProvides>({ provides: label }, "provides", [label]);
  }

  get artifact(): Artifact {
    return this.registry.artifact(this.spec);
  }
}

function specOf(target: ScopedAgent<any>, method: string): AgentSpec {
  if (!(target instanceof ScopedAgentImpl)) {
    throw new Error(`.${method}() expects a scoped agent, but got ${describeValue(target)}`);
  }
  return target.spec;
}

function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  return typeof value;
}
