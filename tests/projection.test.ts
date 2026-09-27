/**
 * Unit tests for projectStateFor: server-only field stripping and history bounding.
 */

import { describe, expect, it } from "bun:test";
import { projectStateFor, CLIENT_HISTORY_TAIL, createInitialGameState } from "../packages/game-core/src/index.js";
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
