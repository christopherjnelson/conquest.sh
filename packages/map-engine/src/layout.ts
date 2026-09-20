import type { TerritoryRender, TerritoryState } from "@conquest/protocol";
import { getGeographyBoundingBox } from "./grid-engine.js";
import type { MapBundle } from "./registry.js";

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type LayoutMode = "compact" | "standard" | "wide";

/**
 * Determines responsive UI layout mode based on terminal dimensions.
 * - compact: columns < 130 or rows < 38
 * - standard: columns < 180 or rows < 51
 * - wide: columns >= 180 and rows >= 51
 */
export function getLayoutMode(cols: number, rows: number): LayoutMode {
  if (cols < 130 || rows < 38) {
    return "compact";
  }
  if (cols < 180 || rows < 51) {
    return "standard";
  }
  return "wide";
}

/** Whether at least one authored geography crop fits inside a map pane. */
export function canRenderMapInPane(bundle: MapBundle, pane: { width: number; height: number }): boolean {
  return bundle.renderVariants.some(({ grid }) => {
    const land = getGeographyBoundingBox(grid);
    return land.width <= pane.width && land.height <= pane.height;
  });
}

/**
 * The smallest full-width terminal that can display one authored geography
 * crop. Compact chrome is intentionally used because this is the final
 * fallback when a sidebar cannot leave enough room for the map.
 */
export function getMinimumTerminalDimensionsForMap(bundle: MapBundle): { columns: number; rows: number } {
  return bundle.renderVariants.reduce<{ columns: number; rows: number } | undefined>((minimum, { grid }) => {
    const land = getGeographyBoundingBox(grid);
    const candidate = { columns: land.width + 2, rows: land.height + 15 };
    if (!minimum || candidate.columns * candidate.rows < minimum.columns * minimum.rows) return candidate;
    return minimum;
  }, undefined) ?? { columns: 0, rows: 0 };
}

/** Interior WORLD MAP dimensions for an explicitly selected responsive mode. */
export function getMapContentDimensionsForLayout(
  terminalCols: number,
  terminalRows: number,
  mode: LayoutMode,
): { width: number; height: number } {
  if (mode === "compact") {
    return { width: Math.max(0, terminalCols - 2), height: Math.max(0, terminalRows - 15) };
  }
  const sidebarWidth = getSidebarWidthForTerminal(terminalCols, terminalRows, mode);
  const outerPaneWidth = Math.max(0, terminalCols - 1 - sidebarWidth);
  const chromeRows = mode === "wide" ? (terminalRows >= 55 ? 14 : 13) : 11;
  return {
    width: Math.max(0, outerPaneWidth - 2),
    height: Math.max(0, terminalRows - chromeRows - 2),
  };
}

/**
 * Keeps the normal sidebar layout whenever it can contain an authored map.
 * Otherwise map priority wins and the client uses the full-width compact pane.
 */
export function getLayoutModeForMap(cols: number, rows: number, bundle: MapBundle): LayoutMode {
  const normalMode = getLayoutMode(cols, rows);
  if (normalMode === "compact") return normalMode;
  return canRenderMapInPane(bundle, getMapContentDimensionsForLayout(cols, rows, normalMode))
    ? normalMode
    : "compact";
}

/** Width of the tactical inspector pane, measured in terminal columns. */
export function getSidebarWidthForTerminal(cols: number, rows: number, mode = getLayoutMode(cols, rows)): number {
  if (mode === "compact") return 0;
  return Math.min(mode === "wide" ? 42 : 38, Math.max(32, Math.floor((cols - 1) * (mode === "wide" ? 1 / 4 : 2 / 7))));
}

/** Interior dimensions of the bordered WORLD MAP pane used by App. */
export function getMapContentDimensionsForTerminal(
  terminalCols: number,
  terminalRows: number
): { width: number; height: number } {
  const mode = getLayoutMode(terminalCols, terminalRows);
  return getMapContentDimensionsForLayout(terminalCols, terminalRows, mode);
}

export const NODE_WIDTH = 18;
export const NODE_HEIGHT = 5;

export interface TerritoryLike {
  id?: string;
  position?: { x: number; y: number };
  render?: TerritoryRender;
}

export function getTerritoryBounds(territory: TerritoryLike): BoundingBox {
  return {
    x: territory.position?.x ?? 0,
    y: territory.position?.y ?? 0,
    width: territory.render?.width ?? NODE_WIDTH,
    height: territory.render?.height ?? NODE_HEIGHT,
  };
}

export function findTerritoryAt<T extends TerritoryLike = TerritoryState>(
  territories: Record<string, T> | T[],
  x: number,
  y: number
): T | null {
  const list = Array.isArray(territories) ? territories : Object.values(territories);
  for (const t of list) {
    const bounds = getTerritoryBounds(t);
    if (
      x >= bounds.x &&
      x < bounds.x + bounds.width &&
      y >= bounds.y &&
      y < bounds.y + bounds.height
    ) {
      return t;
    }
  }
  return null;
}

export * from "./grid-engine.js";
