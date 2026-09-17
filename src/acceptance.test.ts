import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { wolder } from "./wolder.js";
import { createPermissionGuard } from "./runner.js";
import { createSilentReporter } from "./reporter.js";
import { typescriptConventions } from "../packages/typescript/src/index.js";
import type { AgentRunner, Negotiator } from "./types.js";

/**
 * The north-star program from `samples/todo-service/wolder.program.ts`, run against
 * scripted agents. It is the acceptance criterion for v2: layers composing a shipped
 * layer, four agents on disjoint regions, two backward `requests` edges settling
 * contracts that both sides see, a `uses` edge ordering two of them, and one await.
 */

const WRITES: Record<string, Record<string, string>> = {
  "README.md": { "README.md": "# Todo Service\n\nSee TodoService usage below.\n" },
  // Project setup regenerates its files, but keeps the dependency it agreed to — the
  // contract file landed in its region before it ran, as a decision already made.
  "package.json+tsconfig.json": {
    "package.json": '{"name":"todo-service","dependencies":{"express":"^5.0.0"}}',
    "tsconfig.json": '{"compilerOptions":{"module":"Node16","strict":true}}',
  },
  "src/services/**": {
    "src/services/todoService.ts": "export class TodoService {}",
  },
  "src/controllers/**": {
    "src/controllers/todoController.ts":
      'import express from "express";\nexport class TodoController {}',
  },
};

let root: string;
let prompts: Record<string, string>;

function runner(): AgentRunner {
  return {
    async run(request) {
      prompts[request.nodeId] = request.prompt;
      const guard = createPermissionGuard(request);
      for (const [path, content] of Object.entries(WRITES[request.nodeId] ?? {})) {
        if (guard.decide("Write", { file_path: path }).behavior === "deny") {
          throw new Error(`${request.nodeId} was refused a write to ${path}`);
        }
        const abs = resolve(request.root, path);
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, content, "utf-8");
      }
      return { files: guard.written(), text: "done" };
    },
  };
}

const negotiator: Negotiator = {
  async negotiate(request) {
    if (request.provider.id === "package.json+tsconfig.json") {
      return {
        summary: "package.json will depend on express@5.0.0; the controller imports it.",
        terms: [{ name: "express", detail: "express@^5.0.0 in dependencies" }],
        files: [
          {
            path: "package.json",
            content: '{"name":"todo-service","dependencies":{"express":"^5.0.0"}}',
          },
        ],
        transcript: [],
      };
    }
    return {
      summary: "The README will carry a Usage section covering TodoService's CRUD methods.",
      terms: [{ name: "Usage section", detail: "getAll, get, add, update, delete" }],
      files: [],
      transcript: [],
    };
  },
};

function program() {
  const w = wolder({
    root,
    model: "claude-sonnet-4-6",
    services: { runner: runner(), negotiator },
  });

  const project = w
    .layer()
    .apply(typescriptConventions)
    .context(`
      This project is a simple Todo service implemented in TypeScript.
      It includes models, services, and controllers for managing Todo items.
    `)
    .includeFile("src/models/TodoItem.ts");

  const readme = project
    .scopedAgent()
    .canWrite("README.md")
    .act(`Generate a README.md file for the project.`)
    .provides("Documentation");

  const dependencies = project
    .scopedAgent()
    .canWrite("package.json")
    .canWrite("tsconfig.json")
    .act(`
      Initialize an NPM project with the necessary dependencies,
      make assumptions about library selection as needed.

      Write a matching tsconfig.json: strict, ESM with Node16 module resolution,
      a modern ES target, compiling src/ to dist/.
    `)
    .provides("NPM dependencies and TypeScript config");

  const todoService = project
    .scopedAgent()
    .canWrite("src/services/")
    .requests(readme, "Document Todo Service usage")
    .act(`
      Create a TodoService class that provides CRUD operations for TodoItem objects.
      Use an in-memory Map<string, TodoItem> for storage.
      Generate UUIDs randomly.
    `)
    .provides("Todo Service");

  const todoController = project
    .scopedAgent()
    .canWrite("src/controllers/")
    .requests(dependencies, "A framework like Express.js for handling HTTP requests")
    .uses(todoService)
    .act(`Create a TodoController class that wraps TodoService and provides a simple API.`)
    .provides("Todo API");

  return { w, readme, dependencies, todoService, todoController };
}

