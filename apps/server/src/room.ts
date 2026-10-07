import type {
  GameEvent,
  GameState,
  Player,
  Sector,
  ServerEvent,
  ServerMessage,
  ServerSnapshot,
  StateDelta,
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
  tradeCards,
  projectStateFor,
  suggestSets,
  type ActionResult,
  type MapDefinition,
} from "@conquest/game-core";
import { getDefaultMap } from "@conquest/map-engine";
import { generateId, generateRoomCode, getPlayerColor, logger, generateRngSeed, makeSfc32, makeShuffleFn } from "@conquest/shared";
import { decideBotAction } from "@conquest/bot-core";
import type { BotDecision } from "@conquest/bot-core";

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
  /** Deterministic seed for tests. Production code omits this and generates one via crypto. */
  rngSeed?: Uint8Array;
  /** Card mode for all matches in this room. Default: "escalating". */
  cardMode?: "escalating" | "off";
  botCount?: number;
  botActionDelayMs?: number;
  botScheduler?: {
    schedule(callback: () => void, delayMs: number): unknown;
    cancel(handle: unknown): void;
  };
  botPolicy?: (state: Readonly<GameState>, playerId: string) => BotDecision | null;
}

export interface RoomPlayerSummary {
  id: string;
  name: string;
  connected: boolean;
  ready: boolean;
  colorIndex: number;
  colorHex: string;
}

/**
 * Compute the minimal delta between two projected states generically.
 *
 * Iterates the union of all top-level keys in prev and next (excluding
 * `history`, which is never diffed — events carry the increment).
 * `territories` is treated as a keyed-record diff so only changed territory
 * entries are transmitted.  All other fields are deep-compared via
 * JSON.stringify; if changed they land in `set`, if removed they land in
 * `unset`.
 *
 * Because the diff iterates keys generically, any new GameState field (card
 * hands, trade counters, …) propagates to clients automatically without
 * manual list maintenance.
 */
