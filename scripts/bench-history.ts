/**
 * bench-history.ts — History-append performance benchmark.
 *
 * Two 6k-action runs on Earth-42 with 6 players (cards off, seeded):
 *
 *   "after"  — new append-only model: room pushes events via push(...events).
 *              History array is the same reference throughout the game.
 *
 *   "before" — simulated old O(n²) model: every action step copies the full
 *              history array ([...state.history, ...events]), reproducing the
 *              allocation pattern that was in origin/main.
 *
 * Reports total time, median µs/action for first 1k vs last 1k, and ratio.
 *
 * Usage:
 *   bun run scripts/bench-history.ts
 */

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

// ─── Setup ─────────────────────────────────────────────────────────────────────

const SEED = new Uint8Array(16);
new DataView(SEED.buffer).setUint32(0, 0xdeadbeef, true);
new DataView(SEED.buffer).setUint32(4, 0xcafebabe, true);
new DataView(SEED.buffer).setUint32(8, 0x12345678, true);
new DataView(SEED.buffer).setUint32(12, 0xabcdef01, true);

const MAX_ACTIONS = 6_000;
const PLAYER_COUNT = 6;

const map = getDefaultMap().definition; // Earth-42

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

// ─── Utilities ─────────────────────────────────────────────────────────────────

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

// ─── Bot step (single game-core call per invocation) ──────────────────────────

/**
 * Execute ONE game-core action and return the events emitted.
 * Returns null if no action could be taken (game stuck or over).
 */
function botStep(state: GameState, rng: () => number): { nextState: GameState; events: any[] } | null {
  const activePlayer = state.players[state.activePlayerIndex];
  if (!activePlayer || !activePlayer.isAlive || state.phase === "game_over") return null;
  const playerId = activePlayer.id;

  if (state.phase === "deployment") {
    if (state.pendingReinforcements > 0) {
      const myTerrs = Object.values(state.territories).filter((t) => t.ownerId === playerId);
      if (myTerrs.length === 0) return null;
      const tgt = myTerrs[Math.floor(rng() * myTerrs.length)]!;
      const r = deployUnits(state, playerId, tgt.id, state.pendingReinforcements);
      if (r.ok) return { nextState: r.state, events: r.events };
    } else {
      // No reinforcements: force transition (shouldn't happen normally, but guard)
      const r = skipPhase({ ...state, phase: "attack" as const }, playerId);
      if (r.ok) return { nextState: r.state, events: r.events };
    }
    return null;
  }

  if (state.phase === "attack") {
    if (state.pendingConquestMove) {
      const p = state.pendingConquestMove;
      const r = completeConquestMove(state, playerId, p.minimumUnits);
      if (r.ok) return { nextState: r.state, events: r.events };
      return null;
    }
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
      const r = skipPhase(state, playerId); // attack → fortify
      if (r.ok) return { nextState: r.state, events: r.events };
    }
    return null;
  }

  if (state.phase === "fortify") {
    const r = skipPhase(state, playerId); // fortify → end turn
    if (r.ok) return { nextState: r.state, events: r.events };
  }

  return null;
}

// ─── "After" benchmark (new append-only model) ─────────────────────────────────

function runAfterBench(): BenchResult {
  const rng = freshRng();
  const shuffleFn = makeShuffleFn(rng);
  let state = createInitialGameState("bench-after", "BNCH", players, map, 3, shuffleFn, 1, "off");

  const durationUs: number[] = [];
  let stuckCount = 0;
  const total0 = performance.now();

  while (state.phase !== "game_over" && durationUs.length < MAX_ACTIONS) {
    const t0 = performance.now();
    const step = botStep(state, rng);
    const t1 = performance.now();

    if (!step) {
      if (++stuckCount > 10) break; // bail if consistently stuck
      continue;
    }
    stuckCount = 0;

    state = step.nextState;
    // NEW: append events in-place — O(k) where k = new events (usually 1-3)
    state.history.push(...step.events);
    durationUs.push((t1 - t0) * 1000);
  }

  return summarise(durationUs, performance.now() - total0, state);
}

// ─── "Before" benchmark (simulated old O(n²) model) ───────────────────────────
//
// The old code did `history: [...state.history, ...events]` inside every
// game-core function (rules.ts:145, 304, 363, 435, 592, 704, 740, …).
// This creates a new array of length (n + k) for every action — O(n) per step.
// Over N steps the total allocation is O(N²/2) grows super-linearly.
//
// We reproduce that pattern here by copying history on every step.

