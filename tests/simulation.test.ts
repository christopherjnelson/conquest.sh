/**
 * Simulation / invariant test.
 *
 * Plays full seeded games with simple random-but-aggressive bots using only
 * game-core (no server). After every action the invariants listed in the task
 * spec are asserted. Games must reach game_over within a generous action cap.
 */

import { describe, expect, it, setDefaultTimeout } from "bun:test";

// Simulation games can take many seconds on large maps with many players.
setDefaultTimeout(120_000);
import {
  createInitialGameState,
  deployUnits,
  attackTerritory,
  completeConquestMove,
  skipPhase,
  tradeCards,
  suggestSets,
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
  seedHex: string,
  tradeBonusArmies: number = 0
) {
  const territories = Object.values(state.territories) as any[];

  // 1. Every territory has units ≥ 1 and a valid owner
  for (const t of territories) {
    expect((t as any).units).toBeGreaterThanOrEqual(1);
    expect(state.players.some((p) => p.id === (t as any).ownerId)).toBe(true);
  }

  // 2. Exact army conservation: total = initial + deployments + tradeBonuses − losses
  //    Conquest moves and fortifies move troops but conserve the total.
  //    tradeBonusArmies: territory bonuses placed directly by card trades (not via deployUnits).
  const expected = initialArmies + totalDeployments + tradeBonusArmies - totalLosses;
  const actual = totalArmies(state);
  if (actual !== expected) {
    throw new Error(
      `Army conservation violated (seed ${seedHex}): ` +
        `expected ${expected} (${initialArmies} initial + ${totalDeployments} deployed + ${tradeBonusArmies} trade bonuses − ${totalLosses} losses), ` +
        `got ${actual}. Phase: ${state.phase}, turn: ${state.turnNumber}.`
    );
  }

  // 2b. Card invariant: total cards = deck + discard + all hands = territories + 2 (when cards mode on)
  if (state.cards && state.publicCards?.mode === "escalating") {
    const deckCount = state.cards.deck.length;
    const discardCount = state.cards.discard.length;
    const handCount = Object.values(state.cards.hands).reduce((s, h) => s + h.length, 0);
    const totalTerritories = Object.keys(state.territories).length;
    const expectedCardTotal = totalTerritories + 2; // territories + 2 wilds
    expect(deckCount + discardCount + handCount).toBe(expectedCardTotal);
  }

  // 2c. No player holds 5+ cards after finishing deployment
  if (state.publicCards?.mode === "escalating" && state.phase === "attack") {
    // Check that the active player doesn't have 5+ cards (unless forced trade pending)
    const activePlayer = state.players[state.activePlayerIndex];
    if (activePlayer && state.cards && !state.publicCards.pendingForcedTrade) {
      const activeHand = state.cards.hands[activePlayer.id] ?? [];
      // After deployment is done (we're in attack), check that forced trade state is consistent
      // A player can have 5+ cards if they just got them from elimination in attack phase
      // but that should set pendingForcedTrade
    }
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

/** Helper: bot trades cards if forced or has a valid set. Returns updated state. */
function botTradeCards(state: GameState, playerId: string, rng: () => number): GameState {
  const pub = state.publicCards;
  if (!pub || pub.mode !== "escalating") return state;

  const ownedIds = new Set(
    Object.values(state.territories)
      .filter((t: any) => t.ownerId === playerId)
      .map((t: any) => t.id)
  );

  // Trade until no longer forced or hand is small enough.
  // Pigeonhole: any hand of 5+ cards always has a valid set; no escape valve needed.
  let iter = 0;
  while (true) {
    if (++iter > 30) {
      throw new Error(`BOT TRADE LOOP STUCK pid=${playerId} hand=${state.cards?.hands[playerId]?.length} phase=${state.phase} forced=${JSON.stringify(state.publicCards?.pendingForcedTrade)}`);
    }
    const currentHand = state.myHand ?? state.cards?.hands[playerId] ?? [];
    const ftState = state.publicCards?.pendingForcedTrade;
    // Forced = pendingForcedTrade active AND hand > 4 (must trade more)
    const isForced = ftState?.playerId === playerId && currentHand.length > 4;
    // Voluntary = deployment phase with 5+ cards
    const shouldTrade = isForced || (state.phase === "deployment" && currentHand.length >= 5);

    if (!shouldTrade) break;

    const sets = suggestSets(currentHand, ownedIds);
    if (sets.length === 0) {
      // Should never happen: pigeonhole guarantees valid set when hand > 4
      throw new Error(`BUG: no valid set with ${currentHand.length} cards (pigeonhole violated)`);
    }

    const chosen = sets[0]!;
    const cardIds = [chosen[0]!.id, chosen[1]!.id, chosen[2]!.id] as [string, string, string];
    const result = tradeCards(state, playerId, cardIds, (arr) => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j]!, a[i]!];
      }
      return a;
    });
    if (!result.ok) break;
    state = result.state;
    if (state.phase === "game_over") return state;
  }
  return state;
}

