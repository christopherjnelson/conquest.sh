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
  completeConquestMove,
  createInitialGameState,
  deployUnits,
  endTurn,
  forfeitTurn,
  fortifyUnits,
  skipPhase,
  type ActionResult,
  type MapDefinition,
} from "@conquest/game-core";
import { getDefaultMap } from "@conquest/map-engine";
import { generateId, generateRoomCode, getPlayerColor, logger } from "@conquest/shared";

/** Minimal timer abstraction for testability. */
export interface TimerScheduler {
  setTimeout(fn: () => void, ms: number): ReturnType<typeof setTimeout>;
  clearTimeout(id: ReturnType<typeof setTimeout>): void;
}

const defaultScheduler: TimerScheduler = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
};

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
  onDeserted?: (roomCode: string) => void;
  /** ms to wait before forfeiting a disconnected active player's turn (0 = disabled) */
  disconnectGraceMs?: number;
  /** per-turn time limit in ms (0 = disabled) */
  turnTimeoutMs?: number;
  /** ms before removing a room where everyone is disconnected (0 = disabled) */
  abandonTimeoutMs?: number;
  /** injectable timer for tests */
  scheduler?: TimerScheduler;
  /** chat rate limit: max messages per window */
  chatBucketCapacity?: number;
  /** chat rate limit: refill window in ms */
  chatRefillMs?: number;
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
  public gameId: string;
  public matchNumber: number = 1;
  public readonly maxPlayers: number;
  public readonly map: MapDefinition;
  public readonly autoStart: boolean;
  public readonly visibility: RoomVisibility;
  public readonly kind: RoomKind;
  public readonly createdAt: number;
  public onDeserted?: (roomCode: string) => void;

  public state: GameState;
  private playerSockets = new Map<string, RoomSocket>();
  private playerTokens = new Map<string, string>();

  // Timer configuration
  private readonly disconnectGraceMs: number;
  private readonly turnTimeoutMs: number;
  private readonly abandonTimeoutMs: number;
  private readonly scheduler: TimerScheduler;

  // Active timers
  private disconnectForfeitTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private turnTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private abandonTimer: ReturnType<typeof setTimeout> | null = null;

  // Chat rate limiting: per-player token buckets
  private chatBuckets = new Map<string, { tokens: number; lastRefill: number }>();
  public readonly chatBucketCapacity: number;
  public readonly chatRefillMs: number;

  constructor(options: GameRoomOptions) {
    this.roomCode = options.roomCode.toUpperCase();
    this.kind = options.kind ?? "custom";
    this.displayName =
      options.displayName?.trim() ||
      `Room ${this.roomCode}`;
    this.gameId = options.gameId ?? generateId("game");
    this.maxPlayers = Math.max(2, Math.min(6, options.maxPlayers ?? 4));
    this.map = options.map ?? getDefaultMap().definition;
    this.autoStart = options.autoStart ?? false;
    this.visibility = options.visibility ?? "public";
    this.createdAt = options.createdAt ?? Date.now();
    this.onDeserted = options.onDeserted;
    this.disconnectGraceMs = options.disconnectGraceMs ?? 60_000;
    this.turnTimeoutMs = options.turnTimeoutMs ?? 0;
    this.abandonTimeoutMs = options.abandonTimeoutMs ?? 600_000;
    this.scheduler = options.scheduler ?? defaultScheduler;
    this.chatBucketCapacity = options.chatBucketCapacity ?? 5;
    this.chatRefillMs = options.chatRefillMs ?? 10_000;

    const initialSectors: Record<string, Sector> = {};
    for (const s of this.map.sectors) {
      initialSectors[s.id] = { ...s };
    }

    this.state = {
      gameId: this.gameId,
      mapId: this.map.id,
      roomCode: this.roomCode,
      turnNumber: 0,
      activePlayerIndex: 0,
      phase: "lobby",
      players: [],
      territories: {},
      sectors: initialSectors,
      pendingReinforcements: 0,
      pendingConquestMove: null,
      hasConqueredThisTurn: false,
      winnerId: null,
      result: null,
      matchNumber: 1,
      startedAt: this.createdAt,
      endedAt: null,
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
      rematchReady: false,
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

    // Custom rooms begin only after participating players explicitly ready.
    if (this.autoStart && this.state.players.length >= this.maxPlayers) {
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
    if (this.state.phase !== "lobby") return false;
    const player = this.getPlayer(playerId);
    if (!player) return false;

    player.ready = ready;

    const connectedPlayers = this.state.players.filter((p) => p.connected);
    const allReady = connectedPlayers.length >= 2 && connectedPlayers.every((p) => p.ready);
    if (allReady) {
      this.startGame();
      return true;
    }
    // Broadcast updated lobby snapshot so all players see readiness changes
    this.broadcastSnapshot();

    return true;
  }

  /**
   * Toggle rematch readiness for a player during game_over phase.
   * Rematch starts when at least 2 players are connected and all connected players agree.
   */
  setRematchReady(playerId: string, ready: boolean): boolean {
    if (this.state.phase !== "game_over") return false;
    const player = this.getPlayer(playerId);
    if (!player) return false;

    player.rematchReady = ready;

    const connectedPlayers = this.state.players.filter((p) => p.connected);
    const readyCount = connectedPlayers.filter((p) => p.rematchReady).length;
    const requiredCount = connectedPlayers.length;

    const event: GameEvent = {
      type: "rematch_ready_changed",
      playerId,
      rematchReady: ready,
      readyCount,
      requiredCount,
      timestamp: Date.now(),
    };
    this.state.history.push(event);
    this.broadcastEvent(event, this.state);
    this.broadcastSnapshot();

    const allRematchReady =
      connectedPlayers.length >= 2 &&
      connectedPlayers.every((p) => p.rematchReady === true);

    if (allRematchReady) {
      this.startRematch();
    }

    return true;
  }

  /**
   * Start a rematch authoritative state transition.
   * Increments matchNumber, rotates starting player, redistributes territories,
   * generates fresh gameId, resets player statuses and history.
   */
  startRematch(): boolean {
    if (this.state.phase !== "game_over") return false;
    const connectedPlayers = this.state.players.filter((p) => p.connected);
    if (connectedPlayers.length < 2) return false;

    // Drop disconnected players from registration
    for (const p of this.state.players) {
      if (!p.connected) {
        this.playerSockets.delete(p.id);
        this.playerTokens.delete(p.id);
      }
    }

    this.matchNumber += 1;
    this.gameId = generateId("game");

    const participatingPlayers: Player[] = connectedPlayers.map((p, index) => {
      const colorDef = getPlayerColor(index);
      return {
        ...p,
        colorIndex: index,
        colorHex: colorDef.hex,
        isAlive: true,
        ready: false,
        rematchReady: false,
      };
    });

    const initialState = createInitialGameState(
      this.gameId,
      this.roomCode,
      participatingPlayers,
      this.map,
      3,
      undefined,
      this.matchNumber
    );

    const activePlayer = initialState.players[initialState.activePlayerIndex];
    const rematchEvent: GameEvent = {
      type: "rematch_started",
      gameId: this.gameId,
      matchNumber: this.matchNumber,
      startingPlayerId: activePlayer.id,
      timestamp: initialState.startedAt ?? Date.now(),
    };

    initialState.history.unshift(rematchEvent);
    this.state = initialState;

    for (const event of this.state.history) {
      this.broadcastEvent(event, this.state);
    }
    this.broadcastSnapshot();

    // Clear all timers from previous match and start fresh
    this.clearAllTimers();
    this.scheduleTurnTimeout();

    logger.info(
      `Rematch #${this.matchNumber} started in room ${this.roomCode} with ${participatingPlayers.length} players. Active player: ${activePlayer.name}`
    );
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

    this.matchNumber = 1;
    const initialState = createInitialGameState(
      this.gameId,
      this.roomCode,
      activePlayers,
      this.map,
      3,
      undefined,
      1
    );

    this.state = initialState;

    // Broadcast state transition events
    for (const event of initialState.history) {
      this.broadcastEvent(event, this.state);
    }

    // Broadcast full snapshot with assigned player identities to all sockets
    this.broadcastSnapshot();

    // Start per-turn timeout if configured
    this.scheduleTurnTimeout();

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

    // Cancel any pending disconnect forfeit timer for this player
    this.cancelDisconnectForfeit(playerId);
    // Cancel abandon timer since someone is back
    this.cancelAbandonTimer();

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

    // If this player was the active player and we have a turn timeout, restart it
    const activePlayer = this.state.players[this.state.activePlayerIndex];
    if (activePlayer?.id === playerId) {
      this.scheduleTurnTimeout();
    }

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

    if (this.state.phase === "game_over") {
      player.connected = false;
      player.rematchReady = false;
      this.playerSockets.delete(playerId);

      const event: GameEvent = {
        type: "player_left",
        playerId,
        reason: reason ?? "left finished room",
        timestamp: Date.now(),
      };
      this.state.history.push(event);

      this.broadcastEvent(event, this.state);
      this.broadcastSnapshot();

      logger.info(`Player ${player.name} (${playerId}) left finished room ${this.roomCode}`);

      const connected = this.state.players.filter((p) => p.connected);
      if (connected.length >= 2 && connected.every((p) => p.rematchReady)) {
        this.startRematch();
      }

      if (connected.length === 0) {
        this.onDeserted?.(this.roomCode);
      }
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

    // Schedule disconnect forfeit if this player is the active player
    const activePlayer = this.state.players[this.state.activePlayerIndex];
    if (activePlayer?.id === playerId && this.disconnectGraceMs > 0) {
      this.scheduleDisconnectForfeit(playerId);
    }

    // Schedule room abandonment if all players are now disconnected
    const connectedCount = this.state.players.filter((p) => p.connected).length;
    if (connectedCount === 0 && this.abandonTimeoutMs > 0) {
      this.scheduleAbandonTimer();
    }
  }

  removePlayer(playerId: string, reason?: string) {
    this.disconnectPlayer(playerId, reason ?? "removed");
  }

  // ---------------------------------------------------------------------------
  // Timer management
  // ---------------------------------------------------------------------------

  /** Schedule a forfeit for a disconnected active player after the grace period. */
  private scheduleDisconnectForfeit(playerId: string) {
    this.cancelDisconnectForfeit(playerId);
    const timer = this.scheduler.setTimeout(() => {
      this.disconnectForfeitTimers.delete(playerId);
      this.executeForfeit(playerId, "disconnected");
    }, this.disconnectGraceMs);
    this.disconnectForfeitTimers.set(playerId, timer);
  }

  /** Cancel a pending disconnect forfeit for a player. */
  private cancelDisconnectForfeit(playerId: string) {
    const existing = this.disconnectForfeitTimers.get(playerId);
    if (existing !== undefined) {
      this.scheduler.clearTimeout(existing);
      this.disconnectForfeitTimers.delete(playerId);
    }
  }

  /** Schedule the per-turn timeout (if configured). Clears any existing timer first. */
  scheduleTurnTimeout() {
    this.cancelTurnTimeout();
    if (this.turnTimeoutMs <= 0) return;
    const activePlayer = this.state.players[this.state.activePlayerIndex];
    if (!activePlayer?.isAlive) return;
    const deadline = Date.now() + this.turnTimeoutMs;
    this.state = { ...this.state, turnDeadlineAt: deadline };
    this.turnTimeoutTimer = this.scheduler.setTimeout(() => {
      this.turnTimeoutTimer = null;
      const ap = this.state.players[this.state.activePlayerIndex];
      if (ap) this.executeForfeit(ap.id, "timeout");
    }, this.turnTimeoutMs);
  }

  /** Cancel the per-turn timeout timer. */
  private cancelTurnTimeout() {
    if (this.turnTimeoutTimer !== null) {
      this.scheduler.clearTimeout(this.turnTimeoutTimer);
      this.turnTimeoutTimer = null;
    }
    this.state = { ...this.state, turnDeadlineAt: null };
  }

  /** Schedule room removal if abandoned (all players disconnected during active game). */
  private scheduleAbandonTimer() {
    this.cancelAbandonTimer();
    if (this.abandonTimeoutMs <= 0) return;
    this.abandonTimer = this.scheduler.setTimeout(() => {
      this.abandonTimer = null;
      logger.info(`Room ${this.roomCode} abandoned — removing after ${this.abandonTimeoutMs}ms`);
      this.onDeserted?.(this.roomCode);
    }, this.abandonTimeoutMs);
  }

  /** Cancel the abandon timer (called when a player reconnects). */
  cancelAbandonTimer() {
    if (this.abandonTimer !== null) {
      this.scheduler.clearTimeout(this.abandonTimer);
      this.abandonTimer = null;
    }
  }

  /** Clear all pending timers. Should be called when removing a room. */
  clearAllTimers() {
    for (const [pid, timer] of this.disconnectForfeitTimers) {
      this.scheduler.clearTimeout(timer);
    }
    this.disconnectForfeitTimers.clear();
    this.cancelTurnTimeout();
    this.cancelAbandonTimer();
  }

  /** Execute a forfeit for the given player. No-op if they are no longer the active player. */
  private executeForfeit(playerId: string, reason: "disconnected" | "timeout") {
    if (this.state.phase === "game_over") return;
    const activePlayer = this.state.players[this.state.activePlayerIndex];
    if (!activePlayer || activePlayer.id !== playerId) return;
    if (!activePlayer.isAlive) return;

    logger.info(`Forfeiting turn for player ${activePlayer.name} (${playerId}) in room ${this.roomCode} — reason: ${reason}`);

    // Cancel timers that will be restarted after turn advance
    this.cancelTurnTimeout();
    // Also cancel any pending disconnect forfeit for this player
    this.cancelDisconnectForfeit(playerId);

    const result = forfeitTurn(this.state, playerId, reason);
    if (result.ok) {
      this.state = result.state;
      for (const event of result.events) {
        this.broadcastEvent(event, this.state);
      }
      this.broadcastSnapshot();
      // Start turn timeout for next player if they are connected
      this.scheduleTurnTimeout();
      // If the new active player is also disconnected, schedule their forfeit too
      const nextPlayer = this.state.players[this.state.activePlayerIndex];
      if (nextPlayer && !nextPlayer.connected && this.disconnectGraceMs > 0) {
        this.scheduleDisconnectForfeit(nextPlayer.id);
      }
    } else {
      logger.warn(`forfeitTurn failed for ${playerId} in ${this.roomCode}: ${result.error}`);
    }
  }

  /**
   * Apply an action result: update state, broadcast events, reset timers if turn advanced.
   */
  private applyResult<T>(
    prevActiveIndex: number,
    result: ActionResult<T>
  ): ActionResult<T> {
    if (result.ok) {
      this.state = result.state;
      for (const event of result.events) {
        this.broadcastEvent(event, this.state);
      }
      // If game ended, clear all timers
      if (this.state.phase === "game_over") {
        this.clearAllTimers();
      } else if (this.state.activePlayerIndex !== prevActiveIndex) {
        // Turn advanced — reset turn timeout and cancel forfeit for previous player
        this.cancelTurnTimeout();
        this.scheduleTurnTimeout();
        // If the new active player is disconnected, schedule their forfeit
        const newActive = this.state.players[this.state.activePlayerIndex];
        if (newActive && !newActive.connected && this.disconnectGraceMs > 0) {
          this.scheduleDisconnectForfeit(newActive.id);
        }
      }
    }
    return result;
  }

  /**
   * Authoritative deploy action.
   */
  deploy(
    playerId: string,
    territoryId: string,
    count: number
  ): ActionResult<{ remainingReinforcements: number }> {
    if (this.state.phase === "game_over") {
      return { ok: false, error: "Game is over" };
    }
    const prev = this.state.activePlayerIndex;
    return this.applyResult(prev, deployUnits(this.state, playerId, territoryId, count));
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
    if (this.state.phase === "game_over") {
      return { ok: false, error: "Game is over" };
    }
    const prev = this.state.activePlayerIndex;
    return this.applyResult(prev, attackTerritory(this.state, playerId, sourceId, targetId, units));
  }

  completeConquestMove(playerId: string, units: number): ActionResult<void> {
    const prev = this.state.activePlayerIndex;
    return this.applyResult(prev, completeConquestMove(this.state, playerId, units));
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
    if (this.state.phase === "game_over") {
      return { ok: false, error: "Game is over" };
    }
    const prev = this.state.activePlayerIndex;
    return this.applyResult(prev, fortifyUnits(this.state, playerId, sourceId, targetId, units));
  }

  /**
   * Authoritative skip phase action.
   */
  skipPhase(playerId: string): ActionResult<void> {
    if (this.state.phase === "game_over") {
      return { ok: false, error: "Game is over" };
    }
    const prev = this.state.activePlayerIndex;
    return this.applyResult(prev, skipPhase(this.state, playerId));
  }

  /**
   * Authoritative end turn action.
   */
  endTurn(playerId: string): ActionResult<void> {
    if (this.state.phase === "game_over") {
      return { ok: false, error: "Game is over" };
    }
    const prev = this.state.activePlayerIndex;
    return this.applyResult(prev, endTurn(this.state, playerId));
  }

  /**
   * Authoritative chat action. Enforces per-player token-bucket rate limit.
   */
  chat(playerId: string, text: string): ActionResult<{ event: GameEvent }> {
    const player = this.getPlayer(playerId);
    if (!player) {
      return { ok: false, error: "Player not found in room" };
    }

    // Token-bucket rate limiting
    const now = Date.now();
    let bucket = this.chatBuckets.get(playerId);
    if (!bucket) {
      bucket = { tokens: this.chatBucketCapacity, lastRefill: now };
      this.chatBuckets.set(playerId, bucket);
    }
    // Refill tokens based on elapsed time
    const elapsed = now - bucket.lastRefill;
    if (elapsed >= this.chatRefillMs) {
      const refills = Math.floor(elapsed / this.chatRefillMs);
      bucket.tokens = Math.min(this.chatBucketCapacity, bucket.tokens + refills);
      bucket.lastRefill = now - (elapsed % this.chatRefillMs);
    }
    if (bucket.tokens <= 0) {
      return { ok: false, error: "RATE_LIMITED" };
    }
    bucket.tokens -= 1;

    const event: GameEvent = {
      type: "chat_message",
      senderId: playerId,
      senderName: player.name,
      channel: "game",
      text,
      timestamp: now,
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

  getPlayerSocket(playerId: string): RoomSocket | undefined {
    return this.playerSockets.get(playerId);
  }

  hasSocket(socket: RoomSocket): boolean {
    for (const s of this.playerSockets.values()) {
      if (s === socket) return true;
    }
    return false;
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

export interface RoomManagerOptions {
  defaultMap?: MapDefinition;
  defaultMaxPlayers?: number;
  maxRooms?: number;
  disconnectGraceMs?: number;
  turnTimeoutMs?: number;
  abandonTimeoutMs?: number;
  scheduler?: TimerScheduler;
  chatBucketCapacity?: number;
  chatRefillMs?: number;
}

export class RoomManager {
  private rooms = new Map<string, GameRoom>();
  public readonly defaultMap: MapDefinition;
  public readonly defaultMaxPlayers: number;
  public readonly maxRooms: number;
  private readonly roomDefaults: Partial<GameRoomOptions>;

  constructor(options?: RoomManagerOptions) {
    this.defaultMap = options?.defaultMap ?? getDefaultMap().definition;
    this.defaultMaxPlayers = options?.defaultMaxPlayers ?? 4;
    this.maxRooms = options?.maxRooms ?? 500;
    this.roomDefaults = {
      disconnectGraceMs: options?.disconnectGraceMs,
      turnTimeoutMs: options?.turnTimeoutMs,
      abandonTimeoutMs: options?.abandonTimeoutMs,
      scheduler: options?.scheduler,
      chatBucketCapacity: options?.chatBucketCapacity,
      chatRefillMs: options?.chatRefillMs,
    };
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
      ...this.roomDefaults,
      onDeserted: (c) => this.removeRoom(c),
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
  }): GameRoom | null {
    if (this.rooms.size >= this.maxRooms) {
      return null;
    }
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
      ...this.roomDefaults,
      onDeserted: (c) => this.removeRoom(c),
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
        autoStart: options?.autoStart ?? false,
        ...this.roomDefaults,
        onDeserted: (c) => this.removeRoom(c),
        ...options,
      });
      this.rooms.set(code, room);
    }
    return room;
  }

  removeRoom(roomCode: string): boolean {
    const code = roomCode.toUpperCase();
    const room = this.rooms.get(code);
    if (room) {
      room.clearAllTimers();
    }
    return this.rooms.delete(code);
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
