/**
 * cards.ts — Risk-style territory card system.
 *
 * Public API consumed by rules.ts:
 *   buildDeck(map)         → Card[]          (stable, deterministic)
 *   initCardState(...)     → ServerCardState
 *   drawCard(state, pid)   → {state, card?}
 *   captureCards(state, from, to) → {state, count}
 *   tradeCards(state, pid, cardIds, rng?) → ActionResult
 *   buildPublicCardState(state) → PublicCardState
 *   getTradeValue(n)        → number          (n = # sets traded so far)
 *   isValidSet(cards)       → boolean
 *   suggestSets(hand, ownedTerritoryIds) → Card[][]  (best first)
 *
 * Hidden-information contract:
 *   - `ServerCardState` (deck, discard, hands) lives in GameState.cards.
 *   - It is listed in SERVER_ONLY_KEYS and stripped by projectStateFor.
 *   - projectStateFor injects a `myHand` field for the viewer's own hand.
 *   - `publicCards` in GameState is the broadcast summary (counts only).
 */

import type { Card, CardSymbol, GameState, PublicCardState, ServerCardState } from "@conquest/protocol";
import type { ActionResult } from "./rules.js";
import type { MapDefinition } from "./types.js";
import type { GameEvent } from "@conquest/protocol";

// ─── Deck construction ────────────────────────────────────────────────────────

const SYMBOL_ORDER: CardSymbol[] = ["infantry", "cavalry", "artillery"];

/**
 * Build a deterministic deck for a map: one card per territory (symbol = index
 * mod 3 over map.territories order) plus 2 wilds. Card ids are stable for the
 * same map definition.
 */
export function buildDeck(map: MapDefinition): Card[] {
  const cards: Card[] = [];
  map.territories.forEach((t, i) => {
    cards.push({
      id: `card-${t.id}`,
      symbol: SYMBOL_ORDER[i % 3],
      territoryId: t.id,
    });
  });
  // Two wilds, ids are stable
  cards.push({ id: "card-wild-1", symbol: "wild" });
  cards.push({ id: "card-wild-2", symbol: "wild" });
  return cards;
}

// ─── Trade value escalation ───────────────────────────────────────────────────

/**
 * Returns the armies awarded for the n-th set trade (0-indexed: first trade = n=0).
 * Schedule: 4, 6, 8, 10, 12, 15, then +5 each time thereafter.
 */
export function getTradeValue(setsTradedSoFar: number): number {
  const schedule = [4, 6, 8, 10, 12, 15];
  if (setsTradedSoFar < schedule.length) {
    return schedule[setsTradedSoFar];
  }
  // After the 6th trade: 15 + (n - 5) * 5 where n is 1-indexed trade number
  // setsTradedSoFar=5 → trade 6 → 15; setsTradedSoFar=6 → trade 7 → 20; etc.
  return 15 + (setsTradedSoFar - 5) * 5;
}

// ─── Set validation ───────────────────────────────────────────────────────────

/**
 * Returns true if the three cards form a valid Risk set:
 *   - Three of the same symbol (non-wild)
 *   - One of each non-wild symbol (infantry + cavalry + artillery)
 *   - Any two matching + one wild (or equivalently: any combination where wilds
 *     fill in to make one of the above)
 *
 * Validation treats wilds as substitutes for any symbol.
 */
export function isValidSet(cards: Card[]): boolean {
  if (cards.length !== 3) return false;

  const wilds = cards.filter((c) => c.symbol === "wild").length;
  const nonWilds = cards.filter((c) => c.symbol !== "wild").map((c) => c.symbol as Exclude<CardSymbol, "wild">);

  if (wilds === 3) return true; // 3 wilds (not possible with 2 wild deck but valid logically)
  if (wilds === 2) return true; // 2 wilds + any non-wild → always valid
  if (wilds === 1) {
    // 1 wild + 2 non-wilds: valid if both non-wilds are the same (three-of-a-kind via wild)
    // OR if they're different (wild completes a one-of-each set)
    return true; // Any 2 non-wilds + 1 wild always works
  }
  // 0 wilds: three-of-a-kind OR one-of-each
  const set = new Set(nonWilds);
  return set.size === 1 || set.size === 3;
}

// ─── Territory bonus ──────────────────────────────────────────────────────────

/**
 * Find the first card (by submitted order) that matches a territory the player
 * owns. Returns the card and the territory id, or null if none qualifies.
 * Wilds have no territory so they never qualify.
 */
export function findTerritoryBonus(
  cards: Card[],
  ownedTerritoryIds: Set<string>
): { card: Card; territoryId: string } | null {
  for (const card of cards) {
    if (card.territoryId && ownedTerritoryIds.has(card.territoryId)) {
      return { card, territoryId: card.territoryId };
    }
  }
  return null;
}

// ─── Set suggestions ──────────────────────────────────────────────────────────

/**
 * Return all valid 3-card combinations from `hand`, sorted best-first:
 *   1. Sets that include a territory the player currently owns (territory bonus).
 *   2. Sets with highest armies (based on current setsTradedCount — caller passes it).
 *   3. Deterministic tie-break by card ids.
 *
 * The caller supplies `ownedTerritoryIds` for the bonus ordering.
 * The armies value is the same for all sets at a given moment, so ordering
 * by bonus eligibility is the only meaningful distinction.
 */
