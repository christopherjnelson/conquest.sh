import { z } from "zod";

export const GamePhaseSchema = z.enum(["lobby", "deployment", "attack", "fortify", "game_over"]);
export type GamePhase = z.infer<typeof GamePhaseSchema>;

export const PlayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  colorIndex: z.number(),
  colorHex: z.string(),
  connected: z.boolean(),
  isAlive: z.boolean(),
  ready: z.boolean().default(false),
});
export type Player = z.infer<typeof PlayerSchema>;

export const TerritoryStateSchema = z.object({
  id: z.string(),
  name: z.string(),
  sectorId: z.string(),
  ownerId: z.string(),
  units: z.number().int().min(1),
  neighbors: z.array(z.string()),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
});
export type TerritoryState = z.infer<typeof TerritoryStateSchema>;

export const SectorSchema = z.object({
  id: z.string(),
  name: z.string(),
  bonusReinforcements: z.number().int(),
  territoryIds: z.array(z.string()),
  colorHex: z.string(),
});
export type Sector = z.infer<typeof SectorSchema>;

export const GameEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("player_joined"),
    player: PlayerSchema,
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal("player_left"),
    playerId: z.string(),
    reason: z.string().optional(),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal("player_reconnected"),
    playerId: z.string(),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal("game_started"),
    gameId: z.string(),
    turnNumber: z.number(),
    activePlayerId: z.string(),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal("phase_changed"),
    phase: GamePhaseSchema,
    activePlayerId: z.string(),
    reinforcements: z.number(),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal("units_deployed"),
    playerId: z.string(),
    territoryId: z.string(),
    count: z.number(),
    remainingReinforcements: z.number(),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal("attack_resolved"),
    attackerId: z.string(),
    defenderId: z.string(),
    sourceTerritoryId: z.string(),
    targetTerritoryId: z.string(),
    attackerRolls: z.array(z.number()),
    defenderRolls: z.array(z.number()),
    attackerLosses: z.number(),
    defenderLosses: z.number(),
    conquered: z.boolean(),
    unitsMoved: z.number().optional(),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal("units_fortified"),
    playerId: z.string(),
    sourceTerritoryId: z.string(),
    targetTerritoryId: z.string(),
    units: z.number(),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal("turn_ended"),
    previousPlayerId: z.string(),
    nextPlayerId: z.string(),
    turnNumber: z.number(),
    reinforcements: z.number(),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal("player_eliminated"),
    playerId: z.string(),
    eliminatedBy: z.string(),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal("game_won"),
    winnerId: z.string(),
    winnerName: z.string(),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal("chat_message"),
    senderId: z.string(),
    senderName: z.string(),
    channel: z.enum(["game", "system"]).default("game"),
    text: z.string(),
    timestamp: z.number(),
  }),
]);
export type GameEvent = z.infer<typeof GameEventSchema>;

export const GameStateSchema = z.object({
  gameId: z.string(),
  roomCode: z.string(),
  turnNumber: z.number(),
  activePlayerIndex: z.number(),
  phase: GamePhaseSchema,
  players: z.array(PlayerSchema),
  territories: z.record(TerritoryStateSchema),
  sectors: z.record(SectorSchema),
  pendingReinforcements: z.number(),
  hasConqueredThisTurn: z.boolean(),
  winnerId: z.string().nullable(),
  history: z.array(GameEventSchema),
});
export type GameState = z.infer<typeof GameStateSchema>;
