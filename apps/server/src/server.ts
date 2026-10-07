import type { Server, ServerWebSocket } from "bun";
import {
  ClientMessageSchema,
  RoomCodeSchema,
  PROTOCOL_VERSION,
  type ClientCreateRoom,
  type ClientJoin,
  type ClientMessage,
  type ServerError,
  type ServerMessage,
  type ServerWelcome,
} from "@conquest/protocol";
import { isActiveMatchPhase, type MapDefinition } from "@conquest/game-core";
import { getDefaultMap, getMap, listMaps } from "@conquest/map-engine";
import { logger, sanitizeDisplayText } from "@conquest/shared";
import { RoomManager, type GameRoom, type TimerScheduler } from "./room.js";
import { SessionStore, type SessionRecord } from "./session.js";

// Re-export so existing imports from server.ts continue to work.
export { isActiveMatchPhase };

export interface ConquestServerOptions {
  port?: number;
  serverName?: string;
  defaultMap?: MapDefinition;
  maxPlayersPerRoom?: number;
  sessionStore?: SessionStore;
  dbPath?: string;
  /** Maximum number of concurrent rooms (default 500) */
  maxRooms?: number;
  /** Grace period ms before forfeiting a disconnected active player's turn (default 60000, 0 = off) */
  disconnectGraceMs?: number;
  /** Per-turn time limit ms (default 0 = off) */
  turnTimeoutMs?: number;
  /** ms before abandoned active room is removed (default 600000) */
  abandonTimeoutMs?: number;
  /** Chat bucket capacity (max messages per window, default 5) */
  chatBucketCapacity?: number;
  /** Chat rate limit window ms (default 10000) */
  chatRefillMs?: number;
  /** WebSocket max payload bytes (default 16384) */
  maxPayloadLength?: number;
  /** Per-connection flood guard: max messages per second before closing (default 40) */
  floodGuardMsgPerSec?: number;
  /** Injectable timer scheduler for tests */
  scheduler?: TimerScheduler;
  /** Fixed RNG seed injected into every room created by this server (test/screenshot-only). */
  rngSeed?: Uint8Array;
}

export interface WSData {
  sessionToken?: string;
  playerId?: string;
  roomCode?: string;
  /** Per-second message count for flood guard */
  msgCount?: number;
  /** Start of the current 1-second flood window */
  msgWindowStart?: number;
}

export class ConquestServer {
  public readonly serverName: string;
  public readonly roomManager: RoomManager;
  public readonly sessionStore: SessionStore;

  private portOption: number;
  private server: Server<WSData> | null = null;
  private readonly maxPayloadLength: number;
  private readonly floodGuardMsgPerSec: number;

