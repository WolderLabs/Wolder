import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { check, clean } from "./commands.js";
import { createEmptyManifest, hashFiles, updateManifestNode, writeManifest } from "./manifest.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(resolve(tmpdir(), "wolder-commands-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function write(path: string, content: string): void {
  const abs = resolve(root, path);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, "utf-8");
}

/** Record a node exactly as a build would, with the files it actually wrote. */
function record(nodeId: string, files: string[]): void {
  const manifest = createEmptyManifest();
  updateManifestNode(manifest, nodeId, {
    inputHashes: { chain: "x" },
    outputHash: hashFiles(files, root),
    files,
    dependsOn: [],
  });
  writeManifest(manifest, root);
}

describe("check", () => {
  it("reports nothing for an empty manifest", () => {
    expect(check(root)).toEqual([]);
  });

  it("reports a node as fresh while its files are untouched", () => {
    write("src/services/todo.ts", "generated");
    record("src/services/**", ["src/services/todo.ts"]);

    expect(check(root)).toEqual([
      { nodeId: "src/services/**", status: "fresh", files: ["src/services/todo.ts"] },
    ]);
  });

  it("reports a node as drifted once a file is edited by hand", () => {
    write("a.ts", "generated");
    record("a.ts", ["a.ts"]);
    write("a.ts", "edited by hand");

    const [result] = check(root);
    expect(result!.status).toBe("drifted");
    expect(result!.details).toContain("modified by hand");
  });

  it("reports a node as missing once a file is deleted", () => {
    write("a.ts", "generated");
    record("a.ts", ["a.ts"]);
    rmSync(resolve(root, "a.ts"));

    const [result] = check(root);
    expect(result!.status).toBe("missing");
    expect(result!.details).toContain("a.ts");
  });
});

describe("clean", () => {
  it("removes every file the manifest attributes to an agent", () => {
    write("src/services/todo.ts", "generated");
    write("README.md", "generated");
    record("src/services/**", ["src/services/todo.ts", "README.md"]);

    expect(clean(root).sort()).toEqual(["README.md", "src/services/todo.ts"]);
    expect(existsSync(resolve(root, "src/services/todo.ts"))).toBe(false);
  });

  it("removes directories it has emptied", () => {
    write("src/services/todo.ts", "generated");
    record("src/services/**", ["src/services/todo.ts"]);

    clean(root);
    expect(existsSync(resolve(root, "src/services"))).toBe(false);
    expect(existsSync(resolve(root, "src"))).toBe(false);
  });

  it("leaves a directory that still holds a developer-owned file", () => {
    write("src/services/todo.ts", "generated");
    write("src/services/notes.md", "mine");
    record("src/services/**", ["src/services/todo.ts"]);

    clean(root);
    expect(existsSync(resolve(root, "src/services/notes.md"))).toBe(true);
  });

  it("leaves developer-owned files and the manifest alone", () => {
    write("a.ts", "generated");
    write("src/models/TodoItem.ts", "mine");
    record("a.ts", ["a.ts"]);

    clean(root);
    expect(existsSync(resolve(root, "src/models/TodoItem.ts"))).toBe(true);
    expect(existsSync(resolve(root, "wolder.manifest.json"))).toBe(true);
  });

  it("ignores a file that is already gone", () => {
    record("a.ts", ["a.ts"]);
    expect(clean(root)).toEqual([]);
  });
});
