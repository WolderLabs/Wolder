#!/usr/bin/env node

import { resolve } from "node:path"
import { existsSync } from "node:fs"
import { execSync } from "node:child_process"
import { check, clean } from "./commands.js"
import { readManifest } from "./manifest.js"

const DEFAULT_PROGRAM = "wolder.program.ts"

function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  switch (command) {
    case "run":
      runProgram(args[1])
      break

    case "check":
      runCheck()
      break

    case "clean":
      runClean()
      break

    default:
      if (!command) {
        runProgram(undefined)
      } else {
        console.error(
          `Unknown command: ${command}\n` +
            `Usage:\n` +
            `  wolder run [program]   Execute a generation program\n` +
            `  wolder check           Report stale/drifted nodes\n` +
            `  wolder clean           Remove all generated files`,
        )
        process.exit(1)
      }
  }
}

function runProgram(programArg: string | undefined) {
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
}

function runCheck() {
  const root = process.cwd()
  const manifest = readManifest(root)

  if (Object.keys(manifest.nodes).length === 0) {
    console.log("No nodes in manifest. Run 'wolder run' first.")
    return
  }

  const results = check(root)

  for (const r of results) {
    const icon = r.status === "fresh" ? "OK" : r.status === "drifted" ? "!!" : "??"
    console.log(`[${icon}] ${r.nodeId} — ${r.status}`)
    if (r.details) {
      for (const line of r.details.split("\n")) {
        console.log(`    ${line}`)
      }
    }
  }

  const drifted = results.filter((r) => r.status === "drifted").length
  const missing = results.filter((r) => r.status === "missing").length

  if (drifted > 0 || missing > 0) {
    process.exit(1)
  }
}

function runClean() {
  const root = process.cwd()
  const deleted = clean(root)

  if (deleted.length === 0) {
    console.log("Nothing to clean.")
  } else {
    for (const file of deleted) {
      console.log(`  Deleted: ${file}`)
    }
    console.log(`\nRemoved ${deleted.length} generated file(s).`)
  }
}

main()
