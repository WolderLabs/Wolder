#!/usr/bin/env node

import { resolve } from "node:path"
import { existsSync } from "node:fs"
import { execSync } from "node:child_process"

const DEFAULT_PROGRAM = "wolder.program.ts"

function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  if (!command || command === "run") {
    const programArg = command === "run" ? args[1] : args[0]
    const programFile = resolve(process.cwd(), programArg ?? DEFAULT_PROGRAM)

    if (!existsSync(programFile)) {
      console.error(
        `Error: Program file not found: ${programFile}\n` +
          `Create a ${DEFAULT_PROGRAM} or specify a file: wolder run <file>`,
      )
      process.exit(1)
    }

    try {
      execSync(`npx tsx "${programFile}"`, {
        cwd: process.cwd(),
        stdio: "inherit",
        env: process.env,
      })
    } catch (err: unknown) {
      const code =
        err && typeof err === "object" && "status" in err
          ? (err as { status: number }).status
          : 1
      process.exit(code)
    }
  } else {
    console.error(`Unknown command: ${command}\nUsage: wolder run [program]`)
    process.exit(1)
  }
}

main()
