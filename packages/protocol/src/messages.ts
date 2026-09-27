import { z } from "zod";
import { GameEventSchema, GameStateSchema, PlayerSchema, TerritoryStateSchema, GamePhaseSchema, MatchResultSchema } from "./events.js";
import { RoomVisibilitySchema, RoomCodeSchema } from "./api.js";

/**
 * A minimal state delta: only the fields that changed since the previous
 * projected state. `territories` is a partial record of changed territory ids.
 * Absent keys mean "unchanged". Null scalar values mean "set to null".
 * History is never included in deltas — events arrive as discrete `server:event` items.
 */
export const StateDeltaSchema = z.object({
  territories: z.record(TerritoryStateSchema).optional(),
  players: z.array(PlayerSchema).optional(),
  phase: GamePhaseSchema.optional(),
  activePlayerIndex: z.number().int().optional(),
  turnNumber: z.number().int().optional(),
  pendingReinforcements: z.number().optional(),
  pendingConquestMove: z.object({
    sourceTerritoryId: z.string(),
    targetTerritoryId: z.string(),
    defenderId: z.string(),
    minimumUnits: z.number().int().min(1),
    maximumUnits: z.number().int().min(1),
  }).nullable().optional(),
  hasConqueredThisTurn: z.boolean().optional(),
  winnerId: z.string().nullable().optional(),
  result: MatchResultSchema.nullable().optional(),
  turnDeadlineAt: z.number().nullable().optional(),
  matchNumber: z.number().int().optional(),
  startedAt: z.number().optional(),
  endedAt: z.number().nullable().optional(),
});
export type StateDelta = z.infer<typeof StateDeltaSchema>;

// Client -> Server Messages
export const ClientJoinSchema = z.object({
  type: z.literal("client:join"),
  name: z.string().min(1).max(24),
  roomCode: RoomCodeSchema,
  sessionToken: z.string().optional(),
});
export type ClientJoin = z.infer<typeof ClientJoinSchema>;

export const ClientCreateRoomSchema = z.object({
  type: z.literal("client:create_room"),
  playerName: z.string().min(1).max(24),
  sessionToken: z.string().optional(),
  displayName: z.string().min(1).max(40).optional(),
  visibility: RoomVisibilitySchema.default("public"),
  maxPlayers: z.number().int().min(2).max(6).default(4),
  mapId: z.string().optional(),
});
export type ClientCreateRoom = z.infer<typeof ClientCreateRoomSchema>;

export const ClientReadySchema = z.object({
  type: z.literal("client:ready"),
  ready: z.boolean(),
});
export type ClientReady = z.infer<typeof ClientReadySchema>;

export const ClientDeploySchema = z.object({
  type: z.literal("client:deploy"),
  territoryId: z.string(),
  count: z.number().int().min(1),
});
export type ClientDeploy = z.infer<typeof ClientDeploySchema>;

export const ClientAttackSchema = z.object({
  type: z.literal("client:attack"),
  sourceTerritoryId: z.string(),
  targetTerritoryId: z.string(),
  units: z.number().int().min(1).optional(),
});
export type ClientAttack = z.infer<typeof ClientAttackSchema>;

export const ClientCompleteConquestMoveSchema = z.object({
  type: z.literal("client:complete_conquest_move"),
  units: z.number().int().min(1),
});
export type ClientCompleteConquestMove = z.infer<typeof ClientCompleteConquestMoveSchema>;

export const ClientFortifySchema = z.object({
  type: z.literal("client:fortify"),
  sourceTerritoryId: z.string(),
  targetTerritoryId: z.string(),
  units: z.number().int().min(1),
});
export type ClientFortify = z.infer<typeof ClientFortifySchema>;

export const ClientSkipPhaseSchema = z.object({
  type: z.literal("client:skip_phase"),
});
export type ClientSkipPhase = z.infer<typeof ClientSkipPhaseSchema>;

export const ClientEndTurnSchema = z.object({
  type: z.literal("client:end_turn"),
});
export type ClientEndTurn = z.infer<typeof ClientEndTurnSchema>;

export const ClientChatSchema = z.object({
  type: z.literal("client:chat"),
  text: z.string().min(1).max(200),
});
export type ClientChat = z.infer<typeof ClientChatSchema>;

export const ClientPingSchema = z.object({
  type: z.literal("client:ping"),
  timestamp: z.number(),
});
export type ClientPing = z.infer<typeof ClientPingSchema>;

export const ClientResyncSchema = z.object({
  type: z.literal("client:resync"),
});
export type ClientResync = z.infer<typeof ClientResyncSchema>;

export const ClientLeaveRoomSchema = z.object({
  type: z.literal("client:leave_room"),
});
export type ClientLeaveRoom = z.infer<typeof ClientLeaveRoomSchema>;

export const ClientRematchSchema = z.object({
  type: z.literal("client:rematch"),
  ready: z.boolean(),
});
export type ClientRematch = z.infer<typeof ClientRematchSchema>;

export const ClientMessageSchema = z.discriminatedUnion("type", [
  ClientJoinSchema,
  ClientCreateRoomSchema,
  ClientLeaveRoomSchema,
  ClientReadySchema,
  ClientRematchSchema,
  ClientDeploySchema,
  ClientAttackSchema,
  ClientCompleteConquestMoveSchema,
  ClientFortifySchema,
  ClientSkipPhaseSchema,
  ClientEndTurnSchema,
  ClientChatSchema,
  ClientPingSchema,
  ClientResyncSchema,
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// Server -> Client Messages
export const ServerWelcomeSchema = z.object({
  type: z.literal("server:welcome"),
  sessionToken: z.string(),
  playerId: z.string(),
  serverName: z.string(),
  roomCode: z.string(),
});
export type ServerWelcome = z.infer<typeof ServerWelcomeSchema>;

export const ServerSnapshotSchema = z.object({
  type: z.literal("server:snapshot"),
  /** Projected game state for this player. `history` is bounded to the last 200 events. */
  state: GameStateSchema,
  myPlayerId: z.string(),
  /** Monotonic state version at the time of this snapshot. */
  version: z.number().int(),
});
export type ServerSnapshot = z.infer<typeof ServerSnapshotSchema>;

export const ServerEventSchema = z.object({
  type: z.literal("server:event"),
  event: GameEventSchema,
  /** Monotonic state version this event corresponds to. */
  version: z.number().int(),
  /**
   * Minimal diff between the previous and current projected state.
   * Apply to the client's state to reconstruct the new state.
   * If a version gap is detected, discard this and send `client:resync`.
   */
  delta: StateDeltaSchema,
});
export type ServerEvent = z.infer<typeof ServerEventSchema>;

export const ServerErrorSchema = z.object({
  type: z.literal("server:error"),
  code: z.string(),
  message: z.string(),
});
export type ServerError = z.infer<typeof ServerErrorSchema>;

export const ServerPongSchema = z.object({
  type: z.literal("server:pong"),
  timestamp: z.number(),
});
export type ServerPong = z.infer<typeof ServerPongSchema>;

export const ServerMessageSchema = z.discriminatedUnion("type", [
  ServerWelcomeSchema,
  ServerSnapshotSchema,
  ServerEventSchema,
  ServerErrorSchema,
  ServerPongSchema,
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
