import { describe, expect, it } from "bun:test";
import { DEFAULT_MAP, EARTH_42_BUNDLE, findTerritoryAt, getDefaultMap, getGeographyBoundingBox,
  getMap, getNextTerritoryInDirection, getRenderVariant, getTerritoryAt, getTerritoryBounds,
  getTerritoryCentroid, listMaps, NODE_HEIGHT, NODE_WIDTH, selectRenderVariant } from "../packages/map-engine/src/index.js";

describe("map engine defaults to Earth-42", () => {
  it("registers Earth-42 as the only playable bundle", () => {
    expect(DEFAULT_MAP.id).toBe("earth-42");
    expect(getDefaultMap()).toBe(EARTH_42_BUNDLE);
    expect(listMaps().map(map => map.definition.id)).toEqual(["earth-42"]);
    expect(getMap("unregistered-map")).toBeUndefined();
  });

  it("chooses a render density that fits the available pane", () => {
    for (const variant of EARTH_42_BUNDLE.renderVariants) {
      const land = getGeographyBoundingBox(variant.grid);
      expect(selectRenderVariant(EARTH_42_BUNDLE, land).profile).toBe(variant.profile);
      expect(getRenderVariant("earth-42", land)).toBe(variant);
    }
  });

  it("keeps Earth geography, navigation, and hit testing aligned", () => {
    const grid = EARTH_42_BUNDLE.renderVariants[0].grid;
    for (const territory of grid.territories) {
      expect(getTerritoryAt(territory.labelPos.x, territory.labelPos.y, grid)).toBe(territory.id);
      const centroid = getTerritoryCentroid(territory.id, grid);
      expect(Number.isFinite(centroid.x)).toBe(true);
      expect(Number.isFinite(centroid.y)).toBe(true);
    }
    const alaska = grid.territories.find(t => t.id === "na_alaska_range")!;
    expect(getTerritoryBounds(alaska).width).toBeGreaterThan(0);
    expect(getNextTerritoryInDirection("na_alaska_range", "right", grid)).toBeTruthy();
  });
});

describe("generic territory geometry helpers", () => {
  it("uses documented default bounds and searches arrays and records", () => {
    expect(NODE_WIDTH).toBeGreaterThan(0);
    expect(NODE_HEIGHT).toBeGreaterThan(0);
    const first = { id: "one", position: { x: 5, y: 10 } };
    const second = { id: "two", position: { x: 30, y: 10 }, render: { width: 20, height: 4 } };
    expect(getTerritoryBounds(first)).toEqual({ x: 5, y: 10, width: NODE_WIDTH, height: NODE_HEIGHT });
    expect(getTerritoryBounds(second)).toEqual({ x: 30, y: 10, width: 20, height: 4 });
    expect(findTerritoryAt([first, second], 32, 11)?.id).toBe("two");
    expect(findTerritoryAt({ one: first, two: second }, 7, 11)?.id).toBe("one");
    expect(findTerritoryAt([first, second], 999, 999)).toBeNull();
  });
});
