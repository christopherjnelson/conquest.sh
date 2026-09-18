import type { GameState, Player, Sector, TerritoryState } from "@conquest/protocol";
import type { MapDefinition } from "./types.js";
import { calculateReinforcements } from "./rules.js";

export function createInitialGameState(
  gameId: string,
  roomCode: string,
  players: Player[],
  map: MapDefinition,
  initialUnitsPerTerritory: number = 3,
  shuffleFn?: <T>(arr: T[]) => T[]
): GameState {
  if (players.length < 2) {
    throw new Error("At least 2 players are required to start a game");
  }

  // Clone territories and sectors
  const territories: Record<string, TerritoryState> = {};
  const sectors: Record<string, Sector> = {};

  for (const s of map.sectors) {
    sectors[s.id] = { ...s };
  }

  // Shuffle or distribute territories round-robin among alive players
  let territoryDefs = [...map.territories];
  if (shuffleFn) {
    territoryDefs = shuffleFn(territoryDefs);
  }

  territoryDefs.forEach((t, index) => {
    const owner = players[index % players.length];
    territories[t.id] = {
      ...t,
      ownerId: owner.id,
      units: initialUnitsPerTerritory,
    };
  });

  const now = Date.now();
  const activePlayer = players[0];

  const initialStateWithoutReinforcements: GameState = {
    gameId,
    roomCode,
    turnNumber: 1,
    activePlayerIndex: 0,
    phase: "deployment",
    players: players.map((p) => ({ ...p, isAlive: true })),
    territories,
    sectors,
    pendingReinforcements: 0,
    hasConqueredThisTurn: false,
    winnerId: null,
    history: [],
  };

  const reinforcements = calculateReinforcements(initialStateWithoutReinforcements, activePlayer.id);

  const state: GameState = {
    ...initialStateWithoutReinforcements,
    pendingReinforcements: reinforcements,
    history: [
      {
        type: "game_started",
        gameId,
        turnNumber: 1,
        activePlayerId: activePlayer.id,
        timestamp: now,
      },
      {
        type: "phase_changed",
        phase: "deployment",
        activePlayerId: activePlayer.id,
        reinforcements,
        timestamp: now,
      },
    ],
  };

  return state;
}