export function suggestSets(hand: Card[], ownedTerritoryIds: Set<string>): Card[][] {
  const results: Card[][] = [];
  for (let i = 0; i < hand.length - 2; i++) {
    for (let j = i + 1; j < hand.length - 1; j++) {
      for (let k = j + 1; k < hand.length; k++) {
        const combo = [hand[i], hand[j], hand[k]];
        if (isValidSet(combo)) {
          results.push(combo);
        }
      }
    }
  }
  // Sort: sets with territory bonus first, then by card ids for determinism
  results.sort((a, b) => {
    const aBonus = findTerritoryBonus(a, ownedTerritoryIds) ? 1 : 0;
    const bBonus = findTerritoryBonus(b, ownedTerritoryIds) ? 1 : 0;
    if (bBonus !== aBonus) return bBonus - aBonus;
    // Deterministic tie-break
    return a.map((c) => c.id).join(",").localeCompare(b.map((c) => c.id).join(","));
  });
  return results;
}

// ─── State helpers ────────────────────────────────────────────────────────────

export function initCardState(
  map: MapDefinition,
  playerIds: string[],
  shuffleFn: <T>(arr: T[]) => T[]
): ServerCardState {
  const deck = shuffleFn(buildDeck(map));
  const hands: Record<string, Card[]> = {};
  for (const id of playerIds) {
    hands[id] = [];
  }
  return { deck, discard: [], hands };
}

/**
 * Draw the top card from the deck for a player. If the deck is empty, reshuffles
 * the discard pile. If both are empty, returns { card: undefined }.
 * The shuffle uses the provided rng.
 */
export function drawCard(
  cardState: ServerCardState,
  playerId: string,
  shuffleFn: <T>(arr: T[]) => T[]
): { cardState: ServerCardState; card?: Card } {
  let { deck, discard, hands } = cardState;

  // Reshuffle if deck is empty
  if (deck.length === 0) {
    if (discard.length === 0) {
      return { cardState, card: undefined };
    }
    deck = shuffleFn([...discard]);
    discard = [];
  }

  const card = deck[0];
  deck = deck.slice(1);
  hands = { ...hands, [playerId]: [...(hands[playerId] ?? []), card] };

  return {
    cardState: { deck, discard, hands },
    card,
  };
}

/**
 * Move all cards from `fromPlayerId`'s hand to `toPlayerId`'s hand.
 * Returns the new card state and the count of transferred cards.
 */
export function captureCards(
  cardState: ServerCardState,
  fromPlayerId: string,
  toPlayerId: string
): { cardState: ServerCardState; count: number } {
  const fromHand = cardState.hands[fromPlayerId] ?? [];
  const toHand = cardState.hands[toPlayerId] ?? [];
  return {
    cardState: {
      ...cardState,
      hands: {
        ...cardState.hands,
        [fromPlayerId]: [],
        [toPlayerId]: [...toHand, ...fromHand],
      },
    },
    count: fromHand.length,
  };
}

// ─── Public card state ────────────────────────────────────────────────────────

export function buildPublicCardState(state: GameState): PublicCardState {
  const pub = state.publicCards;
  if (!pub) {
    // Fall back to empty state (mode off)
    return {
      mode: "off",
      deckCount: 0,
      discardCount: 0,
      playerHandCounts: {},
      setsTradedCount: 0,
      nextTradeValue: 4,
      pendingForcedTrade: null,
    };
  }
  return pub;
}

// ─── Core trade action ────────────────────────────────────────────────────────

/**
 * Validate and apply a card trade.
 *
 * Valid contexts:
 *   - Deployment phase: voluntary (when hand ≤ 4 incoming), or forced (5+ cards).
 *   - Attack phase: ONLY when pendingForcedTrade is set (elimination capture).
 *
 * After a trade:
 *   - Cards go to discard.
 *   - pendingReinforcements (or pendingForcedTrade.pendingTradeReinforcements) increases.
 *   - Territory bonus +2 is placed directly on the territory.
 *   - If forced trade resolves (hand ≤ 4), pendingForcedTrade clears.
 *
 * Returns ActionResult with updated GameState and events.
 */
