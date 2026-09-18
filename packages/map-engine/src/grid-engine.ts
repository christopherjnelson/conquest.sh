import {
  MAP_GRID_IRONREACH,
  type GridMapDefinition,
  type GridTerritoryMetadata,
  type GridSeaRoute,
  type GridMapDecoration,
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

export {
  MAP_GRID_IRONREACH,
  type GridMapDefinition,
  type GridTerritoryMetadata,
  type GridSeaRoute,
  type GridMapDecoration,
};
