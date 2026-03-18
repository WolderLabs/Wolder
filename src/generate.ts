import Anthropic from "@anthropic-ai/sdk"
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages.js"
import { writeFileSync, mkdirSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { buildSystemPrompt, buildUserPrompt } from "./prompt.js"
import { parseGeneratedFiles, type ParsedFile } from "./parser.js"
import { runCoreExpectations } from "./expectations.js"
import type { NodeDefinition, ExpectationResult, PluginRunContext } from "./types.js"
import * as log from "./log.js"

export { type ExpectationResult }

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

  if (!options.apiKey && !process.env.ANTHROPIC_API_KEY) {
    log.error("No API key found. Set ANTHROPIC_API_KEY or pass apiKey in config.")
    throw new Error("Missing API key")
  }

  const pluginRunContext: PluginRunContext = {
    allExpectations: node.expectations,
    scopeFiles: node.scopeFiles,
    root: options.root,
    model: options.model,
    apiKey: options.apiKey,
  }

  // Run preGenerate hooks (e.g. TDD test-first generation)
  const preGeneratedInputs: Array<{ path: string; content: string }> = []
  for (const plugin of node.plugins) {
    if (plugin.preGenerate) {
      const ownExps = node.expectations.filter((e) =>
        plugin.expectationTypes.includes(e.type),
      )
      const result = await plugin.preGenerate(ownExps, pluginRunContext)
      if (result?.testFile) {
        const absPath = resolve(options.root, result.testFile.path)
        mkdirSync(dirname(absPath), { recursive: true })
        writeFileSync(absPath, result.testFile.content, "utf-8")
        log.info(`  Generated test file ${log.cyan(result.testFile.path)}`)
        preGeneratedInputs.push(result.testFile)
      }
    }
  }

  const client = new Anthropic({
    apiKey: options.apiKey ?? process.env.ANTHROPIC_API_KEY,
  })

  const systemPrompt = buildSystemPrompt()
  const userPrompt = buildUserPrompt(node, options.root, preGeneratedInputs)
  const nodeLabel = node.scopeFiles.join(", ")

  const messages: MessageParam[] = [{ role: "user", content: userPrompt }]

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    if (attempt === 1) {
      log.info(`Generating ${log.bold(nodeLabel)} ${log.dim(`[${options.model}]`)}`)
    } else {
      log.warn(`Retry ${attempt}/${maxRetries} for ${log.bold(nodeLabel)}`)
    }

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

    if (files.length === 0) {
      log.warn("LLM returned no file blocks — retrying")
      if (attempt === maxRetries) {
        throw new GenerationError(
          [{ expectation: { type: "file" }, pass: false, error: "No files were generated" }],
          attempt,
        )
      }
      messages.push({ role: "assistant", content: rawResponse })
      messages.push({
        role: "user",
        content:
          "You did not output any files. Please output the files using the === FILE: path === format.",
      })
      continue
    }

    // Write files to disk
    for (const file of files) {
      const absPath = resolve(options.root, file.path)
      mkdirSync(dirname(absPath), { recursive: true })
      writeFileSync(absPath, file.content, "utf-8")
      log.info(`  Wrote ${log.cyan(file.path)}`)
    }

    if (node.expectations.length === 0 && node.plugins.length === 0) {
      return { files, rawResponse, attempts: attempt }
    }

    log.info(`  Validating expectations...`)
    const results = await runAllExpectations(node, options, pluginRunContext)
    const failures = results.filter((r) => !r.pass)

    if (failures.length === 0) {
      log.success(`  All ${results.length} expectation(s) passed`)
      return { files, rawResponse, attempts: attempt }
    }

    for (const f of failures) {
      log.error(`  Failed: ${f.error}`)
    }

    if (attempt === maxRetries) {
      throw new GenerationError(failures, attempt)
    }

    messages.push({ role: "assistant", content: rawResponse })
    messages.push({
      role: "user",
      content: buildFailureFeedback(failures),
    })
  }

  throw new Error("Unexpected end of retry loop")
}

async function runAllExpectations(
  node: NodeDefinition,
  options: GenerateOptions,
  context: PluginRunContext,
): Promise<ExpectationResult[]> {
  const results: ExpectationResult[] = []

  // Core: file existence (language-agnostic)
  const fileExps = node.expectations.filter((e) => e.type === "file")
  const fileResults = runCoreExpectations(fileExps, node.scopeFiles, options.root)
  results.push(...fileResults)
  if (results.some((r) => !r.pass)) return results

  // Plugin expectations in registration order
  for (const plugin of node.plugins) {
    const ownExps = node.expectations.filter((e) => plugin.expectationTypes.includes(e.type))
    if (ownExps.length === 0) continue
    const pluginResults = await plugin.runExpectations(ownExps, context)
    results.push(...pluginResults)
    if (results.some((r) => !r.pass)) return results
  }

  return results
}

function buildFailureFeedback(failures: ExpectationResult[]): string {
  const lines = ["The generated code did not meet the following expectations:", ""]
  for (const failure of failures) {
    lines.push(`- ${failure.error}`)
  }
  lines.push("")
  lines.push(
    "Please regenerate the files, fixing these issues. Output the complete files again using the same === FILE: path === format.",
  )
  return lines.join("\n")
}
