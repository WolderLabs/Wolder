import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { wolder } from "./wolder.js";
import { createSilentReporter } from "./reporter.js";
import { createPermissionGuard } from "./runner.js";
import { isFresh, isOutputFresh, readManifest } from "./manifest.js";
import type { AgentRunner, Negotiator, Plan, WolderInstance } from "./types.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(resolve(tmpdir(), "wolder-plan-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const files: Record<string, Record<string, string>> = {
  "src/a/**": { "src/a/a.ts": "export const a = 1;" },
  "src/b/**": { "src/b/b.ts": "export const b = 2;" },
  "src/c/**": { "src/c/c.ts": "export const c = 3;" },
};

function counting() {
  const runner: AgentRunner & { calls: number } = {
    calls: 0,
    async run(request) {
      runner.calls++;
      const guard = createPermissionGuard(request);
      for (const [path, content] of Object.entries(files[request.nodeId] ?? {})) {
        guard.decide("Write", { file_path: path, content });
        mkdirSync(dirname(resolve(request.root, path)), { recursive: true });
        writeFileSync(resolve(request.root, path), content, "utf-8");
      }
      return { files: guard.written(), text: "done" };
    },
  };
  const negotiator: Negotiator & { calls: number } = {
    calls: 0,
    async negotiate() {
      negotiator.calls++;
      return { summary: "settled", terms: [], files: [], transcript: [] };
    },
  };
  return { runner, negotiator };
}

interface Edits {
  goalA?: string;
  ask?: string;
}

/** a <- b (after), and c asks a. Rebuilt per call, like a program file is on each load. */
function program(services: ReturnType<typeof counting>, edits: Edits = {}): WolderInstance {
  const w = wolder({ root, model: "m", services });
  const project = w.layer().include("notes.md");
  const a = project
    .agent()
    .owns("src/a/")
    .goal(edits.goalA ?? "make a")
    .provides("A");
  project.agent().owns("src/b/").after(a).goal("make b");
  project.agent().owns("src/c/").asks(a, edits.ask ?? "need a").goal("make c");
  return w;
}

function planOf(w: WolderInstance, force?: boolean): Plan {
  const outcome = w.plan(force ? { force } : undefined);
  if (!outcome.ok) throw new Error(outcome.diagnostic.message);
  return outcome.plan;
}

function listing(dir: string): string[] {
  return readdirSync(dir, { recursive: true }).map(String).sort();
}

async function fullRun() {
  writeFileSync(resolve(root, "notes.md"), "notes");
  const services = counting();
  await program(services).run({ reporter: createSilentReporter(), record: false });
  return services;
}

describe("plan", () => {
  it("is all fresh after a full run", async () => {
    await fullRun();
    const plan = planOf(program(counting()));
    expect(Object.values(plan.nodes).map((n) => n.status)).toEqual(["fresh", "fresh", "fresh"]);
    expect(plan.contracts["contract:src/a/**"]).toEqual({ status: "fresh", reasons: [] });
  });

  it("is never for everything before any run", () => {
    writeFileSync(resolve(root, "notes.md"), "notes");
    const plan = planOf(program(counting()));
    expect(Object.values(plan.nodes).every((n) => n.status === "never")).toBe(true);
    expect(plan.contracts["contract:src/a/**"]!.status).toBe("never");
  });

  it("marks an edited goal stale and its dependents stale because of upstream", async () => {
    await fullRun();
    const plan = planOf(program(counting(), { goalA: "make a differently" }));
    expect(plan.nodes["src/a/**"]!.status).toBe("stale");
    expect(plan.nodes["src/a/**"]!.reasons.join()).toMatch(/goal/);
    expect(plan.nodes["src/b/**"]!.reasons).toContain("upstream `src/a/**` is stale");
  });

  it("names a modified input file", async () => {
    await fullRun();
    writeFileSync(resolve(root, "notes.md"), "changed notes");
    const plan = planOf(program(counting()));
    expect(plan.nodes["src/a/**"]!.reasons).toContain("notes.md changed");
    expect(plan.nodes["src/b/**"]!.status).toBe("stale");
  });

  it("makes the contract and its parties stale when the contract inputs change", async () => {
    await fullRun();
    const plan = planOf(program(counting(), { ask: "need a different a" }));
    const contract = plan.contracts["contract:src/a/**"]!;
    expect(contract.status).toBe("stale");
    expect(contract.reasons.join()).toMatch(/renegotiated/);
    for (const id of ["src/a/**", "src/c/**"]) {
      expect(plan.nodes[id]!.reasons).toContain(
        "contract `contract:src/a/**` must be renegotiated",
      );
    }
  });

  it("flags hand-edited output, and says everything is stale when forced", async () => {
    await fullRun();
    writeFileSync(resolve(root, "src/b/b.ts"), "edited");
    const plan = planOf(program(counting()));
    expect(plan.nodes["src/b/**"]!.reasons.join()).toMatch(/edited or deleted/);
    expect(plan.nodes["src/a/**"]!.status).toBe("fresh");

    const forced = planOf(program(counting()), true);
    expect(forced.nodes["src/a/**"]).toEqual({ status: "stale", reasons: ["forced"] });
    expect(forced.contracts["contract:src/a/**"]!.reasons).toEqual(["forced"]);
  });

  it("never calls the runner or negotiator and writes nothing", async () => {
    await fullRun();
    writeFileSync(resolve(root, "notes.md"), "changed notes");
    const before = listing(root);
    const manifest = readFileSync(resolve(root, "wolder.manifest.json"));

    const services = counting();
    planOf(program(services, { goalA: "other" }));
    planOf(program(services), true);

    expect(services.runner.calls).toBe(0);
    expect(services.negotiator.calls).toBe(0);
    expect(listing(root)).toEqual(before);
    expect(readFileSync(resolve(root, "wolder.manifest.json")).equals(manifest)).toBe(true);
  });

  it("catches what the old stored-inputs approximation called fresh", async () => {
    await fullRun();
    // A hand edit to upstream output: b's own record, chain and files are all unchanged.
    writeFileSync(resolve(root, "src/a/a.ts"), "export const a = 'edited';");

    const outcome = program(counting()).plan();
    if (!outcome.ok) throw new Error("did not assemble");
    const b = outcome.graph.nodes.find((n) => n.id === "src/b/**")!;
    const manifest = readManifest(root);
    const recorded = manifest.nodes[b.id]!;
    const oldApproximation =
      isFresh(manifest, b.id, recorded.inputHashes) &&
      recorded.inputHashes.chain === b.chainHash &&
      isOutputFresh(manifest, b.id, root);

    expect(oldApproximation).toBe(true); // the bug: "fresh"
    expect(outcome.plan.nodes[b.id]!.status).toBe("stale");
    expect(outcome.plan.nodes[b.id]!.reasons).toContain("upstream `src/a/**` is stale");
  });

  it("agrees with a real run: a planned-fresh program runs nothing", async () => {
    await fullRun();
    const services = counting();
    const w = program(services);
    expect(Object.values(planOf(w).nodes).every((n) => n.status === "fresh")).toBe(true);
    const result = await w.run({ reporter: createSilentReporter(), record: false });
    expect(result.skipped).toHaveLength(3);
    expect(services.runner.calls).toBe(0);
  });
});
