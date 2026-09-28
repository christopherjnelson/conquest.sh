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

import { describe, expect, it, setDefaultTimeout } from "bun:test";
setDefaultTimeout(120_000);
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
import { MAP_IRONREACH, listMaps } from "../packages/map-engine/src/index.js";
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

// ─── Deterministic reference-identity over a full seeded simulation ────────────
//
// Runs ~2k bot actions through game-core (room-style history maintenance)
// and asserts that EVERY action returns result.state.history === the input
// state's history array. This catches any future [...state.history, ...]
// copy regression without relying on timing.

describe("game-core: history reference identity over full seeded simulation", () => {
  const SIM_SEED = new Uint8Array(16);
  new DataView(SIM_SEED.buffer).setUint32(0, 0x1234abcd, true);
  new DataView(SIM_SEED.buffer).setUint32(4, 0x5678ef01, true);
  new DataView(SIM_SEED.buffer).setUint32(8, 0x9abcde23, true);
  new DataView(SIM_SEED.buffer).setUint32(12, 0x456789ab, true);
  const MAX_SIM_ACTIONS = 2_000;

  /** Simple aggressive bot — one action per call, returns null when stuck/done. */
  function botStep(
    state: GameState,
    rng: () => number,
    shuffleFn: <T>(arr: T[]) => T[]
  ): { nextState: GameState; events: ReturnType<typeof deployUnits> extends { ok: true; events: infer E } ? E : never[] } | null {
    if (state.phase === "game_over") return null;
    const ap = state.players[state.activePlayerIndex];
    if (!ap || !ap.isAlive) return null;
    const pid = ap.id;

    // Card trade if forced or voluntary (deployment with 5+ cards)
    if (state.publicCards?.mode === "escalating") {
      const hand = state.cards?.hands[pid] ?? [];
      const ft = state.publicCards.pendingForcedTrade;
      const shouldTrade =
        (ft?.playerId === pid && hand.length > 4) ||
        (state.phase === "deployment" && hand.length >= 5);
      if (shouldTrade) {
        const ownedIds = new Set(
          Object.values(state.territories).filter((t) => t.ownerId === pid).map((t) => t.id)
        );
        const sets = suggestSets(hand, ownedIds);
        if (sets.length > 0) {
          const s = sets[0]!;
          const r = tradeCards(state, pid, [s[0]!.id, s[1]!.id, s[2]!.id], shuffleFn);
          if (r.ok) return { nextState: r.state, events: r.events as any };
        }
      }
    }

    if (state.phase === "deployment" && state.pendingReinforcements > 0) {
      const myT = Object.values(state.territories).filter((t) => t.ownerId === pid);
      if (myT.length === 0) return null;
      const tgt = myT[Math.floor(rng() * myT.length)]!;
      const r = deployUnits(state, pid, tgt.id, state.pendingReinforcements);
      if (r.ok) return { nextState: r.state, events: r.events as any };
    } else if (state.phase === "attack") {
      if (state.pendingConquestMove) {
        const p = state.pendingConquestMove;
        const r = completeConquestMove(state, pid, p.minimumUnits);
        if (r.ok) return { nextState: r.state, events: r.events as any };
        return null;
      }
      const myT = Object.values(state.territories).filter((t) => t.ownerId === pid && t.units >= 2);
      const atk = myT.flatMap((src) =>
        src.neighbors
          .filter((n) => state.territories[n]?.ownerId !== pid)
          .map((n) => ({ src, tgt: state.territories[n]! }))
      ).filter(({ src, tgt }) => src.units > tgt.units);
      if (atk.length > 0) {
        const pick = atk[Math.floor(rng() * atk.length)]!;
        const r = attackTerritory(state, pid, pick.src.id, pick.tgt.id, 3, rng);
        if (r.ok) return { nextState: r.state, events: r.events as any };
      } else {
        const r = skipPhase(state, pid, shuffleFn);
        if (r.ok) return { nextState: r.state, events: r.events as any };
      }
    } else if (state.phase === "fortify") {
      const r = skipPhase(state, pid, shuffleFn);
      if (r.ok) return { nextState: r.state, events: r.events as any };
    }
    return null;
  }

  it("every game-core action returns the same history reference as its input (2k-action run)", () => {
    // Use Earth-42 (or the first map with ≥ 4 players) for a realistic run.
    const maps = listMaps();
    const mapDef = maps.find((m) => (m.definition.recommendedPlayers?.max ?? 0) >= 4) ?? maps[0]!;
    const map = mapDef.definition;
    const PLAYER_COUNT = Math.min(4, map.territories.length);

    const rng = makeSfc32(new Uint8Array(SIM_SEED));
    const shuffleFn = makeShuffleFn(rng);

    const players: Player[] = Array.from({ length: PLAYER_COUNT }, (_, i) => ({
      id: `p${i + 1}`,
      name: `Bot${i + 1}`,
      colorIndex: i,
      colorHex: "#ffffff",
      connected: true,
      isAlive: true,
      ready: true,
      rematchReady: false,
    }));

    let state = createInitialGameState("ref-id-test", "REFI", players, map, 3, shuffleFn);

    let actionCount = 0;
    let stuckCount = 0;

    while (state.phase !== "game_over" && actionCount < MAX_SIM_ACTIONS) {
      const inputHistory = state.history; // capture reference BEFORE action
      const step = botStep(state, rng, shuffleFn);

      if (!step) {
        if (++stuckCount > 10) break;
        continue;
      }
      stuckCount = 0;

      // CRITICAL assertion: result.state.history must be the SAME array object
      // as the one passed in. Any [...state.history, ...events] copy will fail here.
      expect(step.nextState.history).toBe(inputHistory);

      // Room-style: append events in place to the shared array.
      state = step.nextState;
      state.history.push(...step.events);
      actionCount++;
    }

    // Sanity: we must have run a meaningful number of actions.
    expect(actionCount).toBeGreaterThan(100);
  });
});
