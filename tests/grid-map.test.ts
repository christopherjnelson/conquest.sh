import { describe, expect, it } from "bun:test";
import defaultMap, {
  GRID_CANVAS_HEIGHT,
  GRID_CANVAS_WIDTH,
  GRID_CANVAS_COMPACT_HEIGHT,
  GRID_CANVAS_COMPACT_WIDTH,
  GRID_CANVAS_WIDE_HEIGHT,
  GRID_CANVAS_WIDE_WIDTH,
  GRID_DECORATIONS,
  GRID_DECORATIONS_COMPACT,
  GRID_DECORATIONS_WIDE,
  GRID_SECTORS,
  GRID_SEA_ROUTES,
  GRID_SEA_ROUTES_COMPACT,
  GRID_SEA_ROUTES_WIDE,
  GRID_TEMPLATE,
  GRID_TEMPLATE_COMPACT,
  GRID_TEMPLATE_WIDE,
  MAP_GRID_IRONREACH,
  MAP_GRID_IRONREACH_COMPACT,
  MAP_GRID_IRONREACH_WIDE,
  MAP_IRONREACH,
  getBorderInfo,
  getGeographyBoundingBox,
  getMapForDimensions,
  getMapContentDimensionsForTerminal,
  getMapForTerminalDimensions,
  getNextTerritoryInDirection,
  getTerritoryAt,
  getTerritoryCells,
  getTerritoryMicroCells,
  getTerritoryCentroid,
  getTerritoryFillRatio,
  isBorderCell,
  getLayoutMode,
  buildMicrocellTemplate,
  getMapMicroTemplate,
  getMicroTerritoryAt,
  getTerritoryAtCell,
  deriveCoarseTemplateFromMicro,
} from "../packages/map-engine/src/index.js";

