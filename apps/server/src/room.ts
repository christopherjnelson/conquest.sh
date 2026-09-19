import type {
  GameEvent,
  GameState,
  Player,
  Sector,
  ServerEvent,
  ServerMessage,
  ServerSnapshot,
  RoomSummary,
  RoomVisibility,
  RoomKind,
} from "@conquest/protocol";
import {
  attackTerritory,
  createInitialGameState,
  deployUnits,
  endTurn,
  fortifyUnits,
  skipPhase,
  type ActionResult,
  type MapDefinition,
} from "@conquest/game-core";
import { MAP_GRID_IRONREACH, MAP_IRONREACH } from "@conquest/map-engine";
import { generateId, generateRoomCode, getPlayerColor, logger } from "@conquest/shared";

export interface RoomSocket {
  send(data: string): void;
  close?(code?: number, reason?: string): void;
}

export interface GameRoomOptions {
  roomCode: string;
  displayName?: string;
  gameId?: string;
  maxPlayers?: number;
  map?: MapDefinition;
  autoStart?: boolean;
  visibility?: RoomVisibility;
  kind?: RoomKind;
  createdAt?: number;
}

export interface RoomPlayerSummary {
  id: string;
  name: string;
  connected: boolean;
  ready: boolean;
  colorIndex: number;
  colorHex: string;
}

export class GameRoom {
  public readonly roomCode: string;
  public readonly displayName: string;
  public readonly gameId: string;
  public readonly maxPlayers: number;
  public readonly map: MapDefinition;
  public readonly autoStart: boolean;
  public readonly visibility: RoomVisibility;
  public readonly kind: RoomKind;
  public readonly createdAt: number;

  public state: GameState;
  private playerSockets = new Map<string, RoomSocket>();
  private playerTokens = new Map<string, string>();

  constructor(options: GameRoomOptions) {
    this.roomCode = options.roomCode.toUpperCase();
    this.kind = options.kind ?? "quick";
    this.displayName =
      options.displayName?.trim() ||
      (this.kind === "quick" ? `Quick Match ${this.roomCode}` : `Room ${this.roomCode}`);
    this.gameId = options.gameId ?? generateId("game");
    this.maxPlayers = Math.max(2, Math.min(6, options.maxPlayers ?? (this.kind === "quick" ? 2 : 4)));
    this.map = options.map ?? MAP_GRID_IRONREACH;
    this.autoStart = options.autoStart ?? (this.kind === "quick");
    this.visibility = options.visibility ?? "public";
    this.createdAt = options.createdAt ?? Date.now();

    const initialSectors: Record<string, Sector> = {};
    for (const s of this.map.sectors) {
      initialSectors[s.id] = { ...s };
    }

    this.state = {
      gameId: this.gameId,
      roomCode: this.roomCode,
      turnNumber: 0,
      activePlayerIndex: 0,
      phase: "lobby",
      players: [],
      territories: {},
      sectors: initialSectors,
      pendingReinforcements: 0,
      hasConqueredThisTurn: false,
      winnerId: null,
      history: [],
    };
  }

  get playerCount(): number {
    return this.state.players.length;
  }

  get connectedPlayersCount(): number {
    return this.state.players.filter((p) => p.connected).length;
  }

  get isFull(): boolean {
    return this.state.players.length >= this.maxPlayers;
  }

  hasPlayer(playerId: string): boolean {
    return this.state.players.some((p) => p.id === playerId);
  }

  getPlayer(playerId: string): Player | undefined {
    return this.state.players.find((p) => p.id === playerId);
  }

  getPlayerToken(playerId: string): string | undefined {
    return this.playerTokens.get(playerId);
  }

  /**
   * Checks whether a player can join or reconnect to this room.
   */
  canJoin(playerId?: string): { ok: boolean; error?: string } {
    if (playerId && this.hasPlayer(playerId)) {
      return { ok: true };
    }

    if (this.state.phase !== "lobby") {
      return { ok: false, error: "Game already in progress" };
    }

    if (this.state.players.length >= this.maxPlayers) {
      return { ok: false, error: "Room is full" };
    }

    return { ok: true };
  }

