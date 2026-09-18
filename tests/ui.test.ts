import { describe, expect, it } from "bun:test";
import { formatEvent } from "../apps/client/src/ui/EventLog.js";
import { MAP_IRONREACH } from "../packages/map-engine/src/index.js";
import type { GameEvent, Player } from "../packages/protocol/src/index.js";

describe("ui: EventLog historical military chronicles", () => {
  const testPlayers: Player[] = [
    {
      id: "p1",
      name: "Alice",
      colorIndex: 0,
      colorHex: "#00d2ff",
      connected: true,
      isAlive: true,
      ready: true,
    },
    {
      id: "p2",
      name: "Bob",
      colorIndex: 1,
      colorHex: "#ff4444",
      connected: true,
      isAlive: true,
      ready: true,
    },
  ];

  it("formats territory capture as a triumphal military chronicle", () => {
    const event: GameEvent = {
      type: "attack_resolved",
      attackerId: "p1",
      defenderId: "p2",
      sourceTerritoryId: "frostfell",
      targetTerritoryId: "highwatch",
      attackerRolls: [6, 5],
      defenderRolls: [3],
      attackerLosses: 0,
      defenderLosses: 1,
      conquered: true,
      unitsMoved: 2,
      timestamp: Date.now(),
    };

    const formatted = formatEvent(event, testPlayers);
    expect(formatted.text).toBe("⚔ Alice captured Highwatch from Bob!");
    expect(formatted.color).toBe("#ff3399");
  });

  it("formats combat defense as a tactical battle chronicle", () => {
    const event: GameEvent = {
      type: "attack_resolved",
      attackerId: "p1",
      defenderId: "p2",
      sourceTerritoryId: "frostfell",
      targetTerritoryId: "highwatch",
      attackerRolls: [4, 2],
      defenderRolls: [5],
      attackerLosses: 1,
      defenderLosses: 0,
      conquered: false,
      timestamp: Date.now(),
    };

    const formatted = formatEvent(event, testPlayers);
    expect(formatted.text).toBe("🎲 Battle at Highwatch: Alice vs Bob (-1 att, -0 def)");
    expect(formatted.color).toBe("#f97316");
  });

  it("formats troop deployment as reinforcements chronicle", () => {
    const event: GameEvent = {
      type: "units_deployed",
      playerId: "p1",
      territoryId: "frostfell",
      count: 3,
      remainingReinforcements: 0,
      timestamp: Date.now(),
    };

    const formatted = formatEvent(event, testPlayers);
    expect(formatted.text).toBe("🛡 Alice reinforced Frostfell (+3 armies)");
    expect(formatted.color).toBe("#00ff66");
  });

  it("formats fortification as strategic troop movement chronicle", () => {
    const event: GameEvent = {
      type: "units_fortified",
      playerId: "p1",
      sourceTerritoryId: "frostfell",
      targetTerritoryId: "iron_hollow",
      units: 2,
      timestamp: Date.now(),
    };

    const formatted = formatEvent(event, testPlayers);
    expect(formatted.text).toBe("🛡 Alice fortified 2 armies to Iron Hollow");
    expect(formatted.color).toBe("#9966ff");
  });

  it("formats player elimination as a solemn death chronicle", () => {
    const event: GameEvent = {
      type: "player_eliminated",
      playerId: "p2",
      eliminatedBy: "p1",
      timestamp: Date.now(),
    };

    const formatted = formatEvent(event, testPlayers);
    expect(formatted.text).toBe("💀 Bob has fallen in battle!");
    expect(formatted.color).toBe("#ff4444");
  });

  it("formats victory as realm conquest chronicle", () => {
    const event: GameEvent = {
      type: "game_won",
      winnerId: "p1",
      winnerName: "Alice",
      timestamp: Date.now(),
    };

    const formatted = formatEvent(event, testPlayers);
    expect(formatted.text).toBe("👑 Alice has conquered the entire realm!");
    expect(formatted.color).toBe("#ffaa00");
  });
});

describe("ui: Ironreach realm map schema & layout", () => {
  it("contains all 10 canonical Ironreach territories across 3 sectors", () => {
    expect(MAP_IRONREACH.sectors.length).toBe(3);
    expect(MAP_IRONREACH.territories.length).toBe(10);

    const territoryIds = MAP_IRONREACH.territories.map((t) => t.id);
    const expected = [
      "frostfell",
      "highwatch",
      "iron_hollow",
      "stoneveil",
      "red_basin",
      "mossgate",
      "sunken_pass",
      "ember_coast",
      "ashmoor",
      "hollowmere",
    ];
    for (const id of expected) {
      expect(territoryIds).toContain(id);
    }
  });

  it("ensures no territorial realm boxes overlap on the canvas", () => {
    for (let i = 0; i < MAP_IRONREACH.territories.length; i++) {
      const a = MAP_IRONREACH.territories[i];
      const aWidth = a.render?.width ?? 18;
      const aHeight = a.render?.height ?? 5;
      const aX1 = a.position.x;
      const aX2 = a.position.x + aWidth;
      const aY1 = a.position.y;
      const aY2 = a.position.y + aHeight;

      for (let j = i + 1; j < MAP_IRONREACH.territories.length; j++) {
        const b = MAP_IRONREACH.territories[j];
        const bWidth = b.render?.width ?? 18;
        const bHeight = b.render?.height ?? 5;
        const bX1 = b.position.x;
        const bX2 = b.position.x + bWidth;
        const bY1 = b.position.y;
        const bY2 = b.position.y + bHeight;

        const xOverlap = aX1 < bX2 && aX2 > bX1;
        const yOverlap = aY1 < bY2 && aY2 > bY1;
        const overlaps = xOverlap && yOverlap;

        expect(overlaps).toBe(false);
      }
    }
  });
});
