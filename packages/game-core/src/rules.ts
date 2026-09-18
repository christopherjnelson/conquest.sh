import type { GameEvent, GamePhase, GameState, Player, TerritoryState } from "@conquest/protocol";
import { resolveCombat, type RandomNumberGenerator } from "./combat.js";

export type ActionResult<T = unknown> =
  | { ok: true; state: GameState; events: GameEvent[]; data?: T }
  | { ok: false; error: string };

/**
 * Calculate reinforcements for a player at the start of their turn.
 */
export function calculateReinforcements(state: GameState, playerId: string): number {
  const ownedTerritories = Object.values(state.territories).filter((t) => t.ownerId === playerId);
  const baseReinforcements = Math.max(3, Math.floor(ownedTerritories.length / 3));

  let sectorBonus = 0;
  for (const sector of Object.values(state.sectors)) {
    const ownsAllInSector = sector.territoryIds.every(
      (tid) => state.territories[tid]?.ownerId === playerId
    );
    if (ownsAllInSector) {
      sectorBonus += sector.bonusReinforcements;
    }
  }

  return baseReinforcements + sectorBonus;
}

/**
 * Validate and apply troop deployment.
 */
export function deployUnits(
  state: GameState,
  playerId: string,
  territoryId: string,
  count: number
): ActionResult<{ remainingReinforcements: number }> {
  const activePlayer = state.players[state.activePlayerIndex];
  if (!activePlayer || activePlayer.id !== playerId) {
    return { ok: false, error: "Not your turn" };
  }

  if (state.phase !== "deployment") {
    return { ok: false, error: `Cannot deploy during ${state.phase} phase` };
  }

  if (count <= 0 || count > state.pendingReinforcements) {
    return { ok: false, error: `Invalid deployment amount: ${count} (have ${state.pendingReinforcements})` };
  }

  const territory = state.territories[territoryId];
  if (!territory) {
    return { ok: false, error: `Territory ${territoryId} not found` };
  }

  if (territory.ownerId !== playerId) {
    return { ok: false, error: "You can only deploy to territories you control" };
  }

  const remaining = state.pendingReinforcements - count;
  const now = Date.now();

  const nextTerritories = {
    ...state.territories,
    [territoryId]: {
      ...territory,
      units: territory.units + count,
    },
  };

  const nextPhase = remaining === 0 ? "attack" : "deployment";
  const events: GameEvent[] = [
    {
      type: "units_deployed",
      playerId,
      territoryId,
      count,
      remainingReinforcements: remaining,
      timestamp: now,
    },
  ];

  if (remaining === 0) {
    events.push({
      type: "phase_changed",
      phase: "attack",
      activePlayerId: playerId,
      reinforcements: 0,
      timestamp: now,
    });
  }

  const nextState: GameState = {
    ...state,
    territories: nextTerritories,
    pendingReinforcements: remaining,
    phase: nextPhase,
    history: [...state.history, ...events],
  };

  return { ok: true, state: nextState, events, data: { remainingReinforcements: remaining } };
}

/**
 * Validate and execute an attack between two adjacent territories.
 */
