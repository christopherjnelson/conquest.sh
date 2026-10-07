import { describe, expect, it } from "bun:test";
import type { GridMapDefinition } from "../packages/map-engine/src/types.js";
import { EARTH_42_BUNDLE } from "../packages/map-engine/src/maps/earth-42.js";
import { deriveCoarseTemplateFromMicro } from "../packages/map-engine/src/raster.js";
import { getBorderInfo, getGeographyBoundingBox, getMapMicroTemplate, getMicroTerritoryAt,
  getTerritoryAt, getTerritoryAtCell, getTerritoryCells, getTerritoryCentroid, getTerritoryFillRatio,
  getTerritoryMicroCells, isBorderCell } from "../packages/map-engine/src/grid-engine.js";
import { getLayoutMode } from "../packages/map-engine/src/layout.js";

const earth = EARTH_42_BUNDLE.renderVariants[0].grid;

// A tiny, test-only graph for isolating generic raster behavior. It is never registered or playable.
const fixture: GridMapDefinition = {
  id: "test-raster", name: "Raster fixture", description: "", recommendedPlayers: { min: 2, max: 2 },
  sectors: [{ id: "region", name: "Region", bonusReinforcements: 1, territoryIds: ["west", "east"], colorHex: "#ffffff" }],
  territories: [
    { id: "west", name: "West", sectorId: "region", neighbors: ["east"], char: "W", regionId: "region", regionName: "Region", regionBonus: 1, regionColor: "#ffffff", labelPos: { x: 1, y: 1 }, position: { x: 0, y: 0 }, icon: "", flavor: "", render: { flavor: "" } },
    { id: "east", name: "East", sectorId: "region", neighbors: ["west"], char: "E", regionId: "region", regionName: "Region", regionBonus: 1, regionColor: "#ffffff", labelPos: { x: 4, y: 1 }, position: { x: 3, y: 0 }, icon: "", flavor: "", render: { flavor: "" } },
  ],
  width: 6, height: 3, template: ["WW.EE.", "WW.EE.", "......"],
  microTemplate: ["WW.EE.", "WW.EE.", "WW.EE.", "WW.EE.", "......", "......"],
  charToTerritoryId: { W: "west", E: "east" }, territoryIdToChar: { west: "W", east: "E" },
  seaRoutes: [{ from: "west", to: "east", path: [{ x: 2, y: 1 }] }],
  decorations: { waves: [], mountains: [], trees: [], compass: { x: 0, y: 0 }, scaleBar: { x: 0, y: 0 } },
};

describe("generic grid raster engine", () => {
  it("maps coarse and micro cells to territories and leaves water/outside empty", () => {
    expect(getTerritoryAt(0, 0, fixture)).toBe("west");
    expect(getTerritoryAt(3, 1, fixture)).toBe("east");
    expect(getTerritoryAt(2, 1, fixture)).toBeNull();
    expect(getTerritoryAt(-1, 0, fixture)).toBeNull();
    expect(getTerritoryAtCell(4, 1, fixture)).toBe("east");
    expect(getMicroTerritoryAt(3, 2, fixture)).toBe("east");
    expect(getMicroTerritoryAt(2, 2, fixture)).toBeNull();
    expect(getMapMicroTemplate(fixture)).toEqual(fixture.microTemplate);
  });

  it("reports territory cells, borders, centroids, and fill ratio", () => {
    expect(getTerritoryCells("west", fixture)).toHaveLength(4);
    expect(getTerritoryMicroCells("east", fixture)).toHaveLength(8);
    expect(isBorderCell(0, 0, fixture)).toBe(true);
    expect(getBorderInfo(1, 1, fixture)).toMatchObject({ isBorder: true, territoryId: "west", east: true });
    expect(getTerritoryCentroid("west", fixture)).toEqual({ x: 0.5, y: 0.75 });
    expect(getTerritoryFillRatio("west", fixture)).toBeGreaterThan(0);
  });

  it("derives coarse rasters consistently and measures Earth-42 geography", () => {
    expect(deriveCoarseTemplateFromMicro(fixture.microTemplate)).toEqual(fixture.template);
    const bounds = getGeographyBoundingBox(earth);
    expect(bounds.width).toBeGreaterThan(50);
    expect(bounds.height).toBeGreaterThan(20);
    expect(earth.microTemplate.length).toBe(earth.height * 2);
    expect(deriveCoarseTemplateFromMicro(earth.microTemplate)).toEqual(earth.template);
  });

  it("retains authored half-cell coastlines and neighborhood-majority hit testing", () => {
    const grid = EARTH_42_BUNDLE.renderVariants.at(-1)!.grid;
    let splitCells = 0;
    let majorityCase: { x: number; y: number; expected: string } | undefined;
    for (let y = 0; y < grid.height; y++) for (let x = 0; x < grid.width; x++) {
      const top = getMicroTerritoryAt(x, 2 * y, grid);
      const bottom = getMicroTerritoryAt(x, 2 * y + 1, grid);
      if (top !== bottom) splitCells++;
      if (!top || !bottom || top === bottom || majorityCase) continue;
      let topScore = 0, bottomScore = 0;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 2; dy++) {
        if (dx === 0 && (dy === 0 || dy === 1)) continue;
        const neighbor = getMicroTerritoryAt(x + dx, 2 * y + dy, grid);
        if (neighbor === top) topScore++;
        if (neighbor === bottom) bottomScore++;
      }
      if (topScore !== bottomScore) majorityCase = { x, y, expected: topScore > bottomScore ? top : bottom };
    }
    expect(splitCells).toBeGreaterThan(200);
    expect(majorityCase).toBeDefined();
    expect(getTerritoryAtCell(majorityCase!.x, majorityCase!.y, grid)).toBe(majorityCase!.expected);
  });

  it("keeps terminal layout mode breakpoints stable", () => {
    expect(getLayoutMode(129, 60)).toBe("compact");
    expect(getLayoutMode(130, 38)).toBe("standard");
    expect(getLayoutMode(179, 50)).toBe("standard");
    expect(getLayoutMode(180, 51)).toBe("wide");
  });
});
