import { z } from "zod";
import { GamePhaseSchema } from "./events.js";

export const RoomVisibilitySchema = z.enum(["public", "unlisted"]);
export type RoomVisibility = z.infer<typeof RoomVisibilitySchema>;

export const RoomKindSchema = z.literal("custom");
export type RoomKind = z.infer<typeof RoomKindSchema>;

export const RoomCodeSchema = z
  .string()
  .regex(/^[A-Z0-9]{4}$/, "Room code must be exactly 4 uppercase alphanumeric characters");
export type RoomCode = z.infer<typeof RoomCodeSchema>;

export const RoomSummarySchema = z.object({
  roomCode: RoomCodeSchema,
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
  availableMaps: z.array(z.object({
    id: z.string(),
    name: z.string(),
    territoryCount: z.number().int(),
    recommendedPlayers: z.object({ min: z.number().int(), max: z.number().int() }),
  })),
  maxPlayersPerRoom: z.number().int().min(2),
});
export type ServerInfo = z.infer<typeof ServerInfoSchema>;

export const RoomSummariesSchema = z.array(RoomSummarySchema);

export { z };