  /**
   * Add a new player to the room, or reconnect if they already exist in this room.
   */
  addPlayer(
    playerId: string,
    name: string,
    socket: RoomSocket,
    sessionToken?: string
  ): { ok: boolean; error?: string } {
    // If player is already registered in this room, treat as reconnect
    if (this.hasPlayer(playerId)) {
      const reconnected = this.reconnectPlayer(playerId, socket);
      return { ok: reconnected, error: reconnected ? undefined : "Player reconnect failed" };
    }

    const joinCheck = this.canJoin(playerId);
    if (!joinCheck.ok) {
      return joinCheck;
    }

    const colorIndex = this.state.players.length;
    const colorDef = getPlayerColor(colorIndex);

    const player: Player = {
      id: playerId,
      name,
      colorIndex,
      colorHex: colorDef.hex,
      connected: true,
      isAlive: true,
      ready: false,
    };

    this.state.players.push(player);
    this.playerSockets.set(playerId, socket);
    if (sessionToken) {
      this.playerTokens.set(playerId, sessionToken);
    }

    const event: GameEvent = {
      type: "player_joined",
      player,
      timestamp: Date.now(),
    };
    this.state.history.push(event);

    // Notify other players that a player joined
    this.broadcastEvent(event, this.state, playerId);

    logger.info(`Player ${name} (${playerId}) joined room ${this.roomCode}`);

    // Auto-start game if conditions are met (quick match only)
    if (this.autoStart && this.kind === "quick" && this.state.players.length >= this.maxPlayers) {
      this.startGame();
    } else {
      // Send lobby snapshot to joining player
      this.sendSnapshot(playerId);
    }

    return { ok: true };
  }

  /**
   * Mark player ready. If all connected players ready and at least 2 players present, start game.
   * If readiness changes and game does not start, broadcast updated lobby state.
   */
  setReady(playerId: string, ready: boolean): boolean {
    const player = this.getPlayer(playerId);
    if (!player) return false;

    player.ready = ready;

    if (this.state.phase === "lobby") {
      const connectedPlayers = this.state.players.filter((p) => p.connected);
      const allReady = connectedPlayers.length >= 2 && connectedPlayers.every((p) => p.ready);
      if (allReady) {
        this.startGame();
        return true;
      }
      // Broadcast updated lobby snapshot so all players see readiness changes
      this.broadcastSnapshot();
    }

    return true;
  }

  /**
   * Start the match authoritative state transition.
   * Only connected players participate in the starting match.
   */
  startGame(): boolean {
    if (this.state.phase !== "lobby") return false;
    const activePlayers = this.state.players.filter((p) => p.connected);
    if (activePlayers.length < 2) return false;

    const initialState = createInitialGameState(
      this.gameId,
      this.roomCode,
      activePlayers,
      this.map,
      3
    );

    this.state = initialState;

    // Broadcast state transition events
    for (const event of initialState.history) {
      this.broadcastEvent(event, this.state);
    }

    // Broadcast full snapshot with assigned player identities to all sockets
    this.broadcastSnapshot();

    logger.info(
      `Game started in room ${this.roomCode} with ${activePlayers.length} players. Active player: ${activePlayers[0].name}`
    );
    return true;
  }

  /**
   * Reconnect an existing player.
   */
  reconnectPlayer(playerId: string, socket: RoomSocket): boolean {
    const player = this.getPlayer(playerId);
    if (!player) return false;

    player.connected = true;
    this.playerSockets.set(playerId, socket);

    const event: GameEvent = {
      type: "player_reconnected",
      playerId,
      timestamp: Date.now(),
    };
    this.state.history.push(event);

    // Broadcast reconnection event to other players
    this.broadcastEvent(event, this.state, playerId);

    // Send full snapshot to the reconnecting player
    this.sendSnapshot(playerId);

    logger.info(`Player ${player.name} (${playerId}) reconnected to room ${this.roomCode}`);
    return true;
  }

  /**
   * Mark a player as disconnected or remove them if still in lobby.
   */
  disconnectPlayer(playerId: string, reason?: string) {
    const player = this.getPlayer(playerId);
    if (!player) return;

    if (this.state.phase === "lobby") {
      // Before game start, free the lobby seat rather than leaving a ghost player
      this.state.players = this.state.players.filter((p) => p.id !== playerId);
      this.playerSockets.delete(playerId);
      this.playerTokens.delete(playerId);

      const event: GameEvent = {
        type: "player_left",
        playerId,
        reason: reason ?? "left lobby",
        timestamp: Date.now(),
      };
      this.state.history.push(event);

      // Broadcast event and updated snapshot to remaining players in lobby
      this.broadcastEvent(event, this.state);
      this.broadcastSnapshot();

      logger.info(`Player ${player.name} (${playerId}) left lobby ${this.roomCode} (seat freed)`);
      return;
    }

    // During an active game, retain disconnected player for reconnect
    player.connected = false;
    this.playerSockets.delete(playerId);

    const event: GameEvent = {
      type: "player_left",
      playerId,
      reason: reason ?? "client disconnected",
      timestamp: Date.now(),
    };
    this.state.history.push(event);

    // Broadcast player_left to remaining connected players
    this.broadcastEvent(event, this.state);

    logger.info(`Player ${player.name} (${playerId}) disconnected from room ${this.roomCode}`);
  }

