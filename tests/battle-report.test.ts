import { describe, expect, it } from "bun:test";
import { getDefaultMap } from "../packages/map-engine/src/index.js";
import { EARTH_42_BUNDLE } from "../packages/map-engine/src/maps/earth-42.js";
import { deriveBattleReport, findPanelCorner } from "../apps/client/src/ui/battle-report.js";
import type { GameEvent, Player } from "@conquest/protocol";

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const players: Player[] = [
  {
    id: "p1",
    name: "Atlas",
    colorIndex: 0,
    colorHex: "#00d2ff",
    connected: true,
    isAlive: true,
    ready: true,
  },
  {
    id: "p2",
    name: "Bravo",
    colorIndex: 1,
    colorHex: "#ffaa00",
    connected: true,
    isAlive: true,
    ready: true,
  },
];

// Use real earth-42 territory IDs so getTerritoryDisplayName resolves to names
const SRC_ID = "na_alaska_range"; // "Alaska Range"
const TGT_ID = "as_kamchatka";   // "Kamchatka"

function makeAttack(
  overrides: Partial<Extract<GameEvent, { type: "attack_resolved" }>> = {}
): Extract<GameEvent, { type: "attack_resolved" }> {
  return {
    type: "attack_resolved",
    attackerId: "p1",
    defenderId: "p2",
    sourceTerritoryId: SRC_ID,
    targetTerritoryId: TGT_ID,
    attackerRolls: [6, 4, 2],
    defenderRolls: [5, 4],
    attackerLosses: 1,
    defenderLosses: 1,
    conquered: false,
    attackerUnitsBefore: 7,
    defenderUnitsBefore: 3,
    timestamp: 1000,
    ...overrides,
  };
}

const mapBundle = getDefaultMap();

// ─── Protocol schema: old events (no unitsBefore) still parse ─────────────────

describe("attack_resolved schema", () => {
  it("parses old events without attackerUnitsBefore/defenderUnitsBefore", async () => {
    const { GameEventSchema } = await import("../packages/protocol/src/events.js");
    const oldEvent = {
      type: "attack_resolved",
      attackerId: "p1",
      defenderId: "p2",
      sourceTerritoryId: "alaska",
      targetTerritoryId: "kamchatka",
      attackerRolls: [6, 4],
      defenderRolls: [5],
      attackerLosses: 0,
      defenderLosses: 1,
      conquered: false,
      timestamp: 9999,
    };
    const result = GameEventSchema.safeParse(oldEvent);
    expect(result.success).toBe(true);
    if (result.success) {
      const ev = result.data as Extract<typeof result.data, { type: "attack_resolved" }>;
      expect(ev.attackerUnitsBefore).toBeUndefined();
      expect(ev.defenderUnitsBefore).toBeUndefined();
    }
  });

  it("parses new events WITH attackerUnitsBefore/defenderUnitsBefore", async () => {
    const { GameEventSchema } = await import("../packages/protocol/src/events.js");
    const newEvent = {
      type: "attack_resolved",
      attackerId: "p1",
      defenderId: "p2",
      sourceTerritoryId: "alaska",
      targetTerritoryId: "kamchatka",
      attackerRolls: [6],
      defenderRolls: [5],
      attackerLosses: 0,
      defenderLosses: 1,
      conquered: false,
      attackerUnitsBefore: 8,
      defenderUnitsBefore: 4,
      timestamp: 9999,
    };
    const result = GameEventSchema.safeParse(newEvent);
    expect(result.success).toBe(true);
    if (result.success) {
      const ev = result.data as Extract<typeof result.data, { type: "attack_resolved" }>;
      expect(ev.attackerUnitsBefore).toBe(8);
      expect(ev.defenderUnitsBefore).toBe(4);
    }
  });
});

// ─── deriveBattleReport ───────────────────────────────────────────────────────

