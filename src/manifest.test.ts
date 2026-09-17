import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  computeCacheKey,
  createEmptyManifest,
  getDependents,
  hashFiles,
  isFresh,
  isOutputFresh,
  pruneManifest,
  readManifest,
  updateManifestContract,
  updateManifestNode,
  writeManifest,
  MANIFEST_VERSION,
} from "./manifest.js";
import type { Contract } from "./types.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(resolve(tmpdir(), "wolder-manifest-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function write(path: string, content: string): void {
  writeFileSync(resolve(root, path), content, "utf-8");
}

describe("reading and writing", () => {
  it("returns an empty manifest when there is no file", () => {
    expect(readManifest(root)).toEqual({ version: MANIFEST_VERSION, nodes: {}, contracts: {} });
  });

  it("round-trips", () => {
    const manifest = createEmptyManifest();
    updateManifestNode(manifest, "a.ts", {
      inputHashes: { chain: "x" },
      outputHash: "h",
      files: ["a.ts"],
      dependsOn: [],
    });
    writeManifest(manifest, root);
    expect(readManifest(root).nodes["a.ts"]!.files).toEqual(["a.ts"]);
  });

  it("discards a v1 manifest — expectations and fixed scopes do not survive", () => {
    write(
      "wolder.manifest.json",
      JSON.stringify({ version: 1, nodes: { "src/a.ts": { expectations: [] } } }),
    );
    expect(readManifest(root).nodes).toEqual({});
  });

  it("survives a corrupt manifest rather than crashing the build", () => {
    write("wolder.manifest.json", "{ not json");
    expect(readManifest(root).nodes).toEqual({});
  });
});

describe("cache keys", () => {
  it("ignores key order", () => {
    expect(computeCacheKey({ a: "1", b: "2" })).toBe(computeCacheKey({ b: "2", a: "1" }));
  });

  it("changes with any value", () => {
    expect(computeCacheKey({ a: "1" })).not.toBe(computeCacheKey({ a: "2" }));
  });

  it("distinguishes a missing key from an empty one", () => {
    expect(computeCacheKey({ a: "1" })).not.toBe(computeCacheKey({ a: "1", b: "" }));
  });
});

describe("freshness", () => {
  it("is stale when the node is unknown", () => {
    expect(isFresh(createEmptyManifest(), "a.ts", { chain: "x" })).toBe(false);
  });

  it("is fresh when the inputs match, stale when they do not", () => {
    const manifest = createEmptyManifest();
    updateManifestNode(manifest, "a.ts", {
      inputHashes: { chain: "x" },
      outputHash: "h",
      files: [],
      dependsOn: [],
    });
    expect(isFresh(manifest, "a.ts", { chain: "x" })).toBe(true);
    expect(isFresh(manifest, "a.ts", { chain: "y" })).toBe(false);
  });
});

describe("output freshness", () => {
  function recorded(): ReturnType<typeof createEmptyManifest> {
    write("a.ts", "generated");
    const manifest = createEmptyManifest();
    updateManifestNode(manifest, "a.ts", {
      inputHashes: {},
      outputHash: hashFiles(["a.ts"], root),
      files: ["a.ts"],
      dependsOn: [],
    });
    return manifest;
  }

  it("is fresh while the files are untouched", () => {
    expect(isOutputFresh(recorded(), "a.ts", root)).toBe(true);
  });

  it("is stale once a file is edited by hand", () => {
    const manifest = recorded();
    write("a.ts", "edited");
    expect(isOutputFresh(manifest, "a.ts", root)).toBe(false);
  });

  it("is stale once a file is deleted", () => {
    const manifest = recorded();
    unlinkSync(resolve(root, "a.ts"));
    expect(isOutputFresh(manifest, "a.ts", root)).toBe(false);
  });
});

describe("hashFiles", () => {
  it("ignores the order the files are listed in", () => {
    write("a.ts", "a");
    write("b.ts", "b");
    expect(hashFiles(["a.ts", "b.ts"], root)).toBe(hashFiles(["b.ts", "a.ts"], root));
  });

  it("distinguishes the same content under different names", () => {
    write("a.ts", "same");
    write("b.ts", "same");
    expect(hashFiles(["a.ts"], root)).not.toBe(hashFiles(["b.ts"], root));
  });

  it("hashes a missing file as absent rather than throwing", () => {
    expect(hashFiles(["gone.ts"], root)).toBe(hashFiles(["gone.ts"], root));
    write("gone.ts", "here now");
    expect(hashFiles(["gone.ts"], root)).not.toBe(hashFiles(["missing.ts"], root));
  });
});

describe("contracts in the manifest", () => {
  const contract: Contract = {
    id: "contract:package.json",
    provider: "package.json",
    label: "NPM dependencies",
    requesters: ["src/controllers/**"],
    summary: "express@5",
    terms: [{ name: "express", detail: "express@5.0.0" }],
    files: [{ path: "package.json", content: "{}" }],
    hash: "content-hash",
  };

  it("records a contract as a first-class entry, with its negotiation inputs", () => {
    const manifest = createEmptyManifest();
    updateManifestContract(manifest, contract, "input-hash");

    const stored = manifest.contracts["contract:package.json"]!;
    expect(stored.hash).toBe("content-hash");
    expect(stored.inputHash).toBe("input-hash");
    expect(stored.terms).toEqual([{ name: "express", detail: "express@5.0.0" }]);
    // Only the paths — the content lives on disk in the provider's region.
    expect(stored.files).toEqual(["package.json"]);
  });
});

describe("pruning", () => {
  it("forgets nodes and contracts the program no longer declares", () => {
    const manifest = createEmptyManifest();
    for (const id of ["a.ts", "b.ts"]) {
      updateManifestNode(manifest, id, {
        inputHashes: {},
        outputHash: "h",
        files: [],
        dependsOn: [],
      });
    }
    manifest.contracts["contract:a.ts"] = {
      id: "contract:a.ts",
      provider: "a.ts",
      requesters: [],
      label: "A",
      hash: "h",
      inputHash: "i",
      summary: "",
      terms: [],
      files: [],
      lastRun: "",
    };

    pruneManifest(manifest, ["a.ts"], []);
    expect(Object.keys(manifest.nodes)).toEqual(["a.ts"]);
    expect(Object.keys(manifest.contracts)).toEqual([]);
  });
});

describe("getDependents", () => {
  it("finds direct and transitive dependents", () => {
    const manifest = createEmptyManifest();
    const add = (id: string, dependsOn: string[]) =>
      updateManifestNode(manifest, id, {
        inputHashes: {},
        outputHash: "h",
        files: [],
        dependsOn,
      });
    add("a.ts", []);
    add("b.ts", ["a.ts"]);
    add("c.ts", ["b.ts"]);
    add("d.ts", []);

    expect(getDependents(manifest, "a.ts").sort()).toEqual(["b.ts", "c.ts"]);
    expect(getDependents(manifest, "d.ts")).toEqual([]);
  });
});
