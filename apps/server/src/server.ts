import type { Server, ServerWebSocket } from "bun";
import {
  ClientMessageSchema,
  type ClientJoin,
  type ClientMessage,
  type ServerError,
  type ServerMessage,
  type ServerWelcome,
} from "@conquest/protocol";
import type { MapDefinition } from "@conquest/game-core";
import { MAP_SECTOR_07 } from "@conquest/map-engine";
import { logger } from "@conquest/shared";
import { RoomManager, type GameRoom } from "./room.js";
import { SessionStore, type SessionRecord } from "./session.js";

export interface ConquestServerOptions {
  port?: number;
  serverName?: string;
  defaultMap?: MapDefinition;
  maxPlayersPerRoom?: number;
  sessionStore?: SessionStore;
  dbPath?: string;
}

export interface WSData {
  sessionToken?: string;
  playerId?: string;
  roomCode?: string;
}

export class ConquestServer {
  public readonly serverName: string;
  public readonly roomManager: RoomManager;
  public readonly sessionStore: SessionStore;

  private portOption: number;
  private server: Server<WSData> | null = null;

  constructor(options?: ConquestServerOptions) {
    this.portOption = options?.port ?? 4000;
    this.serverName = options?.serverName ?? "conquest.sh-server";
    this.sessionStore = options?.sessionStore ?? new SessionStore(options?.dbPath ?? ":memory:");
    this.roomManager = new RoomManager({
      defaultMap: options?.defaultMap ?? MAP_SECTOR_07,
      defaultMaxPlayers: options?.maxPlayersPerRoom ?? 2,
    });
  }

  start(): Server<WSData> {
    if (this.server) {
      return this.server;
    }

    const self = this;

    this.server = Bun.serve<WSData>({
      port: this.portOption,
      fetch(req, server) {
        const url = new URL(req.url);

        if (url.pathname === "/health") {
          return Response.json({
            status: "ok",
            serverName: self.serverName,
            roomsCount: self.roomManager.getRoomsCount(),
            playersCount: self.roomManager.getTotalPlayersCount(),
          });
        }

        if (url.pathname === "/rooms") {
          return Response.json(self.roomManager.getRoomsSummary());
        }

        const upgraded = server.upgrade(req, {
          data: {},
        });
        if (upgraded) {
          return undefined;
        }

        return new Response("Not Found", { status: 404 });
      },
      websocket: {
        open(ws) {
          logger.debug("WebSocket connection established");
        },
        message(ws, raw) {
          self.handleMessage(ws, raw);
        },
        close(ws, code, reason) {
          self.handleClose(ws, code, reason);
        },
      },
    });

    logger.info(`Conquest server "${this.serverName}" running at http://localhost:${this.server.port}`);
    return this.server;
  }

  stop(closeActiveConnections: boolean = true) {
    if (this.server) {
      this.server.stop(closeActiveConnections);
      this.server = null;
      logger.info(`Conquest server stopped`);
    }
  }

  get port(): number {
    return this.server?.port ?? this.portOption;
  }

  get url(): URL | null {
    return this.server?.url ?? null;
  }

  private handleMessage(ws: ServerWebSocket<WSData>, raw: string | Buffer | ArrayBuffer) {
    const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      this.sendError(ws, "BAD_REQUEST", "Invalid JSON payload");
      return;
    }

    const parseResult = ClientMessageSchema.safeParse(parsed);
    if (!parseResult.success) {
      this.sendError(ws, "INVALID_MESSAGE", parseResult.error.message);
      return;
    }

