import type { GameState } from "@conquest/protocol";

/** Maximum number of history events to include in a client-facing state snapshot. */
export const CLIENT_HISTORY_TAIL = 200;

/**
 * Top-level GameState keys that must never be sent to any client.
 *
 * Convention: add the field name here and mark it `@serverOnly` in GameState
 * when you add a field that should not leave the server (e.g. an internal RNG
 * state field if it were ever moved into GameState).  Currently empty because
 * server-only data (RNG seed, socket map) lives on GameRoom, not GameState.
 *
 * `projectStateFor` iterates this list and deletes every matching key before
 * returning the projected state, so any future addition is enforced
 * automatically.
 */
export const SERVER_ONLY_KEYS: string[] = [
  // Example (uncomment when/if added to GameState):
  // "rngState",
];

/**
 * Project the authoritative game state for a specific viewer.
 *
 * - Strips any `SERVER_ONLY_KEYS` from the state.
 * - Bounds `history` to the last `CLIENT_HISTORY_TAIL` events.
 * - Future per-player hidden information (Risk card hands, etc.) belongs here:
 *   filter out other players' private fields when `viewerId` is set.
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

  // ── Per-player hidden information hook ──────────────────────────────────────
  // When viewerId is set, filter out fields that are private to other players.
  // Example (Risk cards): strip other players' card hands so each player only
  // sees their own hand.
  //
  //   if (viewerId && projected["playerHands"]) {
  //     const hands = projected["playerHands"] as Record<string, unknown>;
  //     projected["playerHands"] = { [viewerId]: hands[viewerId] };
  //   }
  //
  // The `viewerId` parameter is intentionally used (not prefixed _) so that
  // future callers can rely on it without a lint-clean rename.
  void viewerId;

  return projected as GameState;
}
