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

const microcellCache = new WeakMap<GridMapDefinition, string[]>();

/**
 * Builds a high-resolution microcell template with 2 vertical microcells per terminal row.
 * Employs sub-pixel edge smoothing on coastlines and concave bays while protecting labels.
 */
export function buildMicrocellTemplate(map: GridMapDefinition = MAP_GRID_IRONREACH): string[] {
  const h = map.template.length;
  const w = map.template[0].length;
  const microRows: string[][] = Array.from({ length: h * 2 }, () =>
    Array(w).fill(".")
  );

  // Helper to check if coordinate is near any territory label/unit text
  const isProtectedCell = (x: number, y: number) => {
    for (const t of map.territories) {
      if (
        (y === t.labelPos.y || y === t.labelPos.y + 1) &&
        x >= t.labelPos.x - 1 &&
        x <= t.labelPos.x + 15
      ) {
        return true;
      }
    }
    return false;
  };

  for (let y = 0; y < h; y++) {
    const row = map.template[y];
    const topMy = y * 2;
    const botMy = y * 2 + 1;

    for (let x = 0; x < w; x++) {
      const c = row[x];
      const isLand = c !== ".";

      if (isLand) {
        let top = c;
        let bot = c;

        if (!isProtectedCell(x, y)) {
          const north = y > 0 ? map.template[y - 1][x] : ".";
          const south = y < h - 1 ? map.template[y + 1][x] : ".";
          const west = x > 0 ? row[x - 1] : ".";
          const east = x < w - 1 ? row[x + 1] : ".";

          // Northwest outer corner smoothing
          if (north === "." && west === "." && east === c && south === c) {
            top = ".";
          }
          // Northeast outer corner smoothing
          else if (north === "." && east === "." && west === c && south === c) {
            top = ".";
          }
          // Southwest outer corner smoothing
          else if (south === "." && west === "." && east === c && north === c) {
            bot = ".";
          }
          // Southeast outer corner smoothing
          else if (south === "." && east === "." && west === c && north === c) {
            bot = ".";
          }
        }

        microRows[topMy][x] = top;
        microRows[botMy][x] = bot;
      } else {
        // Ocean cell: smooth concave bays where land surrounds on two cardinal directions
        let top = ".";
        let bot = ".";

        const north = y > 0 ? map.template[y - 1][x] : ".";
        const south = y < h - 1 ? map.template[y + 1][x] : ".";
        const west = x > 0 ? row[x - 1] : ".";
        const east = x < w - 1 ? row[x + 1] : ".";

        if (north !== "." && west !== "." && north === west) {
          top = north;
        } else if (north !== "." && east !== "." && north === east) {
          top = north;
        } else if (south !== "." && west !== "." && south === west) {
          bot = south;
        } else if (south !== "." && east !== "." && south === east) {
          bot = south;
        }

        microRows[topMy][x] = top;
        microRows[botMy][x] = bot;
      }
    }
  }

  return microRows.map((r) => r.join(""));
}

/**
 * Returns cached or generated microcell template for a map definition.
 */
export function getMapMicroTemplate(map: GridMapDefinition = MAP_GRID_IRONREACH): string[] {
  if (map.microTemplate) return map.microTemplate;
  let cached = microcellCache.get(map);
  if (!cached) {
    cached = buildMicrocellTemplate(map);
    microcellCache.set(map, cached);
  }
  return cached;
}

/**
 * Returns territory ID at microcell coordinates (mx, my) or null if water or out of bounds.
 */
export function getMicroTerritoryAt(
  mx: number,
  my: number,
  map: GridMapDefinition = MAP_GRID_IRONREACH
): string | null {
  const microH = map.template.length * 2;
  const microW = map.template[0].length;
  if (my < 0 || my >= microH || mx < 0 || mx >= microW) {
    return null;
  }
  const microTpl = getMapMicroTemplate(map);
  const char = microTpl[my][mx];
  return map.charToTerritoryId[char] ?? null;
}

/**
 * Hit-testing helper mapping terminal character cell (x, y) to its top and bottom microcells.
 * Evaluates top microcell (x, 2y) and bottom microcell (x, 2y + 1):
 * - If both same -> that territory
 * - If one land and one water -> the land territory
 * - If two different -> majority or top territory
 */
export function getTerritoryAtCell(
  x: number,
  y: number,
  map: GridMapDefinition = MAP_GRID_IRONREACH
): string | null {
  const topT = getMicroTerritoryAt(x, 2 * y, map);
  const botT = getMicroTerritoryAt(x, 2 * y + 1, map);

  if (topT === botT) return topT;
  if (topT && !botT) return topT;
  if (!topT && botT) return botT;
  return topT ?? botT ?? null;
}

export {
  MAP_GRID_IRONREACH,
  type GridMapDefinition,
  type GridTerritoryMetadata,
  type GridSeaRoute,
  type GridMapDecoration,
  type GridMapDecorations,
};

