import { describe, expect, it } from "bun:test";
import {
  DEFAULT_MAP,
  MAP_GRID_IRONREACH,
  MAP_IRONREACH,
  MAP_SECTOR_07,
  NODE_HEIGHT,
  NODE_WIDTH,
  findTerritoryAt,
  getNextTerritoryInDirection,
  getTerritoryAt,
  getTerritoryBounds,
  getTerritoryCentroid,
} from "../packages/map-engine/src/index.js";

describe("map-engine: ironreach unified map schema & integrity", () => {
  it("exports MAP_IRONREACH unified onto MAP_GRID_IRONREACH with valid metadata and default export", () => {
    expect(MAP_IRONREACH).toBe(MAP_GRID_IRONREACH);
    expect(DEFAULT_MAP.id).toBe("earth-42");
    expect(MAP_IRONREACH.id).toBe("ironreach");
    expect(MAP_IRONREACH.name).toBe("The Ironreach");
    expect(MAP_IRONREACH.recommendedPlayers.min).toBe(2);
    expect(MAP_IRONREACH.recommendedPlayers.max).toBe(6);
    expect(MAP_IRONREACH.width).toBe(136);
    expect(MAP_IRONREACH.height).toBe(36);
  });

  it("exports MAP_SECTOR_07 for backward compatibility", () => {
    expect(MAP_SECTOR_07.id).toBe("sector-07");
    expect(MAP_SECTOR_07.territories.length).toBe(8);
  });

  it("defines exactly 6 sectors with expected sector bonuses and colors", () => {
    expect(MAP_IRONREACH.sectors.length).toBe(6);

    const nw = MAP_IRONREACH.sectors.find((s) => s.id === "nw_green");
    expect(nw).toBeDefined();
    expect(nw?.name).toBe("Verdant Fringe");
    expect(nw?.bonusReinforcements).toBe(2);
    expect(nw?.colorHex).toBe("#00ff66");
    expect(nw?.territoryIds).toEqual(["A1", "A2", "A3"]);

    const nc = MAP_IRONREACH.sectors.find((s) => s.id === "nc_amber");
    expect(nc).toBeDefined();
    expect(nc?.name).toBe("Amber Steppes");
    expect(nc?.bonusReinforcements).toBe(2);
    expect(nc?.colorHex).toBe("#ffaa00");
    expect(nc?.territoryIds).toEqual(["B1", "B2", "B3"]);

    const ne = MAP_IRONREACH.sectors.find((s) => s.id === "ne_cyan");
    expect(ne).toBeDefined();
    expect(ne?.name).toBe("Northreach");
    expect(ne?.bonusReinforcements).toBe(3);
    expect(ne?.colorHex).toBe("#00d2ff");
    expect(ne?.territoryIds).toEqual(["C1", "C2", "C3", "C4"]);

    const sw = MAP_IRONREACH.sectors.find((s) => s.id === "sw_red");
    expect(sw).toBeDefined();
    expect(sw?.name).toBe("Crimson Caldera");
    expect(sw?.bonusReinforcements).toBe(3);
    expect(sw?.colorHex).toBe("#ff4444");
    expect(sw?.territoryIds).toEqual(["D1", "D2", "D3", "D4"]);

    const sc = MAP_IRONREACH.sectors.find((s) => s.id === "sc_purple");
    expect(sc).toBeDefined();
    expect(sc?.name).toBe("The Blackfen");
    expect(sc?.bonusReinforcements).toBe(2);
    expect(sc?.colorHex).toBe("#9966ff");
    expect(sc?.territoryIds).toEqual(["E1", "E2", "E3"]);

    const se = MAP_IRONREACH.sectors.find((s) => s.id === "se_green");
    expect(se).toBeDefined();
    expect(se?.name).toBe("Emerald Isles");
    expect(se?.bonusReinforcements).toBe(2);
    expect(se?.colorHex).toBe("#22c55e");
    expect(se?.territoryIds).toEqual(["F1", "F2", "F3"]);
  });

  it("defines exactly 20 canonical territories with valid positions and render properties", () => {
    expect(MAP_IRONREACH.territories.length).toBe(20);

    for (const t of MAP_IRONREACH.territories) {
      expect(typeof t.id).toBe("string");
      expect(typeof t.name).toBe("string");
      expect(typeof t.position.x).toBe("number");
      expect(typeof t.position.y).toBe("number");
      expect(t.neighbors.length).toBeGreaterThan(0);
      expect(t.render).toBeDefined();
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

  it("ensures normal neighbors physically share borders and sea routes do not", () => {
    const seaRouteSet = new Set(
      MAP_IRONREACH.seaRoutes.flatMap((r) => [`${r.from}-${r.to}`, `${r.to}-${r.from}`])
    );

    const contacts = new Map<string, Set<string>>();
    for (const t of MAP_IRONREACH.territories) {
      contacts.set(t.id, new Set());
    }

    for (let y = 0; y < MAP_IRONREACH.height; y++) {
      for (let x = 0; x < MAP_IRONREACH.width; x++) {
        const t1 = getTerritoryAt(x, y, MAP_IRONREACH);
        if (!t1) continue;

        for (const [dx, dy] of [[0, 1], [1, 0]]) {
          const nx = x + dx;
          const ny = y + dy;
          const t2 = getTerritoryAt(nx, ny, MAP_IRONREACH);
          if (t2 && t2 !== t1) {
            contacts.get(t1)!.add(t2);
            contacts.get(t2)!.add(t1);
          }
        }
      }
    }

    for (const t of MAP_IRONREACH.territories) {
      for (const nId of t.neighbors) {
        const isSea = seaRouteSet.has(`${t.id}-${nId}`);
        const touches = contacts.get(t.id)!.has(nId);
        if (isSea) {
          expect(touches).toBe(false);
        } else {
          expect(touches).toBe(true);
        }
      }
    }
  });

  it("calculates centroids and provides spatial navigation across cardinal directions", () => {
    // Centroid calculation
    const a1Centroid = getTerritoryCentroid("A1", MAP_IRONREACH);
    expect(a1Centroid.x).toBeGreaterThan(15);
    expect(a1Centroid.x).toBeLessThan(35);
    expect(a1Centroid.y).toBeGreaterThan(1);
    expect(a1Centroid.y).toBeLessThan(6);

    // Spatial navigation for each cardinal direction
    expect(getNextTerritoryInDirection("A1", "left", MAP_IRONREACH)).toBe("A2");
    expect(getNextTerritoryInDirection("A1", "right", MAP_IRONREACH)).toBe("C1");
    expect(getNextTerritoryInDirection("A1", "down", MAP_IRONREACH)).toBe("A3");
    expect(getNextTerritoryInDirection("C2", "up", MAP_IRONREACH)).toBe("C1");
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
    const highwatch = MAP_IRONREACH.territories.find((t) => t.id === "A1")!;
    const bounds = getTerritoryBounds(highwatch);

    // Coordinate inside highwatch bounds
    const insideX = bounds.x + 2;
    const insideY = bounds.y + 1;

    // Test with array
    const foundArray = findTerritoryAt(MAP_IRONREACH.territories, insideX, insideY);
    expect(foundArray?.id).toBe("A1");

    // Test with record
    const record: Record<string, typeof highwatch> = {};
    for (const t of MAP_IRONREACH.territories) {
      record[t.id] = t;
    }
    const foundRecord = findTerritoryAt(record, insideX, insideY);
    expect(foundRecord?.id).toBe("A1");

    // Coordinate far outside any territory
    const outside = findTerritoryAt(record, 999, 999);
    expect(outside).toBeNull();
  });
});
