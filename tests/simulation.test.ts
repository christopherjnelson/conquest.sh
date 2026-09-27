/**
 * Simulation / invariant test.
 *
 * Plays full seeded games with simple random-but-aggressive bots using only
 * game-core (no server). After every action the invariants listed in the task
 * spec are asserted. Games must reach game_over within a generous action cap.
 */

import { describe, expect, it } from "bun:test";
import {
  createInitialGameState,
  deployUnits,
  attackTerritory,
  completeConquestMove,
  skipPhase,
} from "../packages/game-core/src/index.js";
import { listMaps } from "../packages/map-engine/src/index.js";
import { makeSfc32, makeShuffleFn } from "../packages/shared/src/index.js";
import type { GameState, Player } from "../packages/protocol/src/index.js";

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function seedFromNumber(n: number): Uint8Array {
  const buf = new Uint8Array(16);
  new DataView(buf.buffer).setUint32(0, n >>> 0, true);
  new DataView(buf.buffer).setUint32(4, (n * 2654435761) >>> 0, true);
  new DataView(buf.buffer).setUint32(8, (n * 2246822519) >>> 0, true);
  new DataView(buf.buffer).setUint32(12, (n * 3266489917) >>> 0, true);
  return buf;
}

/** Compute total armies across all territories. */
function totalArmies(state: GameState): number {
  return Object.values(state.territories).reduce((s, t) => s + t.units, 0);
}

// ──────────────────────────────────────────────────────────────────────────────
// Invariant checker
// ──────────────────────────────────────────────────────────────────────────────

