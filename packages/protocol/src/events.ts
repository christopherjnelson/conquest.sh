import { z } from "zod";

export const GamePhaseSchema = z.enum(["lobby", "deployment", "attack", "fortify", "game_over"]);

// ─── Card system ──────────────────────────────────────────────────────────────

export const CardSymbolSchema = z.enum(["infantry", "cavalry", "artillery", "wild"]);
export type CardSymbol = z.infer<typeof CardSymbolSchema>;

/** A single territory card or wild. */
export const CardSchema = z.object({
  id: z.string(),
  symbol: CardSymbolSchema,
  /** Territory this card represents, undefined for wilds. */
  territoryId: z.string().optional(),
});
export type Card = z.infer<typeof CardSchema>;

/** A traded set, recorded in cards_traded events. */
export const TradedSetSchema = z.object({
  cards: z.array(CardSchema).length(3),
  armies: z.number().int().min(4),
  territoryBonus: z.object({ territoryId: z.string(), armies: z.number().int() }).optional(),
  setNumber: z.number().int().min(1),
});
export type TradedSet = z.infer<typeof TradedSetSchema>;

/**
 * Server-only card state. Lives in GameState under key "cards" but is
 * stripped by projectStateFor (listed in SERVER_ONLY_KEYS).
 */
export const ServerCardStateSchema = z.object({
  deck: z.array(CardSchema),
  discard: z.array(CardSchema),
  /** Each player's full hand. */
  hands: z.record(z.array(CardSchema)),
});
export type ServerCardState = z.infer<typeof ServerCardStateSchema>;

/** Per-player summary visible to all. */
export const PublicCardPlayerSchema = z.object({
  handCount: z.number().int().min(0),
});

/**
 * Public card state broadcast to all clients (deck/discard counts, hand sizes,
 * escalation counter). Each player additionally sees their own hand via
 * `myHand` in the projected state.
 */
export const PublicCardStateSchema = z.object({
  mode: z.enum(["escalating", "off"]),
  deckCount: z.number().int().min(0),
  discardCount: z.number().int().min(0),
  /** keyed by playerId */
  playerHandCounts: z.record(z.number().int().min(0)),
  /** Number of sets traded globally so far this match. */
  setsTradedCount: z.number().int().min(0),
  /** Armies for the NEXT trade (based on setsTradedCount). */
  nextTradeValue: z.number().int().min(4),
  /**
   * Set when the active player must trade before doing anything else.
   * During deployment: 5+ cards at start of turn.
   * During attack: after an elimination capture, if hand ≥ 6.
   * Cleared when hand ≤ 4 (deployment) or after forced-trade armies are
   * all deployed (attack, via deployUnits when pendingReinforcements hits 0).
   */
  pendingForcedTrade: z.object({
    playerId: z.string(),
    phase: GamePhaseSchema,
  }).nullable().default(null),
});
export type PublicCardState = z.infer<typeof PublicCardStateSchema>;
export type GamePhase = z.infer<typeof GamePhaseSchema>;

export const PlayerControllerSchema = z.enum(["human", "bot"]);
export type PlayerController = z.infer<typeof PlayerControllerSchema>;
export const BotProfileSchema = z.literal("standard");
export type BotProfile = z.infer<typeof BotProfileSchema>;

export const PlayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  colorIndex: z.number(),
  colorHex: z.string(),
  connected: z.boolean(),
  controller: PlayerControllerSchema.optional(),
  botProfile: BotProfileSchema.optional(),
  isAlive: z.boolean(),
  ready: z.boolean().default(false),
  rematchReady: z.boolean().optional(),
});
export type Player = z.infer<typeof PlayerSchema>;

export const VictoryReasonSchema = z.enum(["conquest"]);
export type VictoryReason = z.infer<typeof VictoryReasonSchema>;

export const PlayerMatchResultSchema = z.object({
  playerId: z.string(),
  playerName: z.string(),
  placement: z.number().int().min(1),
  finalTerritories: z.number().int().min(0),
  finalArmies: z.number().int().min(0),
  eliminated: z.boolean(),
  eliminatedBy: z.string().optional(),
});
export type PlayerMatchResult = z.infer<typeof PlayerMatchResultSchema>;

export const MatchResultSchema = z.object({
  winnerId: z.string(),
  winnerName: z.string(),
  reason: VictoryReasonSchema,
  turnNumber: z.number().int().min(1),
  startedAt: z.number(),
  endedAt: z.number(),
  durationMs: z.number(),
  players: z.array(PlayerMatchResultSchema),
});
export type MatchResult = z.infer<typeof MatchResultSchema>;