export function tradeCards(
  state: GameState,
  playerId: string,
  cardIds: [string, string, string],
  shuffleFn: <T>(arr: T[]) => T[]
): ActionResult<void> {
  // ── Phase check ──────────────────────────────────────────────────────────
  const activePlayer = state.players[state.activePlayerIndex];
  if (!activePlayer || activePlayer.id !== playerId) {
    return { ok: false, error: "Not your turn" };
  }
  if (!activePlayer.isAlive) {
    return { ok: false, error: "Eliminated players cannot trade cards" };
  }

  const pub = state.publicCards;
  if (!pub || pub.mode === "off") {
    return { ok: false, error: "Cards are disabled in this room" };
  }

  const isForcedTrade = pub.pendingForcedTrade?.playerId === playerId;
  const isDeployment = state.phase === "deployment";
  const isAttack = state.phase === "attack";

  if (!isDeployment && !isAttack) {
    return { ok: false, error: `Cannot trade cards during ${state.phase} phase` };
  }
  if (isAttack && !isForcedTrade) {
    return { ok: false, error: "Can only trade cards during the attack phase when a forced trade is pending" };
  }

  // ── Card ownership ───────────────────────────────────────────────────────
  const cardState = state.cards;
  if (!cardState) {
    return { ok: false, error: "Card state not initialized" };
  }
  const hand = cardState.hands[playerId] ?? [];
  const selectedCards = cardIds.map((id) => hand.find((c: Card) => c.id === id));
  if (selectedCards.some((c: Card | undefined) => !c)) {
    return { ok: false, error: "One or more card IDs not in your hand" };
  }
  const cards = selectedCards as Card[];

  // ── Set validity ─────────────────────────────────────────────────────────
  if (!isValidSet(cards)) {
    return { ok: false, error: "Not a valid set (need 3 of a kind, one of each, or any 2 + a wild)" };
  }

  // ── Calculate trade value ────────────────────────────────────────────────
  const setsTradedSoFar = pub.setsTradedCount;
  const armies = getTradeValue(setsTradedSoFar);
  const newSetsTradedCount = setsTradedSoFar + 1;
  const nextTradeValue = getTradeValue(newSetsTradedCount);

  // ── Territory bonus ───────────────────────────────────────────────────────
  const ownedTerritoryIds = new Set(
    (Object.values(state.territories) as import("@conquest/protocol").TerritoryState[])
      .filter((t) => t.ownerId === playerId)
      .map((t) => t.id)
  );
  const bonusMatch = findTerritoryBonus(cards, ownedTerritoryIds);
  const TERRITORY_BONUS = 2;

  // ── Apply trade to card state ────────────────────────────────────────────
  const newHand = hand.filter((c: Card) => !cardIds.includes(c.id));
  let newDiscard = [...cardState.discard, ...cards];
  let newDeck = cardState.deck;
  // Reshuffle discard into deck if deck is empty (happens at draw time normally,
  // but we keep state consistent here too)
  const newCardState: ServerCardState = {
    deck: newDeck,
    discard: newDiscard,
    hands: { ...cardState.hands, [playerId]: newHand },
  };

  // ── Build events ─────────────────────────────────────────────────────────
  const now = Date.now();
  const setNumber = newSetsTradedCount;

  const tradeEvent: GameEvent = {
    type: "cards_traded",
    playerId,
    cards,
    armies,
    territoryBonus: bonusMatch ? { territoryId: bonusMatch.territoryId, armies: TERRITORY_BONUS } : undefined,
    setNumber,
    timestamp: now,
  };

  // ── Apply to GameState ────────────────────────────────────────────────────
  let nextTerritories = { ...state.territories };
  if (bonusMatch) {
    const bonusTerr = state.territories[bonusMatch.territoryId];
    if (bonusTerr) {
      nextTerritories = {
        ...nextTerritories,
        [bonusMatch.territoryId]: { ...bonusTerr, units: bonusTerr.units + TERRITORY_BONUS },
      };
    }
  }

  // Calculate new hand count after trade
  const newHandCount = newHand.length;

  // Armies ALWAYS go directly to pendingReinforcements (simplified model).
  // Any hand of 5+ cards has a valid set (pigeonhole over 3 symbols + wilds),
  // so there is no "no valid set while forced" case — all escape valves removed.
  const nextPendingReinforcements = state.pendingReinforcements + armies;
  let nextPublicCards: PublicCardState;

  if (isAttack) {
    // Attack-phase forced trade: keep pendingForcedTrade set so that:
    //   • attackTerritory stays blocked (hand > 4 OR pendingReinforcements > 0)
    //   • deployUnits is allowed (pendingForcedTrade && pendingReinforcements > 0)
    // deployUnits clears pendingForcedTrade when remaining hits 0.
    nextPublicCards = {
      ...pub,
      setsTradedCount: newSetsTradedCount,
      nextTradeValue,
      playerHandCounts: { ...pub.playerHandCounts, [playerId]: newHandCount },
      pendingForcedTrade: { playerId, phase: "attack" as const },
    };
  } else {
    // Deployment-phase trade: clear pendingForcedTrade once hand ≤ 4.
    const stillForced = newHandCount >= 5;
    nextPublicCards = {
      ...pub,
      setsTradedCount: newSetsTradedCount,
      nextTradeValue,
      playerHandCounts: { ...pub.playerHandCounts, [playerId]: newHandCount },
      pendingForcedTrade: stillForced
        ? { playerId, phase: "deployment" as const }
        : null,
    };
  }

  const nextState: GameState = {
    ...state,
    territories: nextTerritories,
    pendingReinforcements: nextPendingReinforcements,
    cards: newCardState,
    publicCards: nextPublicCards,
    history: [...state.history, tradeEvent],
  };

  return { ok: true, state: nextState, events: [tradeEvent] };
}
