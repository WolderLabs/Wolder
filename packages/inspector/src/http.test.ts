import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { recordedProject } from "./fixture.js";
import { startHttpServer } from "./http.js";
import type { HttpServer } from "./http.js";

let root: string;
let http: HttpServer;

beforeEach(async () => {
  const project = await recordedProject();
  root = project.root;
  http = await startHttpServer(project.store, { port: 0 });
});

afterEach(async () => {
  await http.close();
  rmSync(root, { recursive: true, force: true });
});

describe("the HTTP server", () => {
  it("answers POST /api/<name> with JSON", async () => {
    const res = await fetch(`http://127.0.0.1:${http.port}/api/runs`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(1);
  });

  it("returns 500 with an error body when a handler throws", async () => {
    const res = await fetch(`http://127.0.0.1:${http.port}/api/run`, {
      method: "POST",
      body: JSON.stringify({ id: "nope" }),
    });
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: string }).error).toMatch(/No recorded run/);
  });

  it("serves a placeholder when the UI is not built", async () => {
    const res = await fetch(`http://127.0.0.1:${http.port}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Wolder inspector");
  });
});