function runBeforeBench(): BenchResult {
  const rng = freshRng();
  const shuffleFn = makeShuffleFn(rng);
  let state = createInitialGameState("bench-before", "BNCH", players, map, 3, shuffleFn, 1, "off");

  const durationUs: number[] = [];
  let stuckCount = 0;
  const total0 = performance.now();

  while (state.phase !== "game_over" && durationUs.length < MAX_ACTIONS) {
    const t0 = performance.now();
    const step = botStep(state, rng);

    if (!step) {
      if (++stuckCount > 10) break;
      continue;
    }
    stuckCount = 0;

    // OLD: O(n) full history copy on every action — the key bottleneck
    const newHistory = [...state.history, ...step.events];
    state = { ...step.nextState, history: newHistory };

    const t1 = performance.now();
    durationUs.push((t1 - t0) * 1000);
  }

  return summarise(durationUs, performance.now() - total0, state);
}

// ─── Summary ───────────────────────────────────────────────────────────────────

interface BenchResult {
  totalMs: number;
  actions: number;
  first1kMedianUs: number;
  last1kMedianUs: number;
  ratio: number;
  finalPhase: string;
  historyLen: number;
}

function summarise(durationUs: number[], totalMs: number, state: GameState): BenchResult {
  const first1k = durationUs.slice(0, 1000);
  const last1k = durationUs.slice(-1000);
  const first1kM = first1k.length > 0 ? median(first1k) : 0;
  const last1kM = last1k.length > 0 ? median(last1k) : 0;
  return {
    totalMs,
    actions: durationUs.length,
    first1kMedianUs: first1kM,
    last1kMedianUs: last1kM,
    ratio: first1kM > 0 ? last1kM / first1kM : 0,
    finalPhase: state.phase,
    historyLen: state.history.length,
  };
}

function printResult(label: string, r: BenchResult) {
  console.log(`\n--- ${label} ---`);
  console.log(`  Total time:         ${r.totalMs.toFixed(1)} ms  (${r.actions} timed actions, phase=${r.finalPhase})`);
  console.log(`  History length:     ${r.historyLen} events`);
  console.log(`  First 1k median:    ${r.first1kMedianUs.toFixed(2)} µs/action`);
  console.log(`  Last  1k median:    ${r.last1kMedianUs.toFixed(2)} µs/action`);
  console.log(`  Last/first ratio:   ${r.ratio.toFixed(2)}x`);
}

// ─── Main ──────────────────────────────────────────────────────────────────────

console.log("=== bench-history: History-append performance benchmark ===");
console.log(`Map: ${map.id}, players: ${PLAYER_COUNT}, max actions: ${MAX_ACTIONS}, cardMode: off`);
console.log("Warm-up run (discarded)...");

// Warm-up
runAfterBench();
runBeforeBench();

// Measured runs
const afterResult = runAfterBench();
const beforeResult = runBeforeBench();

console.log("\n=== Results ===");
printResult("AFTER  (new: push in place, O(k) per action)", afterResult);
printResult("BEFORE (old: [...history, ...events], O(n) per action)", beforeResult);

console.log("\n=== Summary table ===");
console.log(
  `| variant | total ms | first 1k med µs | last 1k med µs | ratio |`
);
console.log(`|---------|----------|-----------------|----------------|-------|`);
console.log(
  `| after   | ${afterResult.totalMs.toFixed(0).padStart(8)} | ${afterResult.first1kMedianUs.toFixed(2).padStart(15)} | ${afterResult.last1kMedianUs.toFixed(2).padStart(14)} | ${afterResult.ratio.toFixed(2).padStart(5)} |`
);
console.log(
  `| before  | ${beforeResult.totalMs.toFixed(0).padStart(8)} | ${beforeResult.first1kMedianUs.toFixed(2).padStart(15)} | ${beforeResult.last1kMedianUs.toFixed(2).padStart(14)} | ${beforeResult.ratio.toFixed(2).padStart(5)} |`
);

console.log();
if (afterResult.ratio < 3) {
  console.log(`OK: after-variant per-action cost is flat (ratio ${afterResult.ratio.toFixed(2)}x < 3x).`);
} else {
  console.log(`WARN: after-variant ratio ${afterResult.ratio.toFixed(2)}x >= 3x — check for regression.`);
}
