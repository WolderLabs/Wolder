import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { buildGateFeedback, buildSystemPrompt, buildUserPrompt } from "./prompt.js";
import type { AgentNode, Contract } from "./types.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(resolve(tmpdir(), "wolder-prompt-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function node(overrides: Partial<AgentNode> = {}): AgentNode {
  return {
    id: "src/services/**",
    label: "Todo Service",
    layer: { contexts: ["A todo service."], includedFiles: [], gates: [] },
    regions: ["src/services/**"],
    instruction: "Create a TodoService class.",
    contexts: [],
    uses: [],
    requests: [],
    provides: "Todo Service",
    chainHash: "hash",
    ...overrides,
  };
}

function prompt(overrides: Partial<AgentNode> = {}, extra: Partial<Parameters<typeof buildUserPrompt>[0]> = {}) {
  return buildUserPrompt({
    node: node(overrides),
    root,
    upstreamFiles: [],
    contracts: [],
    gates: [],
    ...extra,
  });
}

describe("system prompt", () => {
  it("names the region and says the boundary is enforced, not requested", () => {
    const text = buildSystemPrompt(node());
    expect(text).toContain("src/services/**");
    expect(text).toContain("refused at the tool");
  });
});

describe("user prompt", () => {
  it("puts layer context before agent context, in declaration order", () => {
    const text = prompt({
      layer: { contexts: ["first", "second"], includedFiles: [], gates: [] },
      contexts: ["agent-specific"],
    });
    expect(text.indexOf("first")).toBeLessThan(text.indexOf("second"));
    expect(text.indexOf("second")).toBeLessThan(text.indexOf("agent-specific"));
  });

  it("always states the writable region and the instruction", () => {
    const text = prompt();
    expect(text).toContain("## Your writable region");
    expect(text).toContain("- src/services/**");
    expect(text).toContain("Create a TodoService class.");
  });

  it("inlines developer-owned files and marks them untouchable", () => {
    writeFileSync(resolve(root, "model.ts"), "export interface TodoItem {}", "utf-8");
    const text = prompt({
      layer: { contexts: [], includedFiles: ["model.ts"], gates: [] },
    });
    expect(text).toContain("## Developer-owned files");
    expect(text).toContain("never change them");
    expect(text).toContain("export interface TodoItem {}");
  });

  it("skips an included file that is not there yet", () => {
    const text = prompt({ layer: { contexts: [], includedFiles: ["gone.ts"], gates: [] } });
    expect(text).not.toContain("## Developer-owned files");
  });

  it("inlines upstream files and says not to reimplement them", () => {
    writeFileSync(resolve(root, "upstream.ts"), "export const x = 1;", "utf-8");
    const text = prompt({}, { upstreamFiles: ["upstream.ts"] });
    expect(text).toContain("## Files from agents you depend on");
    expect(text).toContain("do not reimplement");
    expect(text).toContain("export const x = 1;");
  });

  it("does not repeat a file that is both included and upstream", () => {
    writeFileSync(resolve(root, "shared.ts"), "export const shared = 1;", "utf-8");
    const text = prompt(
      { layer: { contexts: [], includedFiles: ["shared.ts"], gates: [] } },
      { upstreamFiles: ["shared.ts"] },
    );
    expect(text.split("export const shared = 1;")).toHaveLength(2);
  });

  it("lists the gates that will run", () => {
    const text = prompt({}, { gates: [{ command: "npx tsc --noEmit", name: "typecheck" }] });
    expect(text).toContain("## Checks that will run against your work");
    expect(text).toContain("- typecheck");
  });
});

describe("contracts in the prompt", () => {
  const contract: Contract = {
    id: "contract:package.json",
    provider: "package.json",
    label: "NPM dependencies",
    requesters: ["src/services/**"],
    summary: "The package agent installs express@5.0.0.",
    terms: [{ name: "express", detail: "express@5.0.0 in dependencies" }],
    files: [{ path: "package.json", content: '{"dependencies":{"express":"^5.0.0"}}' }],
    hash: "h",
  };

  it("presents a settled contract as settled", () => {
    const text = prompt({}, { contracts: [contract] });
    expect(text).toContain("## Agreed contracts");
    expect(text).toContain("They are settled");
    expect(text).toContain("express@5.0.0 in dependencies");
  });

  it("tells the requester the provider has already written the files", () => {
    const text = prompt({}, { contracts: [contract] });
    expect(text).toContain("you requested this");
    expect(text).toContain("already written these files");
    expect(text).toContain('"express":"^5.0.0"');
  });

  it("tells the provider it already committed to them", () => {
    const text = buildUserPrompt({
      node: node({ id: "package.json", regions: ["package.json"] }),
      root,
      upstreamFiles: [],
      contracts: [contract],
      gates: [],
    });
    expect(text).toContain("you provide this");
    expect(text).toContain("already committed these files");
  });
});

describe("gate feedback", () => {
  it("names the gate and quotes the output", () => {
    const text = buildGateFeedback(
      { command: "npx tsc --noEmit", name: "typecheck" },
      "src/a.ts(1,1): error TS2304",
    );
    expect(text).toContain('The "typecheck" check failed');
    expect(text).toContain("error TS2304");
    expect(text).toContain("Stay inside your writable region.");
  });

  it("truncates a very long output", () => {
    const text = buildGateFeedback({ command: "x", name: "x" }, "e".repeat(20000));
    expect(text.length).toBeLessThan(9000);
  });
});
