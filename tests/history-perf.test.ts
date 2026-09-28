/**
 * history-perf.test.ts — Lightweight per-action-cost regression test.
 *
 * Runs a 6k-action seeded game through game-core (cards off) maintaining
 * history like the room does (push in place). Compares the median µs/action
 * for the first 500 vs the last 500 actions and asserts that the ratio is
 * less than 3x — verifying that the refactor achieved flat per-action cost.
 *
 * Design: uses median (not mean) and a warm-up pass to avoid flakiness from
 * JIT warmup or GC spikes.
 */

import { describe, expect, it, setDefaultTimeout } from "bun:test";
setDefaultTimeout(120_000);

import {
  createInitialGameState,
  deployUnits,
  attackTerritory,
  completeConquestMove,
  skipPhase,
} from "../packages/game-core/src/index.js";
import { getDefaultMap } from "../packages/map-engine/src/index.js";
import { makeSfc32, makeShuffleFn } from "../packages/shared/src/index.js";
import type { GameState, Player } from "../packages/protocol/src/index.js";

const SEED = new Uint8Array(16);
new DataView(SEED.buffer).setUint32(0, 0xdeadbeef, true);
new DataView(SEED.buffer).setUint32(4, 0xcafebabe, true);
new DataView(SEED.buffer).setUint32(8, 0x12345678, true);
new DataView(SEED.buffer).setUint32(12, 0xabcdef01, true);

const MAX_ACTIONS = 6_000;
const PLAYER_COUNT = 6;
const RATIO_LIMIT = 3.0;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function freshRng() {
  return makeSfc32(new Uint8Array(SEED));
}

function botStep(state: GameState, rng: () => number): { nextState: GameState; events: any[] } | null {
  const activePlayer = state.players[state.activePlayerIndex];
  if (!activePlayer || !activePlayer.isAlive || state.phase === "game_over") return null;
  const playerId = activePlayer.id;

  if (state.phase === "deployment" && state.pendingReinforcements > 0) {
    const myTerrs = Object.values(state.territories).filter((t) => t.ownerId === playerId);
    if (myTerrs.length === 0) return null;
    const tgt = myTerrs[Math.floor(rng() * myTerrs.length)]!;
    const r = deployUnits(state, playerId, tgt.id, state.pendingReinforcements);
    if (r.ok) return { nextState: r.state, events: r.events };
  } else if (state.phase === "attack") {
    if (state.pendingConquestMove) {
      const p = state.pendingConquestMove;
      const r = completeConquestMove(state, playerId, p.minimumUnits);
      if (r.ok) return { nextState: r.state, events: r.events };
    } else {
      const myTerrs = Object.values(state.territories).filter((t) => t.ownerId === playerId && t.units >= 2);
      const attackable = myTerrs.flatMap((src) =>
        src.neighbors
          .filter((n) => state.territories[n]?.ownerId !== playerId)
          .map((n) => ({ src, tgt: state.territories[n]! }))
      ).filter(({ src, tgt }) => src.units > tgt.units);

      if (attackable.length > 0) {
        const pick = attackable[Math.floor(rng() * attackable.length)]!;
        const r = attackTerritory(state, playerId, pick.src.id, pick.tgt.id, 3, rng);
        if (r.ok) return { nextState: r.state, events: r.events };
      } else {
        const r = skipPhase(state, playerId);
        if (r.ok) return { nextState: r.state, events: r.events };
      }
    }
  } else if (state.phase === "fortify") {
    const r = skipPhase(state, playerId);
    if (r.ok) return { nextState: r.state, events: r.events };
  }
  return null;
}

function runAndTime(label: string): number[] {
  const map = getDefaultMap().definition;
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

  const rng = freshRng();
  const shuffleFn = makeShuffleFn(rng);
  let state = createInitialGameState("perf-test", "PRFT", players, map, 3, shuffleFn, 1, "off");

  const durationUs: number[] = [];
  let stuckCount = 0;

  while (state.phase !== "game_over" && durationUs.length < MAX_ACTIONS) {
    const t0 = performance.now();
    const step = botStep(state, rng);

    if (!step) {
      if (++stuckCount > 10) break;
      continue;
    }
    stuckCount = 0;

    state = step.nextState;
    // Maintain history like the room: append in place, O(k) per action.
    state.history.push(...step.events);

    durationUs.push((performance.now() - t0) * 1000);
  }

  return durationUs;
}

describe("history-perf: per-action cost regression", () => {
  it(`last 500 actions median is < ${RATIO_LIMIT}x first 500 actions median over ${MAX_ACTIONS} actions`, () => {
    // Warm-up pass (JIT, GC, etc.) — discard result
    runAndTime("warm-up");

    // Measured pass
    const durations = runAndTime("measured");

    expect(durations.length).toBeGreaterThan(1000);

    const first500 = durations.slice(0, 500);
    const last500 = durations.slice(-500);

    const firstMedian = median(first500);
    const lastMedian = median(last500);

    const ratio = firstMedian > 0 ? lastMedian / firstMedian : 0;

    console.log(
      `[history-perf] first-500 median: ${firstMedian.toFixed(2)} µs, ` +
      `last-500 median: ${lastMedian.toFixed(2)} µs, ` +
      `ratio: ${ratio.toFixed(2)}x (limit: ${RATIO_LIMIT}x)`
    );

    expect(ratio).toBeLessThan(RATIO_LIMIT);
  });
});