  constructor(options?: ConquestServerOptions) {
    this.portOption = options?.port ?? 4000;
    this.serverName = options?.serverName ?? "conquest.sh-server";
    this.sessionStore = options?.sessionStore ?? new SessionStore(options?.dbPath ?? ":memory:");
    this.maxPayloadLength = options?.maxPayloadLength ?? 16 * 1024;
    this.floodGuardMsgPerSec = options?.floodGuardMsgPerSec ?? 40;
    this.roomManager = new RoomManager({
      defaultMap: options?.defaultMap ?? getDefaultMap().definition,
      defaultMaxPlayers: options?.maxPlayersPerRoom ?? 4,
      maxRooms: options?.maxRooms ?? 500,
      disconnectGraceMs: options?.disconnectGraceMs,
      turnTimeoutMs: options?.turnTimeoutMs,
      abandonTimeoutMs: options?.abandonTimeoutMs,
      chatBucketCapacity: options?.chatBucketCapacity,
      chatRefillMs: options?.chatRefillMs,
      scheduler: options?.scheduler,
      rngSeed: options?.rngSeed,
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

        if (url.pathname === "/api/server") {
          return Response.json({
            serverName: self.serverName,
            protocolVersion: PROTOCOL_VERSION,
            roomsCount: self.roomManager.getRoomsCount(),
            playersCount: self.roomManager.getTotalPlayersCount(),
            defaultMap: self.roomManager.defaultMap.name,
            availableMaps: listMaps().map(({ definition }) => ({
              id: definition.id, name: definition.name,
              territoryCount: definition.territories.length,
              recommendedPlayers: definition.recommendedPlayers,
            })),
            maxPlayersPerRoom: self.roomManager.defaultMaxPlayers,
          });
        }

        if (url.pathname === "/api/rooms" || url.pathname === "/rooms") {
          return Response.json(self.roomManager.getPublicRoomsSummary());
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
        maxPayloadLength: self.maxPayloadLength,
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
    this.roomManager.dispose();
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
    // Per-connection flood guard
    const now = Date.now();
    const windowStart = ws.data.msgWindowStart ?? now;
    const elapsed = now - windowStart;
    if (elapsed < 1000) {
      ws.data.msgCount = (ws.data.msgCount ?? 0) + 1;
      if (ws.data.msgCount > this.floodGuardMsgPerSec) {
        ws.close(4008, "policy violation: flood");
        return;
      }
    } else {
      ws.data.msgCount = 1;
      ws.data.msgWindowStart = now;
    }

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

      case "client:leave_room":
        this.handleLeaveRoom(ws);
        break;

      case "client:join":
        this.handleJoin(ws, msg);
        break;

      case "client:create_room":
        this.handleCreateRoom(ws, msg);
        break;

      case "client:resync": {
        const { playerId, roomCode } = ws.data;
        if (playerId && roomCode) {
          const room = this.roomManager.getRoom(roomCode);
          if (room) {
            room.handleResync(playerId);
          }
        }
        break;
      }

      default:
        this.handleGameAction(ws, msg);
        break;
    }
  }

  private handleLeaveRoom(ws: ServerWebSocket<WSData>) {
    const { playerId, roomCode, sessionToken } = ws.data;
    if (playerId && roomCode) {
      const room = this.roomManager.getRoom(roomCode);
      if (room) {
        if (isActiveMatchPhase(room.state.phase)) {
          this.sendError(
            ws,
            "ACTION_FAILED",
            "Cannot leave room while match is in progress"
          );
          return;
        }
        room.disconnectPlayer(playerId, "left room");
        if (sessionToken) {
          this.sessionStore.clearRoom(sessionToken);
        }
        if (room.state.phase === "game_over" && room.connectedPlayersCount === 0) {
          this.roomManager.removeRoom(room.roomCode);
        }
      }
    }
    ws.data.roomCode = undefined;
    ws.data.playerId = undefined;
  }

  private handleJoin(ws: ServerWebSocket<WSData>, msg: ClientJoin) {
    // Sanitize player name
    let playerName: string;
    try {
      playerName = sanitizeDisplayText(msg.name);
    } catch {
      this.sendError(ws, "INVALID_NAME", "Player name is invalid or empty");
      return;
    }

    // If socket is already in an active match, reject immediately
    if (ws.data.roomCode && ws.data.playerId) {
      const currentRoom = this.roomManager.getRoom(ws.data.roomCode);
      if (currentRoom && isActiveMatchPhase(currentRoom.state.phase)) {
        this.sendError(
          ws,
          "ACTION_FAILED",
          "Cannot join another room while current match is in progress"
        );
        return;
      }
    }

    let session: SessionRecord | null = null;
    let room: GameRoom | undefined;

    // 1. If sessionToken provided, look up session
    if (msg.sessionToken) {
      session = this.sessionStore.get(msg.sessionToken);
      if (session && session.playerName !== playerName) {
        logger.warn(
          `Session token belongs to "${session.playerName}", but join requested for "${playerName}". Ignoring session token and treating as fresh join.`
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

          // Register the new socket FIRST so the room immediately starts
          // routing to it; then close the old socket.  This removes any
          // dependence on the async delivery order of the close event.
          const oldSocket = room.getPlayerSocket(session.playerId);
          room.reconnectPlayer(session.playerId, ws);

          // Welcome handshake
          const welcome: ServerWelcome = {
            type: "server:welcome",
            sessionToken: session.token,
            playerId: session.playerId,
            serverName: this.serverName,
            roomCode: room.roomCode,
          };
          this.send(ws, welcome);

          // Close any stale old socket after the new one is registered.
          if (oldSocket && oldSocket !== ws) {
            try {
              (oldSocket as ServerWebSocket<WSData>).close(4001, "superseded");
            } catch { /* ignore if already closed */ }
          }
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
      const cleanCode = msg.roomCode.trim().toUpperCase();
      const codeParsed = RoomCodeSchema.safeParse(cleanCode);
      if (!codeParsed.success) {
        this.sendError(
          ws,
          "INVALID_ROOM_CODE",
          "Room code must be exactly 4 uppercase alphanumeric characters"
        );
        return;
      }

      room = this.roomManager.getRoom(cleanCode);
      if (!room) {
        this.sendError(ws, "ROOM_NOT_FOUND", `Room ${cleanCode} not found`);
        return;
      }
    } else {
      this.sendError(ws, "INVALID_ROOM_CODE", "Choose a public game or enter a room code to join");
      return;
    }

    // 4. Validate joinability BEFORE creating/saving session or emitting server:welcome
    const joinCheck = room.canJoin();
    if (!joinCheck.ok) {
      this.sendError(ws, "JOIN_FAILED", joinCheck.error ?? "Failed to join room");
      return;
    }

    // 5. Player is validated as joinable! Detach from any existing lobby or game_over room before attaching to new room
    if (ws.data.roomCode && ws.data.playerId) {
      const currentRoom = this.roomManager.getRoom(ws.data.roomCode);
      if (
        currentRoom &&
        currentRoom.roomCode !== room.roomCode &&
        (currentRoom.state.phase === "lobby" || currentRoom.state.phase === "game_over")
      ) {
        currentRoom.disconnectPlayer(ws.data.playerId, "switching rooms");
        if (ws.data.sessionToken) {
          this.sessionStore.clearRoom(ws.data.sessionToken);
        }
        if (currentRoom.state.phase === "game_over" && currentRoom.connectedPlayersCount === 0) {
          this.roomManager.removeRoom(currentRoom.roomCode);
        }
      }
      ws.data.roomCode = undefined;
      ws.data.playerId = undefined;
    }

    const newSession = this.sessionStore.create(playerName, room.roomCode);
    ws.data.sessionToken = newSession.token;
    ws.data.playerId = newSession.playerId;
    ws.data.roomCode = room.roomCode;

    // Send welcome handshake
    const welcome: ServerWelcome = {
      type: "server:welcome",
      sessionToken: newSession.token,
      playerId: newSession.playerId,
      serverName: this.serverName,
      roomCode: room.roomCode,
    };
    this.send(ws, welcome);

    // Add player to room
    room.addPlayer(newSession.playerId, playerName, ws, newSession.token);
  }

  private handleCreateRoom(ws: ServerWebSocket<WSData>, msg: ClientCreateRoom) {
    const botCount = msg.botCount ?? 0;
    if (!Number.isInteger(botCount) || botCount < 0 || botCount > 5 || botCount > msg.maxPlayers - 1) {
      this.sendError(ws, "INVALID_BOT_COUNT", "Bot count must leave at least one human seat");
      return;
    }
    const requestedMap = msg.mapId ? getMap(msg.mapId) : undefined;
    if (msg.mapId && !requestedMap) {
      this.sendError(ws, "UNKNOWN_MAP", `Unknown map: ${msg.mapId}`);
      return;
    }
    if (ws.data.roomCode && ws.data.playerId) {
      const currentRoom = this.roomManager.getRoom(ws.data.roomCode);
      if (currentRoom && isActiveMatchPhase(currentRoom.state.phase)) {
        this.sendError(
          ws,
          "ACTION_FAILED",
          "Cannot create another room while current match is in progress"
        );
        return;
      }
      if (currentRoom && (currentRoom.state.phase === "lobby" || currentRoom.state.phase === "game_over")) {
        currentRoom.disconnectPlayer(ws.data.playerId, "switching rooms");
        if (ws.data.sessionToken) {
          this.sessionStore.clearRoom(ws.data.sessionToken);
        }
        if (currentRoom.state.phase === "game_over" && currentRoom.connectedPlayersCount === 0) {
          this.roomManager.removeRoom(currentRoom.roomCode);
        }
      }
      ws.data.roomCode = undefined;
      ws.data.playerId = undefined;
    }

    // Sanitize player name and room display name
    let creatorName: string;
    try {
      creatorName = sanitizeDisplayText(msg.playerName);
    } catch {
      this.sendError(ws, "INVALID_NAME", "Player name is invalid or empty");
      return;
    }
    let roomDisplayName: string | undefined;
    if (msg.displayName) {
      try {
        roomDisplayName = sanitizeDisplayText(msg.displayName);
      } catch {
        this.sendError(ws, "INVALID_ROOM_NAME", "Room display name is invalid or empty");
        return;
      }
    }

    const room = this.roomManager.createCustomRoom({
      displayName: roomDisplayName,
      visibility: msg.visibility,
      maxPlayers: msg.maxPlayers,
      botCount,
      map: requestedMap?.definition,
      cardMode: msg.cardMode,
    });
    if (!room) {
      this.sendError(ws, "SERVER_FULL", "Server has reached the maximum number of rooms");
      return;
    }

    const newSession = this.sessionStore.create(creatorName, room.roomCode);
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
    room.addPlayer(newSession.playerId, creatorName, ws, newSession.token);
    if (botCount > 0) room.addBots(botCount);
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
        if (room.state.phase !== "lobby") {
          this.sendError(ws, "ACTION_FAILED", "Ready can only be set in lobby");
          return;
        }
        room.setReady(playerId, msg.ready);
        break;

      case "client:rematch":
        if (room.state.phase !== "game_over") {
          this.sendError(ws, "ACTION_FAILED", "Rematch can only be requested after game over");
          return;
        }
        room.setRematchReady(playerId, msg.ready);
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

      case "client:complete_conquest_move": {
        const res = room.completeConquestMove(playerId, msg.units);
        if (!res.ok) this.sendError(ws, "ACTION_FAILED", res.error);
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
        let chatText: string;
        try {
          chatText = sanitizeDisplayText(msg.text);
        } catch {
          this.sendError(ws, "INVALID_MESSAGE", "Chat text is empty or invalid");
          break;
        }
        const res = room.chat(playerId, chatText);
        if (!res.ok) {
          // Surface rate limit distinctly
          const code = res.error === "RATE_LIMITED" ? "RATE_LIMITED" : "ACTION_FAILED";
          this.sendError(ws, code, res.error === "RATE_LIMITED" ? "Chat rate limit exceeded" : res.error);
        }
        break;
      }

      case "client:trade_cards": {
        const cardIds = msg.cardIds as [string, string, string];
        const res = room.tradeCards(playerId, cardIds);
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
    const { playerId, roomCode, sessionToken } = ws.data;
    if (playerId && roomCode) {
      const room = this.roomManager.getRoom(roomCode);
      if (room) {
        // Stale-socket race fix: only disconnect if this socket is still the
        // registered one. If the player has already reconnected on a new socket,
        // the old socket closing must not shadow the new registration.
        const registeredSocket = room.getPlayerSocket(playerId);
        if (registeredSocket !== ws) {
          logger.debug(
            `Ignoring stale socket close for player ${playerId} in room ${roomCode} (already reconnected)`
          );
          return;
        }
        room.disconnectPlayer(playerId, reason || "closed");
        if ((room.state.phase === "lobby" || room.state.phase === "game_over") && sessionToken) {
          this.sessionStore.clearRoom(sessionToken);
        }
        if (room.state.phase === "game_over" && room.connectedPlayersCount === 0) {
          this.roomManager.removeRoom(room.roomCode);
        }
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