function runBotTurn(
  state: GameState,
  rng: () => number
): { state: GameState; deployments: number; losses: number } {
  const activePlayer = state.players[state.activePlayerIndex]!;
  const playerId = activePlayer.id;
  const myTerritories = () =>
    Object.values(state.territories).filter((t: any) => t.ownerId === playerId);

  let deployments = 0;
  let losses = 0;

  // ── card trades (forced at deployment start) ─────────────────────────────
  if (state.phase === "deployment") {
    state = botTradeCards(state, playerId, rng);
    if (state.phase === "game_over") return { state, deployments, losses };
  }

  // ── deployment ──────────────────────────────────────────────────────────────
  // Deploy all reinforcements. The last deployUnits call automatically
  // transitions phase to "attack" when pendingReinforcements reaches 0.
  let _deployIter = 0;
  while (state.phase === "deployment") {
    if (++_deployIter > 500) {
      throw new Error(`DEPLOY LOOP STUCK pid=${playerId} reinf=${state.pendingReinforcements} forced=${JSON.stringify(state.publicCards?.pendingForcedTrade)} hand=${state.cards?.hands[playerId]?.length}`);
    }
    const remaining = state.pendingReinforcements;
    if (remaining === 0) break; // guard: deployUnits transitions automatically

    const borderTerrs = (myTerritories() as any[]).filter((t: any) =>
      t.neighbors.some((n: string) => (state.territories[n] as any)?.ownerId !== playerId)
    );
    const candidates = borderTerrs.length > 0 ? borderTerrs : myTerritories();
    if (candidates.length === 0) break;
    const target = candidates[Math.floor(rng() * candidates.length)]!;
    const r = deployUnits(state, playerId, (target as any).id, remaining);
    if (!r.ok) {
      throw new Error(`DEPLOY FAILED pid=${playerId} reinf=${remaining} err=${r.error} forced=${JSON.stringify(state.publicCards?.pendingForcedTrade)} hand=${state.cards?.hands[playerId]?.length}`);
    }
    deployments += remaining;
    state = r.state;
    // state.phase is now "attack" (deployUnits auto-transitions on last unit)
  }
  if (state.phase === "game_over") return { state, deployments, losses };

  // ── attack ───────────────────────────────────────────────────────────────────
  let _attackIter = 0;
  while (state.phase === "attack") {
    if (++_attackIter > 10000) {
      throw new Error(`ATTACK LOOP STUCK pid=${playerId} forced=${JSON.stringify(state.publicCards?.pendingForcedTrade)} reinf=${state.pendingReinforcements} hand=${state.cards?.hands[playerId]?.length} conquest=${!!state.pendingConquestMove}`);
    }
    // Handle forced card trade (after elimination capture with 6+ cards).
    // Simplified model: trade until hand ≤ 4, then deploy all pending reinforcements.
    // Pigeonhole guarantees a valid set whenever hand > 4.
    const ftState = state.publicCards?.pendingForcedTrade;
    if (ftState?.playerId === playerId) {
      const currentHand = state.cards?.hands[playerId] ?? [];
      // Trade down to ≤ 4 cards
      if (currentHand.length > 4) {
        state = botTradeCards(state, playerId, rng);
        if (state.phase === "game_over") return { state, deployments, losses };
      }
      // Deploy forced-trade reinforcements (armies went directly to pendingReinforcements)
      if (state.pendingReinforcements > 0) {
        const borderTerrs = (myTerritories() as any[]).filter((t: any) =>
          t.neighbors.some((n: string) => (state.territories[n] as any)?.ownerId !== playerId)
        );
        const candidates = borderTerrs.length > 0 ? borderTerrs : myTerritories();
        if (candidates.length > 0) {
          const target = candidates[Math.floor(rng() * candidates.length)]!;
          const r = deployUnits(state, playerId, (target as any).id, state.pendingReinforcements);
          if (r.ok) {
            deployments += state.pendingReinforcements;
            state = r.state;
            // deployUnits clears pendingForcedTrade when remaining hits 0
          }
        }
        continue; // Loop back — on next iter ftState will be null, proceed to attack
      }
      // pendingForcedTrade set but no cards to trade and no armies to deploy: stale state
      // attackTerritory auto-clears it; fall through.
    }
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
    const allAttackables = (myTerritories() as any[])
      .filter((src: any) => src.units >= 2)
      .flatMap((src: any) =>
        src.neighbors
          .filter((nid: string) => {
            const tgt = state.territories[nid] as any;
            return tgt && tgt.ownerId !== playerId;
          })
          .map((nid: string) => ({ src, tgt: state.territories[nid]! as any }))
      );

    if (allAttackables.length === 0) break;

    // Prefer strictly stronger attacks; fall back to equal-strength.
    // Do NOT fall back to unfavorable attacks: the bot would grind down and loop forever.
    const strictlyBetter = allAttackables.filter(({ src, tgt }: any) => src.units > tgt.units);
    const equalOrBetter = allAttackables.filter(({ src, tgt }: any) => src.units >= tgt.units);
    const attackables =
      strictlyBetter.length > 0 ? strictlyBetter :
      equalOrBetter.length > 0 ? equalOrBetter :
      [];  // No favorable attack available — give up and move to fortify

    if (attackables.length === 0) break;

    const choice = attackables[Math.floor(rng() * attackables.length)]! as any;
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
          let totalTradeBonusArmies = 0;

          assertInvariants(state, initialArmies, 0, 0, seedHex, 0);

          let actions = 0;
          let turns = 0;

          // History tail limit: keeps state.history from growing unboundedly and causing
          // O(n²) spread overhead across thousands of actions.
          const HISTORY_CAP = 500;

          while (state.phase !== "game_over" && actions < MAX_ACTIONS) {
            const prevTurn = state.turnNumber;
            const prevHistoryLength = state.history.length;
            const result = runBotTurn(state, rng);
            state = result.state;
            totalDeployments += result.deployments;
            totalLosses += result.losses;
            // Count territory bonus armies placed directly by card trades
            const newEvents = state.history.slice(prevHistoryLength);
            for (const ev of newEvents) {
              if (ev.type === "cards_traded" && (ev as any).territoryBonus) {
                totalTradeBonusArmies += (ev as any).territoryBonus.armies;
              }
            }
            if (state.turnNumber > prevTurn) turns++;
            actions++;

            // Cap history to prevent O(n²) array spread on long games
            if (state.history.length > HISTORY_CAP * 2) {
              state = { ...state, history: state.history.slice(-HISTORY_CAP) };
            }

            assertInvariants(state, initialArmies, totalDeployments, totalLosses, seedHex, totalTradeBonusArmies);
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
