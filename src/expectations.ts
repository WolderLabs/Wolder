import { existsSync } from "node:fs"
import { resolve } from "node:path"
import type { Expectation, ExpectationResult } from "./types.js"

export type { ExpectationResult }

/**
 * Core file-existence validation. Language-agnostic.
 * All other expectation types are handled by plugins.
 */
export function runCoreExpectations(
  expectations: Expectation[],
  _scopeFiles: string[],
  root: string,
): ExpectationResult[] {
  const results: ExpectationResult[] = []

  for (const exp of expectations) {
    if (exp.type === "file") {
      const absPath = resolve(root, exp.path!)
      if (existsSync(absPath)) {
        results.push({ expectation: exp, pass: true })
      } else {
        results.push({
          expectation: exp,
          pass: false,
          error: `Expected file "${exp.path}" does not exist`,
        })
        return results // fail fast
      }
    }
  }

  return results
}
