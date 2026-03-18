import Anthropic from "@anthropic-ai/sdk"
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages.js"
import { writeFileSync, mkdirSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { buildSystemPrompt, buildUserPrompt } from "./prompt.js"
import { parseGeneratedFiles, type ParsedFile } from "./parser.js"
import { runExpectations, type ExpectationResult } from "./expectations.js"
import type { NodeDefinition } from "./types.js"

export interface GenerateOptions {
  root: string
  model: string
  apiKey?: string
  maxRetries?: number
}

export interface GenerateResult {
  files: ParsedFile[]
  rawResponse: string
  attempts: number
}

export class GenerationError extends Error {
  constructor(
    public readonly failures: ExpectationResult[],
    public readonly attempts: number,
  ) {
    const msgs = failures
      .filter((r) => !r.pass)
      .map((r) => r.error)
      .join("; ")
    super(`Generation failed after ${attempts} attempt(s): ${msgs}`)
    this.name = "GenerationError"
  }
}

export async function generate(
  node: NodeDefinition,
  options: GenerateOptions,
): Promise<GenerateResult> {
  const maxRetries = options.maxRetries ?? 3
  const client = new Anthropic({
    apiKey: options.apiKey ?? process.env.ANTHROPIC_API_KEY,
  })

  const systemPrompt = buildSystemPrompt()
  const userPrompt = buildUserPrompt(node, options.root)

  const messages: MessageParam[] = [{ role: "user", content: userPrompt }]

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const response = await client.messages.create({
      model: options.model,
      max_tokens: 16384,
      temperature: 0,
      system: systemPrompt,
      messages,
    })

    const rawResponse = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")

    const files = parseGeneratedFiles(rawResponse)

    // Write files to disk
    for (const file of files) {
      const absPath = resolve(options.root, file.path)
      mkdirSync(dirname(absPath), { recursive: true })
      writeFileSync(absPath, file.content, "utf-8")
    }

    // Run expectations
    if (node.expectations.length === 0) {
      return { files, rawResponse, attempts: attempt }
    }

    const results = runExpectations(node.expectations, node.scopeFiles, options.root)
    const failures = results.filter((r) => !r.pass)

    if (failures.length === 0) {
      return { files, rawResponse, attempts: attempt }
    }

    // Last attempt — throw
    if (attempt === maxRetries) {
      throw new GenerationError(failures, attempt)
    }

    // Append assistant response + failure feedback for retry
    messages.push({ role: "assistant", content: rawResponse })
    messages.push({
      role: "user",
      content: buildFailureFeedback(failures),
    })
  }

  // Unreachable, but TypeScript needs it
  throw new Error("Unexpected end of retry loop")
}

function buildFailureFeedback(failures: ExpectationResult[]): string {
  const lines = [
    "The generated code did not meet the following expectations:",
    "",
  ]
  for (const failure of failures) {
    lines.push(`- ${failure.error}`)
  }
  lines.push("")
  lines.push(
    "Please regenerate the files, fixing these issues. Output the complete files again using the same === FILE: path === format.",
  )
  return lines.join("\n")
}