export function attackTerritory(
  state: GameState,
  playerId: string,
  sourceTerritoryId: string,
  targetTerritoryId: string,
  requestedUnits?: number,
  randomFn: RandomNumberGenerator = Math.random
): ActionResult<{
  attackerRolls: number[];
  defenderRolls: number[];
  attackerLosses: number;
  defenderLosses: number;
  conquered: boolean;
}> {
  const activePlayer = state.players[state.activePlayerIndex];
  if (!activePlayer || activePlayer.id !== playerId) {
    return { ok: false, error: "Not your turn" };
  }

  if (state.phase !== "attack") {
    return { ok: false, error: `Cannot attack during ${state.phase} phase` };
  }

  const source = state.territories[sourceTerritoryId];
  const target = state.territories[targetTerritoryId];

  if (!source) return { ok: false, error: `Source territory ${sourceTerritoryId} not found` };
  if (!target) return { ok: false, error: `Target territory ${targetTerritoryId} not found` };

  if (source.ownerId !== playerId) {
    return { ok: false, error: "You must own the source territory" };
  }

  if (target.ownerId === playerId) {
    return { ok: false, error: "Cannot attack your own territory" };
  }

  if (!source.neighbors.includes(targetTerritoryId)) {
    return { ok: false, error: `Territory ${target.name} is not adjacent to ${source.name}` };
  }

  if (source.units < 2) {
    return { ok: false, error: "Need at least 2 units in territory to attack" };
  }

  const maxAttackerDice = Math.min(3, source.units - 1);
  const attackerDice = requestedUnits ? Math.max(1, Math.min(maxAttackerDice, requestedUnits)) : maxAttackerDice;
  const defenderDice = Math.min(2, target.units);

  const combat = resolveCombat(attackerDice, defenderDice, randomFn);

  let nextSourceUnits = source.units - combat.attackerLosses;
  let nextTargetUnits = target.units - combat.defenderLosses;
  let targetOwnerId = target.ownerId;
  const originalDefenderId = target.ownerId;
  let conquered = false;
  let unitsMoved = 0;

  const now = Date.now();
  const events: GameEvent[] = [];

  if (nextTargetUnits <= 0) {
    conquered = true;
    targetOwnerId = playerId;
    // Units moved is at least the number of attacking dice used
    unitsMoved = Math.min(nextSourceUnits - 1, attackerDice);
    nextSourceUnits -= unitsMoved;
    nextTargetUnits = unitsMoved;
  }

  events.push({
    type: "attack_resolved",
    attackerId: playerId,
    defenderId: originalDefenderId,
    sourceTerritoryId,
    targetTerritoryId,
    attackerRolls: combat.attackerRolls,
    defenderRolls: combat.defenderRolls,
    attackerLosses: combat.attackerLosses,
    defenderLosses: combat.defenderLosses,
    conquered,
    unitsMoved: conquered ? unitsMoved : undefined,
    timestamp: now,
  });

  const nextTerritories: Record<string, TerritoryState> = {
    ...state.territories,
    [sourceTerritoryId]: {
      ...source,
      units: nextSourceUnits,
    },
    [targetTerritoryId]: {
      ...target,
      ownerId: targetOwnerId,
      units: nextTargetUnits,
    },
  };

  let nextPlayers = [...state.players];
  let winnerId = state.winnerId;
  let nextPhase: GamePhase = state.phase;

  if (conquered) {
    // Check if defender is eliminated
    const defenderTerritories = Object.values(nextTerritories).filter(
      (t) => t.ownerId === originalDefenderId
    );
    if (defenderTerritories.length === 0) {
      nextPlayers = nextPlayers.map((p) =>
        p.id === originalDefenderId ? { ...p, isAlive: false } : p
      );
      events.push({
        type: "player_eliminated",
        playerId: originalDefenderId,
        eliminatedBy: playerId,
        timestamp: now,
      });
    }

    // Check if attacker has won (controls all territories)
    const allControlledByAttacker = Object.values(nextTerritories).every(
      (t) => t.ownerId === playerId
    );
    if (allControlledByAttacker) {
      winnerId = playerId;
      nextPhase = "game_over";
      const winner = nextPlayers.find((p) => p.id === playerId);
      events.push({
        type: "game_won",
        winnerId: playerId,
        winnerName: winner?.name ?? "Player",
        timestamp: now,
      });
    }
  }

  const nextState: GameState = {
    ...state,
    territories: nextTerritories,
    players: nextPlayers,
    winnerId,
    phase: nextPhase,
    hasConqueredThisTurn: state.hasConqueredThisTurn || conquered,
    history: [...state.history, ...events],
  };

  return {
    ok: true,
    state: nextState,
    events,
    data: {
      attackerRolls: combat.attackerRolls,
      defenderRolls: combat.defenderRolls,
      attackerLosses: combat.attackerLosses,
      defenderLosses: combat.defenderLosses,
      conquered,
    },
  };
}

/**
 * Helper to check if two territories are connected by owned territories.
 */
export function areTerritoriesConnected(
  territories: Record<string, TerritoryState>,
  sourceId: string,
  targetId: string,
  ownerId: string
): boolean {
  if (sourceId === targetId) return true;
  const queue: string[] = [sourceId];
  const visited = new Set<string>([sourceId]);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const current = territories[currentId];
    if (!current) continue;

    for (const neighborId of current.neighbors) {
      if (neighborId === targetId && territories[neighborId]?.ownerId === ownerId) {
        return true;
      }
      if (!visited.has(neighborId)) {
        visited.add(neighborId);
        const neighbor = territories[neighborId];
        if (neighbor && neighbor.ownerId === ownerId) {
          queue.push(neighborId);
        }
      }
    }
  }

  return false;
}

/**
 * Fortify units from one owned territory to another.
 */
