/**
 * Unit tests for projectStateFor: server-only field stripping and history bounding.
 * Also tests generic diff/apply round-trip.
 */

import { describe, expect, it } from "bun:test";
import { projectStateFor, CLIENT_HISTORY_TAIL, SERVER_ONLY_KEYS, createInitialGameState } from "../packages/game-core/src/index.js";
import { makeSfc32, makeShuffleFn } from "../packages/shared/src/index.js";
import type { GameState, GameEvent } from "../packages/protocol/src/index.js";
import { MAP_IRONREACH } from "../packages/map-engine/src/index.js";
// MAP_IRONREACH is a MapDefinition; no need to unwrap it.

function makeMinimalState(overrides: Partial<GameState> = {}): GameState {
  const rng = makeSfc32(new Uint8Array(16));
  const players = [
    { id: "p1", name: "Alice", colorIndex: 0, colorHex: "#fff", connected: true, isAlive: true, ready: true, rematchReady: false },
    { id: "p2", name: "Bob",   colorIndex: 1, colorHex: "#000", connected: true, isAlive: true, ready: true, rematchReady: false },
  ];
  const base = createInitialGameState("game-1", "TEST", players, MAP_IRONREACH, 3, makeShuffleFn(rng));
  return { ...base, ...overrides };
}

// ---------------------------------------------------------------------------
// Generic diff/apply helpers (mirrors server diffProjectedStates + client applyStateDelta)
// ---------------------------------------------------------------------------

import type { StateDelta } from "../packages/protocol/src/index.js";

function diffStates(prev: GameState, next: GameState): StateDelta {
  const set: Record<string, unknown> = {};
  const unset: string[] = [];

  const prevRec = prev as Record<string, unknown>;
  const nextRec = next as Record<string, unknown>;
  const allKeys = new Set([...Object.keys(prevRec), ...Object.keys(nextRec)]);

  for (const key of allKeys) {
    if (key === "history") continue;
    const prevVal = prevRec[key];
    const nextVal = nextRec[key];
    if (!(key in nextRec) || nextVal === undefined) { unset.push(key); continue; }
    if (!(key in prevRec) || prevVal === undefined) { set[key] = nextVal; continue; }
    if (key === "territories") {
      const changedT: Record<string, unknown> = {};
      const allIds = new Set([...Object.keys(prev.territories), ...Object.keys(next.territories)]);
      for (const id of allIds) {
        if (JSON.stringify(prev.territories[id]) !== JSON.stringify(next.territories[id])) {
          changedT[id] = next.territories[id];
        }
      }
      if (Object.keys(changedT).length > 0) set["territories"] = changedT;
      continue;
    }
    if (JSON.stringify(prevVal) !== JSON.stringify(nextVal)) { set[key] = nextVal; }
  }

  const delta: StateDelta = {};
  if (Object.keys(set).length > 0) delta.set = set;
  if (unset.length > 0) delta.unset = unset;
  return delta;
}

function applyDelta(state: GameState, delta: StateDelta): GameState {
  const next = { ...state } as Record<string, unknown>;
  if (delta.set) {
    for (const [key, value] of Object.entries(delta.set)) {
      if (key === "territories" && typeof value === "object" && value !== null) {
        const merged = { ...(state.territories ?? {}) } as Record<string, unknown>;
        for (const [tid, tval] of Object.entries(value as Record<string, unknown>)) {
          if (tval === undefined || tval === null) { delete merged[tid]; } else { merged[tid] = tval; }
        }
        next["territories"] = merged;
      } else {
        next[key] = value;
      }
    }
  }
  if (delta.unset) {
    for (const key of delta.unset) { delete next[key]; }
  }
  return next as GameState;
}

// ---------------------------------------------------------------------------

