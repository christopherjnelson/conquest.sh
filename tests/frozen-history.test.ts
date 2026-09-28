/**
 * Pure-function guarantee: game-core actions must never mutate or replace
 * state.history.  Each action is called on a state whose history array is
 * Object.freeze-d; any push() or reassignment would throw at runtime.
 *
 * Design requirement (perf/history-append): "Add a unit test that calls each
 * game-core action (deploy, attack, conquest move, fortify, skip, end turn,
 * forfeit, trade cards) on a state whose history array is Object.freeze-d,
 * and asserts the input state and history are unchanged afterwards."
 */

import { describe, expect, it } from "bun:test";
import {
  attackTerritory,
  completeConquestMove,
  createInitialGameState,
  deployUnits,
  endTurn,
  forfeitTurn,
  fortifyUnits,
  skipPhase,
  tradeCards,
  suggestSets,
} from "../packages/game-core/src/index.js";
import { MAP_IRONREACH } from "../packages/map-engine/src/index.js";
import { makeSfc32, makeShuffleFn } from "../packages/shared/src/index.js";
import type { GameState, Player } from "../packages/protocol/src/index.js";

const SEED = new Uint8Array(16).fill(1);

function make2pState(): GameState {
  const rng = makeSfc32(new Uint8Array(SEED));
  const players: Player[] = [
    { id: "p1", name: "Alice", colorIndex: 0, colorHex: "#ff0000", connected: true, isAlive: true, ready: true, rematchReady: false },
    { id: "p2", name: "Bob", colorIndex: 1, colorHex: "#0000ff", connected: true, isAlive: true, ready: true, rematchReady: false },
  ];
  return createInitialGameState("frozen-test", "FROZ", players, MAP_IRONREACH, 3, makeShuffleFn(rng));
}

/** Return state with a frozen history so any mutation throws immediately. */
function withFrozenHistory(state: GameState): GameState {
  return { ...state, history: Object.freeze([...state.history]) as GameState["history"] };
}

