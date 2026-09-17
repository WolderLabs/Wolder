import { createHash } from "node:crypto";

export function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function hashJson(value: unknown): string {
  return sha256(JSON.stringify(value));
}

/**
 * Strip the common indentation from a template literal block so prose written
 * inside an indented chain reaches the model without its leading whitespace.
 */
export function dedent(text: string): string {
  const lines = text.replace(/\t/g, "  ").split("\n");
  while (lines.length > 0 && lines[0]!.trim() === "") lines.shift();
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === "") lines.pop();

  let indent = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    if (line.trim() === "") continue;
    indent = Math.min(indent, line.length - line.trimStart().length);
  }
  if (!Number.isFinite(indent)) indent = 0;

  return lines.map((line) => line.slice(indent)).join("\n");
}

/** Append to a readonly array, keeping it a set, preserving first-seen order. */
export function appendUnique(items: readonly string[], value: string): readonly string[] {
  return items.includes(value) ? items : [...items, value];
}
