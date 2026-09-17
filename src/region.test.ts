import { describe, it, expect } from "vitest";
import { normalizeRegion, regionMatches, regionsIntersect, regionsMatch } from "./region.js";

describe("normalizeRegion", () => {
  it("leaves a file path alone", () => {
    expect(normalizeRegion("README.md")).toBe("README.md");
    expect(normalizeRegion("src/server/index.ts")).toBe("src/server/index.ts");
  });

  it("treats a trailing slash as a directory", () => {
    expect(normalizeRegion("src/services/")).toBe("src/services/**");
  });

  it("treats a final segment with no extension as a directory", () => {
    expect(normalizeRegion("src/services")).toBe("src/services/**");
  });

  it("leaves an explicit glob alone", () => {
    expect(normalizeRegion("src/**/*.test.ts")).toBe("src/**/*.test.ts");
  });

  it("normalises windows separators and a leading ./", () => {
    expect(normalizeRegion("./src\\services\\")).toBe("src/services/**");
  });

  it("rejects paths that leave the project", () => {
    expect(() => normalizeRegion("")).toThrow(/needs a path/);
    expect(() => normalizeRegion("/etc/passwd")).toThrow(/relative to the project root/);
    expect(() => normalizeRegion("C:/Windows")).toThrow(/relative to the project root/);
    expect(() => normalizeRegion("../secrets/")).toThrow(/escape the project root/);
  });
});

describe("regionMatches", () => {
  it("matches an exact file", () => {
    expect(regionMatches("README.md", "README.md")).toBe(true);
    expect(regionMatches("README.md", "docs/README.md")).toBe(false);
  });

  it("matches anything under a directory, at any depth", () => {
    expect(regionMatches("src/services/**", "src/services/todo.ts")).toBe(true);
    expect(regionMatches("src/services/**", "src/services/deep/nested/todo.ts")).toBe(true);
    expect(regionMatches("src/services/**", "src/controllers/todo.ts")).toBe(false);
  });

  it("keeps * inside a single segment", () => {
    expect(regionMatches("src/*.ts", "src/index.ts")).toBe(true);
    expect(regionMatches("src/*.ts", "src/nested/index.ts")).toBe(false);
  });

  it("matches ? against exactly one character", () => {
    expect(regionMatches("src/v?.ts", "src/v1.ts")).toBe(true);
    expect(regionMatches("src/v?.ts", "src/v10.ts")).toBe(false);
  });

  it("accepts windows separators in the path under test", () => {
    expect(regionMatches("src/services/**", "src\\services\\todo.ts")).toBe(true);
  });

  it("matches against a set of regions", () => {
    expect(regionsMatch(["README.md", "src/services/**"], "src/services/a.ts")).toBe(true);
    expect(regionsMatch(["README.md", "src/services/**"], "package.json")).toBe(false);
  });
});

describe("regionsIntersect", () => {
  it("finds identical regions overlapping", () => {
    expect(regionsIntersect("README.md", "README.md")).toBe(true);
  });

  it("finds disjoint siblings not overlapping", () => {
    expect(regionsIntersect("src/services/**", "src/controllers/**")).toBe(false);
    expect(regionsIntersect("README.md", "package.json")).toBe(false);
  });

  it("counts nesting as overlap — the grabby-region case", () => {
    expect(regionsIntersect("src/**", "src/services/**")).toBe(true);
    expect(regionsIntersect("src/**", "src/index.ts")).toBe(true);
  });

  it("finds globs that cross without nesting", () => {
    expect(regionsIntersect("src/**/*.test.ts", "src/services/**")).toBe(true);
    expect(regionsIntersect("src/**/*.test.ts", "src/services/todo.ts")).toBe(false);
  });

  it("resolves overlapping in-segment patterns", () => {
    expect(regionsIntersect("src/todo*.ts", "src/*Service.ts")).toBe(true);
    expect(regionsIntersect("src/a*.ts", "src/b*.ts")).toBe(false);
    expect(regionsIntersect("src/v?.ts", "src/v1.ts")).toBe(true);
    expect(regionsIntersect("src/v?.ts", "src/v10.ts")).toBe(false);
  });

  it("is symmetric", () => {
    const pairs: Array<[string, string]> = [
      ["src/**", "src/services/**"],
      ["src/**/*.test.ts", "src/services/**"],
      ["README.md", "package.json"],
      ["src/a*.ts", "src/*b.ts"],
    ];
    for (const [a, b] of pairs) {
      expect(regionsIntersect(a, b)).toBe(regionsIntersect(b, a));
    }
  });
});
