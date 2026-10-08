import { describe, expect, it } from "vitest";
import { diffRows, highlightLines } from "./highlight";

const text = (tokens: Array<{ text: string }>) => tokens.map((t) => t.text).join("");

describe("highlightLines", () => {
  it("splits a TypeScript file into classed tokens, one array per line", () => {
    const lines = highlightLines('const one: number = 1;\n// done\nexport const s = "x";', "src/a.ts")!;
    expect(lines.map(text)).toEqual(["const one: number = 1;", "// done", 'export const s = "x";']);
    expect(lines[0]).toContainEqual({ text: "const", cls: "tok-keyword" });
    expect(lines[0]).toContainEqual({ text: "number", cls: "tok-type" });
    expect(lines[0]).toContainEqual({ text: "1", cls: "tok-constant" });
    expect(lines[1]).toEqual([{ text: "// done", cls: "tok-comment" }]);
    expect(lines[2]).toContainEqual({ text: '"x"', cls: "tok-string" });
  });

  it("keeps a token that spans lines classed on each of them", () => {
    const lines = highlightLines("/* a\n   b */", "a.js")!;
    expect(lines).toEqual([[{ text: "/* a", cls: "tok-comment" }], [{ text: "   b */", cls: "tok-comment" }]]);
  });

  it("returns null for a language it does not highlight", () => {
    expect(highlightLines("# Title", "README.md")).toBeNull();
    expect(highlightLines("x", "Makefile")).toBeNull();
  });
});

describe("diffRows", () => {
  it("numbers current lines and leaves removed lines unnumbered", () => {
    const rows = diffRows("const a = 1;\nconst b = 2;\n", "const a = 1;\nconst b = 3;\nconst c = 4;\n", "a.ts");
    expect(rows.map((r) => [r.kind, r.line, text(r.tokens)])).toEqual([
      ["same", 1, "const a = 1;"],
      ["del", null, "const b = 2;"],
      ["add", 2, "const b = 3;"],
      ["add", 3, "const c = 4;"],
    ]);
  });

  it("highlights removed lines from the previous file and added lines from the current one", () => {
    const rows = diffRows('const a = "old";\n', "const a = 2;\n", "a.ts");
    expect(rows[0]!.tokens).toContainEqual({ text: '"old"', cls: "tok-string" });
    expect(rows[1]!.tokens).toContainEqual({ text: "2", cls: "tok-constant" });
  });

  it("shows a new file as all additions", () => {
    const rows = diffRows("", "one\ntwo\n", "notes.txt");
    expect(rows).toEqual([
      { kind: "add", line: 1, tokens: [{ text: "one", cls: "" }] },
      { kind: "add", line: 2, tokens: [{ text: "two", cls: "" }] },
    ]);
  });
});