export function fortifyUnits(
  state: GameState,
  playerId: string,
  sourceTerritoryId: string,
  targetTerritoryId: string,
  units: number
): ActionResult<void> {
  const activePlayer = state.players[state.activePlayerIndex];
  if (!activePlayer || activePlayer.id !== playerId) {
    return { ok: false, error: "Not your turn" };
  }

  if (state.phase !== "fortify") {
    return { ok: false, error: `Cannot fortify during ${state.phase} phase` };
  }

  const source = state.territories[sourceTerritoryId];
  const target = state.territories[targetTerritoryId];

  if (!source || !target) {
    return { ok: false, error: "Territory not found" };
  }

  if (source.ownerId !== playerId || target.ownerId !== playerId) {
    return { ok: false, error: "Both territories must be controlled by you" };
  }

  if (units <= 0 || source.units - units < 1) {
    return { ok: false, error: `Must leave at least 1 unit behind in source (has ${source.units}, attempted to move ${units})` };
  }

  if (!areTerritoriesConnected(state.territories, sourceTerritoryId, targetTerritoryId, playerId)) {
    return { ok: false, error: "No friendly connected path between territories" };
  }

  const now = Date.now();
  const nextTerritories = {
    ...state.territories,
    [sourceTerritoryId]: { ...source, units: source.units - units },
    [targetTerritoryId]: { ...target, units: target.units + units },
  };

  const fortifyEvent: GameEvent = {
    type: "units_fortified",
    playerId,
    sourceTerritoryId,
    targetTerritoryId,
    units,
    timestamp: now,
  };

  const stateAfterFortify: GameState = {
    ...state,
    territories: nextTerritories,
    history: [...state.history, fortifyEvent],
  };

  // Fortifying automatically completes the turn!
  return endTurn(stateAfterFortify, playerId, [fortifyEvent]);
}

/**
 * Skip the current phase (Attack -> Fortify, or Fortify -> End Turn).
 */
export function skipPhase(state: GameState, playerId: string): ActionResult<void> {
  const activePlayer = state.players[state.activePlayerIndex];
  if (!activePlayer || activePlayer.id !== playerId) {
    return { ok: false, error: "Not your turn" };
  }

  const now = Date.now();

  if (state.phase === "attack") {
    const event: GameEvent = {
      type: "phase_changed",
      phase: "fortify",
      activePlayerId: playerId,
      reinforcements: 0,
      timestamp: now,
    };
    return {
      ok: true,
      state: {
        ...state,
        phase: "fortify",
        history: [...state.history, event],
      },
      events: [event],
    };
  }

  if (state.phase === "fortify") {
    return endTurn(state, playerId);
  }

  return { ok: false, error: `Cannot skip phase during ${state.phase}` };
}

/**
 * End the current player's turn and advance to the next alive player.
 */
export function endTurn(
  state: GameState,
  playerId: string,
  priorEvents: GameEvent[] = []
): ActionResult<void> {
  const activePlayer = state.players[state.activePlayerIndex];
  if (!activePlayer || activePlayer.id !== playerId) {
    return { ok: false, error: "Not your turn" };
  }

  // Find next living player
  const totalPlayers = state.players.length;
  let nextIndex = (state.activePlayerIndex + 1) % totalPlayers;
  let wrappedAround = nextIndex <= state.activePlayerIndex;

  let loopCount = 0;
  while (!state.players[nextIndex].isAlive && loopCount < totalPlayers) {
    nextIndex = (nextIndex + 1) % totalPlayers;
    if (nextIndex === 0) wrappedAround = true;
    loopCount++;
  }

  const nextPlayer = state.players[nextIndex];
  if (!nextPlayer || !nextPlayer.isAlive) {
    return { ok: false, error: "No eligible next player found" };
  }

  const nextTurnNumber = wrappedAround ? state.turnNumber + 1 : state.turnNumber;
  const reinforcements = calculateReinforcements(state, nextPlayer.id);
  const now = Date.now();

  const events: GameEvent[] = [
    ...priorEvents,
    {
      type: "turn_ended",
      previousPlayerId: playerId,
      nextPlayerId: nextPlayer.id,
      turnNumber: nextTurnNumber,
      reinforcements,
      timestamp: now,
    },
    {
      type: "phase_changed",
      phase: "deployment",
      activePlayerId: nextPlayer.id,
      reinforcements,
      timestamp: now,
    },
  ];

  const nextState: GameState = {
    ...state,
    activePlayerIndex: nextIndex,
    turnNumber: nextTurnNumber,
    phase: "deployment",
    pendingReinforcements: reinforcements,
    hasConqueredThisTurn: false,
    history: [...state.history, ...events],
  };

  return { ok: true, state: nextState, events };
}
