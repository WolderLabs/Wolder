/**
 * Writable regions.
 *
 * `.canWrite(region)` claims a region. Inside it is that agent's to own; outside
 * is off-limits. Two agents may not claim regions that intersect — checked before
 * the first agent starts, which deferred execution is what makes possible.
 */

/**
 * Turn a developer-written region into a glob.
 *
 * - anything containing a glob character is left alone
 * - a trailing slash means "this directory"
 * - a final segment with no dot in it is a directory too
 * - everything else is a single file
 */
export function normalizeRegion(region: string): string {
  const cleaned = region.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (cleaned === "") {
    throw new Error("canWrite() needs a path — it was given an empty string");
  }
  if (cleaned.startsWith("/") || /^[A-Za-z]:/.test(cleaned)) {
    throw new Error(
      `canWrite("${region}") must be relative to the project root, not an absolute path`,
    );
  }
  if (cleaned.split("/").includes("..")) {
    throw new Error(`canWrite("${region}") must not escape the project root with ".."`);
  }
  if (/[*?]/.test(cleaned)) return cleaned;
  if (cleaned.endsWith("/")) return `${cleaned}**`;

  const last = cleaned.split("/").pop()!;
  return last.includes(".") ? cleaned : `${cleaned}/**`;
}

export function toPosix(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** Does a normalized region cover this root-relative path? */
export function regionMatches(region: string, path: string): boolean {
  return matchSegments(region.split("/"), toPosix(path).split("/"));
}

export function regionsMatch(regions: readonly string[], path: string): boolean {
  return regions.some((region) => regionMatches(region, path));
}

function matchSegments(pattern: string[], path: string[]): boolean {
  if (pattern.length === 0) return path.length === 0;

  const [head, ...rest] = pattern;
  if (head === "**") {
    // zero segments, or consume one and try again
    if (matchSegments(rest, path)) return true;
    return path.length > 0 && matchSegments(pattern, path.slice(1));
  }
  if (path.length === 0) return false;
  return matchSegment(head!, path[0]!) && matchSegments(rest, path.slice(1));
}

function matchSegment(pattern: string, value: string): boolean {
  if (pattern.length === 0) return value.length === 0;
  const head = pattern[0]!;
  if (head === "*") {
    if (matchSegment(pattern.slice(1), value)) return true;
    return value.length > 0 && matchSegment(pattern, value.slice(1));
  }
  if (value.length === 0) return false;
  if (head === "?") return matchSegment(pattern.slice(1), value.slice(1));
  return head === value[0] && matchSegment(pattern.slice(1), value.slice(1));
}

/**
 * Can any one path fall inside both regions?
 *
 * Exact for literals, `*`, `?` and `**` — nesting (`src/**` vs `src/services/**`)
 * and crossing globs (`src/**` + `*.test.ts` vs `src/services/**`) both resolve
 * correctly, which prefix comparison would not.
 */
export function regionsIntersect(a: string, b: string): boolean {
  return intersectSegments(a.split("/"), b.split("/"));
}

function intersectSegments(a: string[], b: string[]): boolean {
  if (a.length === 0 && b.length === 0) return true;
  if (a.length === 0) return b.every((s) => s === "**");
  if (b.length === 0) return a.every((s) => s === "**");

  if (a[0] === "**") {
    if (intersectSegments(a.slice(1), b)) return true;
    return intersectSegments(a, b.slice(1));
  }
  if (b[0] === "**") {
    if (intersectSegments(a, b.slice(1))) return true;
    return intersectSegments(a.slice(1), b);
  }
  return (
    segmentsIntersect(a[0]!, b[0]!) && intersectSegments(a.slice(1), b.slice(1))
  );
}

/** Can one string match both single-segment patterns? */
function segmentsIntersect(a: string, b: string): boolean {
  if (a.length === 0 && b.length === 0) return true;
  if (a.length === 0) return [...b].every((c) => c === "*");
  if (b.length === 0) return [...a].every((c) => c === "*");

  if (a[0] === "*") {
    if (segmentsIntersect(a.slice(1), b)) return true;
    return segmentsIntersect(a, b.slice(1));
  }
  if (b[0] === "*") {
    if (segmentsIntersect(a, b.slice(1))) return true;
    return segmentsIntersect(a.slice(1), b);
  }
  if (a[0] === "?" || b[0] === "?") return segmentsIntersect(a.slice(1), b.slice(1));
  return a[0] === b[0] && segmentsIntersect(a.slice(1), b.slice(1));
}
