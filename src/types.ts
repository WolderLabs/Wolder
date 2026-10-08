import type { GraphDiagnostic, SerializedGraph } from "./serialize.js";

/**
 * Wolder v2 — public types.
 *
 * A program is a graph of *agents with boundaries*. A layer is an immutable value
 * carrying context and included files; agents spawn from a layer, own a writable
 * region, and relate to each other through `after` and `asks` edges. Nothing
 * executes until `w.run()`.
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
  /** How many run records to keep under `.wolder/runs`. Default 20. */
  keepRuns?: number;
  /** Model for the inspector's chat agent. Empty or unset means `model`. */
  inspectorModel?: string;
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
  /** Answers `ask_owner`: speaks as the agent that owns a path. */
  ownerConsultant: OwnerConsultant;
}

export interface WolderInstance {
  /** A fresh, empty layer. */
  layer(): Layer;
  /** Assemble the declared graph, check it, and execute it. The one await in a program. */
  run(options?: RunOptions): Promise<RunResult>;
  /** Assemble and check the graph without running it. Never touches a model. */
  assemble(): AssembleOutcome;
  /**
   * Dry run: assemble, then say which nodes and contracts the next `run` would redo
   * and why. Never touches a model, writes no file and leaves the manifest alone.
   */
  plan(options?: { force?: boolean }): PlanOutcome;
}

/** What the next run would do with one node or contract. */
export interface PlanEntry {
  readonly status: "fresh" | "stale" | "never";
  /** Why it would run; empty when fresh. */
  readonly reasons: readonly string[];
}

export interface Plan {
  readonly nodes: Readonly<Record<string, PlanEntry>>;
  /** Keyed by contract id, `contract:<provider>`. */
  readonly contracts: Readonly<Record<string, PlanEntry>>;
}

export type PlanOutcome =
  | { ok: true; graph: SerializedGraph; plan: Plan }
  | { ok: false; diagnostic: GraphDiagnostic };

/** The result of assembling a program without running it. */
export type AssembleOutcome =
  | { ok: true; graph: SerializedGraph }
  | { ok: false; diagnostic: GraphDiagnostic };

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
  include(path: string): Layer;
  /**
   * A shell command run over an agent's writable region after it generates.
   * A non-zero exit sends the output back to the agent for another attempt.
   */
  gate(command: string, options?: GateOptions): Layer;
  /** Apply a layer→layer function. Sugar for `fn(layer)` that keeps a chain reading left-to-right. */
  apply(fn: LayerTransform): Layer;
  /** Spawn an agent builder inheriting this layer's whole accumulated state. */
  agent(): Agent;
}

export type LayerTransform = (layer: Layer) => Layer;

export type AgentTransform<
  TIn extends ProvidesState = ProvidesState,
  TOut extends ProvidesState = TIn,
> = (agent: Agent<TIn>) => Agent<TOut>;

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

/* ------------------------------------------------------------agent */

/**
 * An immutable agent specification. Declaring one does **not** run it, and
 * declaring is synchronous — there is no await on an `agent`.
 *
 * Every method returns a new value, so a partially-applied agent is a reusable
 * template: derive from it as many times as you like and each derivation becomes
 * its own node. A value that is never derived from and that has a `.goal()` is
 * the node; a value that is derived from is a template, not a node.
 */
export interface Agent<TProvides extends ProvidesState = AgentDoesNotProvideAnything> {
  /** Phantom. Never read at runtime. */
  readonly _provides: TProvides;

  /** Claim a writable region — a file, a directory, or a glob. Nothing outside it is writable. */
  owns(region: string): Agent<TProvides>;
  /** Extra prose for this agent only, on top of its layer's context. */
  context(text: string): Agent<TProvides>;
  /** What this agent is to generate. */
  goal(instruction: string): Agent<TProvides>;
  /** A hard dependency: the target runs first and its files become this agent's context. */
  after(target: Agent<any>): Agent<TProvides>;
  /**
   * Ask a provider for something it owns. The two agents negotiate a contract
   * before either generates, and the settled contract is injected into both.
   * A content edge, not an ordering one — the target may be declared later.
   */
  asks(target: Agent<AgentProvides>, ask: string): Agent<TProvides>;
  /** Label what this agent holds up for others. Required before anything can `.asks()` it. */
  provides(label: string): Agent<AgentProvides>;
  /** Apply an agent->agent function. Sugar for `fn(agent)` that keeps a chain reading left-to-right. */
  apply<TOut extends ProvidesState = TProvides>(fn: AgentTransform<TProvides, TOut>): Agent<TOut>;

