import { describe, expect, it } from "bun:test";
import {
  DEFAULT_MAP,
  MAP_GRID_IRONREACH,
  MAP_IRONREACH,
  MAP_SECTOR_07,
  NODE_HEIGHT,
  NODE_WIDTH,
  findTerritoryAt,
  getTerritoryBounds,
} from "../packages/map-engine/src/index.js";

describe("map-engine: ironreach map schema & integrity", () => {
  it("exports MAP_IRONREACH with valid metadata and default export", () => {
    expect(MAP_IRONREACH.id).toBe("ironreach");
    expect(MAP_IRONREACH.name).toBe("The Ironreach");
    expect(MAP_IRONREACH.description).toBe(
      "A fractured feudal continent of northern peaks, contested river marches, and volcanic coasts."
    );
    expect(DEFAULT_MAP).toBe(MAP_GRID_IRONREACH);
    expect(MAP_IRONREACH.recommendedPlayers.min).toBe(2);
    expect(MAP_IRONREACH.recommendedPlayers.max).toBe(4);
  });

  it("exports MAP_SECTOR_07 for backward compatibility", () => {
    expect(MAP_SECTOR_07.id).toBe("sector-07");
    expect(MAP_SECTOR_07.territories.length).toBe(8);
  });

  it("defines exactly 3 regions with expected sector bonuses and colors", () => {
    expect(MAP_IRONREACH.sectors.length).toBe(3);

    const northreach = MAP_IRONREACH.sectors.find((s) => s.id === "northreach");
    expect(northreach).toBeDefined();
    expect(northreach?.name).toBe("Northreach");
    expect(northreach?.bonusReinforcements).toBe(3);
    expect(northreach?.colorHex).toBe("#00d2ff");
    expect(northreach?.territoryIds).toEqual(["frostfell", "highwatch", "iron_hollow"]);

    const theMarches = MAP_IRONREACH.sectors.find((s) => s.id === "the_marches");
    expect(theMarches).toBeDefined();
    expect(theMarches?.name).toBe("The Marches");
    expect(theMarches?.bonusReinforcements).toBe(2);
    expect(theMarches?.colorHex).toBe("#ffaa00");
    expect(theMarches?.territoryIds).toEqual(["stoneveil", "red_basin", "mossgate", "sunken_pass"]);

    const emberlands = MAP_IRONREACH.sectors.find((s) => s.id === "emberlands");
    expect(emberlands).toBeDefined();
    expect(emberlands?.name).toBe("Emberlands");
    expect(emberlands?.bonusReinforcements).toBe(3);
    expect(emberlands?.colorHex).toBe("#ff3399");
    expect(emberlands?.territoryIds).toEqual(["ember_coast", "ashmoor", "hollowmere"]);
  });

  it("defines exactly 10 territories with valid positions and render dimensions", () => {
    expect(MAP_IRONREACH.territories.length).toBe(10);

    for (const t of MAP_IRONREACH.territories) {
      expect(typeof t.id).toBe("string");
      expect(typeof t.name).toBe("string");
      expect(typeof t.position.x).toBe("number");
      expect(typeof t.position.y).toBe("number");
      expect(t.neighbors.length).toBeGreaterThan(0);
      expect(t.render).toBeDefined();
      expect(t.render?.width).toBeGreaterThanOrEqual(17);
      expect(t.render?.width).toBeLessThanOrEqual(20);
      expect(t.render?.height).toBeGreaterThanOrEqual(4);
      expect(t.render?.height).toBeLessThanOrEqual(5);
      expect(typeof t.render?.flavor).toBe("string");
      expect(t.render?.flavor?.length).toBeGreaterThan(0);
    }
  });

  it("maintains bidirectional adjacency across all neighboring territories", () => {
    const territoryMap = new Map(MAP_IRONREACH.territories.map((t) => [t.id, t]));

    for (const t of MAP_IRONREACH.territories) {
      for (const neighborId of t.neighbors) {
        const neighbor = territoryMap.get(neighborId);
        expect(neighbor).toBeDefined();
        expect(neighbor?.neighbors).toContain(t.id);
      }
    }
  });
});

describe("map-engine: layout and bounding boxes", () => {
  it("defaults NODE_WIDTH = 18 and NODE_HEIGHT = 5", () => {
    expect(NODE_WIDTH).toBe(18);
    expect(NODE_HEIGHT).toBe(5);
  });

  it("calculates bounds using territory render properties or defaults", () => {
    const withCustomRender = {
      position: { x: 5, y: 10 },
      render: { width: 20, height: 4, flavor: "Test" },
    };
    const boundsCustom = getTerritoryBounds(withCustomRender);
    expect(boundsCustom).toEqual({
      x: 5,
      y: 10,
      width: 20,
      height: 4,
    });

    const withoutRender = {
      position: { x: 2, y: 3 },
    };
    const boundsDefault = getTerritoryBounds(withoutRender);
    expect(boundsDefault).toEqual({
      x: 2,
      y: 3,
      width: 18,
      height: 5,
    });
  });

  it("finds territory at given coordinates for both array and record inputs", () => {
    const frostfell = MAP_IRONREACH.territories.find((t) => t.id === "frostfell")!;
    const bounds = getTerritoryBounds(frostfell);

    // Coordinate inside frostfell
    const insideX = bounds.x + 2;
    const insideY = bounds.y + 1;

    // Test with array
    const foundArray = findTerritoryAt(MAP_IRONREACH.territories, insideX, insideY);
    expect(foundArray?.id).toBe("frostfell");

    // Test with record
    const record: Record<string, typeof frostfell> = {};
    for (const t of MAP_IRONREACH.territories) {
      record[t.id] = t;
    }
    const foundRecord = findTerritoryAt(record, insideX, insideY);
    expect(foundRecord?.id).toBe("frostfell");

    // Coordinate far outside any territory
    const outside = findTerritoryAt(record, 999, 999);
    expect(outside).toBeNull();
  });
});
