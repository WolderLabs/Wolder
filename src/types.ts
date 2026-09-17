/**
 * Wolder v2 — public types.
 *
 * A program is a graph of *agents with boundaries*. A layer is an immutable value
 * carrying context and included files; agents spawn from a layer, own a writable
 * region, and relate to each other through `uses` and `requests` edges. Nothing
 * executes until `w.build()`.
 */

export interface WolderConfig {
  model?: string;
  apiKey?: string;
  maxRetries?: number;
  manifestPath?: string;
  /** Maximum request/offer exchanges before a contract negotiation is abandoned. */
  negotiationRounds?: number;
  /** Maximum agent turns per generation run. */
  maxTurns?: number;
}

export interface WolderOptions {
  root: string;
  model: string;
  config?: WolderConfig;
  /**
   * Overrides the machinery that talks to models. Exists so programs and tests can
   * run a graph end to end without an LLM; production runs leave it unset.
   */
  services?: Partial<WolderServices>;
}

/** Everything in a build that reaches a model. Injectable as a unit. */
export interface WolderServices {
  runner: AgentRunner;
  negotiator: Negotiator;
}

export interface WolderInstance {
  /** A fresh, empty layer. */
  layer(): Layer;
  /** Assemble the declared graph, check it, and execute it. The one await in a program. */
  build(options?: BuildOptions): Promise<BuildResult>;
}

/* ------------------------------------------------------------------ layers */

/**
 * A layer is a persistent value. Every method returns a **new** layer; the
 * receiver is never modified. Derivation is monotonic — context accumulates in
 * declaration order and there is no way to remove what a parent contributed.
 */
export interface Layer {
  /** Append prose. Derived layers carry parent context plus their own, in order. */
  context(text: string): Layer;
  /** Include a developer-owned file as read-only context. Accumulates as a set. */
  includeFile(path: string): Layer;
  /**
   * A shell command run over an agent's writable region after it generates.
   * A non-zero exit sends the output back to the agent for another attempt.
   */
  gate(command: string, options?: GateOptions): Layer;
  /** Apply a layer→layer function. Sugar for `fn(layer)` that keeps a chain reading left-to-right. */
  apply(fn: LayerTransform): Layer;
  /** Spawn an agent builder inheriting this layer's whole accumulated state. */
  scopedAgent(): ScopedAgent;
}

export type LayerTransform = (layer: Layer) => Layer;

export interface GateOptions {
  /** Shown in progress output and in feedback to the agent. Defaults to the command. */
  name?: string;
}

export interface Gate {
  readonly command: string;
  readonly name: string;
}

/** The flattened state a layer hands to the agents spawned from it. */
export interface LayerState {
  readonly contexts: readonly string[];
  readonly includedFiles: readonly string[];
  readonly gates: readonly Gate[];
}

/* ------------------------------------------------------- provides branding */

declare const providesTag: unique symbol;

/** The state of an agent that has declared `.provides(...)`. */
export interface AgentProvides {
  readonly [providesTag]: "provides";
}

/** The state of an agent that has not. Named so the compile error explains itself. */
export interface AgentDoesNotProvideAnything {
  readonly [providesTag]: "agent does not provide anything — call .provides(label) on it first";
}

export type ProvidesState = AgentProvides | AgentDoesNotProvideAnything;

/* ------------------------------------------------------------ scoped agent */

/**
 * An immutable agent specification. Declaring one does **not** run it, and
 * declaring is synchronous — there is no await on a `scopedAgent`.
 *
 * Every method returns a new value, so a partially-applied agent is a reusable
 * template: derive from it as many times as you like and each derivation becomes
 * its own node. A value that is never derived from and that has an `.act()` is
 * the node; a value that is derived from is a template, not a node.
 */
export interface ScopedAgent<TProvides extends ProvidesState = AgentDoesNotProvideAnything> {
  /** Phantom. Never read at runtime. */
  readonly _provides: TProvides;

  /** Claim a writable region — a file, a directory, or a glob. Nothing outside it is writable. */
  canWrite(region: string): ScopedAgent<TProvides>;
  /** Extra prose for this agent only, on top of its layer's context. */
  context(text: string): ScopedAgent<TProvides>;
  /** The generation instruction. */
  act(instruction: string): ScopedAgent<TProvides>;
  /** A hard dependency: the target runs first and its files become this agent's context. */
  uses(target: ScopedAgent<any>): ScopedAgent<TProvides>;
  /**
   * Ask a provider for something it owns. The two agents negotiate a contract
   * before either generates, and the settled contract is injected into both.
   * A content edge, not an ordering one — the target may be declared later.
   */
  requests(target: ScopedAgent<AgentProvides>, ask: string): ScopedAgent<TProvides>;
  /** Label what this agent holds up for others. Required before anything can `.requests()` it. */
  provides(label: string): ScopedAgent<AgentProvides>;

