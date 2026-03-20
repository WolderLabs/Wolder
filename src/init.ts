import { resolve, basename } from "node:path"
import { existsSync, writeFileSync } from "node:fs"
import { execSync } from "node:child_process"
import * as log from "./log.js"

function packageJson(name: string, local: boolean): string {
  const ver = local ? "*" : "latest"
  return (
    JSON.stringify(
      {
        name,
        private: true,
        type: "module",
        scripts: {
          generate: "wolder run",
        },
        devDependencies: {
          "@wolder/cli": ver,
          "@wolder/typescript": ver,
        },
      },
      null,
      2,
    ) + "\n"
  )
}

const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["src", "wolder.program.ts"]
}
`

const WOLDER_CONFIG = `import { defineConfig } from "@wolder/typescript"

export default defineConfig({
  model: "claude-sonnet-4-6",
})
`

export function runInit(flag: string | undefined): void {
  const local = flag === "--local"

  if (flag !== undefined && !local) {
    log.error(`Unknown option: ${flag}`)
    log.info("Usage: wolder init [--local]")
    process.exit(1)
  }

  const cwd = process.cwd()
  const toCreate = ["package.json", "tsconfig.json", "wolder.config.ts"]
  const existing = toCreate.filter((f) => existsSync(resolve(cwd, f)))

  if (existing.length > 0) {
    log.error("Cannot initialise — the following files already exist:")
    for (const f of existing) {
      console.error(`  ${f}`)
    }
    log.info("Remove or rename them before running 'wolder init'.")
    process.exit(1)
  }

  const name = basename(cwd)

  writeFileSync(resolve(cwd, "package.json"), packageJson(name, local))
  log.success("Created package.json")

  writeFileSync(resolve(cwd, "tsconfig.json"), TSCONFIG)
  log.success("Created tsconfig.json")

  writeFileSync(resolve(cwd, "wolder.config.ts"), WOLDER_CONFIG)
  log.success("Created wolder.config.ts")

  console.log("")

  if (local) {
    log.info("Add this directory to your workspace, then run 'npm install' from the workspace root.")
    log.info("Then: wolder agent <requirements>")
  } else {
    log.info("Installing dependencies...")
    execSync("npm install", { cwd, stdio: "inherit" })
    console.log("")
    log.success("Ready. Run 'wolder agent <requirements>' to get started.")
  }
}