function diffProjectedStates(prev: GameState, next: GameState): StateDelta {
  const set: Record<string, unknown> = {};
  const unset: string[] = [];

  const prevRec = prev as Record<string, unknown>;
  const nextRec = next as Record<string, unknown>;
  const allKeys = new Set([
    ...Object.keys(prevRec),
    ...Object.keys(nextRec),
  ]);

  for (const key of allKeys) {
    if (key === "history") continue; // history flows via discrete events

    const prevVal = prevRec[key];
    const nextVal = nextRec[key];

    // Key removed in next
    if (!(key in nextRec) || nextVal === undefined) {
      unset.push(key);
      continue;
    }

    // Key added in next (wasn't in prev)
    if (!(key in prevRec) || prevVal === undefined) {
      set[key] = nextVal;
      continue;
    }

    // Special case: territories → keyed record diff (only changed territory ids)
    if (key === "territories") {
      const prevT = prev.territories;
      const nextT = next.territories;
      const changedT: Record<string, unknown> = {};
      const allIds = new Set([...Object.keys(prevT), ...Object.keys(nextT)]);
      for (const id of allIds) {
        if (JSON.stringify(prevT[id]) !== JSON.stringify(nextT[id])) {
          changedT[id] = nextT[id]; // undefined means the territory was removed
        }
      }
      if (Object.keys(changedT).length > 0) set["territories"] = changedT;
      continue;
    }

    // Generic: deep JSON compare
    if (JSON.stringify(prevVal) !== JSON.stringify(nextVal)) {
      set[key] = nextVal;
    }
  }

  const delta: StateDelta = {};
  if (Object.keys(set).length > 0) delta.set = set;
  if (unset.length > 0) delta.unset = unset;
  return delta;
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
  /** Seeded PRNG for the current match: drives shuffles and dice rolls. NOT broadcast to clients. */
  public rng: () => number;
  /** The raw seed used to create rng (kept for debug logging at match end). */
  private rngSeed: Uint8Array;
  /** Optional test-injected seed; when set, every match reuses it deterministically. */
  private readonly injectedSeed?: Uint8Array;
  public readonly botCount: number;
  private botActionDelayMs: number;
  private botTimer: unknown;
  private readonly botScheduler: NonNullable<GameRoomOptions["botScheduler"]>;
  private readonly botPolicy: NonNullable<GameRoomOptions["botPolicy"]>;
  private botGeneration = 0;
  private botActionsThisTurn = 0;
  private botBudgetKey = "";
  private disposed = false;
  public state: GameState;
  /** Monotonically increasing state version. Increments on every successful applyResult. */
  public stateVersion: number = 0;
  /**
   * Per-viewer baseline projected states, keyed by playerId.
   * When computing the delta for a `server:event`, each player's delta is
   * computed from their own baseline so the delta is personalised to their
   * projection (future: card hands visible only to the holder, etc.).
   * Baselines are reset on start/rematch/join/reconnect/resync.
   */
  private prevProjectedStates = new Map<string, GameState>();
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
  public readonly cardMode: "escalating" | "off";

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
    this.cardMode = options.cardMode ?? "escalating";
    this.injectedSeed = options.rngSeed;
    // Provide a no-op rng until the first match starts.
    this.rngSeed = new Uint8Array(16);
    this.rng = Math.random;
    this.botCount = Math.max(0, Math.min(this.maxPlayers - 1, options.botCount ?? 0));
    this.botActionDelayMs = Math.max(0, options.botActionDelayMs ?? 150);
    this.botScheduler = options.botScheduler ?? {
      schedule: (callback, delayMs) => setTimeout(callback, delayMs),
      cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    };
    this.botPolicy = options.botPolicy ?? decideBotAction;
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
    return this.state.players.filter((p) => p.connected && p.controller !== "bot").length;
  }

  get humanPlayersCount(): number {
    return this.state.players.filter((p) => p.controller !== "bot").length;
  }

  get botPlayersCount(): number {
    return this.state.players.filter((p) => p.controller === "bot").length;
  }

  private participatingPlayers(): Player[] {
    return this.state.players.filter((p) => p.controller === "bot" || p.connected);
  }

  private scheduleBotTurn(): void {
    this.cancelBotTurn();
    const player = this.state.players[this.state.activePlayerIndex];
    if (
      this.disposed ||
      this.connectedPlayersCount === 0 ||
      this.state.phase === "lobby" ||
      this.state.phase === "game_over" ||
      player?.controller !== "bot" ||
      !player.isAlive
    ) return;
    const generation = this.botGeneration;
    const gameId = this.state.gameId;
    const playerId = player.id;
    this.botTimer = this.botScheduler.schedule(() => {
      this.botTimer = undefined;
      if (
        generation !== this.botGeneration ||
        this.disposed ||
        this.state.gameId !== gameId ||
        this.state.phase === "game_over" ||
        this.connectedPlayersCount === 0
      ) return;
      const active = this.state.players[this.state.activePlayerIndex];
      if (!active || active.id !== playerId || active.controller !== "bot") return;
      this.runBotAction(playerId);
    }, this.botActionDelayMs);
  }

  private cancelBotTurn(): void {
    this.botGeneration++;
    if (this.botTimer !== undefined) this.botScheduler.cancel(this.botTimer);
    this.botTimer = undefined;
  }

  dispose(): void {
    this.disposed = true;
    this.clearAllTimers();
  }

  private runBotAction(playerId: string): void {
    const active = this.state.players[this.state.activePlayerIndex];
    if (this.disposed || this.state.phase === "game_over" || this.connectedPlayersCount === 0 || active?.id !== playerId || !active.isAlive) return;
    const turnKey = `${this.state.gameId}:${this.state.turnNumber}:${active.id}`;
    if (turnKey !== this.botBudgetKey) {
      this.botBudgetKey = turnKey;
      this.botActionsThisTurn = 0;
    }
    if (this.botActionsThisTurn >= 80) {
      const result = this.performBotFallback(playerId);
      if (!result.ok) {
        logger.error(`Bot action cap fallback failed in room ${this.roomCode}: ${result.error}`);
        this.cancelBotTurn();
        return;
      }
      this.scheduleBotTurn();
      return;
    }
    let decision;
    try {
      decision = this.botPolicy(projectStateFor(this.state, playerId), playerId);
    } catch (error) {
      logger.error(`Bot policy threw in room ${this.roomCode}:`, error);
      const fallback = this.performBotFallback(playerId);
      if (!fallback.ok) this.cancelBotTurn();
      else this.scheduleBotTurn();
      return;
    }
    if (!decision) {
      const fallback = this.performBotFallback(playerId);
      if (!fallback.ok) {
        logger.error(`Bot had no decision in room ${this.roomCode}: ${fallback.error}`);
        this.cancelBotTurn();
      } else this.scheduleBotTurn();
      return;
    }
    const { action } = decision;
    let result: ActionResult<unknown>;
    switch (action.type) {
      case "trade_cards":
        result = this.tradeCards(playerId, action.cardIds);
        break;
      case "deploy":
        result = this.deploy(playerId, action.territoryId, action.count);
        break;
      case "attack":
        result = this.attack(playerId, action.sourceTerritoryId, action.targetTerritoryId, action.dice);
        break;
      case "complete_conquest_move":
        result = this.completeConquestMove(playerId, action.units);
        break;
      case "fortify":
        result = this.fortify(playerId, action.sourceTerritoryId, action.targetTerritoryId, action.units);
        break;
      case "skip_phase":
        result = this.skipPhase(playerId);
        break;
      case "end_turn":
        result = this.endTurn(playerId);
        break;
    }
    if (!result.ok) {
      logger.error(`Bot decision failed in room ${this.roomCode} (${decision.reason}): ${result.error}`);
      const fallback = this.performBotFallback(playerId);
      if (!fallback.ok) {
        logger.error(`Bot fallback failed in room ${this.roomCode}: ${fallback.error}`);
        this.cancelBotTurn();
        return;
      }
      this.botActionsThisTurn++;
      this.scheduleBotTurn();
      return;
    }
    const nextActive = this.state.players[this.state.activePlayerIndex];
    const nextKey = `${this.state.gameId}:${this.state.turnNumber}:${nextActive?.id ?? ""}`;
    if (nextKey !== turnKey) {
      this.botBudgetKey = nextKey;
      this.botActionsThisTurn = 0;
    } else this.botActionsThisTurn++;
    this.scheduleBotTurn();
  }

  private performBotFallback(playerId: string): ActionResult<unknown> {
    if (this.state.pendingConquestMove) {
      return this.completeConquestMove(playerId, this.state.pendingConquestMove.minimumUnits);
    }
    const projected = projectStateFor(this.state, playerId);
    const hand = [...(projected.myHand ?? [])].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    );
    const pendingTrade = projected.publicCards?.pendingForcedTrade?.playerId === playerId;
    if (pendingTrade || (this.state.phase === "deployment" && this.state.pendingReinforcements === 0)) {
      const sets = projected.publicCards?.mode === "escalating" && hand.length >= 3
        ? suggestSets(hand, new Set(Object.values(this.state.territories)
          .filter((territory) => territory.ownerId === playerId)
          .map((territory) => territory.id)))
        : [];
      if (sets[0]?.length === 3) {
        return this.tradeCards(playerId, sets[0].map((card) => card.id) as [string, string, string]);
      }
    }
    if (pendingTrade && this.state.pendingReinforcements > 0) {
      const territory = this.firstOwnedTerritory(playerId);
      if (!territory) return { ok: false, error: "No legal deployment fallback" };
      return this.deploy(playerId, territory.id, this.state.pendingReinforcements);
    }
    if (this.state.phase === "deployment") {
      const territory = this.firstOwnedTerritory(playerId);
      if (!territory || this.state.pendingReinforcements < 1) {
        return { ok: false, error: "No legal deployment fallback" };
      }
      return this.deploy(playerId, territory.id, this.state.pendingReinforcements);
    }
    if (this.state.phase === "attack") return this.skipPhase(playerId);
    if (this.state.phase === "fortify") return this.endTurn(playerId);
    return { ok: false, error: "No fallback for current phase" };
  }

  private firstOwnedTerritory(playerId: string) {
    return Object.values(this.state.territories)
      .filter((territory) => territory.ownerId === playerId)
      .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)[0];
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
      // Broadcast updated snapshot to all connected players (including the new one).
      this.broadcastSnapshot();
    }

    return { ok: true };
  }

  addBots(count: number): boolean {
    if (
      this.state.phase !== "lobby" ||
      !Number.isInteger(count) ||
      count < 0 ||
      count > this.maxPlayers - this.state.players.length ||
      this.botPlayersCount + count > this.botCount
    ) {
      return false;
    }
    for (let i = 0; i < count; i++) {
      const colorIndex = this.state.players.length;
      const colorDef = getPlayerColor(colorIndex);
      const player: Player = {
        id: generateId("bot"),
        name: `Bot ${i + 1}`,
        colorIndex,
        colorHex: colorDef.hex,
        connected: false,
        isAlive: true,
        ready: true,
        rematchReady: true,
        controller: "bot",
        botProfile: "standard",
      };
      this.state.players.push(player);
      const event: GameEvent = {
        type: "player_joined",
        player,
        timestamp: Date.now(),
      };
      this.state.history.push(event);
      this.broadcastEvent(event, this.state);
    }
    this.broadcastSnapshot();
    return true;
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

    const connectedPlayers = this.state.players.filter((p) => p.connected && p.controller !== "bot");
    const participants = this.participatingPlayers();
    const allReady = connectedPlayers.length >= 1 && participants.length >= 2 && participants.every((p) => p.controller === "bot" || (p.connected && p.ready));
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

    const connectedPlayers = this.state.players.filter((p) => p.connected && p.controller !== "bot");
    const participants = this.participatingPlayers();
    const readyCount = participants.filter((p) => p.controller === "bot" || (p.connected && p.rematchReady)).length;
    const requiredCount = participants.length;

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

    const allRematchReady = connectedPlayers.length >= 1 && participants.length >= 2 && participants.every((p) => p.controller === "bot" || (p.connected && p.rematchReady === true));

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
    const connectedPlayers = this.state.players.filter((p) => p.connected && p.controller !== "bot");
    const participating = this.participatingPlayers();
    if (connectedPlayers.length < 1 || participating.length < 2) return false;

    // Drop disconnected players from registration
    for (const p of this.state.players) {
      if (!p.connected && p.controller !== "bot") {
        this.playerSockets.delete(p.id);
        this.playerTokens.delete(p.id);
      }
    }

    this.reseedForMatch();
    this.matchNumber += 1;
    this.gameId = generateId("game");

    const participatingPlayers: Player[] = participating.map((p, index) => {
      const colorDef = getPlayerColor(index);
      return {
        ...p,
        colorIndex: index,
        colorHex: colorDef.hex,
        isAlive: true,
        ready: false,
        rematchReady: p.controller === "bot",
      };
    });

    const initialState = createInitialGameState(
      this.gameId,
      this.roomCode,
      participatingPlayers,
      this.map,
      3,
      makeShuffleFn(this.rng),
      this.matchNumber,
      this.cardMode
    );
    for (const player of initialState.players) {
      if (player.controller === "bot") {
        player.ready = true;
        player.rematchReady = true;
      }
    }

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
    this.stateVersion++;
    this.prevProjectedStates.clear();

    // Clear timers from previous match, then stamp deadline before broadcasting.
    this.clearAllTimers();
    this.applyTurnDeadline();

    for (const event of this.state.history) {
      this.broadcastEvent(event, this.state);
    }
    this.broadcastSnapshot();

    // Arm the timer now that broadcasts have gone out.
    this.armTurnTimer();

    logger.info(
      `Rematch #${this.matchNumber} started in room ${this.roomCode} with ${participatingPlayers.length} players. Active player: ${activePlayer.name}`
    );
    this.botActionsThisTurn = 0;
    this.scheduleBotTurn();
    return true;
  }

  /**
   * Generate a fresh match seed and rng. Uses the injected test seed if one was
   * supplied, otherwise draws fresh bytes from crypto. Called at the start of
   * every match so the logged seed replays exactly that match.
   */
  private reseedForMatch(): void {
    this.rngSeed = this.injectedSeed ? new Uint8Array(this.injectedSeed) : generateRngSeed();
    this.rng = makeSfc32(this.rngSeed);
  }

  /**
   * Start the match authoritative state transition.
   * Only connected players participate in the starting match.
   */
  startGame(): boolean {
    if (this.state.phase !== "lobby") return false;
    const activePlayers = this.participatingPlayers();
    const humanPlayers = activePlayers.filter((p) => p.controller !== "bot" && p.connected);
    if (humanPlayers.length < 1 || activePlayers.length < 2) return false;
    if (!humanPlayers.every((p) => p.ready)) return false;

    this.reseedForMatch();
    this.matchNumber = 1;
    const initialState = createInitialGameState(
      this.gameId,
      this.roomCode,
      activePlayers,
      this.map,
      3,
      makeShuffleFn(this.rng),
      1,
      this.cardMode
    );

    this.state = initialState;
    this.stateVersion++;
    this.prevProjectedStates.clear();

    // Stamp the turn deadline BEFORE broadcasting so clients see it immediately.
    this.applyTurnDeadline();

    // Broadcast state transition events
    for (const event of initialState.history) {
      this.broadcastEvent(event, this.state);
    }

    // Broadcast full snapshot with assigned player identities to all sockets
    this.broadcastSnapshot();

    // Arm the timer now that broadcasts have gone out.
    this.armTurnTimer();

    logger.info(
      `Game started in room ${this.roomCode} with ${activePlayers.length} players. Active player: ${activePlayers[0].name}`
    );
    this.botActionsThisTurn = 0;
    this.scheduleBotTurn();
    return true;
  }

  /**
   * Reconnect an existing player.
   */
  reconnectPlayer(playerId: string, socket: RoomSocket): boolean {
    const player = this.getPlayer(playerId);
    if (!player || player.controller === "bot") return false;

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

    // Broadcast reconnection event to other players, then full snapshot to all.
    this.broadcastEvent(event, this.state, playerId);

    // Send updated snapshot to all connected players (including the reconnecting one).
    this.broadcastSnapshot();

    // If this player was the active player and we have a turn timeout, restart it
    const activePlayer = this.state.players[this.state.activePlayerIndex];
    if (activePlayer?.id === playerId) {
      this.scheduleTurnTimeout();
    }
    this.scheduleBotTurn();
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
      if (this.connectedPlayersCount === 0) this.onDeserted?.(this.roomCode);
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

      const connected = this.state.players.filter((p) => p.connected && p.controller !== "bot");
      if (connected.length >= 2 && connected.every((p) => p.rematchReady)) {
        this.startRematch();
      }

      if (connected.length === 0) {
        this.cancelBotTurn();
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

    // Broadcast player_left to remaining connected players, then snapshot.
    this.broadcastEvent(event, this.state);
    this.broadcastSnapshot();

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
    if (this.connectedPlayersCount === 0) this.cancelBotTurn();
    else this.scheduleBotTurn();
  }

  removePlayer(playerId: string, reason?: string) {
    this.disconnectPlayer(playerId, reason ?? "removed");
  }

  // ---------------------------------------------------------------------------
  // Timer management
  // ---------------------------------------------------------------------------

  /** Schedule a forfeit for a disconnected active player after the grace period. */
  private scheduleDisconnectForfeit(playerId: string) {
    const player = this.getPlayer(playerId);
    if (!player || player.controller === "bot") return;
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

  /**
   * Step 1 of turn-timeout setup: compute the deadline and stamp it onto
   * `this.state` so that every broadcast that follows will carry the deadline.
   * Must be called BEFORE any broadcastEvent / broadcastSnapshot for the new turn.
   */
  private applyTurnDeadline() {
    const activePlayer = this.state.players[this.state.activePlayerIndex];
    if (this.turnTimeoutMs <= 0 || !activePlayer?.isAlive || activePlayer.controller === "bot") {
      this.state = { ...this.state, turnDeadlineAt: null };
      return;
    }
    const deadline = Date.now() + this.turnTimeoutMs;
    this.state = { ...this.state, turnDeadlineAt: deadline };
  }

  /**
   * Step 2 of turn-timeout setup: arm the actual timer.
   * Must be called AFTER broadcasts so the deadline is already in the state
   * clients received.
   */
  private armTurnTimer() {
    const activePlayer = this.state.players[this.state.activePlayerIndex];
    if (this.turnTimeoutMs <= 0 || !activePlayer?.isAlive || activePlayer.controller === "bot") return;
    this.turnTimeoutTimer = this.scheduler.setTimeout(() => {
      this.turnTimeoutTimer = null;
      const ap = this.state.players[this.state.activePlayerIndex];
      if (ap && ap.controller !== "bot") this.executeForfeit(ap.id, "timeout");
    }, this.turnTimeoutMs);
  }

  /**
   * Convenience: cancel any running timer + deadline, set deadline, arm timer.
   * Use this only when no broadcast needs to carry the new deadline (e.g. tests
   * that call scheduleTurnTimeout directly).  In normal game flow prefer calling
   * applyTurnDeadline() before broadcasts and armTurnTimer() after.
   */
  scheduleTurnTimeout() {
    this.cancelTurnTimeout();
    this.applyTurnDeadline();
    this.armTurnTimer();
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
    this.cancelBotTurn();
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
    if (!activePlayer || activePlayer.id !== playerId || activePlayer.controller === "bot") return;
    if (!activePlayer.isAlive) return;

    logger.info(`Forfeiting turn for player ${activePlayer.name} (${playerId}) in room ${this.roomCode} — reason: ${reason}`);

    // Cancel timers that will be restarted after turn advance
    this.cancelTurnTimeout();
    // Also cancel any pending disconnect forfeit for this player
    this.cancelDisconnectForfeit(playerId);

    const result = forfeitTurn(this.state, playerId, reason, makeShuffleFn(this.rng));
    if (result.ok) {
      this.state = result.state;
      // Append forfeit events to the authoritative history.
      if (result.events.length > 0) {
        this.state.history.push(...result.events);
      }
      // Stamp the turn deadline BEFORE broadcasting so clients receive it.
      this.applyTurnDeadline();
      for (const event of result.events) {
        this.broadcastEvent(event, this.state);
      }
      this.broadcastSnapshot();
      // Arm the timer after broadcasts.
      this.armTurnTimer();
      // If the new active player is also disconnected, schedule their forfeit too
      const nextPlayer = this.state.players[this.state.activePlayerIndex];
      if (nextPlayer && nextPlayer.controller !== "bot" && !nextPlayer.connected && this.disconnectGraceMs > 0) {
        this.scheduleDisconnectForfeit(nextPlayer.id);
      }
      this.scheduleBotTurn();
    } else {
      logger.warn(`forfeitTurn failed for ${playerId} in ${this.roomCode}: ${result.error}`);
    }
  }

  /**
   * Apply an action result: update state, broadcast events, reset timers if turn advanced.
   *
   * Per-viewer deltas: each connected player receives a delta computed from
   * their own baseline projection so that per-player hidden information
   * (card hands, etc.) is naturally personalised.
   */
  private applyResult<T>(
    prevActiveIndex: number,
    result: ActionResult<T>
  ): ActionResult<T> {
    if (result.ok) {
      this.state = result.state;
      // Append new events to the authoritative history array in place.
      // game-core preserves the same history reference, so this.state.history
      // is the same array that was passed into the action.
      if (result.events.length > 0) {
        this.state.history.push(...result.events);
      }
      // Detect turn advancement early so we can stamp the deadline BEFORE
      // any broadcast, ensuring clients receive the new turnDeadlineAt.
      const turnAdvanced =
        this.state.phase !== "game_over" &&
        this.state.activePlayerIndex !== prevActiveIndex;
      if (turnAdvanced) {
        this.cancelTurnTimeout();
        this.applyTurnDeadline();
      }
      // Increment version after deadline is applied.
      this.stateVersion++;

      // Compute per-viewer projected state and delta, then serialize per socket.
      for (const event of result.events) {
        const eventJson = JSON.stringify(event);
        for (const [pId, socket] of this.playerSockets.entries()) {
          const nextProjected = projectStateFor(this.state, pId);
          const prevProjected = this.prevProjectedStates.get(pId);
          const delta = prevProjected
            ? diffProjectedStates(prevProjected, nextProjected)
            : {};
          // Update the per-viewer baseline for next event in this applyResult.
          this.prevProjectedStates.set(pId, nextProjected);
          const message = JSON.stringify({
            type: "server:event",
            event: JSON.parse(eventJson),
            version: this.stateVersion,
            delta,
          });
          try {
            socket.send(message);
          } catch (err) {
            logger.error(`Error sending event to player ${pId} in room ${this.roomCode}:`, err);
          }
        }
      }

      // If game ended, clear all timers and log the RNG seed for reproducibility
      if (this.state.phase === "game_over") {
        this.cancelBotTurn();
        this.clearAllTimers();
        logger.debug(
          `Match ${this.matchNumber} ended in room ${this.roomCode}. ` +
          `RNG seed (hex): ${Buffer.from(this.rngSeed).toString("hex")}`
        );
      } else if (turnAdvanced) {
        // Turn advanced — arm the timer now that broadcasts have gone out.
        this.armTurnTimer();
        // If the new active player is disconnected, schedule their forfeit
        const newActive = this.state.players[this.state.activePlayerIndex];
        if (newActive && newActive.controller !== "bot" && !newActive.connected && this.disconnectGraceMs > 0) {
          this.scheduleDisconnectForfeit(newActive.id);
        }
      }
      this.scheduleBotTurn();
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
    return this.applyResult(prev, attackTerritory(this.state, playerId, sourceId, targetId, units, this.rng));
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
    return this.applyResult(prev, skipPhase(this.state, playerId, makeShuffleFn(this.rng)));
  }

  /**
   * Authoritative end turn action.
   */
  endTurn(playerId: string): ActionResult<void> {
    if (this.state.phase === "game_over") {
      return { ok: false, error: "Game is over" };
    }
    const prev = this.state.activePlayerIndex;
    return this.applyResult(prev, endTurn(this.state, playerId, [], makeShuffleFn(this.rng)));
  }

  /**
   * Authoritative trade cards action.
   */
  tradeCards(playerId: string, cardIds: [string, string, string]): ActionResult<void> {
    if (this.state.phase === "game_over") {
      return { ok: false, error: "Game is over" };
    }
    const prev = this.state.activePlayerIndex;
    return this.applyResult(prev, tradeCards(this.state, playerId, cardIds, makeShuffleFn(this.rng)));
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
   * Broadcast a server:event for lobby/game-management events that don't
   * go through applyResult (e.g. player_joined, player_left, player_reconnected).
   * These carry an empty delta since state changes for these events are delivered
   * via broadcastSnapshot which immediately follows.
   */
  broadcastEvent(event: GameEvent, _state?: GameState, excludePlayerId?: string) {
    const message: ServerEvent = {
      type: "server:event",
      event,
      version: this.stateVersion,
      delta: {},
    };
    this.broadcast(message, excludePlayerId);
  }

  /**
   * Broadcast full server:snapshot to all connected sockets in this room.
   * Resets each player's per-viewer delta baseline to the snapshot projection,
   * so future deltas are computed from the state the client is known to have.
   */
  broadcastSnapshot() {
    for (const [pId, socket] of this.playerSockets.entries()) {
      const projected = projectStateFor(this.state, pId);
      // Reset the per-viewer baseline: after this snapshot the client's state
      // is exactly `projected`, so the next delta should diff from here.
      this.prevProjectedStates.set(pId, projected);
      const message: ServerSnapshot = {
        type: "server:snapshot",
        state: projected,
        myPlayerId: pId,
        version: this.stateVersion,
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
   * Resets that player's per-viewer delta baseline.
   */
  sendSnapshot(playerId: string) {
    const socket = this.playerSockets.get(playerId);
    if (!socket) return;

    const projected = projectStateFor(this.state, playerId);
    // Reset the per-viewer baseline for this player.
    this.prevProjectedStates.set(playerId, projected);
    const message: ServerSnapshot = {
      type: "server:snapshot",
      state: projected,
      myPlayerId: playerId,
      version: this.stateVersion,
    };
    try {
      socket.send(JSON.stringify(message));
    } catch (err) {
      logger.error(`Error sending snapshot to player ${playerId} in room ${this.roomCode}:`, err);
    }
  }

  /**
   * Handle a resync request from a client: send them the current snapshot
   * and reset their delta baseline.
   */
  handleResync(playerId: string) {
    // Delete the baseline so the next snapshot resets it cleanly.
    this.prevProjectedStates.delete(playerId);
    this.sendSnapshot(playerId);
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
      humanPlayersCount: this.humanPlayersCount,
      botPlayersCount: this.botPlayersCount,
      maxPlayers: this.maxPlayers,
      mapId: this.map.id,
      mapName: this.map.name,
      turnNumber: this.state.turnNumber,
      createdAt: this.createdAt,
      cardMode: this.cardMode,
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
  /** Fixed RNG seed injected into every room created by this manager (test-only). */
  rngSeed?: Uint8Array;
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
      rngSeed: options?.rngSeed,
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
    cardMode?: "escalating" | "off";
    botCount?: number;
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
      cardMode: options?.cardMode ?? "escalating",
      botCount: options?.botCount ?? 0,
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
      room.dispose();
    }
    return this.rooms.delete(code);
  }

  dispose(): void { for (const room of this.rooms.values()) room.dispose(); this.rooms.clear(); }

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
