import Anthropic from "@anthropic-ai/sdk";
import type { ChatFn } from "./negotiate.js";

/** The default negotiation transport: one non-agentic model call per turn. */
export function createAnthropicChat(model: string, apiKey?: string): ChatFn {
  let client: Anthropic | undefined;

  return async ({ system, messages, maxTokens }) => {
    client ??= new Anthropic({ apiKey: apiKey || process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens ?? 4096,
      temperature: 0,
      system,
      messages,
    });
    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");
  };
}