  /** The result of this node's run. Throws if read before `w.build()` resolves. */
  readonly artifact: Artifact;
}

/* ---------------------------------------------------------------- results */

/**
 * A runtime handle on what a node produced. v2 has no expectation API, so there
 * are no compile-time member names here — the agent decides what exists.
 */
export interface Artifact {
  readonly kind: "artifact";
  readonly id: string;
  readonly outputHash: string;
  /** Paths actually written, discovered after the run. */
  readonly files: readonly string[];
  readonly provides?: string;
}

export interface BuildOptions {
  /** Report progress. Defaults to console output. */
  reporter?: Reporter;
  /** Ignore the manifest and regenerate every node. */
  force?: boolean;
}

export interface BuildResult {
  readonly artifacts: readonly Artifact[];
  readonly contracts: readonly Contract[];
  /** Node ids served from cache. */
  readonly skipped: readonly string[];
  readonly durationMs: number;
}

/* ------------------------------------------------------------------ graph */

/** The frozen specification of one agent, as the graph sees it. */
export interface AgentNode {
  readonly id: string;
  readonly label: string;
  readonly layer: LayerState;
  readonly regions: readonly string[];
  readonly instruction: string;
  readonly contexts: readonly string[];
  readonly uses: readonly string[];
  readonly requests: readonly RequestEdge[];
  readonly provides?: string;
  /** Hash of the entire builder chain that produced this node. */
  readonly chainHash: string;
}

export interface RequestEdge {
  readonly targetId: string;
  readonly ask: string;
}

/* -------------------------------------------------------------- contracts */

/** One agreed point in a contract. Structured, not prose, so it diffs cheaply. */
export interface ContractTerm {
  readonly name: string;
  readonly detail: string;
}

/**
 * The settled outcome of one provider's negotiation with every agent that
 * requested something of it. A first-class artifact: recorded in the manifest,
 * a cache input to every participant.
 */
export interface Contract {
  readonly id: string;
  /** Node id of the provider. */
  readonly provider: string;
  /** The provider's `.provides()` label. */
  readonly label: string;
  /** Node ids of the requesters, provider excluded. */
  readonly requesters: readonly string[];
  readonly summary: string;
  readonly terms: readonly ContractTerm[];
  /** Files the provider commits to, written into its own region before it runs. */
  readonly files: readonly ContractFile[];
  readonly hash: string;
}

export interface ContractFile {
  readonly path: string;
  readonly content: string;
}

export interface NegotiationRequest {
  readonly provider: NegotiationParty;
  readonly requesters: readonly NegotiationRequester[];
  readonly maxRounds: number;
  readonly model: string;
  readonly apiKey?: string;
}

export interface NegotiationParty {
  readonly id: string;
  readonly label: string;
  readonly context: string;
  readonly instruction: string;
  readonly regions: readonly string[];
}

export interface NegotiationRequester extends NegotiationParty {
  readonly ask: string;
}

export interface NegotiationOutcome {
  readonly summary: string;
  readonly terms: readonly ContractTerm[];
  readonly files: readonly ContractFile[];
  /** The exchange, kept for the error message when agreement is not reached. */
  readonly transcript: readonly NegotiationTurn[];
}

export interface NegotiationTurn {
  readonly speaker: string;
  readonly text: string;
}

export interface Negotiator {
  negotiate(request: NegotiationRequest): Promise<NegotiationOutcome>;
}

/* ----------------------------------------------------------- agent runner */

export interface AgentRunRequest {
  readonly nodeId: string;
  readonly root: string;
  readonly model: string;
  readonly apiKey?: string;
  readonly systemPrompt: string;
  readonly prompt: string;
  /** Normalized globs. The runner must refuse every write outside these. */
  readonly regions: readonly string[];
  readonly maxTurns: number;
}

export interface AgentRunResult {
  /** Root-relative paths the agent actually wrote. */
  readonly files: readonly string[];
  readonly text: string;
}

export interface AgentRunner {
  run(request: AgentRunRequest): Promise<AgentRunResult>;
}

/* -------------------------------------------------------------- reporting */

export interface Reporter {
  phase(name: string): void;
  nodeStart(id: string, detail?: string): void;
  nodeSkipped(id: string, reason: string): void;
  nodeDone(id: string, files: readonly string[]): void;
  note(message: string): void;
  warn(message: string): void;
  summary(result: BuildResult): void;
}