beforeEach(() => {
  root = mkdtempSync(resolve(tmpdir(), "wolder-acceptance-"));
  prompts = {};
  mkdirSync(resolve(root, "src/models"), { recursive: true });
  writeFileSync(
    resolve(root, "src/models/TodoItem.ts"),
    "export interface TodoItem { id: string; title: string; done: boolean }",
    "utf-8",
  );
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("the todo-service program", () => {
  it("runs as written", async () => {
    const { w, todoService, todoController } = program();
    const result = await w.build({ reporter: createSilentReporter() });

    expect([...result.artifacts].map((a) => a.id).sort()).toEqual([
      "README.md",
      "package.json+tsconfig.json",
      "src/controllers/**",
      "src/services/**",
    ]);
    expect(todoService.artifact.files).toEqual(["src/services/todoService.ts"]);
    expect(todoController.artifact.provides).toBe("Todo API");
    expect(
      readFileSync(resolve(root, "src/controllers/todoController.ts"), "utf-8"),
    ).toContain("TodoController");
  });

  it("gives every agent the shipped layer and the developer-owned model", async () => {
    const { w } = program();
    await w.build({ reporter: createSilentReporter() });

    for (const prompt of Object.values(prompts)) {
      expect(prompt).toContain("TypeScript conventions");
      expect(prompt).toContain("simple Todo service implemented in TypeScript");
      expect(prompt).toContain("export interface TodoItem");
    }
  });

  it("settles both requests edges and shows each contract to both sides", async () => {
    const { w } = program();
    const result = await w.build({ reporter: createSilentReporter() });

    expect([...result.contracts].map((c) => c.id).sort()).toEqual([
      "contract:README.md",
      "contract:package.json+tsconfig.json",
    ]);

    // The README knows what it agreed to document; the service knows what it promised.
    expect(prompts["README.md"]).toContain("Usage section");
    expect(prompts["src/services/**"]).toContain("Usage section");

    // The controller may import express because the package agent agreed to install it —
    // and the controller never wrote package.json.
    expect(prompts["package.json+tsconfig.json"]).toContain("express@^5.0.0");
    expect(prompts["src/controllers/**"]).toContain("express@^5.0.0");
    expect(readFileSync(resolve(root, "package.json"), "utf-8")).toContain("express");
  });

  it("orders the uses edge and leaves the requests edges unordered", async () => {
    const order: string[] = [];
    const w = wolder({
      root,
      model: "claude-sonnet-4-6",
      services: {
        negotiator,
        runner: {
          async run(request) {
            order.push(request.nodeId);
            return { files: [], text: "" };
          },
        },
      },
    });
    const project = w.layer();
    const readme = project.scopedAgent().canWrite("README.md").act("readme").provides("Docs");
    const service = project
      .scopedAgent()
      .canWrite("src/services/")
      .requests(readme, "Document Todo Service usage")
      .act("service")
      .provides("Todo Service");
    project.scopedAgent().canWrite("src/controllers/").uses(service).act("controller");

    await w.build({ reporter: createSilentReporter() });

    expect(order.indexOf("src/services/**")).toBeLessThan(order.indexOf("src/controllers/**"));
    // The README is not ordered against the service — a requests edge carries content,
    // not sequence.
    expect(order).toContain("README.md");
  });

  it("does no work at all on a second run", async () => {
    await program().w.build({ reporter: createSilentReporter() });

    prompts = {};
    const second = await program().w.build({ reporter: createSilentReporter() });

    expect(prompts).toEqual({});
    expect([...second.skipped].sort()).toEqual([
      "README.md",
      "package.json+tsconfig.json",
      "src/controllers/**",
      "src/services/**",
    ]);
  });
});