function assertInvariants(
  state: GameState,
  initialArmies: number,
  totalDeployments: number,
  totalLosses: number,
  seedHex: string
) {
  const territories = Object.values(state.territories);

  // 1. Every territory has units ≥ 1 and a valid owner
  for (const t of territories) {
    expect(t.units).toBeGreaterThanOrEqual(1);
    expect(state.players.some((p) => p.id === t.ownerId)).toBe(true);
  }

  // 2. Exact army conservation: total = initial + deployments − losses
  //    Conquest moves and fortifies move troops but conserve the total.
  const expected = initialArmies + totalDeployments - totalLosses;
  const actual = totalArmies(state);
  if (actual !== expected) {
    throw new Error(
      `Army conservation violated (seed ${seedHex}): ` +
        `expected ${expected} (${initialArmies} initial + ${totalDeployments} deployed − ${totalLosses} losses), ` +
        `got ${actual}. Phase: ${state.phase}, turn: ${state.turnNumber}.`
    );
  }

  // 3. Eliminated players own nothing
  for (const p of state.players) {
    if (!p.isAlive) {
      const owned = territories.filter((t) => t.ownerId === p.id);
      expect(owned.length).toBe(0);
    }
  }

  // 4. activePlayer is alive
  if (state.phase !== "game_over") {
    const active = state.players[state.activePlayerIndex];
    expect(active).toBeDefined();
    expect(active!.isAlive).toBe(true);
  }

  // 5. pendingConquestMove consistency
  if (state.pendingConquestMove) {
    const { sourceTerritoryId, targetTerritoryId, minimumUnits, maximumUnits } = state.pendingConquestMove;
    expect(state.territories[sourceTerritoryId]).toBeDefined();
    expect(state.territories[targetTerritoryId]).toBeDefined();
    expect(minimumUnits).toBeGreaterThanOrEqual(1);
    expect(maximumUnits).toBeGreaterThanOrEqual(minimumUnits);
  }

  // 6. game_over iff one owner holds everything
  const aliveOwners = new Set(territories.map((t) => t.ownerId));
  if (state.phase === "game_over") {
    expect(aliveOwners.size).toBe(1);
    expect(state.winnerId).not.toBeNull();
  } else {
    const aliveOwnerIds = [...aliveOwners].filter((id) =>
      state.players.some((p) => p.id === id && p.isAlive)
    );
    expect(aliveOwnerIds.length).toBeGreaterThanOrEqual(1);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Simple aggressive bot
// Returns { state, deployments, losses } so caller can track exact totals.
// ──────────────────────────────────────────────────────────────────────────────

function runBotTurn(
  state: GameState,
  rng: () => number
): { state: GameState; deployments: number; losses: number } {
  const activePlayer = state.players[state.activePlayerIndex]!;
  const playerId = activePlayer.id;
  const myTerritories = () =>
    Object.values(state.territories).filter((t) => t.ownerId === playerId);

  let deployments = 0;
  let losses = 0;

  // ── deployment ──────────────────────────────────────────────────────────────
  // Deploy all reinforcements. The last deployUnits call automatically
  // transitions phase to "attack" when pendingReinforcements reaches 0.
  while (state.phase === "deployment") {
    const remaining = state.pendingReinforcements;
    if (remaining === 0) break; // guard: deployUnits transitions automatically

    const borderTerrs = myTerritories().filter((t) =>
      t.neighbors.some((n) => state.territories[n]?.ownerId !== playerId)
    );
    const candidates = borderTerrs.length > 0 ? borderTerrs : myTerritories();
    if (candidates.length === 0) break;
    const target = candidates[Math.floor(rng() * candidates.length)]!;
    const r = deployUnits(state, playerId, target.id, remaining);
    if (!r.ok) break;
    deployments += remaining;
    state = r.state;
    // state.phase is now "attack" (deployUnits auto-transitions on last unit)
  }
  if (state.phase === "game_over") return { state, deployments, losses };

  // ── attack ───────────────────────────────────────────────────────────────────
  while (state.phase === "attack") {
    // Handle pending conquest move first (units conserved, no losses)
    if (state.pendingConquestMove) {
      const p = state.pendingConquestMove;
      const range = p.maximumUnits - p.minimumUnits;
      const units = p.minimumUnits + (range > 0 ? Math.floor(rng() * (range + 1)) : 0);
      const r = completeConquestMove(state, playerId, units);
      if (!r.ok) break;
      state = r.state;
      if (state.phase === "game_over") return { state, deployments, losses };
      continue;
    }

    // Find attackable pairs with ≥2 units adj to any enemy.
    const allAttackables = myTerritories()
      .filter((src) => src.units >= 2)
      .flatMap((src) =>
        src.neighbors
          .filter((nid) => {
            const tgt = state.territories[nid];
            return tgt && tgt.ownerId !== playerId;
          })
          .map((nid) => ({ src, tgt: state.territories[nid]! }))
      );

    if (allAttackables.length === 0) break;

    // Prefer strictly stronger attacks; fall back to equal/any to avoid stalemate.
    const strictlyBetter = allAttackables.filter(({ src, tgt }) => src.units > tgt.units);
    const equalOrBetter = allAttackables.filter(({ src, tgt }) => src.units >= tgt.units);
    const attackables =
      strictlyBetter.length > 0 ? strictlyBetter :
      equalOrBetter.length > 0 ? equalOrBetter :
      allAttackables;

    const choice = attackables[Math.floor(rng() * attackables.length)]!;
    const r = attackTerritory(state, playerId, choice.src.id, choice.tgt.id, undefined, rng);
    if (!r.ok) break;
    state = r.state;
    // Extract losses from the emitted attack_resolved event so the invariant
    // checks game-core applied the dice outcome correctly (not circular).
    const resolvedEvent = r.events.find((e) => e.type === "attack_resolved");
    if (resolvedEvent && resolvedEvent.type === "attack_resolved") {
      losses += resolvedEvent.attackerLosses + resolvedEvent.defenderLosses;
    }
    if (state.phase === "game_over") return { state, deployments, losses };
  }

  // Transition attack → fortify
  if (state.phase === "attack") {
    const r = skipPhase(state, playerId);
    if (r.ok) {
      state = r.state;
      if (state.phase === "game_over") return { state, deployments, losses };
    }
  }

  // Fortify → end turn (skip)
  if (state.phase === "fortify") {
    const r = skipPhase(state, playerId);
    if (r.ok) state = r.state;
  }

  return { state, deployments, losses };
}

// ──────────────────────────────────────────────────────────────────────────────
// Test suite
// ──────────────────────────────────────────────────────────────────────────────

describe("simulation: full-game invariant tests", () => {
  const MAX_ACTIONS = 5000;
  const ALL_PLAYER_COUNTS = [2, 3, 4, 5, 6];
  const SEEDS_PER_CONFIG = 2;

  interface GameStats {
    mapId: string;
    players: number;
    seed: number;
    turns: number;
    actions: number;
  }
  const allStats: GameStats[] = [];

  const maps = listMaps();
  expect(maps.length).toBeGreaterThan(0);

  for (const { definition: map } of maps) {
    const minP = map.recommendedPlayers?.min ?? 2;
    const maxP = Math.min(map.recommendedPlayers?.max ?? 6, 6, map.territories.length);

    for (const playerCount of ALL_PLAYER_COUNTS) {
      if (playerCount < minP || playerCount > maxP) continue;

      for (let seedNum = 1; seedNum <= SEEDS_PER_CONFIG; seedNum++) {
        it(`${map.id} / ${playerCount}p / seed=${seedNum}`, () => {
          const seed = seedFromNumber(seedNum * 100 + playerCount * 10);
          const seedHex = Buffer.from(seed).toString("hex");
          const rng = makeSfc32(seed);

          const players: Player[] = Array.from({ length: playerCount }, (_, i) => ({
            id: `p${i + 1}`,
            name: `Bot${i + 1}`,
            colorIndex: i,
            colorHex: "#ffffff",
            connected: true,
            isAlive: true,
            ready: true,
            rematchReady: false,
          }));

          let state = createInitialGameState(
            `sim-${map.id}-${playerCount}-${seedNum}`,
            "SIM0",
            players,
            map,
            3,
            makeShuffleFn(rng)
          );

          const initialArmies = totalArmies(state);
          let totalDeployments = 0;
          let totalLosses = 0;

          assertInvariants(state, initialArmies, 0, 0, seedHex);

          let actions = 0;
          let turns = 0;

          while (state.phase !== "game_over" && actions < MAX_ACTIONS) {
            const prevTurn = state.turnNumber;
            const result = runBotTurn(state, rng);
            state = result.state;
            totalDeployments += result.deployments;
            totalLosses += result.losses;
            if (state.turnNumber > prevTurn) turns++;
            actions++;

            assertInvariants(state, initialArmies, totalDeployments, totalLosses, seedHex);
          }

          if (state.phase !== "game_over") {
            throw new Error(
              `Game did not finish within ${MAX_ACTIONS} bot turns. ` +
                `Map: ${map.id}, players: ${playerCount}, seed: ${seedNum}. ` +
                `Final phase: ${state.phase}, turn: ${state.turnNumber}. ` +
                `Seed hex: ${seedHex}`
            );
          }

          expect(state.winnerId).not.toBeNull();
          allStats.push({ mapId: map.id, players: playerCount, seed: seedNum, turns, actions });
        });
      }
    }
  }

  it("simulation summary (always passes)", () => {
    if (allStats.length === 0) {
      console.log("\nSimulation: no games recorded.");
      expect(true).toBe(true);
      return;
    }

    const mapIds = [...new Set(allStats.map((g) => g.mapId))];
    const lines: string[] = [
      `\nSimulation: ${allStats.length} games across ${mapIds.length} maps.`,
    ];

    for (const mapId of mapIds) {
      const mapGames = allStats.filter((g) => g.mapId === mapId);
      const avgTurns = (mapGames.reduce((s, g) => s + g.turns, 0) / mapGames.length).toFixed(1);
      const avgActions = (mapGames.reduce((s, g) => s + g.actions, 0) / mapGames.length).toFixed(1);
      lines.push(
        `  ${mapId}: ${mapGames.length} games, avg turns=${avgTurns}, avg actions/game=${avgActions}`
      );
    }

    const overallAvgTurns = (allStats.reduce((s, g) => s + g.turns, 0) / allStats.length).toFixed(1);
    const overallAvgActions = (allStats.reduce((s, g) => s + g.actions, 0) / allStats.length).toFixed(1);
    lines.push(`  Overall avg turns=${overallAvgTurns}, avg actions/game=${overallAvgActions}`);

    console.log(lines.join("\n"));
    expect(true).toBe(true);
  });
});
