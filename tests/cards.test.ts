/**
 * Unit tests for the Risk-style territory card system.
 *
 * Coverage:
 *   - Set validation (isValidSet)
 *   - Escalation schedule (getTradeValue)
 *   - Territory bonus (findTerritoryBonus)
 *   - Card earning on conquest (drawCard / advanceToNextPlayer)
 *   - Forced trades: deployment phase (5+ cards) and attack phase (elimination capture)
 *   - Elimination card capture (captureCards, applyCardCaptureOnElimination)
 *   - cardMode "off" disables card system
 *   - Projection: own hand visible, others hidden, deltas don't leak
 */

import { describe, expect, it } from "bun:test";
import {
  createInitialGameState,
  deployUnits,
  attackTerritory,
  completeConquestMove,
  skipPhase,
  tradeCards,
  projectStateFor,
  SERVER_ONLY_KEYS,
} from "../packages/game-core/src/index.js";
import {
  buildDeck,
  getTradeValue,
  isValidSet,
  findTerritoryBonus,
  suggestSets,
  initCardState,
  drawCard,
  captureCards,
} from "../packages/game-core/src/cards.js";
import { listMaps } from "../packages/map-engine/src/index.js";
import { makeSfc32, makeShuffleFn } from "../packages/shared/src/index.js";
import type { Card, GameState, Player } from "../packages/protocol/src/index.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const identity = <T>(arr: T[]) => arr;

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Player${i + 1}`,
    colorIndex: i,
    colorHex: "#ffffff",
    connected: true,
    isAlive: true,
    ready: true,
    rematchReady: false,
  }));
}

/** Create a 2-player game on ironreach with escalating cards. */
function make2pState(cardMode: "escalating" | "off" = "escalating"): GameState {
  const maps = listMaps();
  const map = maps.find((m) => m.definition.id === "ironreach")!.definition;
  const rng = makeSfc32(new Uint8Array(16));
  return createInitialGameState(
    "test-game",
    "TEST",
    makePlayers(2),
    map,
    3,
    makeShuffleFn(rng),
    1,        // matchNumber
    cardMode
  );
}

/** Advance both players' turns until the given player is active. */
function skipToPlayer(state: GameState, playerId: string, maxTurns = 10): GameState {
  let s = state;
  for (let i = 0; i < maxTurns; i++) {
    if (s.players[s.activePlayerIndex]?.id === playerId) return s;
    // Fake-deploy and skip through
    const activeId = s.players[s.activePlayerIndex]!.id;
    if (s.phase === "deployment") {
      const terr = Object.values(s.territories).find((t) => t.ownerId === activeId)!;
      const r = deployUnits(s, activeId, terr.id, s.pendingReinforcements);
      if (!r.ok) break;
      s = r.state;
    }
    if (s.phase === "attack") {
      const r = skipPhase(s, activeId);
      if (!r.ok) break;
      s = r.state;
    }
    if (s.phase === "fortify") {
      const r = skipPhase(s, activeId);
      if (!r.ok) break;
      s = r.state;
    }
  }
  return s;
}

// ─── isValidSet ───────────────────────────────────────────────────────────────

describe("cards: isValidSet", () => {
  const i: Card = { id: "c1", symbol: "infantry" };
  const c: Card = { id: "c2", symbol: "cavalry" };
  const a: Card = { id: "c3", symbol: "artillery" };
  const w: Card = { id: "w1", symbol: "wild" };
  const w2: Card = { id: "w2", symbol: "wild" };

  it("accepts three of a kind", () => {
    expect(isValidSet([i, i, i])).toBe(true);
    expect(isValidSet([c, c, c])).toBe(true);
    expect(isValidSet([a, a, a])).toBe(true);
  });

  it("accepts one of each", () => {
    expect(isValidSet([i, c, a])).toBe(true);
    expect(isValidSet([a, i, c])).toBe(true);
  });

  it("rejects two of a kind without wild", () => {
    expect(isValidSet([i, i, c])).toBe(false);
    expect(isValidSet([c, c, a])).toBe(false);
  });

  it("accepts one wild + any two", () => {
    expect(isValidSet([i, i, w])).toBe(true);  // wild makes three-of-a-kind
    expect(isValidSet([i, c, w])).toBe(true);  // wild completes one-of-each
    expect(isValidSet([a, a, w])).toBe(true);
  });

  it("accepts two wilds + any one", () => {
    expect(isValidSet([i, w, w2])).toBe(true);
    expect(isValidSet([c, w, w2])).toBe(true);
  });

  it("requires exactly 3 cards", () => {
    expect(isValidSet([])).toBe(false);
    expect(isValidSet([i, c])).toBe(false);
    expect(isValidSet([i, c, a, w])).toBe(false);
  });
});

// ─── getTradeValue ────────────────────────────────────────────────────────────

describe("cards: getTradeValue escalation schedule", () => {
  it("follows the fixed schedule for trades 0–5", () => {
    expect(getTradeValue(0)).toBe(4);
    expect(getTradeValue(1)).toBe(6);
    expect(getTradeValue(2)).toBe(8);
    expect(getTradeValue(3)).toBe(10);
    expect(getTradeValue(4)).toBe(12);
    expect(getTradeValue(5)).toBe(15);
  });

  it("increases by 5 for each trade after 5", () => {
    expect(getTradeValue(6)).toBe(20);
    expect(getTradeValue(7)).toBe(25);
    expect(getTradeValue(10)).toBe(40);
  });
});

// ─── findTerritoryBonus ───────────────────────────────────────────────────────

describe("cards: findTerritoryBonus", () => {
  it("finds a territory card the player owns", () => {
    const card: Card = { id: "card-t1", symbol: "infantry", territoryId: "t1" };
    const owned = new Set(["t1", "t2"]);
    const result = findTerritoryBonus([card], owned);
    expect(result).not.toBeNull();
    expect(result!.territoryId).toBe("t1");
  });

  it("returns null when no owned territory matches", () => {
    const card: Card = { id: "card-t5", symbol: "cavalry", territoryId: "t5" };
    const owned = new Set(["t1", "t2"]);
    expect(findTerritoryBonus([card], owned)).toBeNull();
  });

  it("returns null for wilds (no territoryId)", () => {
    const wild: Card = { id: "w1", symbol: "wild" };
    const owned = new Set(["t1"]);
    expect(findTerritoryBonus([wild], owned)).toBeNull();
  });

  it("returns the first match by card order", () => {
    const c1: Card = { id: "card-t2", symbol: "cavalry", territoryId: "t2" };
    const c2: Card = { id: "card-t1", symbol: "infantry", territoryId: "t1" };
    const owned = new Set(["t1", "t2"]);
    const result = findTerritoryBonus([c1, c2], owned);
    expect(result!.territoryId).toBe("t2"); // first in array
  });
});

// ─── suggestSets ─────────────────────────────────────────────────────────────

describe("cards: suggestSets", () => {
  it("suggests no sets for a hand of fewer than 3 cards", () => {
    const hand: Card[] = [
      { id: "c1", symbol: "infantry" },
      { id: "c2", symbol: "cavalry" },
    ];
    expect(suggestSets(hand, new Set())).toHaveLength(0);
  });

  it("puts territory-bonus sets first", () => {
    const hand: Card[] = [
      { id: "card-t1", symbol: "infantry", territoryId: "t1" },
      { id: "card-t2", symbol: "cavalry", territoryId: "t2" },
      { id: "card-t3", symbol: "artillery", territoryId: "t3" },
      { id: "card-t4", symbol: "infantry", territoryId: "t4" },
      { id: "card-t5", symbol: "infantry", territoryId: "t5" },
    ];
    // Player owns t1; only sets containing card-t1 get bonus
    const owned = new Set(["t1"]);
    const sets = suggestSets(hand, owned);
    expect(sets.length).toBeGreaterThan(0);
    // First set should include the t1 card
    expect(sets[0]!.some((c) => c.id === "card-t1")).toBe(true);
  });

  it("pigeonhole: hand of 5+ always has valid set", () => {
    // Worst-case: 2 infantry, 2 cavalry, 1 artillery (no wilds)
    const hand: Card[] = [
      { id: "c1", symbol: "infantry" },
      { id: "c2", symbol: "infantry" },
      { id: "c3", symbol: "cavalry" },
      { id: "c4", symbol: "cavalry" },
      { id: "c5", symbol: "artillery" },
    ];
    const sets = suggestSets(hand, new Set());
    expect(sets.length).toBeGreaterThan(0);
  });
});

// ─── buildDeck ────────────────────────────────────────────────────────────────

describe("cards: buildDeck", () => {
  it("creates one card per territory plus 2 wilds", () => {
    const maps = listMaps();
    const map = maps[0]!.definition;
    const deck = buildDeck(map);
    expect(deck.length).toBe(map.territories.length + 2);
    const wilds = deck.filter((c) => c.symbol === "wild");
    expect(wilds).toHaveLength(2);
    // All non-wilds have a territoryId
    const nonWilds = deck.filter((c) => c.symbol !== "wild");
    expect(nonWilds.every((c) => c.territoryId !== undefined)).toBe(true);
  });

  it("produces stable card ids across calls", () => {
    const maps = listMaps();
    const map = maps[0]!.definition;
    const deck1 = buildDeck(map);
    const deck2 = buildDeck(map);
    expect(deck1.map((c) => c.id)).toEqual(deck2.map((c) => c.id));
  });
});

// ─── Card earning on conquest ─────────────────────────────────────────────────

describe("cards: card awarded on conquest", () => {
  it("gives a card at end of turn when player conquered", () => {
    const state = make2pState("escalating");
    const p1 = state.players[state.activePlayerIndex]!.id;

    // Deploy p1's reinforcements on a border territory
    let s = state;
    const p1Territories = Object.values(s.territories).filter((t) => t.ownerId === p1);
    const p1Terr = p1Territories[0]!;
    const r1 = deployUnits(s, p1, p1Terr.id, s.pendingReinforcements);
    if (!r1.ok) throw new Error(r1.error);
    s = r1.state;

    // Find an enemy territory adjacent to p1's strongest territory
    const p1Strong = Object.values(s.territories)
      .filter((t) => t.ownerId === p1)
      .sort((a, b) => b.units - a.units)[0]!;
    const enemyNeighbor = p1Strong.neighbors
      .map((id) => s.territories[id]!)
      .find((t) => t.ownerId !== p1);

    if (!enemyNeighbor) {
      // Map has no adjacent enemy at this point — skip
      return;
    }

    // Force conquest by injecting a strong source territory
    const forcedState: GameState = {
      ...s,
      territories: {
        ...s.territories,
        [p1Strong.id]: { ...p1Strong, units: 10 },
        [enemyNeighbor.id]: { ...enemyNeighbor, units: 1 },
      },
    };

    // Attack until conquered
    let attacked = forcedState;
    let conquered = false;
    for (let i = 0; i < 20 && !conquered; i++) {
      const rng = makeSfc32(new Uint8Array([i + 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
      const ar = attackTerritory(attacked, p1, p1Strong.id, enemyNeighbor.id, 3, rng);
      if (!ar.ok) break;
      attacked = ar.state as GameState;
      const ev = ar.events.find((e) => e.type === "attack_resolved");
      if (ev && ev.type === "attack_resolved" && ev.conquered) {
        conquered = true;
        // Complete conquest move
        const cm = completeConquestMove(attacked, p1, attacked.pendingConquestMove?.minimumUnits ?? 1);
        if (cm.ok) attacked = cm.state as GameState;
      }
    }

    if (!conquered) return; // Couldn't conquer in 20 tries — skip

    expect(attacked.hasConqueredThisTurn).toBe(true);

    // Skip to end of turn
    const skipAtk = skipPhase(attacked, p1);
    if (!skipAtk.ok) return;
    const skipFort = skipPhase(skipAtk.state as GameState, p1);
    if (!skipFort.ok) return;
    const afterTurn = skipFort.state as GameState;

    // Check that a card_awarded event was emitted
    const cardAwardedEvent = afterTurn.history.find((e) => e.type === "card_awarded");
    expect(cardAwardedEvent).toBeDefined();

    // p1's hand count should be 1
    const p1HandCount = afterTurn.publicCards?.playerHandCounts[p1] ?? 0;
    expect(p1HandCount).toBe(1);
  });
});

// ─── Forced trade (deployment phase) ─────────────────────────────────────────

describe("cards: forced trade on deployment (5+ cards)", () => {
  it("blocks deployment when player has 5+ cards, allows after trading", () => {
    const state = make2pState("escalating");
    const p1 = state.players[state.activePlayerIndex]!.id;

    // Inject 5 cards into p1's hand
    const deck = state.cards!.deck;
    const five = deck.slice(0, 5);
    const forcedState: GameState = {
      ...state,
      cards: {
        ...state.cards!,
        deck: deck.slice(5),
        hands: { ...state.cards!.hands, [p1]: five },
      },
      publicCards: {
        ...state.publicCards!,
        playerHandCounts: { ...state.publicCards!.playerHandCounts, [p1]: 5 },
        pendingForcedTrade: { playerId: p1, phase: "deployment" },
      },
    };

    const terr = Object.values(forcedState.territories).find((t) => t.ownerId === p1)!;
    const deployResult = deployUnits(forcedState, p1, terr.id, 1);
    expect(deployResult.ok).toBe(false);
    expect((deployResult as any).error).toContain("trade cards before deploying");

    // Trade reduces hand to 2, should clear forced trade
    const sets = suggestSets(five, new Set());
    expect(sets.length).toBeGreaterThan(0);
    const chosen = sets[0]!;
    const tradeResult = tradeCards(
      forcedState,
      p1,
      [chosen[0]!.id, chosen[1]!.id, chosen[2]!.id],
      identity
    );
    if (!tradeResult.ok) throw new Error(tradeResult.error);
    const afterTrade = tradeResult.state;

    // Hand is now 2 → forced trade cleared
    expect(afterTrade.publicCards?.pendingForcedTrade).toBeNull();

    // Deployment should now work
    const deployAfter = deployUnits(afterTrade, p1, terr.id, 1);
    expect(deployAfter.ok).toBe(true);
  });
});

// ─── Forced trade (attack phase after elimination) ───────────────────────────

describe("cards: forced trade after elimination capture", () => {
  it("sets pendingForcedTrade when eliminator gets 6+ cards", () => {
    const state = make2pState("escalating");
    const p1 = state.players[state.activePlayerIndex]!.id;
    const p2 = state.players.find((p) => p.id !== p1)!.id;

    // Give p2 six cards (will be captured)
    const allCards = buildDeck(listMaps()[0]!.definition);
    const sixCards = allCards.slice(0, 6);
    const withCards: GameState = {
      ...state,
      cards: {
        ...state.cards!,
        hands: { ...state.cards!.hands, [p2]: sixCards },
      },
      publicCards: {
        ...state.publicCards!,
        playerHandCounts: { ...state.publicCards!.playerHandCounts, [p2]: 6 },
      },
    };

    // Simulate captureCards (what happens during elimination)
    const { cardState: newCs, count } = captureCards(withCards.cards!, p2, p1);
    expect(count).toBe(6);
    expect(newCs.hands[p1]!.length).toBe(6);
    expect(newCs.hands[p2]!.length).toBe(0);
  });

  it("blocks attack while forced trade pending, clears after trade+deploy", () => {
    const state = make2pState("escalating");
    const p1 = state.players[state.activePlayerIndex]!.id;

    // Set up: p1 in attack phase with pendingForcedTrade (6 cards)
    const allCards = buildDeck(listMaps()[0]!.definition);
    const sixCards = allCards.slice(0, 6);

    // Deploy first to get into attack phase
    const terr = Object.values(state.territories).find((t) => t.ownerId === p1)!;
    const deployRes = deployUnits(state, p1, terr.id, state.pendingReinforcements);
    if (!deployRes.ok) throw new Error(deployRes.error);
    let s = deployRes.state;
    expect(s.phase).toBe("attack");

    // Inject 6 cards + force pendingForcedTrade
    s = {
      ...s,
      cards: { ...s.cards!, hands: { ...s.cards!.hands, [p1]: sixCards } },
      publicCards: {
        ...s.publicCards!,
        playerHandCounts: { ...s.publicCards!.playerHandCounts, [p1]: 6 },
        pendingForcedTrade: { playerId: p1, phase: "attack" },
      },
    };

    // Attempt attack → should be blocked (hand > 4)
    const p2Terr = Object.values(s.territories).find((t) => t.ownerId !== p1)!;
    const p1Adjacent = p2Terr.neighbors
      .map((id) => s.territories[id]!)
      .find((t) => t.ownerId === p1);
    if (!p1Adjacent) return; // No adjacent pair for this seed — skip

    const atkRes = attackTerritory(s, p1, p1Adjacent.id, p2Terr.id);
    expect(atkRes.ok).toBe(false);
    expect((atkRes as any).error).toContain("trade cards");

    // Trade down to ≤ 4 cards
    const sets = suggestSets(sixCards, new Set());
    expect(sets.length).toBeGreaterThan(0);
    const chosen = sets[0]!;
    const tradeRes = tradeCards(s, p1, [chosen[0]!.id, chosen[1]!.id, chosen[2]!.id], identity);
    if (!tradeRes.ok) throw new Error(tradeRes.error);
    s = tradeRes.state;

    // Hand is now 3, pendingForcedTrade still set, pendingReinforcements > 0
    expect(s.publicCards?.pendingForcedTrade).not.toBeNull();
    expect(s.pendingReinforcements).toBeGreaterThan(0);

    // Attack still blocked (pendingReinforcements > 0)
    const atkRes2 = attackTerritory(s, p1, p1Adjacent.id, p2Terr.id);
    expect(atkRes2.ok).toBe(false);
    expect((atkRes2 as any).error).toContain("Deploy");

    // Deploy all armies → clears pendingForcedTrade
    const deployForcedTerr = Object.values(s.territories).find((t) => t.ownerId === p1)!;
    const deployForced = deployUnits(s, p1, deployForcedTerr.id, s.pendingReinforcements);
    if (!deployForced.ok) throw new Error(deployForced.error);
    s = deployForced.state;

    // pendingForcedTrade cleared, attack now allowed
    expect(s.publicCards?.pendingForcedTrade).toBeNull();
  });
});

// ─── cardMode "off" ───────────────────────────────────────────────────────────

describe("cards: cardMode off", () => {
  it("disables card system entirely", () => {
    const state = make2pState("off");
    // cards (server-side hand/deck) is not initialized
    expect(state.cards).toBeUndefined();
    // publicCards still exists but with mode "off" (no deck counts, no hands)
    expect(state.publicCards?.mode).toBe("off");
    expect(state.publicCards?.deckCount).toBe(0);
  });

  it("rejects tradeCards when mode is off", () => {
    const state = make2pState("off");
    const p1 = state.players[state.activePlayerIndex]!.id;
    const result = tradeCards(state, p1, ["a", "b", "c"], identity);
    expect(result.ok).toBe(false);
  });
});

// ─── Projection: hidden-information contract ──────────────────────────────────

describe("cards: projection hides server card state", () => {
  it("SERVER_ONLY_KEYS includes 'cards'", () => {
    expect(SERVER_ONLY_KEYS).toContain("cards");
  });

  it("projectStateFor strips 'cards' from projected state", () => {
    const state = make2pState("escalating");
    const p1 = state.players[0]!.id;
    const projected = projectStateFor(state, p1);

    // Server-only cards field must be stripped
    expect((projected as any).cards).toBeUndefined();
    // But publicCards (deck/hand counts) should be present
    expect(projected.publicCards).toBeDefined();
  });

  it("projectStateFor injects myHand for the viewer only", () => {
    const state = make2pState("escalating");
    const p1 = state.players[0]!.id;
    const p2 = state.players[1]!.id;

    // Give each player a card
    const deck = state.cards!.deck;
    const stateWithCards: GameState = {
      ...state,
      cards: {
        ...state.cards!,
        deck: deck.slice(2),
        hands: {
          [p1]: [deck[0]!],
          [p2]: [deck[1]!],
        },
      },
    };

    const projP1 = projectStateFor(stateWithCards, p1);
    const projP2 = projectStateFor(stateWithCards, p2);

    // Each player sees their own hand
    expect(projP1.myHand).toHaveLength(1);
    expect(projP1.myHand![0]!.id).toBe(deck[0]!.id);

    expect(projP2.myHand).toHaveLength(1);
    expect(projP2.myHand![0]!.id).toBe(deck[1]!.id);

    // Neither player sees raw `cards`
    expect((projP1 as any).cards).toBeUndefined();
    expect((projP2 as any).cards).toBeUndefined();
  });

  it("spectator/undefined viewer gets no myHand", () => {
    const state = make2pState("escalating");
    const deck = state.cards!.deck;
    const stateWithCards: GameState = {
      ...state,
      cards: {
        ...state.cards!,
        deck: deck.slice(1),
        hands: { ...state.cards!.hands, [state.players[0]!.id]: [deck[0]!] },
      },
    };

    const projected = projectStateFor(stateWithCards, "spectator-not-a-player");
    // Unknown viewer gets empty hand (no cards from any player), never another player's cards
    expect(projected.myHand).toEqual([]);
    expect((projected as any).cards).toBeUndefined();
  });
});

// ─── Card conservation invariant ─────────────────────────────────────────────

describe("cards: deck + discard + hands = total cards", () => {
  it("maintains card conservation after trade", () => {
    const state = make2pState("escalating");
    const p1 = state.players[state.activePlayerIndex]!.id;

    const allCards = buildDeck(listMaps()[0]!.definition);
    const threeCards = allCards.slice(0, 3);
    const stateWithHand: GameState = {
      ...state,
      cards: { ...state.cards!, hands: { ...state.cards!.hands, [p1]: threeCards } },
      publicCards: {
        ...state.publicCards!,
        playerHandCounts: { ...state.publicCards!.playerHandCounts, [p1]: 3 },
      },
    };

    const totalBefore =
      stateWithHand.cards!.deck.length +
      stateWithHand.cards!.discard.length +
      Object.values(stateWithHand.cards!.hands).reduce((s, h) => s + h.length, 0);

    const sets = suggestSets(threeCards, new Set());
    if (sets.length === 0) return; // hand is not a valid set — skip
    const chosen = sets[0]!;
    const result = tradeCards(
      stateWithHand,
      p1,
      [chosen[0]!.id, chosen[1]!.id, chosen[2]!.id],
      identity
    );
    if (!result.ok) throw new Error(result.error);
    const after = result.state;

    const totalAfter =
      after.cards!.deck.length +
      after.cards!.discard.length +
      Object.values(after.cards!.hands).reduce((s, h) => s + h.length, 0);

    expect(totalAfter).toBe(totalBefore);
  });
});
