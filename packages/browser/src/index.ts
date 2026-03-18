import { chromium, type Page } from "playwright"
import { spawn, type ChildProcess } from "node:child_process"
import Anthropic from "@anthropic-ai/sdk"
import type {
  Plugin,
  PluginBuilder,
  Expectation,
  ExpectationResult,
  PluginRunContext,
} from "../../../src/index.js"

export interface WebPageBuilder extends PluginBuilder<[]> {
  hasPage(route: string, description: string): WebPageBuilder
}

class WebPageBuilderImpl implements WebPageBuilder {
  declare readonly _members: []

  constructor(private readonly addExpectation: (exp: Expectation) => void) {}

  hasPage(route: string, description: string): WebPageBuilder {
    this.addExpectation({ type: "webPage", route, description })
    return this
  }
}

export const webPage: Plugin<WebPageBuilder> = {
  name: "webPage",
  expectationTypes: ["webPage"],

  createBuilder(addExpectation) {
    return new WebPageBuilderImpl(addExpectation)
  },

  async runExpectations(ownExpectations, context) {
    return runWebPageExpectations(ownExpectations, context)
  },

  formatExpectations(expectations) {
    return expectations.map((exp) => `The page at route "${exp.route}" must: ${exp.description}`)
  },
}

async function runWebPageExpectations(
  expectations: Expectation[],
  context: PluginRunContext,
): Promise<ExpectationResult[]> {
  const results: ExpectationResult[] = []

  // Read dev server config from environment / context
  const devCommand = process.env.WOLDER_DEV_COMMAND
  const devPort = Number(process.env.WOLDER_DEV_PORT ?? 3000)
  const devReadyPattern = process.env.WOLDER_DEV_READY_PATTERN ?? "listening on port"

  if (!devCommand) {
    return expectations.map((exp) => ({
      expectation: exp,
      pass: false,
      error:
        "expectWebPage: WOLDER_DEV_COMMAND environment variable is required for browser validation",
    }))
  }

  let serverProc: ChildProcess | null = null
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null

  try {
    serverProc = await startDevServer(devCommand, devReadyPattern)
    browser = await chromium.launch({ headless: true })

    for (const exp of expectations) {
      if (!exp.route || !exp.description) {
        results.push({
          expectation: exp,
          pass: false,
          error: "webPage: missing route or description",
        })
        continue
      }

      const page = await browser.newPage()
      try {
        await page.goto(`http://localhost:${devPort}${exp.route}`, { waitUntil: "networkidle" })

        let assertion = exp.compiledAssertion
        if (!assertion) {
          const snapshot = await page.locator("body").ariaSnapshot()
          assertion = await compileAssertion(exp.description, snapshot, context)
        }

        const error = await executeAssertion(page, assertion)
        results.push({ expectation: { ...exp, compiledAssertion: assertion }, pass: !error, error: error ?? undefined })
      } finally {
        await page.close()
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    for (const exp of expectations) {
      if (!results.some((r) => r.expectation === exp)) {
        results.push({ expectation: exp, pass: false, error: `Browser setup failed: ${msg}` })
      }
    }
  } finally {
    if (browser) await browser.close()
    if (serverProc) serverProc.kill()
  }

  return results
}

async function startDevServer(devCommand: string, readyPattern: string): Promise<ChildProcess> {
  const [cmd, ...args] = devCommand.split(" ")
  const proc = spawn(cmd!, args, { shell: true, stdio: ["ignore", "pipe", "pipe"] })

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Dev server did not become ready within 30s")),
      30000,
    )
    const onData = (data: Buffer) => {
      if (data.toString().includes(readyPattern)) {
        clearTimeout(timeout)
        resolve()
      }
    }
    proc.stdout?.on("data", onData)
    proc.stderr?.on("data", onData)
    proc.on("error", (err) => { clearTimeout(timeout); reject(err) })
    proc.on("exit", (code) => {
      clearTimeout(timeout)
      if (code !== null && code !== 0) reject(new Error(`Dev server exited with code ${code}`))
    })
  })

  return proc
}

async function compileAssertion(
  description: string,
  snapshot: string,
  context: PluginRunContext,
): Promise<string> {
  const client = new Anthropic({ apiKey: context.apiKey ?? process.env.ANTHROPIC_API_KEY })
  const response = await client.messages.create({
    model: context.model,
    max_tokens: 1024,
    temperature: 0,
    system:
      "You are a test assertion compiler. Given an ARIA snapshot of a page and a description of what the page should look like, write a single Playwright assertion that verifies the description. Output ONLY the assertion code — no explanation, no imports, no wrapping function. The variable `page` is already available. Use @playwright/test expect syntax.",
    messages: [
      {
        role: "user",
        content: `ARIA snapshot:\n${snapshot}\n\nDescription: "${description}"\n\nWrite a single Playwright assertion:`,
      },
    ],
  })
  return response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim()
}

async function executeAssertion(page: Page, assertion: string): Promise<string | null> {
  try {
    const { expect } = await import("playwright/test")
    const fn = new Function("page", "expect", `return (async () => { ${assertion} })()`)
    await fn(page, expect)
    return null
  } catch (err: unknown) {
    return `Assertion failed: ${err instanceof Error ? err.message : String(err)}`
  }
}
