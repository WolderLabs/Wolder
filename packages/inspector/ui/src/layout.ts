// Which columns are on screen. Pure, so the rules are testable without a browser.

export type ColumnId = "program" | "graph" | "project";

/** Left-to-right order on screen. */
export const COLUMNS: readonly ColumnId[] = ["program", "graph", "project"];

export const COLUMN_LABELS: Record<ColumnId, string> = { program: "Program", graph: "Graph", project: "Project" };

/** How many columns fit: one below 800px (the toggles act as tabs), two below 1200px, else all three. */
export function maxColumns(width: number): number {
  return width < 800 ? 1 : width < 1200 ? 2 : 3;
}

/**
 * `order` lists the columns the user wants, least recently chosen first. The newest
 * `max` of them are shown, so a narrow window drops the oldest and a wider one
 * brings it back.
 */
export function shownColumns(order: readonly ColumnId[], max: number): ColumnId[] {
  const recent = order.slice(-Math.max(1, max));
  return COLUMNS.filter((id) => recent.includes(id));
}

/** Show a hidden column (as the most recent), or hide a shown one. The last column cannot be hidden. */
export function toggleColumn(order: readonly ColumnId[], id: ColumnId, max: number): ColumnId[] {
  const shown = shownColumns(order, max);
  const rest = order.filter((c) => c !== id);
  if (!shown.includes(id)) return [...rest, id];
  return shown.length === 1 ? [...order] : rest;
}

/** A stored order, or every column when nothing valid was stored. */
export function parseOrder(raw: string | null): ColumnId[] {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (Array.isArray(value)) {
      const order = value.filter((c): c is ColumnId => COLUMNS.includes(c as ColumnId));
      const unique = order.filter((c, i) => order.indexOf(c) === i);
      if (unique.length > 0) return unique;
    }
  } catch {
    // Fall through to the default.
  }
  return [...COLUMNS];
}

/** localStorage that never throws (private windows, blocked site data). */
export const layoutStorage = {
  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Sizes just are not remembered.
    }
  },
};