    const msg = parseResult.data;
    switch (msg.type) {
      case "client:ping":
        this.send(ws, { type: "server:pong", timestamp: msg.timestamp });
        break;

      case "client:join":
        this.handleJoin(ws, msg);
        break;

      default:
        this.handleGameAction(ws, msg);
        break;
    }
  }

  private handleJoin(ws: ServerWebSocket<WSData>, msg: ClientJoin) {
    let session: SessionRecord | null = null;
    let room: GameRoom | undefined;

    // 1. If sessionToken provided, look up session
    if (msg.sessionToken) {
      session = this.sessionStore.get(msg.sessionToken);
      if (session && session.playerName !== msg.name) {
        logger.warn(
          `Session token belongs to "${session.playerName}", but join requested for "${msg.name}". Ignoring session token and treating as fresh join.`
        );
        session = null;
      }
    }

    // 2. Validate reconnection to existing active room
    if (session && session.roomCode) {
      if (!msg.roomCode || msg.roomCode.toUpperCase() === session.roomCode.toUpperCase()) {
        room = this.roomManager.getRoom(session.roomCode);
        if (room && room.hasPlayer(session.playerId)) {
          this.sessionStore.updateLastSeen(session.token, room.roomCode);

          ws.data.sessionToken = session.token;
          ws.data.playerId = session.playerId;
          ws.data.roomCode = room.roomCode;

          // Welcome handshake
          const welcome: ServerWelcome = {
            type: "server:welcome",
            sessionToken: session.token,
            playerId: session.playerId,
            serverName: this.serverName,
            roomCode: room.roomCode,
          };
          this.send(ws, welcome);

          // Reconnect player in room
          room.reconnectPlayer(session.playerId, ws);
          return;
        } else {
          logger.info(
            `Session room "${session.roomCode}" is no longer active for player "${session.playerName}". Proceeding with fresh join.`
          );
        }
      } else {
        logger.info(
          `Player "${session.playerName}" requested explicit room "${msg.roomCode}", bypassing previous session in room "${session.roomCode}". Proceeding with fresh join.`
        );
      }
    } else if (session && !session.roomCode) {
      logger.info(
        `Session for player "${session.playerName}" has no associated room. Proceeding with fresh join.`
      );
    }

    // 3. New player or fresh room join
    if (msg.roomCode) {
      room = this.roomManager.getOrCreateRoom(msg.roomCode);
    } else {
      room = this.roomManager.getOrCreateQuickMatchRoom();
    }

    const newSession = this.sessionStore.create(msg.name, room.roomCode);
    ws.data.sessionToken = newSession.token;
    ws.data.playerId = newSession.playerId;
    ws.data.roomCode = room.roomCode;

    // Send welcome handshake first
    const welcome: ServerWelcome = {
      type: "server:welcome",
      sessionToken: newSession.token,
      playerId: newSession.playerId,
      serverName: this.serverName,
      roomCode: room.roomCode,
    };
    this.send(ws, welcome);

    // Add player to room
    const addResult = room.addPlayer(newSession.playerId, msg.name, ws, newSession.token);
    if (!addResult.ok) {
      this.sendError(ws, "JOIN_FAILED", addResult.error ?? "Failed to join room");
    }
  }

  private handleGameAction(ws: ServerWebSocket<WSData>, msg: ClientMessage) {
    const { playerId, roomCode } = ws.data;
    if (!playerId || !roomCode) {
      this.sendError(ws, "UNAUTHORIZED", "Must join a room first");
      return;
    }

    const room = this.roomManager.getRoom(roomCode);
    if (!room) {
      this.sendError(ws, "ROOM_NOT_FOUND", `Room ${roomCode} not found`);
      return;
    }

    switch (msg.type) {
      case "client:ready":
        room.setReady(playerId, msg.ready);
        break;

      case "client:deploy": {
        const res = room.deploy(playerId, msg.territoryId, msg.count);
        if (!res.ok) {
          this.sendError(ws, "ACTION_FAILED", res.error);
        }
        break;
      }

      case "client:attack": {
        const res = room.attack(
          playerId,
          msg.sourceTerritoryId,
          msg.targetTerritoryId,
          msg.units
        );
        if (!res.ok) {
          this.sendError(ws, "ACTION_FAILED", res.error);
        }
        break;
      }

      case "client:fortify": {
        const res = room.fortify(
          playerId,
          msg.sourceTerritoryId,
          msg.targetTerritoryId,
          msg.units
        );
        if (!res.ok) {
          this.sendError(ws, "ACTION_FAILED", res.error);
        }
        break;
      }

      case "client:skip_phase": {
        const res = room.skipPhase(playerId);
        if (!res.ok) {
          this.sendError(ws, "ACTION_FAILED", res.error);
        }
        break;
      }

      case "client:end_turn": {
        const res = room.endTurn(playerId);
        if (!res.ok) {
          this.sendError(ws, "ACTION_FAILED", res.error);
        }
        break;
      }

      case "client:chat": {
        const res = room.chat(playerId, msg.text);
        if (!res.ok) {
          this.sendError(ws, "ACTION_FAILED", res.error);
        }
        break;
      }

      default:
        this.sendError(ws, "UNKNOWN_ACTION", "Unhandled message type");
        break;
    }
  }

  private handleClose(ws: ServerWebSocket<WSData>, code: number, reason: string) {
    const { playerId, roomCode } = ws.data;
    if (playerId && roomCode) {
      const room = this.roomManager.getRoom(roomCode);
      if (room) {
        room.disconnectPlayer(playerId, reason || "closed");
      }
    }
  }

  private send(ws: ServerWebSocket<WSData>, message: ServerMessage) {
    try {
      ws.send(JSON.stringify(message));
    } catch (err) {
      logger.error("Failed to send WebSocket message:", err);
    }
  }

  private sendError(ws: ServerWebSocket<WSData>, code: string, message: string) {
    const errorMsg: ServerError = {
      type: "server:error",
      code,
      message,
    };
    this.send(ws, errorMsg);
  }
}