describe("projectStateFor", () => {
  it("returns a state structurally equal to the input when history is within bounds", () => {
    const state = makeMinimalState();
    // history should be within 200 events after initial game creation
    expect(state.history.length).toBeLessThanOrEqual(CLIENT_HISTORY_TAIL);

    const projected = projectStateFor(state, "p1");

    // All fields except history should be identical references (not deep copies)
    expect(projected.gameId).toBe(state.gameId);
    expect(projected.territories).toBe(state.territories);
    expect(projected.players).toBe(state.players);
    expect(projected.phase).toBe(state.phase);
    expect(projected.history).toBe(state.history); // same ref when within bound
  });

  it("bounds history to CLIENT_HISTORY_TAIL (200) events", () => {
    // Build a fake history of 250 events
    const fakeEvents: GameEvent[] = Array.from({ length: 250 }, (_, i) => ({
      type: "chat_message" as const,
      senderId: "p1",
      senderName: "Alice",
      channel: "game" as const,
      text: `msg ${i}`,
      timestamp: Date.now() + i,
    }));

    const state = makeMinimalState({ history: fakeEvents });
    const projected = projectStateFor(state, "p1");

    expect(projected.history.length).toBe(CLIENT_HISTORY_TAIL);
    // Should be the LAST 200 events
    const first = projected.history[0];
    expect(first.type).toBe("chat_message");
    if (first.type === "chat_message") {
      expect(first.text).toBe("msg 50");
    }
    const last = projected.history[projected.history.length - 1];
    expect(last.type).toBe("chat_message");
    if (last.type === "chat_message") {
      expect(last.text).toBe("msg 249");
    }
  });

  it("strips SERVER_ONLY_KEYS from the projected state", () => {
    // Inject a fake server-only key into the state via cast
    const state = makeMinimalState();
    const stateWithSecret = { ...state, rngState: { seed: [1, 2, 3] } } as unknown as GameState;

    // Temporarily add to SERVER_ONLY_KEYS for the duration of this test
    SERVER_ONLY_KEYS.push("rngState");
    try {
      const projected = projectStateFor(stateWithSecret, "p1");
      expect((projected as unknown as Record<string, unknown>)["rngState"]).toBeUndefined();
      // Regular fields still present
      expect(projected.gameId).toBe(state.gameId);
      expect(projected.phase).toBe(state.phase);
    } finally {
      SERVER_ONLY_KEYS.splice(SERVER_ONLY_KEYS.indexOf("rngState"), 1);
    }
  });

  it("strips SERVER_ONLY_KEYS for spectator (null viewerId) too", () => {
    const state = makeMinimalState();
    const stateWithSecret = { ...state, _serverInternal: "secret" } as unknown as GameState;

    SERVER_ONLY_KEYS.push("_serverInternal");
    try {
      const projectedPlayer = projectStateFor(stateWithSecret, "p1");
      const projectedSpectator = projectStateFor(stateWithSecret, null);
      expect((projectedPlayer as unknown as Record<string, unknown>)["_serverInternal"]).toBeUndefined();
      expect((projectedSpectator as unknown as Record<string, unknown>)["_serverInternal"]).toBeUndefined();
    } finally {
      SERVER_ONLY_KEYS.splice(SERVER_ONLY_KEYS.indexOf("_serverInternal"), 1);
    }
  });

  it("does not include any server-only fields (documented convention)", () => {
    const state = makeMinimalState();
    const projected = projectStateFor(state, "p1");

    // GameState has no server-only fields at the type level yet.
    // The convention: if a field were marked @serverOnly it would be stripped here.
    // For future reference: RNG seed is in GameRoom (not GameState), so nothing to strip now.
    // Verify the projected state is a valid GameState (has all required fields).
    expect(projected).toHaveProperty("gameId");
    expect(projected).toHaveProperty("phase");
    expect(projected).toHaveProperty("territories");
    expect(projected).toHaveProperty("players");
    expect(projected).toHaveProperty("history");
  });

  it("strips history to tail for null viewer (spectator)", () => {
    const fakeEvents: GameEvent[] = Array.from({ length: 300 }, (_, i) => ({
      type: "chat_message" as const,
      senderId: "p1",
      senderName: "Alice",
      channel: "game" as const,
      text: `msg ${i}`,
      timestamp: Date.now() + i,
    }));

    const state = makeMinimalState({ history: fakeEvents });
    const projectedSpectator = projectStateFor(state, null);
    const projectedPlayer = projectStateFor(state, "p1");

    // Both spectator and player see the same tail (no hidden info yet)
    expect(projectedSpectator.history.length).toBe(CLIENT_HISTORY_TAIL);
    expect(projectedPlayer.history.length).toBe(CLIENT_HISTORY_TAIL);
    expect(projectedSpectator.history[0]).toEqual(projectedPlayer.history[0]);
  });
});