describe("grid-map: 2D Ironreach territory grid engine", () => {
  it("exports MAP_GRID_IRONREACH and matches wide canvas dimensions (136x36)", () => {
    expect(defaultMap).toBe(MAP_GRID_IRONREACH);
    expect(MAP_IRONREACH).toBe(MAP_GRID_IRONREACH);
    expect(MAP_GRID_IRONREACH).toBe(MAP_GRID_IRONREACH_WIDE);
    expect(MAP_GRID_IRONREACH.width).toBe(136);
    expect(MAP_GRID_IRONREACH.height).toBe(36);
    expect(GRID_CANVAS_WIDTH).toBe(136);
    expect(GRID_CANVAS_HEIGHT).toBe(36);
    expect(GRID_CANVAS_WIDE_WIDTH).toBe(136);
    expect(GRID_CANVAS_WIDE_HEIGHT).toBe(36);
    expect(MAP_GRID_IRONREACH.template.length).toBe(36);

    for (let y = 0; y < MAP_GRID_IRONREACH.template.length; y++) {
      expect(MAP_GRID_IRONREACH.template[y].length).toBe(136);
    }
  });

  it("exports MAP_GRID_IRONREACH_COMPACT matching compact canvas dimensions (104x30)", () => {
    expect(MAP_GRID_IRONREACH_COMPACT.width).toBe(104);
    expect(MAP_GRID_IRONREACH_COMPACT.height).toBe(30);
    expect(GRID_CANVAS_COMPACT_WIDTH).toBe(104);
    expect(GRID_CANVAS_COMPACT_HEIGHT).toBe(30);
    expect(MAP_GRID_IRONREACH_COMPACT.template.length).toBe(30);

    for (let y = 0; y < MAP_GRID_IRONREACH_COMPACT.template.length; y++) {
      expect(MAP_GRID_IRONREACH_COMPACT.template[y].length).toBe(104);
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

    for (const map of [MAP_GRID_IRONREACH_COMPACT, MAP_GRID_IRONREACH_WIDE]) {
      expect(map.territories.length).toBe(20);
      const territoryMap = new Map(map.territories.map((t) => [t.id, t]));

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
    for (const map of [MAP_GRID_IRONREACH_COMPACT, MAP_GRID_IRONREACH_WIDE]) {
      const charCounts: Record<string, number> = {};
      for (const row of map.template) {
        for (const char of row) {
          if (char !== ".") {
            charCounts[char] = (charCounts[char] || 0) + 1;
          }
        }
      }

      for (const t of map.territories) {
        const count = charCounts[t.char] || 0;
        expect(count).toBeGreaterThanOrEqual(30);

        const cells = getTerritoryCells(t.id, map);
        expect(cells.length).toBe(count);
      }
    }
  });

  it("verifies every label position is inside its territory land cells", () => {
    for (const map of [MAP_GRID_IRONREACH_COMPACT, MAP_GRID_IRONREACH_WIDE]) {
      for (const t of map.territories) {
        const { x, y } = t.labelPos;
        const territoryAtPos = getTerritoryAt(x, y, map);

        expect(territoryAtPos).toBe(t.id);
        expect(t.position.x).toBe(x);
        expect(t.position.y).toBe(y);
        expect(map.template[y][x]).toBe(t.char);
      }
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
    for (const map of [MAP_GRID_IRONREACH_COMPACT, MAP_GRID_IRONREACH_WIDE]) {
      const seaRoutePairs = new Set(
        map.seaRoutes.flatMap((r) => [`${r.from}-${r.to}`, `${r.to}-${r.from}`])
      );

      // Build physical contacts between territories on the grid
      const contacts = new Map<string, Set<string>>();
      for (const t of map.territories) {
        contacts.set(t.id, new Set());
      }

      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          const t1 = getTerritoryAt(x, y, map);
          if (!t1) continue;

          for (const [dx, dy] of [
            [0, 1],
            [1, 0],
          ]) {
            const nx = x + dx;
            const ny = y + dy;
            const t2 = getTerritoryAt(nx, ny, map);
            if (t2 && t2 !== t1) {
              contacts.get(t1)!.add(t2);
              contacts.get(t2)!.add(t1);
            }
          }
        }
      }

      // Verify: each declared neighbor is either physically touching OR a sea route
      for (const t of map.territories) {
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
        const territory = map.territories.find((item) => item.id === tId)!;
        for (const touchedId of touchedSet) {
          expect(territory.neighbors).toContain(touchedId);
        }
      }
    }
  });

  it("correctly resolves getTerritoryAt for land, water, and out-of-bounds coordinates", () => {
    // Land resolution using actual label positions on wide default map
    for (const t of MAP_GRID_IRONREACH.territories) {
      expect(getTerritoryAt(t.labelPos.x, t.labelPos.y, MAP_GRID_IRONREACH)).toBe(t.id);
    }
    // Land resolution using compact map
    for (const t of MAP_GRID_IRONREACH_COMPACT.territories) {
      expect(getTerritoryAt(t.labelPos.x, t.labelPos.y, MAP_GRID_IRONREACH_COMPACT)).toBe(t.id);
    }

    // Water resolution (wide)
    expect(getTerritoryAt(0, 0, MAP_GRID_IRONREACH)).toBeNull();
    expect(getTerritoryAt(135, 0, MAP_GRID_IRONREACH)).toBeNull();
    expect(getTerritoryAt(0, 35, MAP_GRID_IRONREACH)).toBeNull();
    expect(getTerritoryAt(135, 35, MAP_GRID_IRONREACH)).toBeNull();
    expect(getTerritoryAt(25, 15, MAP_GRID_IRONREACH)).toBeNull(); // Northern Isthmus strait
    expect(getTerritoryAt(72, 15, MAP_GRID_IRONREACH)).toBeNull(); // Eastern Sound strait

    // Out of bounds resolution
    expect(getTerritoryAt(-1, 0)).toBeNull();
    expect(getTerritoryAt(0, -1)).toBeNull();
    expect(getTerritoryAt(136, 0, MAP_GRID_IRONREACH)).toBeNull();
    expect(getTerritoryAt(0, 36, MAP_GRID_IRONREACH)).toBeNull();
    expect(getTerritoryAt(104, 0, MAP_GRID_IRONREACH_COMPACT)).toBeNull();
    expect(getTerritoryAt(0, 30, MAP_GRID_IRONREACH_COMPACT)).toBeNull();
    expect(getTerritoryAt(999, 999)).toBeNull();
  });

  it("detects border cells and orientation flags correctly", () => {
    // (31, 4) is inside A1, surrounded on all 4 sides by A1 in wide map
    const interior = getBorderInfo(31, 4, MAP_GRID_IRONREACH);
    expect(interior.territoryId).toBe("A1");
    expect(interior.isBorder).toBe(false);
    expect(interior.north).toBe(false);
    expect(interior.south).toBe(false);
    expect(interior.west).toBe(false);
    expect(interior.east).toBe(false);
    expect(isBorderCell(31, 4, MAP_GRID_IRONREACH)).toBe(false);

    // Boundary check on compact map: (7, 0) is on the top boundary of A2 (whispering woods)
    const boundary = getBorderInfo(7, 0, MAP_GRID_IRONREACH_COMPACT);
    expect(boundary.territoryId).toBe("A2");
    expect(boundary.isBorder).toBe(true);
    expect(boundary.north).toBe(true); // water/edge above
    expect(isBorderCell(7, 0, MAP_GRID_IRONREACH_COMPACT)).toBe(true);

    // Water cell (0, 0)
    const water = getBorderInfo(0, 0);
    expect(water.territoryId).toBeNull();
    expect(water.isBorder).toBe(false);
    expect(isBorderCell(0, 0)).toBe(false);
  });

  it("defines sea routes connecting coastal territories across water", () => {
    for (const map of [MAP_GRID_IRONREACH_COMPACT, MAP_GRID_IRONREACH_WIDE]) {
      expect(map.seaRoutes.length).toBe(4);

      const routePairs = map.seaRoutes.map((r) => `${r.from}<->${r.to}`);
      expect(routePairs).toContain("A3<->B1");
      expect(routePairs).toContain("C4<->B3");
      expect(routePairs).toContain("C4<->F1");
      expect(routePairs).toContain("E3<->F1");

      for (const route of map.seaRoutes) {
        expect(route.path.length).toBeGreaterThanOrEqual(2);
        const start = route.path[0];
        const end = route.path[route.path.length - 1];

        // Starting cell belongs to "from" territory
        expect(getTerritoryAt(start.x, start.y, map)).toBe(route.from);
        // Ending cell belongs to "to" territory
        expect(getTerritoryAt(end.x, end.y, map)).toBe(route.to);

        // Intermediate cells must be open water
        for (let i = 1; i < route.path.length - 1; i++) {
          expect(getTerritoryAt(route.path[i].x, route.path[i].y, map)).toBeNull();
        }
      }
    }
  });

  it("defines decorative map features including compass rose and scale bar", () => {
    for (const map of [MAP_GRID_IRONREACH_COMPACT, MAP_GRID_IRONREACH_WIDE]) {
      expect(map.decorations.waves.length).toBeGreaterThan(0);
      expect(map.decorations.mountains.length).toBeGreaterThan(0);
      expect(map.decorations.trees.length).toBeGreaterThan(0);

      // Compass rose sits in open water
      expect(getTerritoryAt(map.decorations.compass.x, map.decorations.compass.y, map)).toBeNull();

      // Scale bar sits in open water
      expect(getTerritoryAt(map.decorations.scaleBar.x, map.decorations.scaleBar.y, map)).toBeNull();
    }
  });

  it("calculates territory centroids accurately from canonical microcell geometry", () => {
    for (const map of [MAP_GRID_IRONREACH_COMPACT, MAP_GRID_IRONREACH_WIDE]) {
      for (const t of map.territories) {
        const centroid = getTerritoryCentroid(t.id, map);
        const microCells = getTerritoryMicroCells(t.id, map);
        expect(microCells.length).toBeGreaterThanOrEqual(60);

        const expectedX = microCells.reduce((sum, c) => sum + c.x, 0) / microCells.length;
        const expectedY = microCells.reduce((sum, c) => sum + c.y / 2, 0) / microCells.length;

        expect(centroid.x).toBeCloseTo(expectedX, 4);
        expect(centroid.y).toBeCloseTo(expectedY, 4);
      }
    }
  });

  it("navigates spatially in all cardinal directions via geometry", () => {
    for (const map of [MAP_GRID_IRONREACH, MAP_GRID_IRONREACH_COMPACT]) {
      // From A1 (Highwatch)
      expect(getNextTerritoryInDirection("A1", "left", map)).toBe("A2");
      expect(getNextTerritoryInDirection("A1", "right", map)).toBe("C1");
      expect(getNextTerritoryInDirection("A1", "down", map)).toBe("A3");
      expect(getNextTerritoryInDirection("A1", "up", map)).toBeNull();

      // From C2 (Crown Citadel)
      expect(getNextTerritoryInDirection("C2", "up", map)).toBe("C1");
      expect(getNextTerritoryInDirection("C2", "left", map)).toBe("A3");
      expect(getNextTerritoryInDirection("C2", "right", map)).toBe("C4");
      expect(getNextTerritoryInDirection("C2", "down", map)).toBe("B2");

      // From B2 (The Marches)
      expect(getNextTerritoryInDirection("B2", "left", map)).toBe("B1");
      expect(getNextTerritoryInDirection("B2", "right", map)).toBe("B3");
      expect(getNextTerritoryInDirection("B2", "down", map)).toBe("E1");
      expect(getNextTerritoryInDirection("B2", "up", map)).toBe("C2");

      // From F1 (Mossgate)
      expect(getNextTerritoryInDirection("F1", "right", map)).toBe("F2");
      expect(getNextTerritoryInDirection("F1", "down", map)).toBe("F3");
      expect(getNextTerritoryInDirection("F1", "up", map)).toBe("C4");
    }
  });
});

describe("grid-map: geometry sanity tests (spec sections 3, 4, 6, 7, 8, 9)", () => {
  it("asserts fillRatio <= 0.85 for all 20 territories in both compact and wide maps", () => {
    const maps = [
      { name: "compact", map: MAP_GRID_IRONREACH_COMPACT },
      { name: "wide", map: MAP_GRID_IRONREACH_WIDE },
    ];

    for (const { name, map } of maps) {
      expect(map.territories.length).toBe(20);
      for (const t of map.territories) {
        const ratio = getTerritoryFillRatio(t.id, map);
        expect(ratio).toBeGreaterThan(0);
        expect(ratio).toBeLessThanOrEqual(0.85);
      }
    }
  });

  it("asserts geographyBoundingBox spans at least 80% width and 75% height for both templates", () => {
    for (const map of [MAP_GRID_IRONREACH_COMPACT, MAP_GRID_IRONREACH_WIDE]) {
      const bbox = getGeographyBoundingBox(map);
      const widthRatio = bbox.width / map.width;
      const heightRatio = bbox.height / map.height;

      expect(widthRatio).toBeGreaterThanOrEqual(0.80);
      expect(heightRatio).toBeGreaterThanOrEqual(0.75);
    }
  });

  it("asserts MAP_GRID_IRONREACH_WIDE.width === 136 and height === 36", () => {
    expect(MAP_GRID_IRONREACH_WIDE.width).toBe(136);
    expect(MAP_GRID_IRONREACH_WIDE.height).toBe(36);
    expect(MAP_GRID_IRONREACH_WIDE.template.length).toBe(36);
    for (const row of MAP_GRID_IRONREACH_WIDE.template) {
      expect(row.length).toBe(136);
    }
  });

  it("asserts all continental neighbors physically share borders", () => {
    for (const map of [MAP_GRID_IRONREACH_COMPACT, MAP_GRID_IRONREACH_WIDE]) {
      const seaRouteSet = new Set(
        map.seaRoutes.flatMap((r) => [`${r.from}-${r.to}`, `${r.to}-${r.from}`])
      );

      const contacts = new Map<string, Set<string>>();
      for (const t of map.territories) {
        contacts.set(t.id, new Set());
      }

      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          const t1 = getTerritoryAt(x, y, map);
          if (!t1) continue;

          for (const [dx, dy] of [
            [0, 1],
            [1, 0],
          ]) {
            const nx = x + dx;
            const ny = y + dy;
            const t2 = getTerritoryAt(nx, ny, map);
            if (t2 && t2 !== t1) {
              contacts.get(t1)!.add(t2);
              contacts.get(t2)!.add(t1);
            }
          }
        }
      }

      for (const t of map.territories) {
        for (const nbrId of t.neighbors) {
          const isSea = seaRouteSet.has(`${t.id}-${nbrId}`);
          const touches = contacts.get(t.id)!.has(nbrId);
          if (isSea) {
            expect(touches).toBe(false);
          } else {
            expect(touches).toBe(true);
          }
        }
      }
    }
  });

  it("asserts getMapForDimensions returns wide map when given width 140, height 40", () => {
    const wideMap = getMapForDimensions(140, 40);
    expect(wideMap).toBe(MAP_GRID_IRONREACH_WIDE);
    expect(wideMap.width).toBe(136);
    expect(wideMap.height).toBe(36);

    // Below threshold returns compact
    const compactMap = getMapForDimensions(120, 30);
    expect(compactMap).toBe(MAP_GRID_IRONREACH_COMPACT);
    expect(compactMap.width).toBe(104);
    expect(compactMap.height).toBe(30);

    // Threshold edge checks use the rendered wide land crop, excluding ocean margin.
    const wideLand = getGeographyBoundingBox(MAP_GRID_IRONREACH_WIDE);
    expect(getMapForDimensions(wideLand.width, wideLand.height)).toBe(MAP_GRID_IRONREACH_WIDE);
    expect(getMapForDimensions(wideLand.width - 1, wideLand.height)).toBe(MAP_GRID_IRONREACH_COMPACT);
    expect(getMapForDimensions(wideLand.width, wideLand.height - 1)).toBe(MAP_GRID_IRONREACH_COMPACT);

    // Wide-but-short returns compact to prevent vertical overflow
    expect(getMapForDimensions(200, 30)).toBe(MAP_GRID_IRONREACH_COMPACT);

    // Terminal content dimensions mirror App's actual tactical pane rather
    // than treating every layout as a 75% split.
    expect(getMapContentDimensionsForTerminal(140, 45)).toEqual({ width: 99, height: 34 });
    expect(getMapContentDimensionsForTerminal(180, 50)).toEqual({ width: 134, height: 36 });
    expect(getMapContentDimensionsForTerminal(200, 55)).toEqual({ width: 149, height: 41 });

    // Exact wide boundary: its 132x36 land crop fits at 180x50, while either
    // preceding terminal dimension remains in the standard pane and selects compact.
    expect(getMapForTerminalDimensions(179, 50)).toBe(MAP_GRID_IRONREACH_COMPACT);
    expect(getMapForTerminalDimensions(180, 49)).toBe(MAP_GRID_IRONREACH_COMPACT);
    expect(getMapForTerminalDimensions(180, 50)).toBe(MAP_GRID_IRONREACH_WIDE);
    expect(getMapForTerminalDimensions(184, 55)).toBe(MAP_GRID_IRONREACH_WIDE);
    expect(getMapForTerminalDimensions(185, 55)).toBe(MAP_GRID_IRONREACH_WIDE);
    expect(getMapForTerminalDimensions(200, 55)).toBe(MAP_GRID_IRONREACH_WIDE);
    // 200x30 remains compact because the terminal is below the layout minimum.
    expect(getMapForTerminalDimensions(200, 30)).toBe(MAP_GRID_IRONREACH_COMPACT);
    // The compact responsive viewport is authoritative even if a short,
    // wide terminal's raw rectangle could otherwise hold wide geography.
    expect(getMapForTerminalDimensions(200, 37)).toBe(MAP_GRID_IRONREACH_COMPACT);
  });

  it("evaluates getLayoutMode with canonical thresholds for compact, standard, and wide", () => {
    // Compact: cols < 130 or rows < 38
    expect(getLayoutMode(105, 34)).toBe("compact");
    expect(getLayoutMode(120, 40)).toBe("compact");
    expect(getLayoutMode(129, 50)).toBe("compact");
    expect(getLayoutMode(200, 30)).toBe("compact");
    expect(getLayoutMode(200, 37)).toBe("compact");

    // Standard: cols 130..179 and rows >= 38, or cols >= 180 and rows 38..49
    expect(getLayoutMode(130, 38)).toBe("standard");
    expect(getLayoutMode(140, 45)).toBe("standard");
    expect(getLayoutMode(179, 45)).toBe("standard");
    expect(getLayoutMode(185, 45)).toBe("standard");

    // Wide: cols >= 180 and rows >= 50. The same boundary now has a
    // 134x36 App map pane, which fits the 132x36 wide land raster.
    expect(getLayoutMode(180, 50)).toBe("wide");
    expect(getLayoutMode(200, 55)).toBe("wide");
    expect(getLayoutMode(240, 60)).toBe("wide");
  });

  it("builds 2x vertical resolution microcell templates with sub-pixel coastlines", () => {
    const wideMicro = getMapMicroTemplate(MAP_GRID_IRONREACH_WIDE);
    expect(wideMicro.length).toBe(72); // 36 * 2
    for (const row of wideMicro) {
      expect(row.length).toBe(136);
    }

    const compactMicro = getMapMicroTemplate(MAP_GRID_IRONREACH_COMPACT);
    expect(compactMicro.length).toBe(60); // 30 * 2
    for (const row of compactMicro) {
      expect(row.length).toBe(104);
    }

    // Every territory label position is mapped in microcell space
    for (const t of MAP_GRID_IRONREACH_WIDE.territories) {
      const topT = getMicroTerritoryAt(t.labelPos.x, t.labelPos.y * 2, MAP_GRID_IRONREACH_WIDE);
      const botT = getMicroTerritoryAt(t.labelPos.x, t.labelPos.y * 2 + 1, MAP_GRID_IRONREACH_WIDE);
      expect(topT).toBe(t.id);
      expect(botT).toBe(t.id);
    }

    // Water out of bounds and open sea
    expect(getMicroTerritoryAt(0, 0, MAP_GRID_IRONREACH_WIDE)).toBeNull();
    expect(getMicroTerritoryAt(-1, 0, MAP_GRID_IRONREACH_WIDE)).toBeNull();
    expect(getMicroTerritoryAt(0, 999, MAP_GRID_IRONREACH_WIDE)).toBeNull();
  });

  it("verifies getTerritoryAtCell hit-testing across cells and boundaries", () => {
    // Label centroids resolve accurately
    for (const t of MAP_GRID_IRONREACH_WIDE.territories) {
      const tid = getTerritoryAtCell(t.labelPos.x, t.labelPos.y, MAP_GRID_IRONREACH_WIDE);
      expect(tid).toBe(t.id);
    }

    // Open water cell resolves to null
    expect(getTerritoryAtCell(0, 0, MAP_GRID_IRONREACH_WIDE)).toBeNull();

    // Ocean labels decoration presence
    expect(MAP_GRID_IRONREACH_WIDE.decorations.oceanLabels).toBeDefined();
    expect(MAP_GRID_IRONREACH_WIDE.decorations.oceanLabels!.length).toBeGreaterThanOrEqual(3);
    const wideGreySea = MAP_GRID_IRONREACH_WIDE.decorations.oceanLabels!.find((l) =>
      l.text.includes("THE GREY SEA")
    );
    expect(wideGreySea).toBeDefined();

    expect(MAP_GRID_IRONREACH_COMPACT.decorations.oceanLabels).toBeDefined();
    const compactGreySea = MAP_GRID_IRONREACH_COMPACT.decorations.oceanLabels!.find((l) =>
      l.text.includes("THE GREY SEA")
    );
    expect(compactGreySea).toBeDefined();
  });

  it("verifies canonical microcell templates contain genuine sub-pixel diagonal transitions impossible in coarse grids", () => {
    // Both wide and compact micro templates must have authored microTemplate arrays
    expect(MAP_GRID_IRONREACH_WIDE.microTemplate).toBeDefined();
    expect(MAP_GRID_IRONREACH_COMPACT.microTemplate).toBeDefined();

    // Count transitions where top half-block and bottom half-block differ within the same terminal character cell
    // (i.e. y is cell row, cell character is made of microRow 2*y and microRow 2*y+1)
    let wideDiagonalTransitions = 0;
    for (let y = 0; y < MAP_GRID_IRONREACH_WIDE.height; y++) {
      const topRow = MAP_GRID_IRONREACH_WIDE.microTemplate![y * 2];
      const botRow = MAP_GRID_IRONREACH_WIDE.microTemplate![y * 2 + 1];
      for (let x = 0; x < MAP_GRID_IRONREACH_WIDE.width; x++) {
        const topC = topRow[x];
        const botC = botRow[x];
        if (topC !== botC) {
          wideDiagonalTransitions++;
        }
      }
    }

    let compactDiagonalTransitions = 0;
    for (let y = 0; y < MAP_GRID_IRONREACH_COMPACT.height; y++) {
      const topRow = MAP_GRID_IRONREACH_COMPACT.microTemplate![y * 2];
      const botRow = MAP_GRID_IRONREACH_COMPACT.microTemplate![y * 2 + 1];
      for (let x = 0; x < MAP_GRID_IRONREACH_COMPACT.width; x++) {
        const topC = topRow[x];
        const botC = botRow[x];
        if (topC !== botC) {
          compactDiagonalTransitions++;
        }
      }
    }

    // Coarse-smoothing produces very few vertical half-block transitions.
    // Authored microcell templates contain hundreds of hand-crafted sub-pixel transitions.
    expect(wideDiagonalTransitions).toBeGreaterThan(200);
    expect(compactDiagonalTransitions).toBeGreaterThan(200);

    // Also verify deriveCoarseTemplateFromMicro derives the coarse template deterministically
    const derivedWide = deriveCoarseTemplateFromMicro(MAP_GRID_IRONREACH_WIDE.microTemplate!);
    expect(derivedWide).toEqual(MAP_GRID_IRONREACH_WIDE.template);

    const derivedCompact = deriveCoarseTemplateFromMicro(MAP_GRID_IRONREACH_COMPACT.microTemplate!);
    expect(derivedCompact).toEqual(MAP_GRID_IRONREACH_COMPACT.template);
  });

  it("keeps Duskfall's core as one continuous land lobe", () => {
    for (const map of [MAP_GRID_IRONREACH_COMPACT, MAP_GRID_IRONREACH_WIDE]) {
      const rows = map.microTemplate!;
      for (const row of rows) {
        const qCells = [...row].flatMap((cell, x) => (cell === "Q" ? [x] : []));
        // Small Q fragments belong to the exterior taper.  A substantial row is
        // the lobe's interior and may not contain a water channel.
        if (qCells.length < 8) continue;
        for (let x = qCells[0]; x <= qCells[qCells.length - 1]; x++) {
          expect(row[x]).toBe("Q");
        }
      }
    }

    const wideRows = MAP_GRID_IRONREACH_WIDE.microTemplate!.slice(49, 70);
    const rightEdges = wideRows.map((row) => row.lastIndexOf("Q"));
    for (let i = 1; i < rightEdges.length; i++) {
      expect(Math.abs(rightEdges[i] - rightEdges[i - 1])).toBeLessThanOrEqual(4);
    }

    // The facing coast is a proper angled cape after microcells are merged,
    // rather than a flat horizontal bar between Hollowmere and Mossgate.
    const renderedWide = deriveCoarseTemplateFromMicro(MAP_GRID_IRONREACH_WIDE.microTemplate!);
    const duskfallEastEdge = [24, 25, 26, 27].map((y) => renderedWide[y].lastIndexOf("Q"));
    expect(duskfallEastEdge[2]).toBeGreaterThanOrEqual(duskfallEastEdge[0] + 6);
    expect(duskfallEastEdge[3]).toBeLessThan(duskfallEastEdge[2]);
    const mossgateWestEdge = [23, 24, 25, 26].map((y) => renderedWide[y].indexOf("R"));
    expect(mossgateWestEdge[1]).toBeLessThanOrEqual(mossgateWestEdge[0] - 8);
    expect(mossgateWestEdge[3]).toBeGreaterThan(mossgateWestEdge[1]);
  });

  it("composes the Mist Strait as a narrow water route rather than a broad empty channel", () => {
    const widestChannel = (rows: readonly string[], rowIndexes: readonly number[]) => {
      const gaps = rowIndexes.map((y) => {
        const row = rows[y];
        const duskfallEdge = row.lastIndexOf("Q");
        const mossgateEdge = row.indexOf("R");
        expect(duskfallEdge).toBeGreaterThanOrEqual(0);
        expect(mossgateEdge).toBeGreaterThan(duskfallEdge);
        return mossgateEdge - duskfallEdge - 1;
      });
      return Math.max(...gaps);
    };

    // The paired E3/F1 peninsulas retain a navigable sea gap.  These rows sit
    // directly beneath the E3 <-> F1 route and prevent a return to the former
    // 24-microcell-wide empty corridor in wide mode.
    expect(widestChannel(MAP_GRID_IRONREACH_WIDE.microTemplate!, [49, 50, 51, 52, 53]))
      .toBeLessThanOrEqual(11);
    expect(widestChannel(MAP_GRID_IRONREACH_COMPACT.microTemplate!, [41, 42, 43]))
      .toBeLessThanOrEqual(8);
  });

  it("authors staggered northern coastlines instead of a continuous shelf", () => {
    for (const map of [MAP_GRID_IRONREACH_COMPACT, MAP_GRID_IRONREACH_WIDE]) {
      const northRows = map.microTemplate!.slice(0, Math.floor(map.microTemplate!.length / 4));
      for (let y = 0; y < northRows.length; y++) {
        let run = 0;
        let longestExteriorRun = 0;
        for (let x = 0; x < northRows[y].length; x++) {
          const isExteriorCoast = northRows[y][x] !== "." && (y === 0 || northRows[y - 1][x] === ".");
          run = isExteriorCoast ? run + 1 : 0;
          longestExteriorRun = Math.max(longestExteriorRun, run);
        }
        expect(longestExteriorRun).toBeLessThanOrEqual(9);
      }
    }

    // Rendering merges each two microcell rows into a terminal row.  Guard the
    // visible contour as well, since a pair of short microcell ledges can form
    // one long shelf after that merge.
    const renderedNorth = deriveCoarseTemplateFromMicro(MAP_GRID_IRONREACH_WIDE.microTemplate!).slice(0, 8);
    for (let y = 0; y < renderedNorth.length; y++) {
      let run = 0;
      let longestExteriorRun = 0;
      for (let x = 0; x < renderedNorth[y].length; x++) {
        const isExteriorCoast = renderedNorth[y][x] !== "." && (y === 0 || renderedNorth[y - 1][x] === ".");
        run = isExteriorCoast ? run + 1 : 0;
        longestExteriorRun = Math.max(longestExteriorRun, run);
      }
      expect(longestExteriorRun).toBeLessThanOrEqual(9);
    }

    // These water cuts create the paired bays between the northern territories
    // while preserving their connections on the rows below.
    expect(MAP_GRID_IRONREACH_COMPACT.microTemplate![2].slice(34, 40)).toBe("......");
    expect(MAP_GRID_IRONREACH_WIDE.microTemplate![4].slice(41, 51)).toBe("..........");
    expect(MAP_GRID_IRONREACH_WIDE.microTemplate![5].slice(42, 49)).toBe(".......");
    expect(renderedNorth[2].slice(77, 85)).toBe("IIIIIIII");
  });

  it("does not leave floating micro-fragments in the Emerald Isles", () => {
    for (const map of [MAP_GRID_IRONREACH_COMPACT, MAP_GRID_IRONREACH_WIDE]) {
      const rows = map.microTemplate!;
      for (const char of ["R", "S", "T"]) {
        const visited = new Set<string>();
        for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) {
          const key = `${x},${y}`;
          if (rows[y][x] !== char || visited.has(key)) continue;
          const queue = [[x, y]];
          const component: Array<[number, number]> = [];
          visited.add(key);
          while (queue.length) {
            const [cx, cy] = queue.pop()!;
            component.push([cx, cy]);
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const nx = cx + dx, ny = cy + dy, next = `${nx},${ny}`;
              if (rows[ny]?.[nx] === char && !visited.has(next)) {
                visited.add(next);
                queue.push([nx, ny]);
              }
            }
          }
          expect(component.length).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it("resolves ambiguous half-cell hit testing using local neighborhood majority instead of always top microcell", () => {
    // Cell (40, 2) on wide map: top microcell is C1, bottom is A1.
    // Local neighborhood is dominated by A1, so getTerritoryAtCell resolves to A1 (botT), not C1.
    const cell40_2_top = getMicroTerritoryAt(40, 4, MAP_GRID_IRONREACH_WIDE);
    const cell40_2_bot = getMicroTerritoryAt(40, 5, MAP_GRID_IRONREACH_WIDE);
    expect(cell40_2_top).toBe("C1");
    expect(cell40_2_bot).toBe("A1");
    expect(getTerritoryAtCell(40, 2, MAP_GRID_IRONREACH_WIDE)).toBe("A1");

    // Cell (21, 3) on wide map: top microcell is A1, bottom is A2.
    // Local neighborhood resolves to A2 (botT), not A1.
    const cell21_3_top = getMicroTerritoryAt(21, 6, MAP_GRID_IRONREACH_WIDE);
    const cell21_3_bot = getMicroTerritoryAt(21, 7, MAP_GRID_IRONREACH_WIDE);
    expect(cell21_3_top).toBe("A1");
    expect(cell21_3_bot).toBe("A2");
    expect(getTerritoryAtCell(21, 3, MAP_GRID_IRONREACH_WIDE)).toBe("A2");

    // Cell (115, 20) on wide map: top microcell is F2, bottom is F1.
    // Local neighborhood resolves to F1 (botT).
    const cell115_20_top = getMicroTerritoryAt(115, 40, MAP_GRID_IRONREACH_WIDE);
    const cell115_20_bot = getMicroTerritoryAt(115, 41, MAP_GRID_IRONREACH_WIDE);
    expect(cell115_20_top).toBe("F2");
    expect(cell115_20_bot).toBe("F1");
    expect(getTerritoryAtCell(115, 20, MAP_GRID_IRONREACH_WIDE)).toBe("F1");
  });
});
