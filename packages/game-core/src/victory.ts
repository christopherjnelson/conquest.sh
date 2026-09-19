import type {
  GameEvent,
  GameState,
  MatchResult,
  PlayerMatchResult,
  VictoryReason,
} from "@conquest/protocol";

/**
 * Checks whether a defeated player has lost all territories and should be eliminated.
 * Ensures an already-eliminated player is never eliminated twice.
 */
export function evaluatePlayerEliminations(
  state: GameState,
  defeatedPlayerId: string,
  eliminatorId: string,
  timestamp: number = Date.now()
): {
  nextPlayers: GameState["players"];
  eliminationEvent?: GameEvent;
  isNewlyEliminated: boolean;
} {
  const player = state.players.find((p) => p.id === defeatedPlayerId);
  if (!player || !player.isAlive) {
    return {
      nextPlayers: state.players,
      isNewlyEliminated: false,
    };
  }

  // Count territories owned
  const ownedCount = Object.values(state.territories).filter(
    (t) => t.ownerId === defeatedPlayerId
  ).length;

  if (ownedCount === 0) {
    const nextPlayers = state.players.map((p) =>
      p.id === defeatedPlayerId ? { ...p, isAlive: false } : p
    );
    const eliminationEvent: GameEvent = {
      type: "player_eliminated",
      playerId: defeatedPlayerId,
      eliminatedBy: eliminatorId,
      timestamp,
    };
    return {
      nextPlayers,
      eliminationEvent,
      isNewlyEliminated: true,
    };
  }

  return {
    nextPlayers: state.players,
    isNewlyEliminated: false,
  };
}

/**
 * Evaluates whether total conquest or another victory condition has been achieved.
 */
export function evaluateVictory(
  state: GameState,
  candidateWinnerId?: string
): {
  isVictory: boolean;
  winnerId?: string;
  reason?: VictoryReason;
} {
  if (state.phase === "game_over" && state.winnerId) {
    return {
      isVictory: true,
      winnerId: state.winnerId,
      reason: state.result?.reason ?? "conquest",
    };
  }

  const territories = Object.values(state.territories);
  if (territories.length === 0) {
    return { isVictory: false };
  }

  const firstOwner = candidateWinnerId || territories[0].ownerId;
  const allControlledByOne = territories.every((t) => t.ownerId === firstOwner);

  if (allControlledByOne) {
    return {
      isVictory: true,
      winnerId: firstOwner,
      reason: "conquest",
    };
  }

  return { isVictory: false };
}

/**
 * Builds the canonical MatchResult object with authoritative player placements.
 * Winner: placement = 1.
 * Eliminated players: most recently eliminated ranks above players eliminated earlier.
 */
export function buildMatchResult(
  state: GameState,
  winnerId: string,
  reason: VictoryReason = "conquest",
  endedAt: number = Date.now()
): MatchResult {
  const winner = state.players.find((p) => p.id === winnerId);
  const startedAt =
    state.startedAt ??
    (state.history.find((e) => e.type === "game_started")?.timestamp ?? endedAt);
  const durationMs = Math.max(0, endedAt - startedAt);

  // Extract all elimination events to determine elimination sequence
  const elimEvents = state.history.filter(
    (e) => e.type === "player_eliminated"
  ) as Array<{
    type: "player_eliminated";
    playerId: string;
    eliminatedBy: string;
    timestamp: number;
  }>;

  const elimOrder = elimEvents.map((e) => e.playerId);
  const eliminatedByMap = new Map<string, string>();
  for (const e of elimEvents) {
    eliminatedByMap.set(e.playerId, e.eliminatedBy);
  }

  // Non-winner players
  const nonWinners = state.players.filter((p) => p.id !== winnerId);

  // Sort non-winners:
  // Alive players first (if any), then eliminated players in reverse chronological order
  nonWinners.sort((a, b) => {
    const aElimIndex = elimOrder.lastIndexOf(a.id);
    const bElimIndex = elimOrder.lastIndexOf(b.id);

    // If both eliminated, higher index was eliminated later -> better placement
    if (aElimIndex !== -1 && bElimIndex !== -1) {
      return bElimIndex - aElimIndex;
    }

    if (aElimIndex === -1 && bElimIndex !== -1) return -1;
    if (aElimIndex !== -1 && bElimIndex === -1) return 1;

    // Both alive: sort by territory count desc, then armies desc
    const aTerrs = Object.values(state.territories).filter((t) => t.ownerId === a.id).length;
    const bTerrs = Object.values(state.territories).filter((t) => t.ownerId === b.id).length;
    if (bTerrs !== aTerrs) return bTerrs - aTerrs;

    const aArmies = Object.values(state.territories)
      .filter((t) => t.ownerId === a.id)
      .reduce((sum, t) => sum + t.units, 0);
    const bArmies = Object.values(state.territories)
      .filter((t) => t.ownerId === b.id)
      .reduce((sum, t) => sum + t.units, 0);
    return bArmies - aArmies;
  });

  const orderedPlayers = [
    state.players.find((p) => p.id === winnerId)!,
    ...nonWinners,
  ].filter(Boolean);

  const playerResults: PlayerMatchResult[] = orderedPlayers.map((p, index) => {
    const owned = Object.values(state.territories).filter((t) => t.ownerId === p.id);
    const armies = owned.reduce((sum, t) => sum + t.units, 0);
    const isEliminated =
      p.id !== winnerId && (eliminatedByMap.has(p.id) || !p.isAlive || owned.length === 0);

    return {
      playerId: p.id,
      playerName: p.name,
      placement: index + 1,
      finalTerritories: owned.length,
      finalArmies: armies,
      eliminated: isEliminated,
      eliminatedBy: eliminatedByMap.get(p.id),
    };
  });

  return {
    winnerId,
    winnerName: winner?.name ?? "Commander",
    reason,
    turnNumber: state.turnNumber,
    startedAt,
    endedAt,
    durationMs,
    players: playerResults,
  };
}

/**
 * Finalizes match state into game_over with canonical MatchResult and game_won event.
 */
export function finalizeMatch(
  state: GameState,
  winnerId: string,
  reason: VictoryReason = "conquest",
  timestamp: number = Date.now()
): {
  state: GameState;
  events: GameEvent[];
  result: MatchResult;
} {
  if (state.phase === "game_over" && state.result) {
    return {
      state,
      events: [],
      result: state.result,
    };
  }

  const winner = state.players.find((p) => p.id === winnerId);
  const winEvent: GameEvent = {
    type: "game_won",
    winnerId,
    winnerName: winner?.name ?? "Player",
    timestamp,
  };

  const stateWithEvent: GameState = {
    ...state,
    history: [...state.history, winEvent],
  };

  const result = buildMatchResult(stateWithEvent, winnerId, reason, timestamp);

  const finalState: GameState = {
    ...stateWithEvent,
    phase: "game_over",
    winnerId,
    endedAt: timestamp,
    result,
  };

  return {
    state: finalState,
    events: [winEvent],
    result,
  };
}
