import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import type { NodeDefinition, InputRef, Artifact, MemberRef, Expectation } from "./types.js"

export function buildSystemPrompt(): string {
  return `You are a TypeScript code generator. You will generate or modify files within a specified scope. Files listed as INPUT are read-only context — do not modify them. Files listed as SCOPE are your output targets.

Output ONLY the content of each scoped file, formatted as:
=== FILE: <path> ===
<content>
=== END FILE ===

Do not include any explanation, commentary, or markdown fencing. Output only the file blocks.`
}

export function buildUserPrompt(node: NodeDefinition, root: string): string {
  const parts: string[] = []

  // Scope files
  parts.push("SCOPE FILES (you will generate these):")
  for (const file of node.scopeFiles) {
    parts.push(`- ${file}`)
  }
  parts.push("")

  // Input files
  const inputFiles = collectInputContent(node.inputs, root)
  if (inputFiles.length > 0) {
    parts.push("INPUT FILES (read-only context):")
    for (const { path, content } of inputFiles) {
      parts.push(`=== FILE: ${path} ===`)
      parts.push(content)
      parts.push("=== END FILE ===")
      parts.push("")
    }
  }

  // Instruction
  parts.push("INSTRUCTION:")
  parts.push(node.actInstruction.trim())
  parts.push("")

  // Expectations
  const expLines = formatExpectations(node.expectations)
  if (expLines.length > 0) {
    parts.push("EXPECTATIONS (your output must satisfy these):")
    for (const line of expLines) {
      parts.push(`- ${line}`)
    }
  }

  return parts.join("\n")
}

function collectInputContent(
  inputs: Array<InputRef | Artifact | MemberRef>,
  root: string,
): Array<{ path: string; content: string }> {
  const results: Array<{ path: string; content: string }> = []
  const seen = new Set<string>()

  for (const input of inputs) {
    if (input.kind === "input") {
      const absPath = resolve(root, input.path)
      if (!seen.has(input.path) && existsSync(absPath)) {
        seen.add(input.path)
        results.push({ path: input.path, content: readFileSync(absPath, "utf-8") })
      }
    } else if (input.kind === "member") {
      // MemberRef — read the file containing this member and include it
      const absPath = resolve(root, input.filePath)
      if (!seen.has(input.filePath) && existsSync(absPath)) {
        seen.add(input.filePath)
        results.push({ path: input.filePath, content: readFileSync(absPath, "utf-8") })
      }
    } else {
      // Artifact — include all generated files
      for (const file of input.generatedFiles) {
        const absPath = resolve(root, file)
        if (!seen.has(file) && existsSync(absPath)) {
          seen.add(file)
          results.push({ path: file, content: readFileSync(absPath, "utf-8") })
        }
      }
    }
  }

  return results
}

function formatExpectations(expectations: Expectation[]): string[] {
  const lines: string[] = []
  for (const exp of expectations) {
    switch (exp.type) {
      case "file":
        lines.push(`A file named "${exp.path}" must exist`)
        break
      case "class":
        lines.push(`A class named "${exp.name}" must exist`)
        break
      case "function":
        lines.push(`${exp.className} must have a method named "${exp.name}"`)
        break
      case "interface":
        lines.push(`An interface named "${exp.name}" must exist`)
        break
      case "method":
        lines.push(`${exp.className} must have a method named "${exp.name}"`)
        break
      case "compiles":
        lines.push("The files must compile without TypeScript errors")
        break
      case "webPage":
        lines.push(`The page at route "${exp.route}" must: ${exp.description}`)
        break
      case "implements":
        lines.push(`A class must implement an interface from "${exp.interfacePath}"`)
        break
    }
  }
  return lines
}
