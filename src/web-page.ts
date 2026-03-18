import { chromium, type Page } from "playwright"
import { spawn, type ChildProcess } from "node:child_process"
import Anthropic from "@anthropic-ai/sdk"
import type { Expectation, WebPageConfig } from "./types.js"
import type { ExpectationResult } from "./expectations.js"

/**
 * Start the dev server, wait for it to be ready, and return the process.
 */
export async function startDevServer(config: WebPageConfig): Promise<ChildProcess> {
  const [cmd, ...args] = config.devCommand.split(" ")
  const proc = spawn(cmd!, args, {
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  })

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Dev server did not become ready within 30s`))
    }, 30000)

    const onData = (data: Buffer) => {
      if (data.toString().includes(config.devReadyPattern)) {
        clearTimeout(timeout)
        resolve()
      }
    }

    proc.stdout?.on("data", onData)
    proc.stderr?.on("data", onData)

    proc.on("error", (err) => {
      clearTimeout(timeout)
      reject(err)
    })

    proc.on("exit", (code) => {
      clearTimeout(timeout)
      if (code !== null && code !== 0) {
        reject(new Error(`Dev server exited with code ${code}`))
      }
    })
  })

  return proc
}

/**
 * Get a page snapshot (aria snapshot of body) for LLM assertion compilation.
 */
export async function getPageSnapshot(page: Page): Promise<string> {
  const ariaSnapshot = await page.locator("body").ariaSnapshot()
  return ariaSnapshot
}

/**
 * Ask the LLM to compile a Playwright assertion from a description and
 * accessibility tree.
 */
export async function compileAssertion(
  description: string,
  accessibilityTree: string,
  config: WebPageConfig,
): Promise<string> {
  const client = new Anthropic({
    apiKey: config.apiKey ?? process.env.ANTHROPIC_API_KEY,
  })

  const response = await client.messages.create({
    model: config.model,
    max_tokens: 1024,
    temperature: 0,
    system:
      "You are a test assertion compiler. Given an ARIA snapshot of a page and a description of what the page should look like, write a single Playwright assertion that verifies the description. Output ONLY the assertion code — no explanation, no imports, no wrapping function. The variable `page` is already available. Use @playwright/test expect syntax.",
    messages: [
      {
        role: "user",
        content: `ARIA snapshot:\n${accessibilityTree}\n\nDescription: "${description}"\n\nWrite a single Playwright assertion:`,
      },
    ],
  })

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim()

  return text
}

/**
 * Execute a compiled Playwright assertion against a page.
 * Returns null on success, or an error message on failure.
 */
export async function executeAssertion(
  page: Page,
  assertion: string,
): Promise<string | null> {
  try {
    // Build a function that has `page` and `expect` in scope
    const { expect } = await import("playwright/test")
    const fn = new Function("page", "expect", `return (async () => { ${assertion} })()`)
    await fn(page, expect)
    return null
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return `Assertion failed: ${msg}`
  }
}

/**
 * Run all webPage expectations for a node.
 *
 * - Starts the dev server once
 * - For each expectation, checks if a compiled assertion exists in the manifest
 * - If not (or description changed), compiles one via LLM
 * - Executes the assertion
 * - Returns results and any newly compiled assertions to store in manifest
 */
export async function runWebPageExpectations(
  expectations: Expectation[],
  compiledAssertions: Record<string, string>,
  config: WebPageConfig,
): Promise<{
  results: ExpectationResult[]
  updatedAssertions: Record<string, string>
}> {
  const results: ExpectationResult[] = []
  const updatedAssertions = { ...compiledAssertions }

  let serverProc: ChildProcess | null = null
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null

  try {
    serverProc = await startDevServer(config)
    browser = await chromium.launch({ headless: true })

    for (const exp of expectations) {
      if (!exp.route || !exp.description) {
        results.push({
          expectation: exp,
          pass: false,
          error: "expectWebPage: missing route or description",
        })
        continue
      }

      const cacheKey = `${exp.route}::${exp.description}`
      let assertion = updatedAssertions[cacheKey]

      const page = await browser.newPage()

      try {
        const url = `http://localhost:${config.devPort}${exp.route}`
        await page.goto(url, { waitUntil: "networkidle" })

        // Compile assertion if not cached or description changed
        if (!assertion) {
          const snapshot = await getPageSnapshot(page)
          assertion = await compileAssertion(exp.description, snapshot, config)
          updatedAssertions[cacheKey] = assertion
        }

        // Execute the assertion
        const error = await executeAssertion(page, assertion)

        if (error) {
          results.push({ expectation: { ...exp, compiledAssertion: assertion }, pass: false, error })
        } else {
          results.push({ expectation: { ...exp, compiledAssertion: assertion }, pass: true })
        }
      } finally {
        await page.close()
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    // If server or browser failed to start, fail all remaining expectations
    for (const exp of expectations) {
      if (!results.some((r) => r.expectation === exp)) {
        results.push({
          expectation: exp,
          pass: false,
          error: `Web page validation setup failed: ${msg}`,
        })
      }
    }
  } finally {
    if (browser) await browser.close()
    if (serverProc) {
      serverProc.kill()
    }
  }

  return { results, updatedAssertions }
}
