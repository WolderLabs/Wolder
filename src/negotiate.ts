import type {
  ContractFile,
  ContractTerm,
  NegotiationOutcome,
  NegotiationParty,
  NegotiationRequest,
  NegotiationRequester,
  NegotiationTurn,
  Negotiator,
} from "./types.js";
import { NegotiationError } from "./errors.js";

export type ChatMessage = { role: "user" | "assistant"; content: string };

/** The one thing in negotiation that touches a model. Swap it out to test the protocol. */
export type ChatFn = (params: {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
}) => Promise<string>;

/**
 * `.requests()` does not staple a sentence onto the target's prompt. The two
 * sides talk — the requesters state what they need, the provider states what it
 * can offer — until they settle on a contract, which is then injected into
 * everyone's instructions so all of them generate against the same agreed shape.
 *
 * Negotiation is per-provider over the whole set of inbound requests, not
 * per-edge: pairwise-only bargaining would produce conflicting agreements about
 * one file, and the README case is exactly several requesters settling one document.
 */
export function createNegotiator(chat: ChatFn): Negotiator {
  return {
    async negotiate(request: NegotiationRequest): Promise<NegotiationOutcome> {
      const transcript: NegotiationTurn[] = [];
      const participants = [
        request.provider.id,
        ...request.requesters.map((r) => r.id),
      ];
      const brief = describeParties(request);
      let accepted = false;

      for (let round = 1; round <= request.maxRounds && !accepted; round++) {
        const offer = await chat({
          system: PROVIDER_SYSTEM,
          messages: [{ role: "user", content: providerTurn(brief, transcript, round) }],
          maxTokens: 2048,
        });
        transcript.push({ speaker: request.provider.id, text: offer.trim() });

        const replyText = await chat({
          system: REQUESTER_SYSTEM,
          messages: [{ role: "user", content: requesterTurn(brief, transcript) }],
          maxTokens: 2048,
        });
        const reply = parseJson<{ accepted?: boolean; response?: string }>(replyText);
        const response = reply?.response?.trim() || replyText.trim();
        transcript.push({ speaker: requesterVoice(request), text: response });
        accepted = reply?.accepted === true;
      }

      if (!accepted) {
        throw new NegotiationError(
          participants,
          transcript,
          `no agreement after ${request.maxRounds} round(s). Generating against a ` +
            `non-agreement is worse than stopping, so the build stops here. Loosen the ` +
            `ask, or raise negotiationRounds in wolder.config.ts.`,
        );
      }

      const settledText = await chat({
        system: SETTLE_SYSTEM,
        messages: [{ role: "user", content: settleTurn(brief, transcript) }],
        maxTokens: 8192,
      });
      const settled = parseJson<{
        summary?: string;
        terms?: ContractTerm[];
        files?: ContractFile[];
      }>(settledText);

      if (!settled || typeof settled.summary !== "string") {
        throw new NegotiationError(
          participants,
          transcript,
          "the agreement could not be written down as a structured contract.",
        );
      }

      return {
        summary: settled.summary,
        terms: (settled.terms ?? []).filter(
          (t): t is ContractTerm => typeof t?.name === "string" && typeof t?.detail === "string",
        ),
        files: (settled.files ?? []).filter(
          (f): f is ContractFile =>
            typeof f?.path === "string" && typeof f?.content === "string",
        ),
        transcript,
      };
    },
  };
}

const PROVIDER_SYSTEM = `You are an agent that owns part of a codebase. Other agents need something from you that only you can write, because only you may write inside your region.

State concretely what you will provide: exact names, signatures, versions, file paths. Where a real file would settle the question better than a description, say so and describe the file you will write. Do not agree to anything outside your writable region, and do not ask the other agents to write inside it.

Reply with prose only. Be brief and specific.`;

const REQUESTER_SYSTEM = `You are one or more agents that asked another agent for something it owns. You have just been given its offer.

Accept when the offer is concrete enough that you could generate your own code against it without guessing. Otherwise say exactly what is still ambiguous.

Reply with JSON only:
{"accepted": true | false, "response": "<what you accept, or what is still missing>"}`;

const SETTLE_SYSTEM = `You write down an agreement that two or more agents have just reached, as a structured contract.

Record only what was actually agreed. Do not invent terms. Where the agreement is that the provider will write specific files, include their full contents — the provider writes them into its own region before it generates, so they must be complete and valid.

Reply with JSON only:
{
  "summary": "<one paragraph stating what was agreed>",
  "terms": [{"name": "<short label>", "detail": "<the specific commitment>"}],
  "files": [{"path": "<path inside the provider's region>", "content": "<full file content>"}]
}
"files" may be empty when the agreement is not about file contents.`;

function describeParties(request: NegotiationRequest): string {
  const lines = [
    `# Provider: ${request.provider.id} — "${request.provider.label}"`,
    "",
    `Writable region: ${request.provider.regions.join(", ")}`,
    "",
    "Its context:",
    request.provider.context || "(none)",
    "",
    "What it was told to do:",
    request.provider.instruction,
    "",
  ];
  for (const requester of request.requesters) {
    lines.push(
      `# Requester: ${requester.id}${requester.label ? ` — "${requester.label}"` : ""}`,
      "",
      `Writable region: ${requester.regions.join(", ")}`,
      "",
      "Its context:",
      requester.context || "(none)",
      "",
      "What it was told to do:",
      requester.instruction,
      "",
      "What it is asking the provider for:",
      requester.ask,
      "",
    );
  }
  return lines.join("\n");
}

function providerTurn(brief: string, transcript: NegotiationTurn[], round: number): string {
  return [
    brief,
    formatTranscript(transcript),
    round === 1
      ? "You are the provider. Make your offer."
      : "You are the provider. Answer what is still missing and revise your offer.",
  ]
    .filter(Boolean)
    .join("\n");
}

function requesterTurn(brief: string, transcript: NegotiationTurn[]): string {
  return [brief, formatTranscript(transcript), "You are the requester side. Respond."]
    .filter(Boolean)
    .join("\n");
}

function settleTurn(brief: string, transcript: NegotiationTurn[]): string {
  return [brief, formatTranscript(transcript), "Write the agreement down."]
    .filter(Boolean)
    .join("\n");
}

function formatTranscript(transcript: NegotiationTurn[]): string {
  if (transcript.length === 0) return "";
  return [
    "# Exchange so far",
    "",
    ...transcript.map((turn) => `${turn.speaker}:\n${turn.text}\n`),
  ].join("\n");
}

function requesterVoice(request: NegotiationRequest): string {
  return request.requesters.map((r) => r.id).join(" + ");
}

/** Models wrap JSON in prose and fences often enough to be worth tolerating. */
export function parseJson<T>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [fenced?.[1], text].filter((c): c is string => typeof c === "string");

  for (const candidate of candidates) {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end <= start) continue;
    try {
      return JSON.parse(candidate.slice(start, end + 1)) as T;
    } catch {
      continue;
    }
  }
  return null;
}

export type { NegotiationParty, NegotiationRequester };
