import { describe, expect, it } from "bun:test";
import defaultMap, {
  GRID_CANVAS_HEIGHT,
  GRID_CANVAS_WIDTH,
  GRID_DECORATIONS,
  GRID_SECTORS,
  GRID_SEA_ROUTES,
  GRID_TEMPLATE,
  MAP_GRID_IRONREACH,
  MAP_IRONREACH,
  getBorderInfo,
  getNextTerritoryInDirection,
  getTerritoryAt,
  getTerritoryCells,
  getTerritoryCentroid,
  isBorderCell,
} from "../packages/map-engine/src/index.js";

describe("grid-map: 2D Ironreach territory grid engine", () => {
  it("exports MAP_GRID_IRONREACH and matches canvas dimensions (104x30)", () => {
    expect(defaultMap).toBe(MAP_GRID_IRONREACH);
    expect(MAP_IRONREACH).toBe(MAP_GRID_IRONREACH);
    expect(MAP_GRID_IRONREACH.width).toBe(104);
    expect(MAP_GRID_IRONREACH.height).toBe(30);
    expect(GRID_CANVAS_WIDTH).toBe(104);
    expect(GRID_CANVAS_HEIGHT).toBe(30);
    expect(MAP_GRID_IRONREACH.template.length).toBe(30);

    for (let y = 0; y < MAP_GRID_IRONREACH.template.length; y++) {
      expect(MAP_GRID_IRONREACH.template[y].length).toBe(104);
    }
  });

  it("defines all 20 canonical territories across 6 continental clusters", () => {
    expect(MAP_GRID_IRONREACH.territories.length).toBe(20);

    const expectedTerritories = [
      // Cluster A (Northwest / Green) - North Continent
      { id: "A1", name: "Highwatch", sectorId: "nw_green", char: "A" },
      { id: "A2", name: "Whispering Woods", sectorId: "nw_green", char: "B" },
      { id: "A3", name: "Stoneveil", sectorId: "nw_green", char: "C" },
      // Cluster B (North-Center / Amber-Gold) - Central/South Continent
      { id: "B1", name: "Sunken Pass", sectorId: "nc_amber", char: "D" },
      { id: "B2", name: "The Marches", sectorId: "nc_amber", char: "E" },
      { id: "B3", name: "Golden Vale", sectorId: "nc_amber", char: "F" },
      // Cluster C (Northeast / Ice Cyan) - North Continent
      { id: "C1", name: "Frostfell", sectorId: "ne_cyan", char: "G" },
      { id: "C2", name: "Crown Citadel", sectorId: "ne_cyan", char: "H" },
      { id: "C3", name: "Glacier Bay", sectorId: "ne_cyan", char: "I" },
      { id: "C4", name: "White Cliff", sectorId: "ne_cyan", char: "J" },
      // Cluster D (Southwest / Crimson Red) - Central/South Continent
      { id: "D1", name: "Ember Coast", sectorId: "sw_red", char: "K" },
      { id: "D2", name: "Ashmoor", sectorId: "sw_red", char: "L" },
      { id: "D3", name: "Red Basin", sectorId: "sw_red", char: "M" },
      { id: "D4", name: "Iron Hollow", sectorId: "sw_red", char: "N" },
      // Cluster E (South-Center / Violet Purple) - Central/South Continent
      { id: "E1", name: "Hollowmere", sectorId: "sc_purple", char: "O" },
      { id: "E2", name: "Blackfen", sectorId: "sc_purple", char: "P" },
      { id: "E3", name: "Duskfall", sectorId: "sc_purple", char: "Q" },
      // Cluster F (Southeast / Forest Green) - Eastern Archipelago
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

  it("verifies every territory has at least 30 land cells in the grid template", () => {
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
      expect(count).toBeGreaterThanOrEqual(30);

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

  it("verifies normal land neighbors physically share borders and sea routes do not", () => {
    const seaRoutePairs = new Set(
      MAP_GRID_IRONREACH.seaRoutes.flatMap((r) => [`${r.from}-${r.to}`, `${r.to}-${r.from}`])
    );

    // Build physical contacts between territories on the grid
    const contacts = new Map<string, Set<string>>();
    for (const t of MAP_GRID_IRONREACH.territories) {
      contacts.set(t.id, new Set());
    }

    for (let y = 0; y < MAP_GRID_IRONREACH.height; y++) {
      for (let x = 0; x < MAP_GRID_IRONREACH.width; x++) {
        const t1 = getTerritoryAt(x, y);
        if (!t1) continue;

        for (const [dx, dy] of [[0, 1], [1, 0]]) {
          const nx = x + dx;
          const ny = y + dy;
          const t2 = getTerritoryAt(nx, ny);
          if (t2 && t2 !== t1) {
            contacts.get(t1)!.add(t2);
            contacts.get(t2)!.add(t1);
          }
        }
      }
    }

    // Verify: each declared neighbor is either physically touching OR a sea route
    for (const t of MAP_GRID_IRONREACH.territories) {
      for (const nbrId of t.neighbors) {
        const isSea = seaRoutePairs.has(`${t.id}-${nbrId}`);
        const touches = contacts.get(t.id)!.has(nbrId);

        if (isSea) {
          expect(touches).toBe(false);
        } else {
          expect(touches).toBe(true);
        }
      }
    }

    // Verify: no non-neighbors physically touch
    for (const [tId, touchedSet] of contacts.entries()) {
      const territory = MAP_GRID_IRONREACH.territories.find((item) => item.id === tId)!;
      for (const touchedId of touchedSet) {
        expect(territory.neighbors).toContain(touchedId);
      }
    }
  });

  it("correctly resolves getTerritoryAt for land, water, and out-of-bounds coordinates", () => {
    // Land resolution using actual label positions
    expect(getTerritoryAt(24, 3)).toBe("A1");
    expect(getTerritoryAt(9, 4)).toBe("A2");
    expect(getTerritoryAt(19, 8)).toBe("A3");
    expect(getTerritoryAt(20, 14)).toBe("B1");
    expect(getTerritoryAt(34, 15)).toBe("B2");
    expect(getTerritoryAt(50, 15)).toBe("B3");
    expect(getTerritoryAt(41, 3)).toBe("C1");
    expect(getTerritoryAt(38, 8)).toBe("C2");
    expect(getTerritoryAt(59, 4)).toBe("C3");
    expect(getTerritoryAt(58, 9)).toBe("C4");
    expect(getTerritoryAt(9, 18)).toBe("D1");
    expect(getTerritoryAt(20, 19)).toBe("D2");
    expect(getTerritoryAt(9, 23)).toBe("D3");
    expect(getTerritoryAt(20, 24)).toBe("D4");
    expect(getTerritoryAt(37, 21)).toBe("E1");
    expect(getTerritoryAt(32, 26)).toBe("E2");
    expect(getTerritoryAt(54, 24)).toBe("E3");
    expect(getTerritoryAt(78, 17)).toBe("F1");
    expect(getTerritoryAt(91, 16)).toBe("F2");
    expect(getTerritoryAt(86, 24)).toBe("F3");

    // Water resolution
    expect(getTerritoryAt(0, 0)).toBeNull();
    expect(getTerritoryAt(103, 0)).toBeNull();
    expect(getTerritoryAt(0, 29)).toBeNull();
    expect(getTerritoryAt(103, 29)).toBeNull();
    expect(getTerritoryAt(19, 12)).toBeNull(); // Northern Isthmus strait
    expect(getTerritoryAt(55, 12)).toBeNull(); // Eastern Sound strait

    // Out of bounds resolution
    expect(getTerritoryAt(-1, 0)).toBeNull();
    expect(getTerritoryAt(0, -1)).toBeNull();
    expect(getTerritoryAt(104, 0)).toBeNull();
    expect(getTerritoryAt(0, 30)).toBeNull();
    expect(getTerritoryAt(999, 999)).toBeNull();
  });

  it("detects border cells and orientation flags correctly", () => {
    // (24, 3) is inside A1, surrounded on all 4 sides by A1
    const interior = getBorderInfo(24, 3);
    expect(interior.territoryId).toBe("A1");
    expect(interior.isBorder).toBe(false);
    expect(interior.north).toBe(false);
    expect(interior.south).toBe(false);
    expect(interior.west).toBe(false);
    expect(interior.east).toBe(false);
    expect(isBorderCell(24, 3)).toBe(false);

    // (6, 1) is on the top boundary of A2 (whispering woods)
    const boundary = getBorderInfo(6, 1);
    expect(boundary.territoryId).toBe("A2");
    expect(boundary.isBorder).toBe(true);
    expect(boundary.north).toBe(true); // water above
    expect(isBorderCell(6, 1)).toBe(true);

    // Water cell (0, 0)
    const water = getBorderInfo(0, 0);
    expect(water.territoryId).toBeNull();
    expect(water.isBorder).toBe(false);
    expect(isBorderCell(0, 0)).toBe(false);
  });

  it("defines sea routes connecting coastal territories across water", () => {
    expect(GRID_SEA_ROUTES.length).toBe(4);

    const routePairs = GRID_SEA_ROUTES.map((r) => `${r.from}<->${r.to}`);
    expect(routePairs).toContain("A3<->B1");
    expect(routePairs).toContain("C4<->B3");
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

      // Intermediate cells must be open water
      for (let i = 1; i < route.path.length - 1; i++) {
        expect(getTerritoryAt(route.path[i].x, route.path[i].y)).toBeNull();
      }
    }
  });

  it("defines decorative map features including compass rose and scale bar", () => {
    expect(GRID_DECORATIONS.waves.length).toBeGreaterThan(0);
    expect(GRID_DECORATIONS.mountains.length).toBeGreaterThan(0);
    expect(GRID_DECORATIONS.trees.length).toBeGreaterThan(0);

    // Compass rose sits in open water
    expect(GRID_DECORATIONS.compass).toEqual({ x: 2, y: 22 });
    expect(getTerritoryAt(2, 22)).toBeNull();

    // Scale bar sits in open water
    expect(GRID_DECORATIONS.scaleBar).toEqual({ x: 50, y: 28 });
    expect(getTerritoryAt(50, 28)).toBeNull();
  });

  it("calculates territory centroids accurately from land cells", () => {
    for (const t of MAP_GRID_IRONREACH.territories) {
      const centroid = getTerritoryCentroid(t.id);
      const cells = getTerritoryCells(t.id);
      expect(cells.length).toBeGreaterThanOrEqual(30);

      const expectedX = cells.reduce((sum, c) => sum + c.x, 0) / cells.length;
      const expectedY = cells.reduce((sum, c) => sum + c.y, 0) / cells.length;

      expect(centroid.x).toBeCloseTo(expectedX, 4);
      expect(centroid.y).toBeCloseTo(expectedY, 4);
    }
  });

  it("navigates spatially in all cardinal directions via geometry", () => {
    // From A1 (Highwatch)
    expect(getNextTerritoryInDirection("A1", "left")).toBe("A2");
    expect(getNextTerritoryInDirection("A1", "right")).toBe("C1");
    expect(getNextTerritoryInDirection("A1", "down")).toBe("A3");
    expect(getNextTerritoryInDirection("A1", "up")).toBeNull();

    // From C2 (Crown Citadel)
    expect(getNextTerritoryInDirection("C2", "up")).toBe("C1");
    expect(getNextTerritoryInDirection("C2", "left")).toBe("A3");
    expect(getNextTerritoryInDirection("C2", "right")).toBe("C4");
    expect(getNextTerritoryInDirection("C2", "down")).toBe("B2");

    // From B2 (The Marches)
    expect(getNextTerritoryInDirection("B2", "left")).toBe("B1");
    expect(getNextTerritoryInDirection("B2", "right")).toBe("B3");
    expect(getNextTerritoryInDirection("B2", "down")).toBe("E1");
    expect(getNextTerritoryInDirection("B2", "up")).toBe("C2");

    // From F1 (Mossgate)
    expect(getNextTerritoryInDirection("F1", "right")).toBe("F2");
    expect(getNextTerritoryInDirection("F1", "down")).toBe("F3");
    expect(getNextTerritoryInDirection("F1", "up")).toBe("C4");
  });
});
