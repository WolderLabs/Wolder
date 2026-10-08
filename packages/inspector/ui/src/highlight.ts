import { javascriptLanguage, jsxLanguage, tsxLanguage, typescriptLanguage } from "@codemirror/lang-javascript";
import { highlightCode, tagHighlighter, tags as t } from "@lezer/highlight";
import { diffLines } from "diff";

/**
 * One set of token classes for the program editor and the file view. The colours
 * live in app.css as `--tok-*` variables, so both follow the light and dark themes.
 */
export const highlighter = tagHighlighter([
  { tag: t.comment, class: "tok-comment" },
  { tag: [t.string, t.special(t.string), t.regexp, t.escape], class: "tok-string" },
  { tag: [t.number, t.bool, t.null, t.atom, t.self], class: "tok-constant" },
  { tag: [t.keyword, t.modifier, t.operatorKeyword], class: "tok-keyword" },
  { tag: [t.typeName, t.className, t.namespace], class: "tok-type" },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.function(t.definition(t.variableName))], class: "tok-function" },
  { tag: [t.propertyName, t.attributeName], class: "tok-property" },
  { tag: t.definition(t.variableName), class: "tok-definition" },
  { tag: t.tagName, class: "tok-tag" },
  { tag: [t.operator, t.punctuation, t.meta], class: "tok-punctuation" },
  { tag: t.invalid, class: "tok-invalid" },
]);

export interface Token {
  text: string;
  /** Space-separated token classes; empty for plain text. */
  cls: string;
}

const LANGUAGES: Record<string, typeof javascriptLanguage> = {
  ts: typescriptLanguage, mts: typescriptLanguage, cts: typescriptLanguage,
  tsx: tsxLanguage,
  js: javascriptLanguage, mjs: javascriptLanguage, cjs: javascriptLanguage,
  jsx: jsxLanguage,
};

/** Parsing is synchronous, so very large files stay plain. */
const MAX_HIGHLIGHT_CHARS = 300_000;

/** The file's lines as highlighted tokens, or null when its language is not one we highlight. */
export function highlightLines(code: string, path: string): Token[][] | null {
  const language = LANGUAGES[path.split(".").pop()?.toLowerCase() ?? ""];
  if (!language || code.length > MAX_HIGHLIGHT_CHARS) return null;
  const lines: Token[][] = [[]];
  highlightCode(
    code,
    language.parser.parse(code),
    highlighter,
    (text, cls) => lines[lines.length - 1]!.push({ text, cls }),
    () => lines.push([]),
  );
  return lines;
}

export interface DiffRow {
  kind: "add" | "del" | "same";
  /** Line number in the current file; null for a removed line. */
  line: number | null;
  tokens: Token[];
}

/** A line diff from `previous` to `current`, each row highlighted in the context of its own file. */
export function diffRows(previous: string, current: string, path: string): DiffRow[] {
  const now = highlightLines(current, path);
  const before = highlightLines(previous, path);
  const rows: DiffRow[] = [];
  let iNow = 0;
  let iBefore = 0;
  for (const piece of diffLines(previous, current)) {
    for (const text of piece.value.replace(/\n$/, "").split("\n")) {
      const plain: Token[] = [{ text, cls: "" }];
      if (piece.removed) {
        rows.push({ kind: "del", line: null, tokens: before?.[iBefore] ?? plain });
        iBefore++;
      } else {
        rows.push({ kind: piece.added ? "add" : "same", line: iNow + 1, tokens: now?.[iNow] ?? plain });
        iNow++;
        if (!piece.added) iBefore++;
      }
    }
  }
  return rows;
}
