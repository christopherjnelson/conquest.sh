import type { TerritoryState } from "@conquest/protocol";

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const NODE_WIDTH = 12;
export const NODE_HEIGHT = 4;

export function getTerritoryBounds(territory: { position: { x: number; y: number } }): BoundingBox {
  return {
    x: territory.position.x,
    y: territory.position.y,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  };
}

export function findTerritoryAt(
  territories: Record<string, TerritoryState>,
  x: number,
  y: number
): TerritoryState | null {
  for (const t of Object.values(territories)) {
    const bounds = getTerritoryBounds(t);
    if (x >= bounds.x && x < bounds.x + bounds.width && y >= bounds.y && y < bounds.y + bounds.height) {
      return t;
    }
  }
  return null;
}
