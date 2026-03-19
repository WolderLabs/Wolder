#!/usr/bin/env node
import { spawnSync } from "child_process"
import { fileURLToPath } from "url"
import { dirname, resolve } from "path"

const dir = dirname(fileURLToPath(import.meta.url))
const cli = resolve(dir, "../../../src/cli.ts")

const result = spawnSync("npx", ["tsx", cli, ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: true,
  cwd: process.cwd(),
})

process.exit(result.status ?? 1)