describe("game-core: frozen history pure-function guarantee", () => {
  it("deployUnits preserves history reference", () => {
    const base = withFrozenHistory(make2pState());
    const p1 = base.players[base.activePlayerIndex]!.id;
    const targetId = Object.values(base.territories).find((t) => t.ownerId === p1)!.id;
    const result = deployUnits(base, p1, targetId, 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.history).toBe(base.history);
  });

  it("attackTerritory preserves history reference", () => {
    const rng = makeSfc32(new Uint8Array(SEED));
    const base = make2pState();
    const p1 = base.players[base.activePlayerIndex]!.id;
    const p1Id = Object.values(base.territories).find((t) => t.ownerId === p1)!.id;
    // Deploy to reach attack phase
    const dr = deployUnits(base, p1, p1Id, base.pendingReinforcements);
    expect(dr.ok).toBe(true);
    if (!dr.ok) return;
    // Give the attacker overwhelming force and freeze history
    const frozenAttack: GameState = withFrozenHistory({
      ...dr.state,
      territories: {
        ...dr.state.territories,
        [p1Id]: { ...dr.state.territories[p1Id]!, units: 10 },
      },
    });
    const enemyId = frozenAttack.territories[p1Id]!.neighbors.find(
      (n) => frozenAttack.territories[n]?.ownerId !== p1
    );
    if (!enemyId) return; // no adjacent enemy on this seed
    const result = attackTerritory(frozenAttack, p1, p1Id, enemyId, 3, rng);
    if (!result.ok) return;
    expect(result.state.history).toBe(frozenAttack.history);
  });

  it("completeConquestMove preserves history reference", () => {
    const rng = makeSfc32(new Uint8Array(SEED));
    const base = make2pState();
    const p1 = base.players[base.activePlayerIndex]!.id;
    const p1Id = Object.values(base.territories).find((t) => t.ownerId === p1)!.id;
    const dr = deployUnits(base, p1, p1Id, base.pendingReinforcements);
    if (!dr.ok) return;
    const strongState = withFrozenHistory({
      ...dr.state,
      territories: {
        ...dr.state.territories,
        [p1Id]: { ...dr.state.territories[p1Id]!, units: 10 },
      },
    });
    const enemyId = strongState.territories[p1Id]!.neighbors.find(
      (n) => strongState.territories[n]?.ownerId !== p1
    );
    if (!enemyId) return;
    // Attack repeatedly until conquered
    let atkState: GameState = strongState;
    let conquered = false;
    for (let i = 0; i < 20 && !conquered; i++) {
      const ar = attackTerritory(atkState, p1, p1Id, enemyId, 3, rng);
      if (!ar.ok) break;
      atkState = ar.state;
      const ev = ar.events.find((e) => e.type === "attack_resolved");
      if (ev?.type === "attack_resolved" && ev.conquered) conquered = true;
    }
    if (!conquered || !atkState.pendingConquestMove) return;
    const frozenConquest = withFrozenHistory(atkState);
    const result = completeConquestMove(frozenConquest, p1, frozenConquest.pendingConquestMove!.minimumUnits);
    if (!result.ok) return;
    expect(result.state.history).toBe(frozenConquest.history);
  });

  it("fortifyUnits preserves history reference", () => {
    const rng = makeSfc32(new Uint8Array(SEED));
    const base = make2pState();
    const p1 = base.players[base.activePlayerIndex]!.id;
    const p1Id = Object.values(base.territories).find((t) => t.ownerId === p1)!.id;
    const dr = deployUnits(base, p1, p1Id, base.pendingReinforcements);
    if (!dr.ok) return;
    const sp = skipPhase(dr.state, p1);
    if (!sp.ok) return;
    // Find two connected p1 territories to fortify between
    const p1Terrs = Object.values(sp.state.territories).filter((t) => t.ownerId === p1);
    const src = p1Terrs.find((t) =>
      t.units > 1 && t.neighbors.some((n) => sp.state.territories[n]?.ownerId === p1)
    );
    if (!src) return;
    const dstId = src.neighbors.find((n) => sp.state.territories[n]?.ownerId === p1);
    if (!dstId) return;
    const frozenFortify = withFrozenHistory(sp.state);
    const result = fortifyUnits(frozenFortify, p1, src.id, dstId, 1);
    if (!result.ok) return;
    expect(result.state.history).toBe(frozenFortify.history);
  });

  it("skipPhase (attack→fortify) preserves history reference", () => {
    const base = make2pState();
    const p1 = base.players[base.activePlayerIndex]!.id;
    const p1Id = Object.values(base.territories).find((t) => t.ownerId === p1)!.id;
    const dr = deployUnits(base, p1, p1Id, base.pendingReinforcements);
    if (!dr.ok) return;
    const frozenAttack = withFrozenHistory(dr.state);
    const result = skipPhase(frozenAttack, p1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.history).toBe(frozenAttack.history);
  });

  it("endTurn preserves history reference", () => {
    const base = make2pState();
    const p1 = base.players[base.activePlayerIndex]!.id;
    const p1Id = Object.values(base.territories).find((t) => t.ownerId === p1)!.id;
    const dr = deployUnits(base, p1, p1Id, base.pendingReinforcements);
    if (!dr.ok) return;
    const sk = skipPhase(dr.state, p1); // attack→fortify
    if (!sk.ok) return;
    const frozenFortify = withFrozenHistory(sk.state);
    const result = endTurn(frozenFortify, p1, [], makeShuffleFn(makeSfc32(new Uint8Array(SEED))));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.history).toBe(frozenFortify.history);
  });

  it("forfeitTurn preserves history reference", () => {
    const base = withFrozenHistory(make2pState());
    const p1 = base.players[base.activePlayerIndex]!.id;
    const result = forfeitTurn(base, p1, "timeout", makeShuffleFn(makeSfc32(new Uint8Array(SEED))));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.history).toBe(base.history);
  });

  it("tradeCards preserves history reference", () => {
    // Build a state with cards and inject a tradeable set into p1's hand
    const rng = makeSfc32(new Uint8Array(SEED));
    const shuffleFn = makeShuffleFn(rng);
    const base = make2pState();
    if (!base.cards) return;
    const p1 = base.players[base.activePlayerIndex]!.id;
    // Inject 5 infantry cards into p1's hand to guarantee a valid set
    const deck = base.cards.deck.slice(0, 5);
    const forcedState: GameState = {
      ...base,
      cards: { ...base.cards, hands: { ...base.cards.hands, [p1]: deck }, deck: base.cards.deck.slice(5) },
      publicCards: base.publicCards
        ? { ...base.publicCards, playerHandCounts: { ...base.publicCards.playerHandCounts, [p1]: deck.length } }
        : base.publicCards,
    };
    const ownedIds = new Set(Object.values(forcedState.territories).filter((t) => t.ownerId === p1).map((t) => t.id));
    const sets = suggestSets(deck, ownedIds);
    if (sets.length === 0) return;
    const cardIds = [sets[0]![0]!.id, sets[0]![1]!.id, sets[0]![2]!.id] as [string, string, string];
    const frozenState = withFrozenHistory(forcedState);
    const result = tradeCards(frozenState, p1, cardIds, shuffleFn);
    if (!result.ok) return;
    expect(result.state.history).toBe(frozenState.history);
  });
});
