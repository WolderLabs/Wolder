#!/usr/bin/env node

import { resolve } from "node:path"
import { existsSync } from "node:fs"
import { execSync } from "node:child_process"
import { check, clean } from "./commands.js"
import { readManifest } from "./manifest.js"
import { runAgent } from "./agent.js"
import { runInit } from "./init.js"
import * as log from "./log.js"

const DEFAULT_PROGRAM = "wolder.program.ts"

async function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  switch (command) {
    case "run":
      runProgram(args[1])
      break

    case "init":
      runInit(args[1])
      break

    case "agent":
      await runAgent(args[1])
      break

    case "check":
      runCheck()
      break

    case "clean":
      runClean()
      break

    case "help":
    case "--help":
    case "-h":
      printHelp()
      break

    default:
      if (!command) {
        runProgram(undefined)
      } else {
        log.error(`Unknown command: ${command}`)
        printHelp()
        process.exit(1)
      }
  }
}

function printHelp() {
  console.log(`
${log.bold("wolder")} — code-first agentic software generation

${log.bold("Usage:")}
  wolder init [--local]       Set up a new wolder project in the current directory
  wolder agent <requirements> Generate a wolder.program.ts from a requirements document
  wolder run [program]        Execute a generation program (default: ${DEFAULT_PROGRAM})
  wolder check               Compare generated files against manifest
  wolder clean               Remove all generated files
  wolder help                Show this help
`)
}

function runProgram(programArg: string | undefined) {
  const programFile = resolve(process.cwd(), programArg ?? DEFAULT_PROGRAM)

  if (!existsSync(programFile)) {
    log.error(`Program file not found: ${programFile}`)
    log.info(`Create a ${DEFAULT_PROGRAM} or specify a file: wolder run <file>`)
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
    log.warn("No nodes in manifest. Run 'wolder run' first.")
    return
  }

  const results = check(root)
  let hasProblems = false

  for (const r of results) {
    switch (r.status) {
      case "fresh":
        console.log(`  ${log.green("OK")}  ${r.nodeId}`)
        break
      case "drifted":
        console.log(`  ${log.yellow("!!")}  ${r.nodeId} — ${log.yellow("drifted")}`)
        if (r.details) {
          for (const line of r.details.split("\n")) {
            console.log(`       ${log.dim(line)}`)
          }
        }
        hasProblems = true
        break
      case "missing":
        console.log(`  ${log.red("??")}  ${r.nodeId} — ${log.red("missing")}`)
        if (r.details) {
          for (const line of r.details.split("\n")) {
            console.log(`       ${log.dim(line)}`)
          }
        }
        hasProblems = true
        break
    }
  }

  const fresh = results.filter((r) => r.status === "fresh").length
  const total = results.length
  console.log("")

  if (hasProblems) {
    log.warn(`${fresh}/${total} nodes fresh. Run 'wolder run' to regenerate stale nodes.`)
    process.exit(1)
  } else {
    log.success(`All ${total} node(s) fresh.`)
  }
}

function runClean() {
  const root = process.cwd()
  const deleted = clean(root)

  if (deleted.length === 0) {
    log.info("Nothing to clean.")
  } else {
    for (const file of deleted) {
      console.log(`  ${log.red("x")}  ${file}`)
    }
    console.log("")
    log.success(`Removed ${deleted.length} generated file(s).`)
  }
}

main().catch((err) => {
  log.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
