import { describe, expect, test } from "bun:test";
import { decideBotAction, createSeededRng, estimateCaptureProbability } from "@conquest/bot-core";
import { isValidSet } from "@conquest/game-core";
import type { GameState } from "@conquest/protocol";

function state(overrides: Partial<GameState>={}): GameState {
  const territories: GameState["territories"]={
    a: { id: "a", name: "A", sectorId: "s", ownerId: "p1", units: 5, neighbors: ["b", "c"] },
    b: { id: "b", name: "B", sectorId: "s", ownerId: "p2", units: 1, neighbors: ["a", "c"] },
    c: { id: "c", name: "C", sectorId: "s", ownerId: "p1", units: 2, neighbors: ["a", "b", "d"] },
    d: { id: "d", name: "D", sectorId: "t", ownerId: "p2", units: 4, neighbors: ["c"] },
  };
  return { gameId: "g", mapId: "earth-42", roomCode: "ABCD", turnNumber: 1, activePlayerIndex: 0, phase: "attack", players: [{ id: "p1", name: "One", colorIndex: 0, colorHex: "#111", connected: true, isAlive: true, ready: true }, { id: "p2", name: "Two", colorIndex: 1, colorHex: "#222", connected: true, isAlive: true, ready: true }], territories, sectors: { s: { id: "s", name: "Sector", bonusReinforcements: 4, territoryIds: ["a", "b", "c"], colorHex: "#aaa" }, t: { id: "t", name: "Other", bonusReinforcements: 3, territoryIds: ["d"], colorHex: "#bbb" } }, pendingReinforcements: 0, pendingConquestMove: null, hasConqueredThisTurn: false, winnerId: null, result: null, matchNumber: 1, history: [], ...overrides };
}
describe("deterministic bot decisions", () => {
  test("returns no action outside a live active turn", () => {
    expect(decideBotAction(state({ phase: "lobby" }), "p1")).toBeNull();
    expect(decideBotAction(state({ phase: "game_over" }), "p1")).toBeNull();
    expect(decideBotAction(state(), "p2")).toBeNull();
  });
  test("completes mandatory conquest transfer before evaluating attacks", () => {
    const s=state({ pendingConquestMove: { sourceTerritoryId: "a", targetTerritoryId: "b", defenderId: "p2", minimumUnits: 3, maximumUnits: 4 } });
    expect(decideBotAction(s, "p1")?.action).toEqual({ type: "complete_conquest_move", units: 3 });
  });
  test("selects an attack with bounded dice and does not mutate state", () => {
    const s=state(), before=JSON.stringify(s);
    const d=decideBotAction(s, "p1");
    expect(d?.action).toMatchObject({ type: "attack", sourceTerritoryId: "a", targetTerritoryId: "b", dice: 3 });
    expect(JSON.stringify(s)).toBe(before);
  });
  test("deploys all reinforcements to a threatened owned frontier", () => {
    const s=state({ phase: "deployment", pendingReinforcements: 5 });
    expect(decideBotAction(s, "p1")?.action).toEqual({ type: "deploy", territoryId: "c", count: 5 });
  });
  test("finds connected fortification and leaves one unit behind", () => {
    const s=state({ phase: "fortify", territories: { ...state().territories, a: { ...state().territories.a, units: 8 }, c: { ...state().territories.c, units: 1 } } });
    const action=decideBotAction(s, "p1")?.action;
    expect(action?.type).toBe("fortify");
    if (action?.type==="fortify") expect(s.territories[action.sourceTerritoryId]!.units-action.units).toBeGreaterThanOrEqual(1);
  });
  test("skips attack if there is no worthwhile target and handles huge armies", () => {
    const weak=state({ territories: { ...state().territories, a: { ...state().territories.a, units: 2 }, b: { ...state().territories.b, units: 20 } } });
    expect(decideBotAction(weak, "p1")?.action).toEqual({ type: "skip_phase" });
    const huge=state({ territories: { ...state().territories, a: { ...state().territories.a, units: 100000 }, b: { ...state().territories.b, units: 1 } } });
    expect(decideBotAction(huge, "p1")?.action.type).toBe("attack");
  });
  test("seeded simulation RNG repeats for the same seed", () => {
    const a=createSeededRng(42), b=createSeededRng(42);
    expect(Array.from({ length: 8 }, a)).toEqual(Array.from({ length: 8 }, b));
  });
  test("exact combat DP matches the one-die one-die odds", () => {
    expect(estimateCaptureProbability(2, 1)).toBeCloseTo(15/36, 12);
  });
  test("scaled odds stay monotone across the exact-computation boundary", () => {
    const atEdge=estimateCaptureProbability(160, 160);
    expect(estimateCaptureProbability(161, 161)).toBeCloseTo(atEdge, 12);
    expect(estimateCaptureProbability(220, 160)).toBeGreaterThanOrEqual(atEdge);
    expect(estimateCaptureProbability(220, 160)).toBeGreaterThan(estimateCaptureProbability(160, 220));
    expect(estimateCaptureProbability(220, 161)).toBeLessThanOrEqual(estimateCaptureProbability(220, 160));
  });
  test("decisions ignore history and object insertion order", () => {
    const a=state(), b=state({ territories: Object.fromEntries(Object.entries(state().territories).reverse()), history: [{ type: "phase_changed", phase: "attack", activePlayerId: "p1", reinforcements: 0, timestamp: 999 }] as GameState["history"] });
    expect(decideBotAction(a, "p1")).toEqual(decideBotAction(b, "p1"));
  });
  test("keeps a transfer minimum when the source faces a large adjacent threat", () => {
    const s=state({ pendingConquestMove: { sourceTerritoryId: "a", targetTerritoryId: "c", defenderId: "p2", minimumUnits: 2, maximumUnits: 6 }, territories: { ...state().territories, a: { ...state().territories.a, units: 5 }, c: { ...state().territories.c, units: 4 }, b: { ...state().territories.b, units: 4 }, d: { ...state().territories.d, units: 10 } } });
    expect(decideBotAction(s, "p1")?.action).toEqual({ type: "complete_conquest_move", units: 3 });
    expect(estimateCaptureProbability(Number.NaN, 1)).toBe(0);
  });

  const hand = [
    { id: "card-a", symbol: "infantry" as const, territoryId: "a" },
    { id: "card-b", symbol: "cavalry" as const, territoryId: "b" },
    { id: "card-c", symbol: "artillery" as const, territoryId: "c" },
    { id: "card-d", symbol: "infantry" as const, territoryId: "d" },
    { id: "card-wild", symbol: "wild" as const },
  ];
  const cardState = (overrides: Partial<GameState> = {}) => state({
    myHand: hand,
    publicCards: {
      mode: "escalating",
      deckCount: 30,
      discardCount: 0,
      playerHandCounts: { p1: hand.length, p2: 0 },
      setsTradedCount: 0,
      nextTradeValue: 4,
      pendingForcedTrade: { playerId: "p1", phase: "deployment" },
    },
    ...overrides,
  });
  test("trades a deterministic valid set before deployment when a forced trade is pending", () => {
    const snapshot = cardState({ phase: "deployment", pendingReinforcements: 3 });
    const before = JSON.stringify(snapshot);
    const first = decideBotAction(snapshot, "p1")?.action;
    const second = decideBotAction(snapshot, "p1")?.action;
    expect(first).toEqual(second);
    expect(first?.type).toBe("trade_cards");
    if (first?.type === "trade_cards") {
      expect(first.cardIds).toHaveLength(3);
      expect(isValidSet(first.cardIds.map((id) => hand.find((card) => card.id === id)!))).toBe(true);
    }
    expect(JSON.stringify(snapshot)).toBe(before);
  });
  test("trades after elimination during attack, then deploys the trade reinforcements", () => {
    const forcedAttack = cardState({
      phase: "attack",
      myHand: hand,
      publicCards: { ...cardState().publicCards!, pendingForcedTrade: { playerId: "p1", phase: "attack" } },
    });
    expect(decideBotAction(forcedAttack, "p1")?.action.type).toBe("trade_cards");

    const afterTrade = cardState({
      phase: "attack",
      myHand: hand.slice(0, 4),
      pendingReinforcements: 8,
      publicCards: { ...cardState().publicCards!, pendingForcedTrade: { playerId: "p1", phase: "attack" } },
    });
    expect(decideBotAction(afterTrade, "p1")?.action).toMatchObject({ type: "deploy", count: 8 });
  });
  test("never reads another player's hand from authoritative card state", () => {
    const hidden = cardState({
      phase: "deployment",
      pendingReinforcements: 3,
      myHand: [],
      cards: { deck: [], discard: [], hands: { p1: hand, p2: hand } },
      publicCards: { ...cardState().publicCards!, pendingForcedTrade: null, playerHandCounts: { p1: 5, p2: 5 } },
    });
    const action = decideBotAction(hidden, "p1")?.action;
    expect(action?.type).toBe("deploy");
    expect(action?.type).not.toBe("trade_cards");
    expect(decideBotAction(state({ phase: "deployment", pendingReinforcements: 3 }), "p1")?.action).not.toMatchObject({ type: "trade_cards" });
  });
});
