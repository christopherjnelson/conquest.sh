import {
  MAP_GRID_IRONREACH,
  type GridMapDefinition,
  type GridTerritoryMetadata,
  type GridSeaRoute,
  type GridMapDecoration,
  type GridMapDecorations,
} from "./maps/grid-ironreach.js";

export interface BorderCellInfo {
  isBorder: boolean;
  north: boolean;
  south: boolean;
  west: boolean;
  east: boolean;
  territoryId: string | null;
}

/**
 * Returns the territory ID at grid coordinates (x, y), or null if water or out of bounds.
 */
export function getTerritoryAt(
  x: number,
  y: number,
  map: GridMapDefinition = MAP_GRID_IRONREACH
): string | null {
  if (y < 0 || y >= map.template.length || x < 0 || x >= map.template[0].length) {
    return null;
  }
  const char = map.template[y][x];
  return map.charToTerritoryId[char] ?? null;
}

/**
 * Checks if coordinate (x, y) is on the boundary of its territory.
 */
export function isBorderCell(
  x: number,
  y: number,
  map: GridMapDefinition = MAP_GRID_IRONREACH
): boolean {
  return getBorderInfo(x, y, map).isBorder;
}

/**
 * Computes border info for any cell (x, y).
 * For any land cell (x, y), computes if it's on the boundary of its territory:
 * - isBorder: touches water or a different territory on north, south, west, or east
 * - north: touches different cell above
 * - south: touches different cell below
 * - west: touches different cell left
 * - east: touches different cell right
 */
export function getBorderInfo(
  x: number,
  y: number,
  map: GridMapDefinition = MAP_GRID_IRONREACH
): BorderCellInfo {
  const currentTerritory = getTerritoryAt(x, y, map);
  if (!currentTerritory) {
    return {
      isBorder: false,
      north: false,
      south: false,
      west: false,
      east: false,
      territoryId: null,
    };
  }

  const northTerritory = getTerritoryAt(x, y - 1, map);
  const southTerritory = getTerritoryAt(x, y + 1, map);
  const westTerritory = getTerritoryAt(x - 1, y, map);
  const eastTerritory = getTerritoryAt(x + 1, y, map);

  const north = northTerritory !== currentTerritory;
  const south = southTerritory !== currentTerritory;
  const west = westTerritory !== currentTerritory;
  const east = eastTerritory !== currentTerritory;
  const isBorder = north || south || west || east;

  return {
    isBorder,
    north,
    south,
    west,
    east,
    territoryId: currentTerritory,
  };
}

/**
 * Returns all (x, y) coordinates belonging to a specific territory.
 */
export function getTerritoryCells(
  territoryId: string,
  map: GridMapDefinition = MAP_GRID_IRONREACH
): Array<{ x: number; y: number }> {
  const targetChar = map.territoryIdToChar[territoryId];
  if (!targetChar) return [];
  const cells: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < map.template.length; y++) {
    for (let x = 0; x < map.template[y].length; x++) {
      if (map.template[y][x] === targetChar) {
        cells.push({ x, y });
      }
    }
  }
  return cells;
}

/**
 * Calculates the centroid (average x, y coordinate) of all cells belonging to a territory.
 */
export function getTerritoryCentroid(
  territoryId: string,
  map: GridMapDefinition = MAP_GRID_IRONREACH
): { x: number; y: number } {
  const cells = getTerritoryCells(territoryId, map);
  if (cells.length === 0) {
    const t = map.territories.find((item) => item.id === territoryId);
    return t ? { ...t.labelPos } : { x: 0, y: 0 };
  }
  let sumX = 0;
  let sumY = 0;
  for (const cell of cells) {
    sumX += cell.x;
    sumY += cell.y;
  }
  return {
    x: sumX / cells.length,
    y: sumY / cells.length,
  };
}

/**
 * Computes centroids and selects the closest candidate territory in the requested cardinal direction.
 */
export function getNextTerritoryInDirection(
  currentId: string,
  direction: "up" | "down" | "left" | "right",
  map: GridMapDefinition = MAP_GRID_IRONREACH
): string | null {
  const currentCentroid = getTerritoryCentroid(currentId, map);
  let bestTarget: string | null = null;
  let bestScore = Infinity;

  for (const t of map.territories) {
    if (t.id === currentId) continue;
    const targetCentroid = getTerritoryCentroid(t.id, map);
    const dx = targetCentroid.x - currentCentroid.x;
    const dy = targetCentroid.y - currentCentroid.y;

    // Terminal characters visually have ~2:1 width-to-height ratio (rows are taller than columns)
    const vx = dx;
    const vy = dy * 2.0;

    let projected: number;
    let perp: number;

    if (direction === "right") {
      projected = vx;
      perp = Math.abs(vy);
    } else if (direction === "left") {
      projected = -vx;
      perp = Math.abs(vy);
    } else if (direction === "down") {
      projected = vy;
      perp = Math.abs(vx);
    } else if (direction === "up") {
      projected = -vy;
      perp = Math.abs(vx);
    } else {
      continue;
    }

    // Must be in the forward direction cone (projected > 0.5 and perp within cone)
    if (projected > 0.5 && perp <= projected * 2.0) {
      const score = projected + 2.0 * perp;
      if (score < bestScore) {
        bestScore = score;
        bestTarget = t.id;
      }
    }
  }

  return bestTarget;
}

/**
 * Computes territory silhouette fill ratio: cells.length / (bbox.width * bbox.height).
 */
export function getTerritoryFillRatio(
  territoryId: string,
  map: GridMapDefinition = MAP_GRID_IRONREACH
): number {
  const cells = getTerritoryCells(territoryId, map);
  if (cells.length === 0) return 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const c of cells) {
    if (c.x < minX) minX = c.x;
    if (c.x > maxX) maxX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.y > maxY) maxY = c.y;
  }
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  return cells.length / (width * height);
}

/**
 * Finds the bounding box of all non-water cells in the map.
 */
export function getGeographyBoundingBox(
  map: GridMapDefinition = MAP_GRID_IRONREACH
): { minX: number; maxX: number; minY: number; maxY: number; width: number; height: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (let y = 0; y < map.template.length; y++) {
    const row = map.template[y];
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== ".") {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (minX === Infinity) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0 };
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

export {
  MAP_GRID_IRONREACH,
  type GridMapDefinition,
  type GridTerritoryMetadata,
  type GridSeaRoute,
  type GridMapDecoration,
  type GridMapDecorations,
};

