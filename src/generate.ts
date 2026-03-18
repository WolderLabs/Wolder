import Anthropic from "@anthropic-ai/sdk"
import { writeFileSync, mkdirSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { buildSystemPrompt, buildUserPrompt } from "./prompt.js"
import { parseGeneratedFiles, type ParsedFile } from "./parser.js"
import type { NodeDefinition } from "./types.js"

export interface GenerateOptions {
  root: string
  model: string
  apiKey?: string
}

export interface GenerateResult {
  files: ParsedFile[]
  rawResponse: string
}

export async function generate(
  node: NodeDefinition,
  options: GenerateOptions,
): Promise<GenerateResult> {
  const client = new Anthropic({
    apiKey: options.apiKey ?? process.env.ANTHROPIC_API_KEY,
  })

  const systemPrompt = buildSystemPrompt()
  const userPrompt = buildUserPrompt(node, options.root)

  const response = await client.messages.create({
    model: options.model,
    max_tokens: 16384,
    temperature: 0,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
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

  return { files, rawResponse }
}
