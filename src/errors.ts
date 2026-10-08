import type { GraphDiagnostic } from "./serialize.js";

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
