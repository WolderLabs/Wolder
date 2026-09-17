import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AgentNode, Contract, Gate } from "./types.js";
import { layerContext } from "./layer.js";

export interface PromptInputs {
  readonly node: AgentNode;
  readonly root: string;
  /** Files produced by the agents this node `.uses()`. */
  readonly upstreamFiles: readonly string[];
  /** Every contract this node is party to, as provider or requester. */
  readonly contracts: readonly Contract[];
  readonly gates: readonly Gate[];
}

export function buildSystemPrompt(node: AgentNode): string {
  return [
    "You are a code-generating agent working inside an existing project.",
    "",
    "You own a writable region and nothing else. Writes outside it are refused at the tool",
    "layer, so do not attempt them — if you need something that lives in another agent's",
    "region, it has already been given to you as context or as a contract below.",
    "",
    `Your writable region: ${node.regions.join(", ")}`,
    "",
    "Read whatever you need to understand the project. Write complete, working files —",
    "no placeholders, no TODO stubs, no truncation. Finish the work in this run.",
  ].join("\n");
}

export function buildUserPrompt(inputs: PromptInputs): string {
  const { node, root, upstreamFiles, contracts, gates } = inputs;
  const parts: string[] = [];

  const context = [layerContext(node.layer), ...node.contexts].filter((s) => s.trim() !== "");
  if (context.length > 0) {
    parts.push("## Project context", "", context.join("\n\n"), "");
  }

  parts.push("## Your writable region", "");
  for (const region of node.regions) parts.push(`- ${region}`);
  parts.push("", "Everything outside this is read-only.", "");

  const included = readFiles(node.layer.includedFiles, root);
  if (included.length > 0) {
    parts.push(
      "## Developer-owned files",
      "",
      "These are owned by the developer. Read them, honour their shapes, never change them.",
      "",
    );
    for (const file of included) parts.push(fileBlock(file), "");
  }

  const upstream = readFiles(upstreamFiles, root).filter(
    (f) => !node.layer.includedFiles.includes(f.path),
  );
  if (upstream.length > 0) {
    parts.push(
      "## Files from agents you depend on",
      "",
      "Already generated. Import from them; do not reimplement or modify them.",
      "",
    );
    for (const file of upstream) parts.push(fileBlock(file), "");
  }

  if (contracts.length > 0) {
    parts.push(
      "## Agreed contracts",
      "",
      "You and the other agents named here already negotiated these. They are settled —",
      "generate against them exactly rather than reopening the question.",
      "",
    );
    for (const contract of contracts) parts.push(formatContract(contract, node.id), "");
  }

  parts.push("## What to do", "", node.instruction.trim(), "");

  if (gates.length > 0) {
    parts.push(
      "## Checks that will run against your work",
      "",
      ...gates.map((gate) => `- ${gate.name}`),
      "",
      "These run after you finish. Failures come back to you to fix, so it is cheaper to",
      "get them right the first time.",
      "",
    );
  }

  return parts.join("\n");
}

export function formatContract(contract: Contract, viewerId: string): string {
  const role = contract.provider === viewerId ? "you provide this" : "you requested this";
  const lines = [
    `### ${contract.label} — ${role}`,
    "",
    `Provider: ${contract.provider}`,
    `Requesters: ${contract.requesters.join(", ") || "(none)"}`,
    "",
    contract.summary.trim(),
  ];
  if (contract.terms.length > 0) {
    lines.push("", "Agreed terms:");
    for (const term of contract.terms) lines.push(`- **${term.name}**: ${term.detail}`);
  }
  if (contract.files.length > 0) {
    lines.push(
      "",
      contract.provider === viewerId
        ? "You already committed these files as part of the agreement — they are on disk. Keep them consistent with the rest of your work rather than discarding them:"
        : "The provider has already written these files. Treat them as decisions made:",
      "",
    );
    for (const file of contract.files) lines.push(fileBlock(file), "");
  }
  return lines.join("\n");
}

/** Feedback sent back to an agent when a gate fails. */
export function buildGateFeedback(gate: Gate, output: string): string {
  return [
    `The "${gate.name}" check failed against your region:`,
    "",
    "```",
    output.trim().slice(0, 8000),
    "```",
    "",
    "Fix the files you own so this passes. Stay inside your writable region.",
  ].join("\n");
}

function fileBlock(file: { path: string; content: string }): string {
  return [`=== FILE: ${file.path} ===`, file.content, "=== END FILE ==="].join("\n");
}

function readFiles(
  paths: readonly string[],
  root: string,
): Array<{ path: string; content: string }> {
  const seen = new Set<string>();
  const results: Array<{ path: string; content: string }> = [];
  for (const path of paths) {
    if (seen.has(path)) continue;
    const abs = resolve(root, path);
    if (!existsSync(abs)) continue;
    seen.add(path);
    results.push({ path, content: readFileSync(abs, "utf-8") });
  }
  return results;
}
