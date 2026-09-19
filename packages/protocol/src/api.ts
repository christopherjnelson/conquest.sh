import { z } from "zod";
import { GamePhaseSchema } from "./events.js";

export const RoomVisibilitySchema = z.enum(["public", "unlisted"]);
export type RoomVisibility = z.infer<typeof RoomVisibilitySchema>;

export const RoomKindSchema = z.enum(["quick", "custom"]);
export type RoomKind = z.infer<typeof RoomKindSchema>;

export const RoomSummarySchema = z.object({
  roomCode: z.string(),
  displayName: z.string(),
  visibility: RoomVisibilitySchema,
  kind: RoomKindSchema,
  phase: GamePhaseSchema,
  playersCount: z.number().int().min(0),
  maxPlayers: z.number().int().min(2).max(6),
  mapId: z.string(),
  mapName: z.string(),
  turnNumber: z.number().int().min(0),
  createdAt: z.number(),
});
export type RoomSummary = z.infer<typeof RoomSummarySchema>;

export const ServerInfoSchema = z.object({
  serverName: z.string(),
  protocolVersion: z.string(),
  roomsCount: z.number().int().min(0),
  playersCount: z.number().int().min(0),
  defaultMap: z.string(),
  maxPlayersPerRoom: z.number().int().min(2),
});
export type ServerInfo = z.infer<typeof ServerInfoSchema>;