describe("Generic diff/apply round-trip", () => {
  it("apply(prev, diff(prev, next)) deep-equals next for scalar changes", () => {
    const prev = makeMinimalState();
    const next = { ...prev, phase: "attack" as const, turnNumber: 3, activePlayerIndex: 1 };

    const delta = diffStates(prev, next);
    const reconstructed = applyDelta(prev, delta);

    // Deep-equal ignoring history (it's excluded from diff)
    const prevWithoutHistory = { ...prev, history: [] };
    const nextWithoutHistory = { ...next, history: [] };
    const recWithoutHistory = { ...reconstructed, history: [] };
    expect(JSON.stringify(recWithoutHistory)).toBe(JSON.stringify(nextWithoutHistory));
    // Confirm history was unchanged (carried from prev)
    expect(reconstructed.history).toEqual(prev.history);
    // Sanity: delta captured the changed fields
    expect(delta.set?.["phase"]).toBe("attack");
    expect(delta.set?.["turnNumber"]).toBe(3);
    void prevWithoutHistory; // used above
  });

  it("apply(prev, diff(prev, next)) deep-equals next for territory changes", () => {
    const prev = makeMinimalState();
    const territoryId = Object.keys(prev.territories)[0]!;
    const changedTerritory = { ...prev.territories[territoryId]!, units: 99 };
    const next = {
      ...prev,
      territories: { ...prev.territories, [territoryId]: changedTerritory },
    };

    const delta = diffStates(prev, next);
    const reconstructed = applyDelta(prev, delta);

    expect(reconstructed.territories[territoryId]!.units).toBe(99);
    // Other territories unchanged
    for (const id of Object.keys(prev.territories)) {
      if (id === territoryId) continue;
      expect(JSON.stringify(reconstructed.territories[id])).toBe(JSON.stringify(prev.territories[id]));
    }
    // Only the changed territory is in the delta
    const terrDelta = delta.set?.["territories"] as Record<string, unknown> | undefined;
    expect(terrDelta).toBeDefined();
    expect(Object.keys(terrDelta!)).toEqual([territoryId]);
  });

  it("apply(prev, diff(prev, next)) deep-equals next for an arbitrary new top-level key", () => {
    // Simulate a future GameState field that isn't in the current type
    const prev = makeMinimalState() as unknown as Record<string, unknown> & GameState;
    const next = { ...prev, cardHand: ["territory-card-a", "territory-card-b"], tradeCount: 2 };

    const delta = diffStates(prev as GameState, next as unknown as GameState);
    const reconstructed = applyDelta(prev as GameState, delta) as unknown as Record<string, unknown>;

    expect(reconstructed["cardHand"]).toEqual(["territory-card-a", "territory-card-b"]);
    expect(reconstructed["tradeCount"]).toBe(2);
    expect(delta.set?.["cardHand"]).toEqual(["territory-card-a", "territory-card-b"]);
    expect(delta.set?.["tradeCount"]).toBe(2);
  });

  it("apply(prev, diff(prev, next)) handles key removal via unset", () => {
    const prev = { ...makeMinimalState(), extraField: "will-be-removed" } as unknown as GameState;
    const next = { ...makeMinimalState() } as GameState; // extraField absent

    const delta = diffStates(prev, next);
    const reconstructed = applyDelta(prev, delta) as unknown as Record<string, unknown>;

    expect(reconstructed["extraField"]).toBeUndefined();
    expect(delta.unset).toContain("extraField");
  });

  it("empty diff between identical states", () => {
    const state = makeMinimalState();
    const delta = diffStates(state, state);
    expect(delta.set).toBeUndefined();
    expect(delta.unset).toBeUndefined();
  });
});

// ─── Card projection: hidden-information invariants ───────────────────────────

describe("cards: projection does not leak opponent hands", () => {
  it("strips 'cards' from projected state for all players", () => {
    const state = makeMinimalState();
    // Both players should not see the raw cards field
    for (const p of state.players) {
      const projected = projectStateFor(state, p.id);
      expect((projected as any).cards).toBeUndefined();
    }
  });

  it("each player sees only their own hand in myHand", () => {
    const base = makeMinimalState();
    if (!base.cards) return; // cards not enabled for this map

    const p1 = base.players[0]!.id;
    const p2 = base.players[1]!.id;
    const deck = base.cards.deck;
    if (deck.length < 2) return;

    // Give p1 card[0] and p2 card[1]
    const state: GameState = {
      ...base,
      cards: {
        ...base.cards,
        deck: deck.slice(2),
        hands: { [p1]: [deck[0]!], [p2]: [deck[1]!] },
      },
    };

    const projP1 = projectStateFor(state, p1);
    const projP2 = projectStateFor(state, p2);

    // p1 sees their card, not p2's
    expect(projP1.myHand).toHaveLength(1);
    expect(projP1.myHand![0]!.id).toBe(deck[0]!.id);
    expect(projP1.myHand!.some((c) => c.id === deck[1]!.id)).toBe(false);

    // p2 sees their card, not p1's
    expect(projP2.myHand).toHaveLength(1);
    expect(projP2.myHand![0]!.id).toBe(deck[1]!.id);
    expect(projP2.myHand!.some((c) => c.id === deck[0]!.id)).toBe(false);
  });

  it("delta from p1 state to p1 state after card gain does not include raw deck/hands", () => {
    const base = makeMinimalState();
    if (!base.cards) return;

    const p1 = base.players[0]!.id;
    const deck = base.cards.deck;
    if (deck.length < 1) return;

    const before = projectStateFor(base, p1);
    const after = projectStateFor({
      ...base,
      cards: { ...base.cards, deck: deck.slice(1), hands: { ...base.cards.hands, [p1]: [deck[0]!] } },
      publicCards: base.publicCards
        ? { ...base.publicCards, deckCount: deck.length - 1, playerHandCounts: { ...base.publicCards.playerHandCounts, [p1]: 1 } }
        : base.publicCards,
    }, p1);

    const delta = diffStates(before, after);
    // Delta must not contain "cards" key (server-only)
    expect(delta.set?.["cards"]).toBeUndefined();
    // But may contain myHand or publicCards (public info)
    if (delta.set?.["myHand"]) {
      expect(Array.isArray(delta.set["myHand"])).toBe(true);
    }
  });
});
