import type { GameState } from "@conquest/protocol";

/** Maximum number of history events to include in a client-facing state snapshot. */
export const CLIENT_HISTORY_TAIL = 200;

/**
 * Fields on GameState that are server-only and must not be sent to clients.
 * Currently there are none at the type level — server-only data (e.g. RNG state)
 * is stored on GameRoom, not in GameState. This projection primarily bounds
 * the history array and is the seam for future per-player hidden information
 * (e.g. Risk cards: each player's hand would be filtered here).
 *
 * Convention: any field added to GameState that should not reach clients should
 * be stripped in this function and documented with a "@serverOnly" JSDoc tag.
 */
export function projectStateFor(
  state: GameState,
  /** The player ID viewing the state. Null for a spectator. Reserved for future
   *  per-player hidden-information filtering (e.g. card hands). */
  _viewerId: string | null
): GameState {
  return {
    ...state,
    // Bound history to a tail so snapshots don't grow without limit.
    history: state.history.length > CLIENT_HISTORY_TAIL
      ? state.history.slice(-CLIENT_HISTORY_TAIL)
      : state.history,
  };
}
