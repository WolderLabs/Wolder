import { describe, expect, it } from "vitest";
import { maxColumns, parseOrder, shownColumns, toggleColumn } from "./layout";

describe("maxColumns", () => {
  it("fits fewer columns on narrower windows", () => {
    expect(maxColumns(500)).toBe(1);
    expect(maxColumns(1000)).toBe(2);
    expect(maxColumns(1600)).toBe(3);
  });
});

describe("shownColumns", () => {
  it("shows the most recently chosen columns, in screen order", () => {
    expect(shownColumns(["project", "program", "graph"], 3)).toEqual(["program", "graph", "project"]);
    expect(shownColumns(["project", "program", "graph"], 2)).toEqual(["program", "graph"]);
    expect(shownColumns(["project", "program", "graph"], 1)).toEqual(["graph"]);
  });

  it("brings a dropped column back when the window widens", () => {
    const order = toggleColumn(["program", "graph", "project"], "program", 1);
    expect(shownColumns(order, 1)).toEqual(["program"]);
    expect(shownColumns(order, 3)).toEqual(["program", "graph", "project"]);
  });
});

describe("toggleColumn", () => {
  it("hides a shown column", () => {
    expect(toggleColumn(["program", "graph", "project"], "graph", 3)).toEqual(["program", "project"]);
  });

  it("shows a hidden column as the most recent", () => {
    expect(toggleColumn(["program", "project"], "graph", 3)).toEqual(["program", "project", "graph"]);
  });

  it("replaces the oldest column when no more fit", () => {
    const order = toggleColumn(["program", "graph", "project"], "program", 2);
    expect(shownColumns(order, 2)).toEqual(["program", "project"]);
  });

  it("acts as tabs with one column, and never hides the last one", () => {
    const order = toggleColumn(["program", "graph", "project"], "graph", 1);
    expect(shownColumns(order, 1)).toEqual(["graph"]);
    expect(toggleColumn(order, "graph", 1)).toEqual(order);
    expect(toggleColumn(["graph"], "graph", 3)).toEqual(["graph"]);
  });
});

describe("parseOrder", () => {
  it("keeps a valid stored order", () => {
    expect(parseOrder('["project","graph"]')).toEqual(["project", "graph"]);
  });

  it("drops unknown and repeated columns", () => {
    expect(parseOrder('["graph","chat","graph"]')).toEqual(["graph"]);
  });

  it("falls back to every column", () => {
    expect(parseOrder(null)).toEqual(["program", "graph", "project"]);
    expect(parseOrder("not json")).toEqual(["program", "graph", "project"]);
    expect(parseOrder("[]")).toEqual(["program", "graph", "project"]);
  });
});
