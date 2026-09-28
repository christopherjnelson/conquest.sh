import type { GameState } from "@conquest/protocol";

/** Maximum number of history events to include in a client-facing state snapshot. */
export const CLIENT_HISTORY_TAIL = 200;

/**
 * Top-level GameState keys that must never be sent to any client.
 *
 * - `cards`: The full ServerCardState (deck order, all hands, discard).
 *   projectStateFor replaces it with per-viewer `myHand` injection instead.
 * - `cardMode`: Stored redundantly in publicCards.mode; the raw field is server-only.
 */
export const SERVER_ONLY_KEYS: string[] = [
  "cards",
  "cardMode",
];

/**
 * Project the authoritative game state for a specific viewer.
 *
 * Hidden-information contract:
 * - `cards` (deck, discard, ALL hands) is stripped entirely (SERVER_ONLY_KEYS).
 * - `cardMode` is stripped (mode is accessible via publicCards.mode).
 * - `myHand` is injected as the viewer's own hand from cards.hands[viewerId].
 *   Spectators (viewerId=null) get myHand=null.
 * - publicCards contains only counts (no hand contents), visible to all.
 *
 * Deltas computed generically from projected states in room.ts therefore
 * can never leak another player's hand or the deck order.
 */
export function projectStateFor(
  state: GameState,
  /** The player ID viewing the state. Null for a spectator. */
  viewerId: string | null
): GameState {
  // Start with a shallow copy so we can delete server-only keys safely.
  const projected: Record<string, unknown> = { ...state };

  // Strip server-only fields.
  for (const key of SERVER_ONLY_KEYS) {
    delete projected[key];
  }

  // Bound history to a tail so snapshots don't grow without limit.
  const history = state.history.length > CLIENT_HISTORY_TAIL
    ? state.history.slice(-CLIENT_HISTORY_TAIL)
    : state.history;
  projected["history"] = history;

  // ── Card hand injection ──────────────────────────────────────────────────────
  // Inject the viewer's own hand as `myHand`. Spectators get null.
  // Other players' hands are never included — `cards` is already stripped above.
  if (viewerId && state.cards) {
    projected["myHand"] = state.cards.hands[viewerId] ?? [];
  } else {
    projected["myHand"] = null;
  }

  return projected as GameState;
}
