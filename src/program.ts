import type { Artifact, LayerState, RequestEdge } from "./types.js";

/** One link in a builder chain, kept verbatim so the whole chain can be hashed. */
export interface ChainEntry {
  readonly method: string;
  readonly args: readonly unknown[];
}

/**
 * The immutable specification behind one `ScopedAgent` value.
 *
 * Every builder method produces a new spec whose `parentId` is the value it was
 * derived from. That is what makes templates work: a spec that has been derived
 * from is a template, and only the specs nothing was derived from are nodes.
 */
export interface AgentSpec {
  readonly id: string;
  readonly parentId?: string;
  readonly layer: LayerState;
  readonly regions: readonly string[];
  readonly instruction?: string;
  readonly contexts: readonly string[];
  readonly uses: readonly string[];
  readonly requests: readonly RequestEdge[];
  readonly provides?: string;
  readonly chain: readonly ChainEntry[];
}

/**
 * The declaration-time record of a program. Holds every spec ever created, which
 * of them were derived from, and — once `build()` has run — each node's artifact.
 */
export class Registry {
  private readonly specs = new Map<string, AgentSpec>();
  private readonly derivedFrom = new Set<string>();
  private readonly artifacts = new Map<string, Artifact>();
  private counter = 0;
  private built = false;

  create(layer: LayerState): AgentSpec {
    const spec: AgentSpec = {
      id: `a${++this.counter}`,
      layer,
      regions: [],
      contexts: [],
      uses: [],
      requests: [],
      chain: [{ method: "scopedAgent", args: [] }],
    };
    this.specs.set(spec.id, spec);
    return spec;
  }

  derive(from: AgentSpec, patch: Partial<AgentSpec>, entry: ChainEntry): AgentSpec {
    this.derivedFrom.add(from.id);
    const spec: AgentSpec = {
      ...from,
      ...patch,
      id: `a${++this.counter}`,
      parentId: from.id,
      chain: [...from.chain, entry],
    };
    this.specs.set(spec.id, spec);
    return spec;
  }

  get(id: string): AgentSpec | undefined {
    return this.specs.get(id);
  }

  wasDerivedFrom(id: string): boolean {
    return this.derivedFrom.has(id);
  }

  /**
   * The specs that are nodes: never derived from, and carrying an instruction.
   * A leaf with no `.act()` is an unused template, not a node.
   */
  nodes(): AgentSpec[] {
    return [...this.specs.values()].filter(
      (spec) => !this.derivedFrom.has(spec.id) && spec.instruction !== undefined,
    );
  }

  setArtifact(specId: string, artifact: Artifact): void {
    this.artifacts.set(specId, artifact);
  }

  markBuilt(): void {
    this.built = true;
  }

  artifact(spec: AgentSpec): Artifact {
    const found = this.artifacts.get(spec.id);
    if (found) return found;

    const label = describe(spec);
    if (!this.built) {
      throw new Error(
        `${label} has no artifact yet — nothing runs until "await w.build()".\n` +
          `Declaring an agent registers it; the files it writes only exist after the build.\n` +
          `Move anything that reads .artifact to after the build.`,
      );
    }
    if (this.derivedFrom.has(spec.id)) {
      throw new Error(
        `${label} is a template, not a node — something was derived from it, so it never ran.\n` +
          `Read .artifact on the value at the end of the chain instead.`,
      );
    }
    throw new Error(
      `${label} never ran: it has no .act() instruction, so the build treated it as an unused template.`,
    );
  }
}

export function describe(spec: AgentSpec): string {
  if (spec.provides) return `Agent "${spec.provides}"`;
  if (spec.regions.length > 0) return `Agent writing ${spec.regions.join(", ")}`;
  return `Agent ${spec.id}`;
}
