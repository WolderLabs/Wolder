import { execSync } from "node:child_process"
import { writeFileSync, mkdirSync } from "node:fs"
import { resolve, dirname, extname } from "node:path"
import Anthropic from "@anthropic-ai/sdk"
import type {
  Plugin,
  PluginBuilder,
  Expectation,
  ExpectationResult,
  PluginRunContext,
} from "../../../src/index.js"

// Re-export everything from @wolder/typescript so users only need one import
export { wolder, typescript } from "../typescript/src/index.js"
export type {
  WolderConfig,
  WolderInstance,
  WolderOptions,
  InputRef,
  Artifact,
  MemberRef,
  ScopeBuilder,
  ActBuilder,
  NodeDefinition,
  ExtractMembers,
  TypeScriptBuilder,
} from "../typescript/src/index.js"

export interface TestsBuilder extends PluginBuilder<[]> {
  /** Override the inferred test file path */
  file(path: string): TestsBuilder
}

class TestsBuilderImpl implements TestsBuilder {
  declare readonly _members: []

  constructor(private readonly addExpectation: (exp: Expectation) => void) {}

  file(path: string): TestsBuilder {
    this.addExpectation({ type: "tests", testFile: path })
    return this
  }
}

function inferTestFilePath(scopeFiles: string[]): string {
  const first = scopeFiles[0] ?? "index.ts"
  const ext = extname(first)
  const base = first.slice(0, -ext.length)
  return `${base}.test${ext}`
}

function buildExpectationSummary(allExpectations: Expectation[]): string {
  return allExpectations
    .filter((e) => e.type !== "tests")
    .map((e) => {
      switch (e.type) {
        case "class":
          return `- A class named "${e.name}" exists`
        case "function":
          return `- "${e.className}" has a method "${e.name}"`
        case "interface":
          return `- An interface named "${e.name}" exists`
        case "method":
          return `- "${e.className}" has a method "${e.name}"`
        case "compiles":
          return `- The code compiles without TypeScript errors`
        case "implements":
          return `- A class implements the interface from "${e.interfacePath}"`
        default:
          return null
      }
    })
    .filter((s): s is string => s !== null)
    .join("\n")
}

export const tests: Plugin<TestsBuilder> = {
  name: "tests",
  expectationTypes: ["tests"],
  defaultExpectations: [{ type: "tests" }],

  createBuilder(addExpectation) {
    return new TestsBuilderImpl(addExpectation)
  },

  async preGenerate(ownExpectations, context) {
    const exp = ownExpectations[0]
    const testFilePath = exp?.testFile ?? inferTestFilePath(context.scopeFiles)

    const client = new Anthropic({
      apiKey: context.apiKey ?? process.env.ANTHROPIC_API_KEY,
    })

    const scopeList = context.scopeFiles.map((f) => `- ${f}`).join("\n")
    const expectationSummary = buildExpectationSummary(context.allExpectations)

    const response = await client.messages.create({
      model: context.model,
      max_tokens: 8192,
      temperature: 0,
      system: `You are a TypeScript test writer using vitest. Write tests ONLY — do not write the implementation. Output ONLY the test file content formatted as:
=== FILE: <path> ===
<content>
=== END FILE ===`,
      messages: [
        {
          role: "user",
          content: `Write a vitest test file at "${testFilePath}" for the following scope:

SCOPE FILES (to be implemented):
${scopeList}

EXPECTED STRUCTURE:
${expectationSummary || "(no structural expectations — write general behavioral tests)"}

Write comprehensive tests covering the expected behavior. Import from the scope files using relative paths with .js extensions.`,
        },
      ],
    })

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim()

    const match = text.match(/=== FILE: (.+?) ===\n([\s\S]*?)\n=== END FILE ===/)
    const path = match ? match[1]!.trim() : testFilePath
    const content = match ? match[2]!.trim() : text

    return { testFile: { path, content } }
  },

  async runExpectations(ownExpectations, context) {
    const exp = ownExpectations[0]
    if (!exp) return []

    const testFilePath = exp.testFile ?? inferTestFilePath(context.scopeFiles)
    const absTestPath = resolve(context.root, testFilePath)

    try {
      execSync(`npx vitest run ${absTestPath}`, {
        cwd: context.root,
        stdio: "pipe",
      })
      return [{ expectation: exp, pass: true }]
    } catch (err: unknown) {
      const output =
        err instanceof Error && "stdout" in err ? String((err as any).stdout) : String(err)
      return [
        {
          expectation: exp,
          pass: false,
          error: `Tests failed:\n${output}`,
        },
      ]
    }
  },

  formatExpectations(expectations) {
    return expectations.map((exp) =>
      exp.testFile ? `Tests at "${exp.testFile}" must pass` : "Tests must pass",
    )
  },
}