export const TerritoryRenderSchema = z.object({
  width: z.number().optional(),
  height: z.number().optional(),
  flavor: z.string().optional(),
});
export type TerritoryRender = z.infer<typeof TerritoryRenderSchema>;

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
  }).optional(),
  render: TerritoryRenderSchema.optional(),
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
    type: z.literal("conquest_move_completed"),
    playerId: z.string(),
    sourceTerritoryId: z.string(),
    targetTerritoryId: z.string(),
    units: z.number(),
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
    /** Troop count in the source territory before this roll (for the battle panel). */
    attackerUnitsBefore: z.number().int().optional(),
    /** Troop count in the target territory before this roll (for the battle panel). */
    defenderUnitsBefore: z.number().int().optional(),
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
  z.object({
    type: z.literal("rematch_ready_changed"),
    playerId: z.string(),
    rematchReady: z.boolean(),
    readyCount: z.number(),
    requiredCount: z.number(),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal("rematch_started"),
    gameId: z.string(),
    matchNumber: z.number(),
    startingPlayerId: z.string(),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal("turn_forfeited"),
    playerId: z.string(),
    reason: z.enum(["disconnected", "timeout"]),
    timestamp: z.number(),
  }),
  // Card events — no hidden info leaked; card details only shown for trades (cards are revealed)
  z.object({
    type: z.literal("card_awarded"),
    playerId: z.string(),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal("cards_traded"),
    playerId: z.string(),
    /** Cards are publicly revealed on trade, as in classic Risk. */
    cards: z.array(CardSchema).length(3),
    armies: z.number().int().min(4),
    territoryBonus: z.object({ territoryId: z.string(), armies: z.number().int() }).optional(),
    setNumber: z.number().int().min(1),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal("cards_captured"),
    fromPlayerId: z.string(),
    toPlayerId: z.string(),
    count: z.number().int().min(0),
    timestamp: z.number(),
  }),
]);
export type GameEvent = z.infer<typeof GameEventSchema>;

export const GameStateSchema = z.object({
  gameId: z.string(),
  mapId: z.string(),
  roomCode: z.string(),
  turnNumber: z.number(),
  activePlayerIndex: z.number(),
  phase: GamePhaseSchema,
  players: z.array(PlayerSchema),
  territories: z.record(TerritoryStateSchema),
  sectors: z.record(SectorSchema),
  pendingReinforcements: z.number(),
  pendingConquestMove: z.object({
    sourceTerritoryId: z.string(),
    targetTerritoryId: z.string(),
    defenderId: z.string(),
    minimumUnits: z.number().int().min(1),
    maximumUnits: z.number().int().min(1),
  }).nullable().default(null),
  hasConqueredThisTurn: z.boolean(),
  winnerId: z.string().nullable(),
  result: MatchResultSchema.nullable().default(null),
  matchNumber: z.number().int().min(1).default(1),
  startedAt: z.number().optional(),
  endedAt: z.number().nullable().optional(),
  history: z.array(GameEventSchema),
  turnDeadlineAt: z.number().nullable().optional(),
  /**
   * @serverOnly — stripped by projectStateFor; listed in SERVER_ONLY_KEYS.
   * Full card state: deck, discard, and all hands. Never broadcast.
   */
  cards: ServerCardStateSchema.optional(),
  /**
   * Public card state visible to all clients (hand counts, escalation level,
   * etc.). projectStateFor also appends `myHand` for each viewer.
   * null when cardMode is "off" or before game start.
   */
  publicCards: PublicCardStateSchema.nullable().optional(),
  /**
   * @serverOnly — stripped by projectStateFor. Indicates card mode for this match.
   * The public face is publicCards.mode.
   */
  cardMode: z.enum(["escalating", "off"]).optional(),
  /**
   * Per-viewer only: the viewing player's own hand. Injected by projectStateFor.
   * Never present in the authoritative state; always null/undefined there.
   */
  myHand: z.array(CardSchema).nullable().optional(),
  /**
   * Authoritative elimination order: one entry per eliminated player, in the
   * order they were eliminated.  Maintained by evaluatePlayerEliminations and
   * used by buildMatchResult (replacing the old state.history scan).
   * Optional with default [] for back-compat with clients and tests that were
   * serialised before this field was added.
   */
  eliminationOrder: z.array(z.object({
    playerId: z.string(),
    eliminatedBy: z.string(),
    timestamp: z.number(),
  })).default([]).optional(),
});
export type GameState = z.infer<typeof GameStateSchema>;
