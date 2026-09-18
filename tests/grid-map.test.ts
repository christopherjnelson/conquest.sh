import { describe, expect, it } from "bun:test";
import defaultMap, {
  GRID_CANVAS_HEIGHT,
  GRID_CANVAS_WIDTH,
  GRID_DECORATIONS,
  GRID_SECTORS,
  GRID_SEA_ROUTES,
  GRID_TEMPLATE,
  MAP_GRID_IRONREACH,
  getBorderInfo,
  getTerritoryAt,
  getTerritoryCells,
  isBorderCell,
} from "../packages/map-engine/src/index.js";

describe("grid-map: 2D Ironreach territory grid engine", () => {
  it("exports MAP_GRID_IRONREACH as default and matches canvas dimensions", () => {
    expect(defaultMap).toBe(MAP_GRID_IRONREACH);
    expect(MAP_GRID_IRONREACH.width).toBe(76);
    expect(MAP_GRID_IRONREACH.height).toBe(28);
    expect(GRID_CANVAS_WIDTH).toBe(76);
    expect(GRID_CANVAS_HEIGHT).toBe(28);
    expect(MAP_GRID_IRONREACH.template.length).toBe(28);

    for (let y = 0; y < MAP_GRID_IRONREACH.template.length; y++) {
      expect(MAP_GRID_IRONREACH.template[y].length).toBe(76);
    }
  });

  it("defines all 18-20 canonical territories across 6 continental clusters", () => {
    // There are 20 territories partitioned across 6 continental clusters
    expect(MAP_GRID_IRONREACH.territories.length).toBeGreaterThanOrEqual(18);
    expect(MAP_GRID_IRONREACH.territories.length).toBe(20);

    const expectedTerritories = [
      // Cluster A (Northwest / Green)
      { id: "A1", name: "Highwatch", sectorId: "nw_green", char: "A" },
      { id: "A2", name: "Whispering Woods", sectorId: "nw_green", char: "B" },
      { id: "A3", name: "Stoneveil", sectorId: "nw_green", char: "C" },
      // Cluster B (North-Center / Amber-Gold)
      { id: "B1", name: "Sunken Pass", sectorId: "nc_amber", char: "D" },
      { id: "B2", name: "The Marches", sectorId: "nc_amber", char: "E" },
      { id: "B3", name: "Golden Vale", sectorId: "nc_amber", char: "F" },
      // Cluster C (Northeast / Ice Cyan)
      { id: "C1", name: "Frostfell", sectorId: "ne_cyan", char: "G" },
      { id: "C2", name: "Crown Citadel", sectorId: "ne_cyan", char: "H" },
      { id: "C3", name: "Glacier Bay", sectorId: "ne_cyan", char: "I" },
      { id: "C4", name: "White Cliff", sectorId: "ne_cyan", char: "J" },
      // Cluster D (Southwest / Crimson Red)
      { id: "D1", name: "Ember Coast", sectorId: "sw_red", char: "K" },
      { id: "D2", name: "Ashmoor", sectorId: "sw_red", char: "L" },
      { id: "D3", name: "Red Basin", sectorId: "sw_red", char: "M" },
      { id: "D4", name: "Iron Hollow", sectorId: "sw_red", char: "N" },
      // Cluster E (South-Center / Violet Purple)
      { id: "E1", name: "Hollowmere", sectorId: "sc_purple", char: "O" },
      { id: "E2", name: "Blackfen", sectorId: "sc_purple", char: "P" },
      { id: "E3", name: "Duskfall", sectorId: "sc_purple", char: "Q" },
      // Cluster F (Southeast / Forest Green)
      { id: "F1", name: "Mossgate", sectorId: "se_green", char: "R" },
      { id: "F2", name: "Verdant Reach", sectorId: "se_green", char: "S" },
      { id: "F3", name: "Mist Isle", sectorId: "se_green", char: "T" },
    ];

    const territoryMap = new Map(MAP_GRID_IRONREACH.territories.map((t) => [t.id, t]));

    for (const exp of expectedTerritories) {
      const t = territoryMap.get(exp.id);
      expect(t).toBeDefined();
      expect(t?.name).toBe(exp.name);
      expect(t?.sectorId).toBe(exp.sectorId);
      expect(t?.char).toBe(exp.char);
      expect(t?.flavor).toBeDefined();
      expect(t?.flavor.length).toBeGreaterThan(0);
      expect(t?.icon).toBeDefined();
      expect(t?.regionColor).toBeDefined();
      expect(t?.regionBonus).toBeGreaterThanOrEqual(2);
    }
  });

  it("defines exactly 6 sectors with appropriate bonuses and colors matching ref.png", () => {
    expect(GRID_SECTORS.length).toBe(6);
    expect(MAP_GRID_IRONREACH.sectors.length).toBe(6);

    const sectorMap = new Map(MAP_GRID_IRONREACH.sectors.map((s) => [s.id, s]));

    const nw = sectorMap.get("nw_green");
    expect(nw).toBeDefined();
    expect(nw?.name).toBe("Verdant Fringe");
    expect(nw?.bonusReinforcements).toBe(2);
    expect(nw?.colorHex).toBe("#00ff66");
    expect(nw?.territoryIds).toEqual(["A1", "A2", "A3"]);

    const nc = sectorMap.get("nc_amber");
    expect(nc).toBeDefined();
    expect(nc?.name).toBe("Amber Steppes");
    expect(nc?.bonusReinforcements).toBe(2);
    expect(nc?.colorHex).toBe("#ffaa00");
    expect(nc?.territoryIds).toEqual(["B1", "B2", "B3"]);

    const ne = sectorMap.get("ne_cyan");
    expect(ne).toBeDefined();
    expect(ne?.name).toBe("Northreach");
    expect(ne?.bonusReinforcements).toBe(3);
    expect(ne?.colorHex).toBe("#00d2ff");
    expect(ne?.territoryIds).toEqual(["C1", "C2", "C3", "C4"]);

    const sw = sectorMap.get("sw_red");
    expect(sw).toBeDefined();
    expect(sw?.name).toBe("Crimson Caldera");
    expect(sw?.bonusReinforcements).toBe(3);
    expect(sw?.colorHex).toBe("#ff4444");
    expect(sw?.territoryIds).toEqual(["D1", "D2", "D3", "D4"]);

    const sc = sectorMap.get("sc_purple");
    expect(sc).toBeDefined();
    expect(sc?.name).toBe("The Blackfen");
    expect(sc?.bonusReinforcements).toBe(2);
    expect(sc?.colorHex).toBe("#9966ff");
    expect(sc?.territoryIds).toEqual(["E1", "E2", "E3"]);

    const se = sectorMap.get("se_green");
    expect(se).toBeDefined();
    expect(se?.name).toBe("Emerald Isles");
    expect(se?.bonusReinforcements).toBe(2);
    expect(se?.colorHex).toBe("#22c55e");
    expect(se?.territoryIds).toEqual(["F1", "F2", "F3"]);
  });

  it("verifies every territory has at least 15 land cells in the grid template", () => {
    const charCounts: Record<string, number> = {};
    for (const row of MAP_GRID_IRONREACH.template) {
      for (const char of row) {
        if (char !== ".") {
          charCounts[char] = (charCounts[char] || 0) + 1;
        }
      }
    }

    for (const t of MAP_GRID_IRONREACH.territories) {
      const count = charCounts[t.char] || 0;
      expect(count).toBeGreaterThanOrEqual(15);

      // Verify helper getTerritoryCells returns identical count
      const cells = getTerritoryCells(t.id);
      expect(cells.length).toBe(count);
    }
  });

  it("verifies every label position is inside its territory land cells", () => {
    for (const t of MAP_GRID_IRONREACH.territories) {
      const { x, y } = t.labelPos;
      const territoryAtPos = getTerritoryAt(x, y);

      expect(territoryAtPos).toBe(t.id);
      expect(t.position.x).toBe(x);
      expect(t.position.y).toBe(y);

      // Verify character directly matches
      expect(MAP_GRID_IRONREACH.template[y][x]).toBe(t.char);
    }
  });

  it("maintains bidirectional adjacency symmetry across all neighboring territories", () => {
    const territoryMap = new Map(MAP_GRID_IRONREACH.territories.map((t) => [t.id, t]));

    for (const t of MAP_GRID_IRONREACH.territories) {
      expect(t.neighbors.length).toBeGreaterThan(0);

      for (const neighborId of t.neighbors) {
        const neighbor = territoryMap.get(neighborId);
        expect(neighbor).toBeDefined();
        expect(neighbor?.neighbors).toContain(t.id);
      }
    }
  });

  it("correctly resolves getTerritoryAt for land, water, and out-of-bounds coordinates", () => {
    // Land resolution
    expect(getTerritoryAt(10, 4)).toBe("A1");
    expect(getTerritoryAt(5, 9)).toBe("A2");
    expect(getTerritoryAt(16, 9)).toBe("A3");
    expect(getTerritoryAt(34, 4)).toBe("B1");
    expect(getTerritoryAt(31, 10)).toBe("B2");
    expect(getTerritoryAt(41, 10)).toBe("B3");
    expect(getTerritoryAt(58, 4)).toBe("C1");
    expect(getTerritoryAt(56, 9)).toBe("C2");
    expect(getTerritoryAt(64, 10)).toBe("C3");
    expect(getTerritoryAt(54, 13)).toBe("C4");
    expect(getTerritoryAt(7, 16)).toBe("D1");
    expect(getTerritoryAt(18, 16)).toBe("D2");
    expect(getTerritoryAt(7, 20)).toBe("D3");
    expect(getTerritoryAt(19, 21)).toBe("D4");
    expect(getTerritoryAt(35, 18)).toBe("E1");
    expect(getTerritoryAt(31, 22)).toBe("E2");
    expect(getTerritoryAt(42, 22)).toBe("E3");
    expect(getTerritoryAt(54, 19)).toBe("F1");
    expect(getTerritoryAt(63, 19)).toBe("F2");
    expect(getTerritoryAt(62, 23)).toBe("F3");

    // Water resolution
    expect(getTerritoryAt(0, 0)).toBeNull();
    expect(getTerritoryAt(75, 0)).toBeNull();
    expect(getTerritoryAt(25, 8)).toBeNull();
    expect(getTerritoryAt(48, 8)).toBeNull();

    // Out of bounds resolution
    expect(getTerritoryAt(-1, 0)).toBeNull();
    expect(getTerritoryAt(0, -1)).toBeNull();
    expect(getTerritoryAt(76, 0)).toBeNull();
    expect(getTerritoryAt(0, 28)).toBeNull();
    expect(getTerritoryAt(999, 999)).toBeNull();
  });

  it("detects border cells and orientation flags correctly", () => {
    // (7, 3) is deep inside A1, surrounded on all 4 sides by A1
    const interior = getBorderInfo(7, 3);
    expect(interior.territoryId).toBe("A1");
    expect(interior.isBorder).toBe(false);
    expect(interior.north).toBe(false);
    expect(interior.south).toBe(false);
    expect(interior.west).toBe(false);
    expect(interior.east).toBe(false);
    expect(isBorderCell(7, 3)).toBe(false);

    // (5, 2) is on the top-left boundary of A1
    const boundary = getBorderInfo(5, 2);
    expect(boundary.territoryId).toBe("A1");
    expect(boundary.isBorder).toBe(true);
    expect(boundary.north).toBe(true); // water above
    expect(boundary.west).toBe(true);  // water left
    expect(isBorderCell(5, 2)).toBe(true);

    // Water cell (0, 0)
    const water = getBorderInfo(0, 0);
    expect(water.territoryId).toBeNull();
    expect(water.isBorder).toBe(false);
    expect(isBorderCell(0, 0)).toBe(false);
  });

  it("defines sea routes connecting coastal territories across water", () => {
    expect(GRID_SEA_ROUTES.length).toBeGreaterThanOrEqual(9);

    const routePairs = GRID_SEA_ROUTES.map((r) => `${r.from}<->${r.to}`);
    expect(routePairs).toContain("A3<->B2");
    expect(routePairs).toContain("A2<->D1");
    expect(routePairs).toContain("A3<->D2");
    expect(routePairs).toContain("B1<->C1");
    expect(routePairs).toContain("B3<->C2");
    expect(routePairs).toContain("B2<->E1");
    expect(routePairs).toContain("D2<->E1");
    expect(routePairs).toContain("C4<->F1");
    expect(routePairs).toContain("E3<->F1");

    for (const route of GRID_SEA_ROUTES) {
      expect(route.path.length).toBeGreaterThanOrEqual(2);
      const start = route.path[0];
      const end = route.path[route.path.length - 1];

      // Starting cell belongs to "from" territory
      expect(getTerritoryAt(start.x, start.y)).toBe(route.from);
      // Ending cell belongs to "to" territory
      expect(getTerritoryAt(end.x, end.y)).toBe(route.to);
    }
  });

  it("defines decorative map features including compass rose and scale bar", () => {
    expect(GRID_DECORATIONS.waves.length).toBeGreaterThan(0);
    expect(GRID_DECORATIONS.mountains.length).toBeGreaterThan(0);
    expect(GRID_DECORATIONS.trees.length).toBeGreaterThan(0);

    // Compass rose position specified in task
    expect(GRID_DECORATIONS.compass).toEqual({ x: 2, y: 22 });
    expect(getTerritoryAt(2, 22)).toBeNull(); // Must sit in open water

    // Scale bar position specified in task
    expect(GRID_DECORATIONS.scaleBar).toEqual({ x: 50, y: 26 });
    expect(getTerritoryAt(50, 26)).toBeNull(); // Must sit in open water
  });
});
