import { describe, it, expect } from "vitest";
import { parseInspectArgs, openCommand } from "./inspect.js";
import { mergeConfig } from "./config.js";

describe("parseInspectArgs", () => {
  it("defaults", () => {
    expect(parseInspectArgs([])).toEqual({ program: "wolder.program.ts", port: 4747, mcp: false, open: true });
  });
  it("parses flags and program", () => {
    expect(parseInspectArgs(["p.ts", "--port", "5000", "--mcp", "--no-open"])).toEqual({
      program: "p.ts", port: 5000, mcp: true, open: false,
    });
    expect(parseInspectArgs(["--port=1"]).port).toBe(1);
  });
  it("rejects bad input", () => {
    expect(() => parseInspectArgs(["--port", "x"])).toThrow(/--port/);
    expect(() => parseInspectArgs(["--bogus"])).toThrow(/Unknown option/);
  });
});

describe("openCommand", () => {
  it("picks per platform", () => {
    expect(openCommand("http://x", "darwin")).toMatch(/^open /);
    expect(openCommand("http://x", "win32")).toMatch(/^start /);
    expect(openCommand("http://x", "linux")).toMatch(/^xdg-open /);
  });
});

describe("inspectorModel", () => {
  it("is empty by default and overridable", () => {
    expect(mergeConfig({}).inspectorModel).toBe("");
    expect(mergeConfig({ inspectorModel: "m" }).inspectorModel).toBe("m");
  });
});