  removePlayer(playerId: string, reason?: string) {
    this.disconnectPlayer(playerId, reason ?? "removed");
  }

  /**
   * Authoritative deploy action.
   */
  deploy(
    playerId: string,
    territoryId: string,
    count: number
  ): ActionResult<{ remainingReinforcements: number }> {
    const result = deployUnits(this.state, playerId, territoryId, count);
    if (result.ok) {
      this.state = result.state;
      for (const event of result.events) {
        this.broadcastEvent(event, this.state);
      }
    }
    return result;
  }

  /**
   * Authoritative attack action.
   */
  attack(
    playerId: string,
    sourceId: string,
    targetId: string,
    units?: number
  ): ActionResult<{
    attackerRolls: number[];
    defenderRolls: number[];
    attackerLosses: number;
    defenderLosses: number;
    conquered: boolean;
  }> {
    const result = attackTerritory(this.state, playerId, sourceId, targetId, units);
    if (result.ok) {
      this.state = result.state;
      for (const event of result.events) {
        this.broadcastEvent(event, this.state);
      }
    }
    return result;
  }

  /**
   * Authoritative fortify action.
   */
  fortify(
    playerId: string,
    sourceId: string,
    targetId: string,
    units: number
  ): ActionResult<void> {
    const result = fortifyUnits(this.state, playerId, sourceId, targetId, units);
    if (result.ok) {
      this.state = result.state;
      for (const event of result.events) {
        this.broadcastEvent(event, this.state);
      }
    }
    return result;
  }

  /**
   * Authoritative skip phase action.
   */
  skipPhase(playerId: string): ActionResult<void> {
    const result = skipPhase(this.state, playerId);
    if (result.ok) {
      this.state = result.state;
      for (const event of result.events) {
        this.broadcastEvent(event, this.state);
      }
    }
    return result;
  }

  /**
   * Authoritative end turn action.
   */
  endTurn(playerId: string): ActionResult<void> {
    const result = endTurn(this.state, playerId);
    if (result.ok) {
      this.state = result.state;
      for (const event of result.events) {
        this.broadcastEvent(event, this.state);
      }
    }
    return result;
  }

  /**
   * Authoritative chat action.
   */
  chat(playerId: string, text: string): ActionResult<{ event: GameEvent }> {
    const player = this.getPlayer(playerId);
    if (!player) {
      return { ok: false, error: "Player not found in room" };
    }

    const event: GameEvent = {
      type: "chat_message",
      senderId: playerId,
      senderName: player.name,
      channel: "game",
      text,
      timestamp: Date.now(),
    };
    this.state.history.push(event);
    this.broadcastEvent(event, this.state);

    return { ok: true, state: this.state, events: [event], data: { event } };
  }

  /**
   * Broadcast a ServerMessage to sockets in this room.
   */
  broadcast(message: ServerMessage, excludePlayerId?: string) {
    const payload = JSON.stringify(message);
    for (const [pId, socket] of this.playerSockets.entries()) {
      if (excludePlayerId && pId === excludePlayerId) continue;
      try {
        socket.send(payload);
      } catch (err) {
        logger.error(`Error sending message to player ${pId} in room ${this.roomCode}:`, err);
      }
    }
  }

  /**
   * Broadcast a server:event message to connected sockets.
   */
  broadcastEvent(event: GameEvent, state?: GameState, excludePlayerId?: string) {
    const message: ServerEvent = {
      type: "server:event",
      event,
      state,
    };
    this.broadcast(message, excludePlayerId);
  }

  /**
   * Broadcast full server:snapshot to all connected sockets in this room.
   */
  broadcastSnapshot() {
    for (const [pId, socket] of this.playerSockets.entries()) {
      const message: ServerSnapshot = {
        type: "server:snapshot",
        state: this.state,
        myPlayerId: pId,
      };
      try {
        socket.send(JSON.stringify(message));
      } catch (err) {
        logger.error(`Error sending snapshot to player ${pId} in room ${this.roomCode}:`, err);
      }
    }
  }

  /**
   * Send full server:snapshot to a specific player.
   */
  sendSnapshot(playerId: string) {
    const socket = this.playerSockets.get(playerId);
    if (!socket) return;

    const message: ServerSnapshot = {
      type: "server:snapshot",
      state: this.state,
      myPlayerId: playerId,
    };
    try {
      socket.send(JSON.stringify(message));
    } catch (err) {
      logger.error(`Error sending snapshot to player ${playerId} in room ${this.roomCode}:`, err);
    }
  }

