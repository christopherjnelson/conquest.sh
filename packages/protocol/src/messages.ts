import { z } from "zod";
import { GameEventSchema, GameStateSchema } from "./events.js";

// Client -> Server Messages
export const ClientJoinSchema = z.object({
  type: z.literal("client:join"),
  name: z.string().min(1).max(24),
  roomCode: z.string().optional(),
  sessionToken: z.string().optional(),
});
export type ClientJoin = z.infer<typeof ClientJoinSchema>;

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

export const ClientMessageSchema = z.discriminatedUnion("type", [
  ClientJoinSchema,
  ClientReadySchema,
  ClientDeploySchema,
  ClientAttackSchema,
  ClientFortifySchema,
  ClientSkipPhaseSchema,
  ClientEndTurnSchema,
  ClientChatSchema,
  ClientPingSchema,
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
  state: GameStateSchema,
  myPlayerId: z.string(),
});
export type ServerSnapshot = z.infer<typeof ServerSnapshotSchema>;

export const ServerEventSchema = z.object({
  type: z.literal("server:event"),
  event: GameEventSchema,
  state: GameStateSchema.optional(),
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
