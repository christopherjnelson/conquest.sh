import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { attackTerritory, calculateReinforcements, createInitialGameState } from "../packages/game-core/src/index.js";
import { EARTH_42_BUNDLE } from "../packages/map-engine/src/maps/earth-42.js";
import { getDefaultMap, getMap, getRenderVariant, selectRenderVariant, type MapBundle } from "../packages/map-engine/src/registry.js";
import { getNextTerritoryInDirection, getTerritoryAt } from "../packages/map-engine/src/grid-engine.js";
import { getNextTabTerritoryId } from "../packages/map-engine/src/navigation.js";
import { deriveCoarseTemplateFromMicro } from "../packages/map-engine/src/raster.js";
import type { GridMapDefinition } from "../packages/map-engine/src/types.js";
import type { Player } from "../packages/protocol/src/index.js";

const earth = EARTH_42_BUNDLE.definition;
const expectedGroups = [
  ["North America", 9, 5], ["South America", 4, 2], ["Europe", 7, 5],
  ["Africa", 6, 3], ["Asia", 12, 7], ["Oceania", 4, 2],
];
const canonicalGraphSha256 = "da40a605fc205affd52225052aec7d902a4dced0a14ac609af85af668f6f2a4f";

function players(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`, name: `Player ${i}`, colorIndex: i, colorHex: "#ffffff",
    connected: true, isAlive: true, ready: true,
  }));
}

describe("Earth-42 logical topology", () => {
  it("has exactly the canonical regions, bonuses, territories and neighbors", () => {
    expect(earth.territories.length).toBe(42);
    expect(new Set(earth.territories.map(t => t.id)).size).toBe(42);
    expect(earth.territories.every(t => (t.description?.length ?? 0) > 20)).toBe(true);
    expect(earth.sectors.map(s => [s.name, s.territoryIds.length, s.bonusReinforcements])).toEqual(expectedGroups);
    const signature = earth.territories.map(t => `${t.id}:${[...t.neighbors].sort().join(",")}`).sort().join("\n");
    expect(createHash("sha256").update(signature).digest("hex")).toBe(canonicalGraphSha256);
  });

  it("is a valid bidirectional connected graph", () => {
    const byId = new Map(earth.territories.map(t => [t.id, t]));
    for (const t of earth.territories) {
      expect(new Set(t.neighbors).size).toBe(t.neighbors.length);
      expect(t.neighbors).not.toContain(t.id);
      for (const id of t.neighbors) {
        expect(byId.has(id)).toBe(true);
        expect(byId.get(id)?.neighbors).toContain(t.id);
      }
    }
    const seen = new Set<string>();
    const pending = [earth.territories[0].id];
    while (pending.length) {
      const id = pending.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      pending.push(...byId.get(id)!.neighbors);
    }
    expect(seen.size).toBe(42);
  });

  for (const count of [2, 3, 4, 5, 6]) {
    it(`distributes all territories exactly once among ${count} players`, () => {
      const state = createInitialGameState("g", "EAR1", players(count), earth);
      expect(state.mapId).toBe("earth-42");
      expect(Object.keys(state.territories).sort()).toEqual(earth.territories.map(t => t.id).sort());
      const counts = players(count).map(p => Object.values(state.territories).filter(t => t.ownerId === p.id).length);
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    });
  }

  it("awards each continent bonus through generic reinforcement rules", () => {
    const base = createInitialGameState("g", "EAR1", players(2), earth);
    for (const sector of earth.sectors) {
      const state = structuredClone(base);
      for (const t of Object.values(state.territories)) t.ownerId = "p1";
      for (const id of sector.territoryIds) state.territories[id].ownerId = "p0";
      expect(calculateReinforcements(state, "p0")).toBe(
        Math.max(3, Math.floor(sector.territoryIds.length / 3)) + sector.bonusReinforcements
      );
    }
  });

  it("can conquer all 42 Earth territories and finish through normal attack rules", () => {
    let state = createInitialGameState("g", "EAR1", players(2), earth);
    for (const t of Object.values(state.territories)) { t.ownerId = "p1"; t.units = 1; }
    state.territories.na_alaska_range.ownerId = "p0";
    state.phase = "attack";
    const byId = new Map(earth.territories.map(t => [t.id, t]));
    const conquered = new Set(["na_alaska_range"]);
    let attacks = 0;
    while (conquered.size < earth.territories.length) {
      const frontier = [...conquered].flatMap(from => byId.get(from)!.neighbors
        .filter(to => !conquered.has(to)).map(to => ({ from, to })))[0];
      expect(frontier).toBeDefined();
      state.territories[frontier.from].units = 20;
      let roll = 0;
      const result = attackTerritory(state, "p0", frontier.from, frontier.to, 3,
        () => [0.99, 0.99, 0.99, 0][roll++ % 4]);
      expect(result.ok).toBe(true);
      if (!result.ok) break;
      state = result.state;
      expect(state.territories[frontier.to].ownerId).toBe("p0");
      conquered.add(frontier.to);
      attacks++;
    }
    expect(attacks).toBe(41);
    expect(state.mapId).toBe("earth-42");
    expect(state.phase).toBe("game_over");
    expect(state.winnerId).toBe("p0");
    expect(state.result?.winnerId).toBe("p0");
    expect(Object.values(state.territories).every(t => t.ownerId === "p0")).toBe(true);
  });
});

describe("map bundles and geometry", () => {
  it("defaults to Earth and resolves Ironreach aliases", () => {
    expect(getDefaultMap().definition.id).toBe("earth-42");
    expect(getMap("ironreach")?.definition.territories.length).toBe(20);
    expect(getMap("grid-ironreach")).toBe(getMap("ironreach"));
    expect(getRenderVariant("earth-42", { width: 144, height: 38 }).profile).toBe("wide");
  });

  it("selects an arbitrary synthetic bundle by pane size", () => {
    const definition: MapBundle["definition"] = {
        id: "test-archipelago", name: "Test", description: "", recommendedPlayers: { min: 2, max: 2 },
        sectors: [{ id: "one", name: "One", colorHex: "#ffffff", bonusReinforcements: 1, territoryIds: ["north", "south"] },
          { id: "two", name: "Two", colorHex: "#000000", bonusReinforcements: 1, territoryIds: ["isle"] }],
        territories: [{ id: "north", name: "North", sectorId: "one", neighbors: ["south"] },
          { id: "south", name: "South", sectorId: "one", neighbors: ["north", "isle"] },
          { id: "isle", name: "Isle", sectorId: "two", neighbors: ["south"] }] };
    const grid = (microTemplate: string[]): GridMapDefinition => {
      const anchors = { north: { x: 1, y: 0 }, south: { x: 4, y: 2 }, isle: { x: 7, y: 0 } };
      const chars = { north: "X", south: "Y", isle: "Z" };
      return { ...definition, width: microTemplate[0].length, height: microTemplate.length / 2,
        template: deriveCoarseTemplateFromMicro(microTemplate), microTemplate,
        charToTerritoryId: { X: "north", Y: "south", Z: "isle" }, territoryIdToChar: chars,
        territories: definition.territories.map(t => ({ ...t, char: chars[t.id as keyof typeof chars],
          regionId: t.sectorId, regionName: t.sectorId, regionBonus: 1, regionColor: "#ffffff",
          labelPos: anchors[t.id as keyof typeof anchors], position: anchors[t.id as keyof typeof anchors],
          icon: "●", flavor: "", render: { flavor: "" } })),
        seaRoutes: [{ from: "north", to: "south", path: [{ x: 2, y: 2 }] },
          { from: "south", to: "isle", path: [{ x: 6, y: 2 }] }],
        decorations: { waves: [], mountains: [], trees: [], compass: { x: 0, y: 0 }, scaleBar: { x: 0, y: 3 } },
      };
    };
    const compact = grid(["XXX...ZZZ", "XXX...ZZZ", "XXX...ZZZ", "XXX...ZZZ", "...YYY...", "...YYY...", "...YYY...", "...YYY..."]);
    const wide = grid(["XXX......ZZZ", "XXX......ZZZ", "XXX......ZZZ", "XXX......ZZZ", "............", "....YYYY....",
      "....YYYY....", "....YYYY....", "....YYYY....", "............", "............", "............"]);
    const synthetic: MapBundle = {
      definition,
      renderVariants: [{ profile: "compact", grid: compact }, { profile: "wide", grid: wide }],
      metadata: { regionSingular: "Region", regionPlural: "Regions", navigationAnchorTerritoryId: "north",
        displayCodes: { north: "N", south: "S", isle: "I" } },
    };
    expect(selectRenderVariant(synthetic, { width: 9, height: 4 }).profile).toBe("compact");
    expect(selectRenderVariant(synthetic, { width: 12, height: 6 }).profile).toBe("wide");
    expect(getTerritoryAt(1, 0, compact)).toBe("north");
    expect(getTerritoryAt(4, 2, compact)).toBe("south");
    expect(getTerritoryAt(7, 0, compact)).toBe("isle");
    expect(getNextTerritoryInDirection("north", "right", compact)).toBe("isle");
  });

  it("supports authored anchor and spatial navigation across five continents", () => {
    const map = EARTH_42_BUNDLE.renderVariants.find(v => v.profile === "wide")!.grid;
    expect(earth.territories.some(t => t.id === EARTH_42_BUNDLE.metadata.navigationAnchorTerritoryId)).toBe(true);
    expect(getNextTerritoryInDirection("na_pacific_states", "right", map)).toBe("na_atlantic_states");
    expect(getNextTerritoryInDirection("eu_northern_europe", "up", map)).toBe("eu_scandinavia");
    expect(getNextTerritoryInDirection("as_siberia", "down", map)).toBe("as_mongolia");
    expect(getNextTerritoryInDirection("af_congo_basin", "right", map)).toBe("af_east_africa");
    expect(getNextTerritoryInDirection("oc_western_australia", "right", map)).toBe("oc_eastern_australia");
    const ids = earth.territories.map(t => t.id);
    let current: string | null = null;
    const cycled = new Set<string>();
    for (let i = 0; i < ids.length; i++) {
      current = getNextTabTerritoryId(ids, current);
      cycled.add(current!);
    }
    expect(cycled.size).toBe(42);
    expect(getNextTabTerritoryId(ids, current)).toBe(ids[0]);
    expect(getNextTabTerritoryId(ids, null, true)).toBe(ids[41]);
  });

  for (const { profile, grid } of EARTH_42_BUNDLE.renderVariants) {
    it(`${profile} raster has every territory, valid anchors, and no undeclared contacts`, () => {
      expect(grid.microTemplate).toHaveLength(grid.height * 2);
      expect(grid.microTemplate.every(row => row.length === grid.width)).toBe(true);
      const represented = new Set([...grid.microTemplate.join("")].map(c => grid.charToTerritoryId[c]).filter(Boolean));
      expect(represented.size).toBe(42);
      const touching = new Set<string>();
      for (let y = 0; y < grid.microTemplate.length; y++) for (let x = 0; x < grid.width; x++) {
        const a = grid.charToTerritoryId[grid.microTemplate[y][x]];
        if (!a) continue;
        for (const [dx, dy] of [[1, 0], [0, 1]]) {
          const b = grid.charToTerritoryId[grid.microTemplate[y + dy]?.[x + dx]];
          if (b && a !== b) touching.add([a, b].sort().join("|"));
        }
      }
      const routed = new Set(grid.seaRoutes.map(route => [route.from, route.to].sort().join("|")));
      for (const t of grid.territories) {
        expect(grid.microTemplate.join("").split(t.char).length - 1).toBeGreaterThanOrEqual(4);
        const y = t.labelPos.y * 2;
        expect([grid.microTemplate[y]?.[t.labelPos.x], grid.microTemplate[y + 1]?.[t.labelPos.x]]).toContain(t.char);
        const cells = new Set<string>();
        for (let microY = 0; microY < grid.microTemplate.length; microY++) {
          for (let microX = 0; microX < grid.width; microX++) {
            if (grid.microTemplate[microY][microX] === t.char) cells.add(`${microX},${microY}`);
          }
        }
        let components = 0;
        while (cells.size) {
          components++;
          const first = cells.values().next().value!;
          cells.delete(first);
          const pending = [first];
          while (pending.length) {
            const [x, y] = pending.pop()!.split(",").map(Number);
            for (const neighbor of [`${x + 1},${y}`, `${x - 1},${y}`, `${x},${y + 1}`, `${x},${y - 1}`]) {
              if (cells.delete(neighbor)) pending.push(neighbor);
            }
          }
        }
        if (!["as_japan", "oc_indonesia", "oc_new_guinea"].includes(t.id)) expect(components).toBe(1);
        for (const id of t.neighbors) {
          const pair = [t.id, id].sort().join("|");
          expect(touching.has(pair) || routed.has(pair)).toBe(true);
        }
      }
      for (const pair of touching) {
        const [a, b] = pair.split("|");
        expect(earth.territories.find(t => t.id === a)?.neighbors).toContain(b);
      }
      for (const pair of routed) {
        const [a, b] = pair.split("|");
        expect(earth.territories.find(t => t.id === a)?.neighbors).toContain(b);
      }
    });
  }
});
