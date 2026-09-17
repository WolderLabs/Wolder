import { describe, it, expect } from "vitest";
import { createNegotiator, parseJson, type ChatFn } from "./negotiate.js";
import { NegotiationError } from "./errors.js";
import type { NegotiationRequest } from "./types.js";

function request(overrides: Partial<NegotiationRequest> = {}): NegotiationRequest {
  return {
    provider: {
      id: "package.json",
      label: "NPM dependencies",
      context: "A todo service.",
      instruction: "Initialise an NPM project.",
      regions: ["package.json"],
    },
    requesters: [
      {
        id: "src/controllers/**",
        label: "Todo API",
        context: "A todo service.",
        instruction: "Write a controller.",
        regions: ["src/controllers/**"],
        ask: "A framework like Express.js",
      },
    ],
    maxRounds: 3,
    model: "test-model",
    ...overrides,
  };
}

/** A scripted model. Nothing here reaches the network. */
function scripted(replies: string[]): ChatFn & { prompts: string[]; systems: string[] } {
  const prompts: string[] = [];
  const systems: string[] = [];
  let index = 0;
  const fn: ChatFn = async ({ system, messages }) => {
    systems.push(system);
    prompts.push(messages.map((m) => m.content).join("\n"));
    return replies[index++] ?? "";
  };
  return Object.assign(fn, { prompts, systems });
}

const ACCEPT = JSON.stringify({ accepted: true, response: "That works." });
const SETTLE = JSON.stringify({
  summary: "The package agent installs express@5.0.0; the controller imports it.",
  terms: [{ name: "express", detail: "express@5.0.0 in dependencies" }],
  files: [{ path: "package.json", content: '{"dependencies":{"express":"^5.0.0"}}' }],
});

describe("settling a contract", () => {
  it("runs offer → reply → write-it-down and returns the structured result", async () => {
    const chat = scripted(["I will install express@5.0.0.", ACCEPT, SETTLE]);
    const outcome = await createNegotiator(chat).negotiate(request());

    expect(chat.prompts).toHaveLength(3);
    expect(outcome.summary).toContain("express@5.0.0");
    expect(outcome.terms).toEqual([{ name: "express", detail: "express@5.0.0 in dependencies" }]);
    expect(outcome.files[0]!.path).toBe("package.json");
  });

  it("stops as soon as the requester accepts", async () => {
    const chat = scripted(["offer", ACCEPT, SETTLE]);
    const outcome = await createNegotiator(chat).negotiate(request({ maxRounds: 5 }));
    expect(outcome.transcript).toHaveLength(2);
  });

  it("keeps going while the requester says something is missing", async () => {
    const chat = scripted([
      "A framework.",
      JSON.stringify({ accepted: false, response: "Which one, and at what version?" }),
      "express@5.0.0.",
      ACCEPT,
      SETTLE,
    ]);
    const outcome = await createNegotiator(chat).negotiate(request());

    expect(outcome.transcript.map((t) => t.speaker)).toEqual([
      "package.json",
      "src/controllers/**",
      "package.json",
      "src/controllers/**",
    ]);
    expect(outcome.summary).toContain("express");
  });

  it("shows both sides everything — context, instruction, region and ask", async () => {
    const chat = scripted(["offer", ACCEPT, SETTLE]);
    await createNegotiator(chat).negotiate(request());

    for (const prompt of chat.prompts) {
      expect(prompt).toContain("Initialise an NPM project.");
      expect(prompt).toContain("Write a controller.");
      expect(prompt).toContain("A framework like Express.js");
      expect(prompt).toContain("src/controllers/**");
    }
  });

  it("lays out every requester when a provider fans out", async () => {
    const chat = scripted(["offer", ACCEPT, SETTLE]);
    await createNegotiator(chat).negotiate(
      request({
        requesters: [
          {
            id: "src/services/**",
            label: "Todo Service",
            context: "",
            instruction: "Write a service.",
            regions: ["src/services/**"],
            ask: "Document Todo Service usage",
          },
          {
            id: "src/controllers/**",
            label: "Todo API",
            context: "",
            instruction: "Write a controller.",
            regions: ["src/controllers/**"],
            ask: "Document the API",
          },
        ],
      }),
    );

    expect(chat.prompts[0]).toContain("Document Todo Service usage");
    expect(chat.prompts[0]).toContain("Document the API");
  });
});

describe("when the parties cannot agree", () => {
  it("fails at the round cap rather than generating against a non-agreement", async () => {
    const reject = JSON.stringify({ accepted: false, response: "Still too vague." });
    const chat = scripted(["offer", reject, "offer", reject]);

    await expect(createNegotiator(chat).negotiate(request({ maxRounds: 2 }))).rejects.toThrow(
      NegotiationError,
    );
  });

  it("names the participants and quotes the last exchange", async () => {
    const reject = JSON.stringify({ accepted: false, response: "Still too vague." });
    const chat = scripted(["my offer", reject]);

    await expect(
      createNegotiator(chat).negotiate(request({ maxRounds: 1 })),
    ).rejects.toThrow(/package\.json and src\/controllers\/\*\*/);
    const retry = scripted(["my offer", reject]);
    await expect(
      createNegotiator(retry).negotiate(request({ maxRounds: 1 })),
    ).rejects.toThrow(/Still too vague/);
  });

  it("fails when the agreement cannot be written down", async () => {
    const chat = scripted(["offer", ACCEPT, "I am afraid I cannot do that."]);
    await expect(createNegotiator(chat).negotiate(request())).rejects.toThrow(
      /could not be written down/,
    );
  });

  it("treats an unparseable reply as a refusal rather than an acceptance", async () => {
    const chat = scripted(["offer", "sure, sounds good", "offer", "yes fine"]);
    await expect(createNegotiator(chat).negotiate(request({ maxRounds: 2 }))).rejects.toThrow(
      NegotiationError,
    );
  });

  it("drops malformed terms and files instead of passing them on", async () => {
    const chat = scripted([
      "offer",
      ACCEPT,
      JSON.stringify({
        summary: "ok",
        terms: [{ name: "good", detail: "fine" }, { name: "bad" }],
        files: [{ path: "package.json" }, { path: "a.json", content: "{}" }],
      }),
    ]);
    const outcome = await createNegotiator(chat).negotiate(request());

    expect(outcome.terms).toEqual([{ name: "good", detail: "fine" }]);
    expect(outcome.files).toEqual([{ path: "a.json", content: "{}" }]);
  });
});

describe("parseJson", () => {
  it("reads bare JSON", () => {
    expect(parseJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it("reads JSON out of a fenced block", () => {
    expect(parseJson<{ a: number }>('Sure:\n```json\n{"a":1}\n```\n')).toEqual({ a: 1 });
  });

  it("reads JSON surrounded by prose", () => {
    expect(parseJson<{ a: number }>('Here you go: {"a":1} — hope that helps')).toEqual({ a: 1 });
  });

  it("returns null when there is no JSON to find", () => {
    expect(parseJson("no json here")).toBeNull();
    expect(parseJson("{not json}")).toBeNull();
  });
});
