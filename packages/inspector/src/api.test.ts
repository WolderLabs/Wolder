import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { handlers } from "./api.js";
import type { Store } from "./api.js";
import { recordedProject } from "./fixture.js";
import type { RunEvent } from "@wolder/core";

let root: string;
let store: Store;
let programFile: string;
let runId: string;
let events: RunEvent[];

beforeEach(async () => {
  ({ root, store, programFile } = await recordedProject());
  const runs = await handlers.runs(store);
  runId = runs[0]!.id;
  events = (await handlers.run(store, { id: runId })).events;
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

const doneSeq = (node: string): number =>
  events.find((e) => e.kind === "node:done" && e.node === node)!.seq;
const snapshotSeq = (node: string): number =>
  events.find((e) => e.kind === "snapshot" && e.node === node)!.seq;

describe("the read API", () => {
  it("lists runs and returns one run's events", async () => {
    const runs = await handlers.runs(store);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.status).toBe("ok");
    expect(events[0]!.kind).toBe("phase");
  });

  it("returns prompts, files and events for a node", async () => {
    const node = await handlers.node(store, { run: runId, id: "b/**" });
    expect(node.prompts).toHaveLength(1);
    expect(node.prompts[0]!.user).toContain("second");
    expect(node.files.sort()).toEqual(["b/three.ts", "b/two.ts"]);
    expect(node.events.every((e) => e.node === "b/**")).toBe(true);
    expect(Object.keys(node.inputHashes)).toContain("chain");
  });

  it("picks the snapshot at or before the scrubber position", async () => {
    const between = snapshotSeq("a/**") + 1;
    expect(between).toBeLessThan(doneSeq("b/**"));
    const mid = await handlers.snapshot(store, { run: runId, at: between });
    expect(Object.keys(mid.tree)).toEqual(["a/one.ts"]);
    const end = await handlers.snapshot(store, { run: runId, at: events.length });
    expect(Object.keys(end.tree).sort()).toEqual(["a/one.ts", "b/three.ts", "b/two.ts"]);
    expect((await handlers.snapshot(store, { run: runId, at: 0 })).tree).toEqual({});
  });

  it("reads file content from a snapshot blob and from disk", async () => {
    const at = events.length;
    expect(await handlers.file(store, { run: runId, at, path: "a/one.ts" })).toEqual({
      content: "export const one = 1;",
    });
    expect(await handlers.file(store, { run: runId, at: "now", path: "b/two.ts" })).toEqual({
      content: "export const two = 2;",
    });
    await expect(
      handlers.file(store, { run: runId, at: "now", path: "../outside.ts" }),
    ).rejects.toThrow(/outside the project root/);
  });

  it("diffs two snapshots", async () => {
    const diff = await handlers.diff(store, {
      run: runId,
      a: snapshotSeq("a/**"),
      b: snapshotSeq("b/**"),
    });
    expect(diff).toEqual({ added: ["b/three.ts", "b/two.ts"], removed: [], changed: [] });
  });

  it("reports freshness from the manifest", async () => {
    const result = await handlers.graph({ ...store, program: store.program });
    expect(result.ok).toBe(true);
  });
});

describe("program.edit", () => {
  it("writes a program file", async () => {
    await handlers["program.edit"](store, { path: programFile, content: "export const x = 1;\n" });
    const files = await handlers["program.files"](store);
    expect(files.files[0]!.content).toBe("export const x = 1;\n");
  });

  it("refuses a path that is not a program file", async () => {
    await expect(
      handlers["program.edit"](store, { path: "../outside.ts", content: "x" }),
    ).rejects.toThrow(/not one of the program files/);
  });
});