describe("deriveBattleReport", () => {
  it("returns null for empty history", () => {
    expect(deriveBattleReport([], players, mapBundle)).toBeNull();
  });

  it("returns null when no attack_resolved in history", () => {
    const history: GameEvent[] = [
      { type: "game_started", gameId: "g1", turnNumber: 1, activePlayerId: "p1", timestamp: 1 },
    ];
    expect(deriveBattleReport(history, players, mapBundle)).toBeNull();
  });

  it("returns null after turn_ended following the last attack", () => {
    const history: GameEvent[] = [
      makeAttack({ timestamp: 1000 }),
      { type: "turn_ended", previousPlayerId: "p1", nextPlayerId: "p2", turnNumber: 1, reinforcements: 3, timestamp: 2000 },
    ];
    expect(deriveBattleReport(history, players, mapBundle)).toBeNull();
  });

  it("builds a single-battle report", () => {
    const history: GameEvent[] = [makeAttack()];
    const report = deriveBattleReport(history, players, mapBundle);
    expect(report).not.toBeNull();
    expect(report!.attackerName).toBe("Atlas");
    expect(report!.defenderName).toBe("Bravo");
    expect(report!.attackerColor).toBe("#00d2ff");
    expect(report!.sourceTerritoryName).toBe("Alaska Range");
    expect(report!.targetTerritoryName).toBe("Kamchatka");
    expect(report!.attackerRolls).toEqual([6, 4, 2]);
    expect(report!.defenderRolls).toEqual([5, 4]);
    expect(report!.pairs).toHaveLength(2);
    expect(report!.pairs[0]!.attackerDie).toBe(6);
    expect(report!.pairs[0]!.defenderDie).toBe(5);
    expect(report!.pairs[0]!.attackerWins).toBe(true);
    expect(report!.pairs[1]!.attackerDie).toBe(4);
    expect(report!.pairs[1]!.defenderDie).toBe(4);
    expect(report!.pairs[1]!.attackerWins).toBe(false); // tie → defender wins
    expect(report!.unpairedAttackerDice).toEqual([2]);
    expect(report!.attackerLosses).toBe(1);
    expect(report!.defenderLosses).toBe(1);
    expect(report!.attackerUnitsBefore).toBe(7);
    expect(report!.defenderUnitsBefore).toBe(3);
    expect(report!.attackerUnitsAfter).toBe(6);
    expect(report!.defenderUnitsAfter).toBe(2);
    expect(report!.conquered).toBe(false);
    expect(report!.engagementRound).toBe(1);
    expect(report!.engagementAttackerLosses).toBe(1);
    expect(report!.engagementDefenderLosses).toBe(1);
  });

  it("aggregates 3 consecutive rounds of the same engagement", () => {
    const history: GameEvent[] = [
      makeAttack({ timestamp: 1000, attackerLosses: 1, defenderLosses: 0 }),
      makeAttack({ timestamp: 2000, attackerLosses: 0, defenderLosses: 1 }),
      makeAttack({ timestamp: 3000, attackerLosses: 1, defenderLosses: 0 }),
    ];
    const report = deriveBattleReport(history, players, mapBundle);
    expect(report!.engagementRound).toBe(3);
    expect(report!.engagementAttackerLosses).toBe(2);
    expect(report!.engagementDefenderLosses).toBe(1);
  });

  it("breaks the engagement on a different attack pair", () => {
    const history: GameEvent[] = [
      makeAttack({ sourceTerritoryId: "na_greenland", targetTerritoryId: "eu_great_britain", timestamp: 500 }),
      makeAttack({ timestamp: 1000 }),
      makeAttack({ timestamp: 2000 }),
    ];
    // The greenland→britain event breaks the alaska_range→kamchatka run
    const report = deriveBattleReport(history, players, mapBundle);
    expect(report!.engagementRound).toBe(2);
    expect(report!.sourceTerritoryName).toBe("Alaska Range");
  });

  it("ignores non-attack interleaved events (chat, player_reconnected)", () => {
    const history: GameEvent[] = [
      makeAttack({ timestamp: 1000 }),
      { type: "chat_message", senderId: "p2", senderName: "Bravo", channel: "game", text: "gg", timestamp: 1500 },
      { type: "player_reconnected", playerId: "p2", timestamp: 1600 },
      makeAttack({ timestamp: 2000 }),
    ];
    const report = deriveBattleReport(history, players, mapBundle);
    // Chat and reconnect don't break the engagement
    expect(report!.engagementRound).toBe(2);
  });

  it("builds a conquest report", () => {
    const history: GameEvent[] = [
      makeAttack({ conquered: true, defenderLosses: 3, unitsMoved: 3, timestamp: 5000 }),
    ];
    const report = deriveBattleReport(history, players, mapBundle);
    expect(report!.conquered).toBe(true);
  });
});

// ─── findPanelCorner ──────────────────────────────────────────────────────────

describe("findPanelCorner on Earth-42 variants", () => {
  it("finds bottom-left for standard/wide/large/ultra with the full panel dimensions", async () => {
    const { FULL_W, FULL_H } = await import("../apps/client/src/ui/BattlePanel.js");
    for (const profile of ["standard", "wide", "large", "ultra"]) {
      const variant = EARTH_42_BUNDLE.renderVariants.find((v) => v.profile === profile)!;
      expect(variant, `variant ${profile} exists`).toBeDefined();
      const result = findPanelCorner(variant.grid, FULL_W, FULL_H);
      expect(result?.corner, `${profile} ${FULL_W}×${FULL_H}`).toBe("bottom-left");
    }
  });

  it("finds bottom-left for compact/compact-tall with the condensed panel dimensions", async () => {
    const { COND_W, COND_H } = await import("../apps/client/src/ui/BattlePanel.js");
    for (const profile of ["compact", "compact-tall"]) {
      const variant = EARTH_42_BUNDLE.renderVariants.find((v) => v.profile === profile)!;
      const result = findPanelCorner(variant.grid, COND_W, COND_H);
      expect(result?.corner, `${profile} ${COND_W}×${COND_H}`).toBe("bottom-left");
    }
  });

  it("falls back gracefully when panel is larger than grid", () => {
    const variant = EARTH_42_BUNDLE.renderVariants[0]!;
    const result = findPanelCorner(variant.grid, 9999, 9999);
    expect(result).toBeNull();
  });

  it("returns row/col coordinates within land crop bounds", () => {
    const variant = EARTH_42_BUNDLE.renderVariants.find((v) => v.profile === "wide")!;
    const result = findPanelCorner(variant.grid, 30, 9);
    expect(result).not.toBeNull();
    expect(result!.col).toBeGreaterThanOrEqual(0);
    expect(result!.row).toBeGreaterThanOrEqual(0);
  });
});
