/** A problem found before any generation token is spent. */
export class GraphError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphError";
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
        `.uses() or .requests() instead of widening .canWrite().`,
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
