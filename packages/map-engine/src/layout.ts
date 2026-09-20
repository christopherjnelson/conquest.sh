import type { TerritoryRender, TerritoryState } from "@conquest/protocol";

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