  /** The result of this node's run. Throws if read before `w.run()` resolves. */
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

export interface RunOptions {
  /** Report progress. Defaults to console output. */
  reporter?: Reporter;
  /** Ignore the manifest and regenerate every node. */
  force?: boolean;
  /** Write a run record under `.wolder/`. Default true. */
  record?: boolean;
}

export interface RunResult {
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
  readonly goal: string;
  readonly contexts: readonly string[];
  readonly after: readonly string[];
  readonly asks: readonly AskEdge[];
  readonly provides?: string;
  /** Hash of the entire builder chain that produced this node. */
  readonly chainHash: string;
}

export interface AskEdge {
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
  /** Called as the exchange progresses, so a long negotiation is not a silent one. */
  readonly onEvent?: (event: AgentEvent) => void;
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

/** A raw conversation turn, kept in full for inspection. The console ignores it. */
export type AgentTurn =
  | { readonly kind: "turn"; readonly role: "assistant"; readonly message: unknown }
  | { readonly kind: "turn"; readonly role: "tool"; readonly message: unknown };

/**
 * Something an agent did, surfaced while it is still working.
 *
 * Generation is slow enough that silence is indistinguishable from a hang. Every
 * one of these is a sign of life, and `retry` in particular explains a stall that
 * would otherwise look like one.
 */
export type AgentEvent =
  | AgentTurn
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "tool"; readonly name: string; readonly detail?: string }
  | {
      readonly kind: "denied";
      readonly name: string;
      readonly detail?: string;
      readonly reason: string;
    }
  | {
      readonly kind: "retry";
      readonly attempt: number;
      readonly maxAttempts: number;
      readonly delayMs: number;
      readonly reason: string;
    }
  | { readonly kind: "note"; readonly text: string };

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
  /**
   * Every other agent in the graph, so the runner can answer `who_owns`. Optional:
   * a runner that does not mount the boundary tools can ignore it.
   */
  readonly owners?: readonly BoundaryOwner[];
  /**
   * Puts a question to the agent that owns a path and returns its answer. Backs
   * `ask_owner`. Optional: a runner that does not mount the boundary tools can ignore it.
   */
  readonly consultOwner?: (owner: BoundaryOwner, question: string) => Promise<string>;
  /** Called as the agent works. Nothing depends on it — it exists to break the silence. */
  readonly onEvent?: (event: AgentEvent) => void;
}

export interface AgentRunResult {
  /** Root-relative paths the agent actually wrote. */
  readonly files: readonly string[];
  readonly text: string;
  /**
   * Set when the agent called `request_path`. The runner has stopped the session;
   * the orchestrator fails the run with a `BoundaryRequestError`.
   */
  readonly boundaryRequest?: BoundaryRequest;
}

/** Another agent, as seen from the boundary: who it is, what it is for, what it owns. */
export interface BoundaryOwner {
  readonly id: string;
  readonly goal: string;
  readonly regions: readonly string[];
  /** The owner's layer and agent context, for answering as it. */
  readonly context?: string;
}

/** An agent's request to write a path outside its regions. Never granted. */
export interface BoundaryRequest {
  readonly path: string;
  readonly reason: string;
  /** The requesting agent's own advice on how the program (or its goal) should change. */
  readonly recommendation: string;
  /** What the owning agent said when consulted about this path, in order. */
  readonly advice?: readonly OwnerAdvice[];
}

/** One `ask_owner` exchange. */
export interface OwnerAdvice {
  readonly owner: string;
  readonly question: string;
  readonly answer: string;
}

/** A question put to the agent that owns a path, with what that agent needs to answer as itself. */
export interface OwnerConsultRequest {
  readonly owner: BoundaryOwner;
  /** The agent asking. */
  readonly asker: { readonly id: string; readonly goal: string; readonly regions: readonly string[] };
  readonly question: string;
  /** Read-only snapshot of what currently exists in the owner's region. */
  readonly existing: ReadonlyArray<{ readonly path: string; readonly content: string }>;
}

export interface OwnerConsultant {
  consult(request: OwnerConsultRequest): Promise<string>;
}

export interface AgentRunner {
  run(request: AgentRunRequest): Promise<AgentRunResult>;
}

/* -------------------------------------------------------------- reporting */

/** The outcome of one gate run over an agent's region. */
export interface GateReport {
  readonly name: string;
  readonly command: string;
  readonly pass: boolean;
  readonly output: string;
  readonly attempt: number;
}

export interface Reporter {
  phase(name: string): void;
  nodeStart(id: string, detail?: string): void;
  /** Live progress from a node that is still working. */
  nodeEvent(id: string, event: AgentEvent): void;
  nodeSkipped(id: string, reason: string): void;
  nodeDone(id: string, files: readonly string[]): void;
  note(message: string): void;
  warn(message: string): void;
  summary(result: RunResult): void;
  /** The prompt an agent is about to receive. Optional so fakes keep compiling. */
  nodePrompt?(id: string, prompt: { system: string; user: string; attempt: number }): void;
  gate?(id: string, report: GateReport): void;
  failed?(error: Error): void;
  /** A contract negotiated this run, with the full exchange that produced it. */
  contractSettled?(contract: Contract, transcript: readonly NegotiationTurn[]): void;
  /** The checked graph, right after assembly. */
  graphAssembled?(graph: SerializedGraph): void;
}
