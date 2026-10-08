import type { GraphDiagnostic } from "./serialize.js";
import type { BoundaryOwner } from "./types.js";

/** A problem found before any generation token is spent. */
export class GraphError extends Error {
  /** The same problem as data: the first line, who is involved, and the advice. */
  readonly diagnostic: GraphDiagnostic;

  constructor(message: string, info: Omit<GraphDiagnostic, "message"> = { agents: [] }) {
    super(message);
    this.name = "GraphError";
    // `.message` stays the full text so CLI output is unchanged; the diagnostic splits
    // it at the first line break into the problem and the "what you probably want".
    const [head = message, ...rest] = message.split("\n");
    this.diagnostic = {
      message: head,
      ...info,
      hint: info.hint ?? (rest.length > 0 ? rest.join("\n") : undefined),
    };
  }
}

/** An agent tried to write outside the region it claimed. */
export class RegionViolationError extends Error {
  constructor(
    readonly nodeId: string,
    readonly path: string,
    readonly regions: readonly string[],
  ) {
    super(
      `${nodeId} tried to write "${path}", which is outside its writable region ` +
        `(${regions.join(", ")}).\n` +
        `If it needs something from another agent's region, express that with ` +
        `.after() or .asks() instead of widening .owns().`,
    );
    this.name = "RegionViolationError";
  }
}

/** Two agents could not settle a contract within the round cap. */
export class NegotiationError extends Error {
  constructor(
    readonly participants: readonly string[],
    readonly transcript: readonly { speaker: string; text: string }[],
    detail: string,
  ) {
    const exchange = transcript
      .slice(-2)
      .map((turn) => `  ${turn.speaker}: ${turn.text}`)
      .join("\n");
    super(
      `Contract negotiation between ${participants.join(" and ")} did not settle: ${detail}\n` +
        (exchange ? `Last exchange:\n${exchange}` : ""),
    );
    this.name = "NegotiationError";
  }
}

/** A layer gate kept failing over an agent's region. */
export class GateError extends Error {
  constructor(
    readonly nodeId: string,
    readonly gateName: string,
    readonly output: string,
    readonly attempts: number,
  ) {
    super(
      `${nodeId} failed the "${gateName}" gate after ${attempts} attempt(s):\n${output}`,
    );
    this.name = "GateError";
  }
}

/**
 * An agent called `request_path`: it believes it must write a path outside its
 * regions. That is never granted — a region has exactly one owner, and boundaries do
 * not widen at runtime — so the node, and the run, ends here. The message is for
 * whoever reads it next: the developer at the terminal, or a planning agent in the
 * inspector that can edit the program.
 */
export class BoundaryRequestError extends Error {
  constructor(
    readonly nodeId: string,
    readonly path: string,
    readonly reason: string,
    readonly regions: readonly string[],
    readonly owner?: BoundaryOwner,
  ) {
    const own = regions.join(", ");
    const lines: string[] = [];
    if (owner) {
      lines.push(
        `${nodeId} asked to write "${path}", which is outside its writable region (${own}) ` +
          `and owned by ${owner.id}.`,
        `  Reason given: ${reason}`,
        `  ${owner.id} (owns ${owner.regions.join(", ")}) is responsible for: ${summarise(owner.goal)}`,
        `Boundaries do not widen at runtime — a region has exactly one owner — so the request ` +
          `was not granted and the run was stopped. To fix the program:`,
        `  - If ${nodeId} needs what ${owner.id} produces, declare the dependency: ` +
          `.asks(${owner.id}, "what you need") to settle content or a contract, or ` +
          `.after(${owner.id}) if it only needs the finished files to exist first.`,
        `  - If the behaviour belongs to ${owner.id}, move that responsibility into its goal ` +
          `and out of ${nodeId}'s.`,
      );
    } else {
      lines.push(
        `${nodeId} asked to write "${path}", which is outside its writable region (${own}) ` +
          `and no agent owns it.`,
        `  Reason given: ${reason}`,
        `Boundaries do not widen at runtime, so the request was not granted and the run was ` +
          `stopped. To fix the program:`,
        `  - If ${nodeId} should own it, add it to the agent: .owns("${path}").`,
        `  - If it is a separate responsibility, declare a new agent that .owns("${path}"), ` +
          `then connect it with .asks() (content or contract) or .after() (ordering).`,
      );
    }
    lines.push(
      `  - If ${nodeId} simply misunderstood its boundary, tighten its goal so it asks only ` +
        `for work that lives in ${own}.`,
    );
    super(lines.join("\n"));
    this.name = "BoundaryRequestError";
  }
}

function summarise(goal: string): string {
  const flat = goal.replace(/\s+/g, " ").trim();
  return flat.length <= 300 ? flat : `${flat.slice(0, 299)}…`;
}
