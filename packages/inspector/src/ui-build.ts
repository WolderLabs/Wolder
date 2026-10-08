import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const UI_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "ui");

/**
 * Build `ui/dist` when it is missing. `ui/dist` is not committed, so the first
 * `wolder inspect` pays for it. Says what it is doing; returns false (with the
 * reason logged) when it could not, so the server still starts with the API.
 */
export function ensureUiBuilt(log: (message: string) => void = console.log): boolean {
  if (existsSync(join(UI_DIR, "dist", "index.html"))) return true;
  if (!existsSync(join(UI_DIR, "package.json"))) {
    log("The inspector UI sources are not installed, so there is no UI to serve. The API still works.");
    return false;
  }
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const run = (args: string[]): boolean =>
    spawnSync(npm, args, { cwd: UI_DIR, stdio: "inherit", shell: process.platform === "win32" }).status === 0;
  log("Building the inspector UI (first use; ui/dist is not committed)...");
  if (!existsSync(join(UI_DIR, "node_modules")) && !run(["install", "--no-audit", "--no-fund"])) {
    log("npm install failed in packages/inspector/ui; the API still works. Run `npm run inspector:ui` after fixing it.");
    return false;
  }
  if (!run(["run", "build"])) {
    log("The UI build failed; the API still works. Run `npm run inspector:ui` to see the errors.");
    return false;
  }
  log("Inspector UI built.");
  return true;
}