  /**
   * Returns a lightweight summary of room status matching @conquest/protocol RoomSummary.
   */
  getSummary(): RoomSummary {
    return {
      roomCode: this.roomCode,
      displayName: this.displayName,
      visibility: this.visibility,
      kind: this.kind,
      phase: this.state.phase,
      playersCount: this.state.players.length,
      maxPlayers: this.maxPlayers,
      mapId: this.map.id,
      mapName: this.map.name,
      turnNumber: this.state.turnNumber,
      createdAt: this.createdAt,
    };
  }
}

export class RoomManager {
  private rooms = new Map<string, GameRoom>();
  public readonly defaultMap: MapDefinition;
  public readonly defaultMaxPlayers: number;

  constructor(options?: { defaultMap?: MapDefinition; defaultMaxPlayers?: number }) {
    this.defaultMap = options?.defaultMap ?? MAP_GRID_IRONREACH;
    this.defaultMaxPlayers = options?.defaultMaxPlayers ?? 4;
  }

  getRoom(roomCode: string): GameRoom | undefined {
    return this.rooms.get(roomCode.toUpperCase());
  }

  createRoom(options: GameRoomOptions): GameRoom {
    const code = options.roomCode.toUpperCase();
    if (this.rooms.has(code)) {
      return this.rooms.get(code)!;
    }
    const room = new GameRoom({
      map: this.defaultMap,
      ...options,
      roomCode: code,
    });
    this.rooms.set(code, room);
    return room;
  }

  createCustomRoom(options?: {
    displayName?: string;
    visibility?: RoomVisibility;
    maxPlayers?: number;
    map?: MapDefinition;
  }): GameRoom {
    let code: string;
    do {
      code = generateRoomCode();
    } while (this.rooms.has(code));

    const room = new GameRoom({
      roomCode: code,
      displayName: options?.displayName?.trim() || `Room ${code}`,
      visibility: options?.visibility ?? "public",
      kind: "custom",
      autoStart: false,
      maxPlayers: options?.maxPlayers ?? 4,
      map: options?.map ?? this.defaultMap,
    });
    this.rooms.set(code, room);
    return room;
  }

  getOrCreateRoom(roomCode: string, options?: Partial<GameRoomOptions>): GameRoom {
    const code = roomCode.toUpperCase();
    let room = this.rooms.get(code);
    if (!room) {
      room = new GameRoom({
        roomCode: code,
        map: options?.map ?? this.defaultMap,
        maxPlayers: options?.maxPlayers ?? this.defaultMaxPlayers,
        autoStart: options?.autoStart ?? true,
        ...options,
      });
      this.rooms.set(code, room);
    }
    return room;
  }

  getOrCreateQuickMatchRoom(): GameRoom {
    // Find an existing public quick match room in lobby phase with open slot
    for (const room of this.rooms.values()) {
      if (
        room.kind === "quick" &&
        room.visibility === "public" &&
        room.state.phase === "lobby" &&
        room.playerCount < room.maxPlayers
      ) {
        return room;
      }
    }

    // Otherwise create a new public quick-match room
    let code: string;
    do {
      code = generateRoomCode();
    } while (this.rooms.has(code));

    const room = new GameRoom({
      roomCode: code,
      displayName: `Quick Match ${code}`,
      kind: "quick",
      visibility: "public",
      autoStart: true,
      maxPlayers: 2,
      map: this.defaultMap,
    });
    this.rooms.set(code, room);
    return room;
  }

  removeRoom(roomCode: string): boolean {
    return this.rooms.delete(roomCode.toUpperCase());
  }

  getRoomsCount(): number {
    return this.rooms.size;
  }

  getTotalPlayersCount(): number {
    let total = 0;
    for (const room of this.rooms.values()) {
      total += room.connectedPlayersCount;
    }
    return total;
  }

  getRoomsSummary(): RoomSummary[] {
    return Array.from(this.rooms.values()).map((r) => r.getSummary());
  }

  getPublicRoomsSummary(): RoomSummary[] {
    return Array.from(this.rooms.values())
      .filter((r) => r.visibility === "public")
      .map((r) => r.getSummary());
  }

  findRoomByPlayerId(playerId: string): GameRoom | undefined {
    for (const room of this.rooms.values()) {
      if (room.hasPlayer(playerId)) {
        return room;
      }
    }
    return undefined;
  }
}
