/**
 * Pure derivation of a BattleReport view model from the event history.
 * No React / rendering dependencies — this is plain TypeScript.
 */
import type { GameEvent, Player } from "@conquest/protocol";
import type { MapBundle, GridMapDefinition } from "@conquest/map-engine";
import { getTerritoryAt, getMicroTerritoryAt, getGeographyBoundingBox } from "@conquest/map-engine";

// ─── View model ──────────────────────────────────────────────────────────────

export interface DicePair {
  attackerDie: number;
  defenderDie: number;
  /** true = attacker wins (attacker > defender), false = defender wins (ties go to defender) */
  attackerWins: boolean;
}

export interface BattleReport {
  /** Unique key: timestamp + attacker + defender ids for animation keying */
  key: string;
  attackerName: string;
  attackerColor: string;
  defenderName: string;
  defenderColor: string;
  sourceTerritoryName: string;
  targetTerritoryName: string;
  attackerRolls: number[];
  defenderRolls: number[];
  /** Compared pairs sorted by desc attacker die */
  pairs: DicePair[];
  /** Unpaired attacker dice (when attacker rolls > defender rolls) */
  unpairedAttackerDice: number[];
  attackerLosses: number;
  defenderLosses: number;
  /** Troop counts before this roll (may be undefined for old events) */
  attackerUnitsBefore?: number;
  defenderUnitsBefore?: number;
  /**
   * Source territory units after losses (excludes unitsMoved, which departed on conquest).
   * Undefined when attackerUnitsBefore is not available.
   */
  attackerUnitsAfter?: number;
  /**
   * Target territory units after losses.  On a conquest this is effectively 0
   * before unitsMoved arrive; panel should show conquest outcome instead.
   */
  defenderUnitsAfter?: number;
  /** Troops that advanced into a conquered territory (undefined on non-conquest). */
  unitsMoved?: number;
  conquered: boolean;
  /** Round index within this engagement (1-based) */
  engagementRound: number;
  /** Cumulative attacker losses across the engagement */
  engagementAttackerLosses: number;
  /** Cumulative defender losses across the engagement */
  engagementDefenderLosses: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getPlayerById(players: Player[], id: string): Player | undefined {
  return players.find((p) => p.id === id);
}

function getTerritoryDisplayName(bundle: MapBundle, id: string): string {
  const t = bundle.definition.territories.find((t) => t.id === id);
  return t?.name ?? id;
}

/**
 * Builds an ordered list of dice pairs from sorted attacker/defender rolls.
 * Both input arrays must already be sorted descending (as emitted by game-core).
 */
function buildPairs(attackerRolls: number[], defenderRolls: number[]): {
  pairs: DicePair[];
  unpairedAttackerDice: number[];
} {
  const pairs: DicePair[] = [];
  const n = Math.min(attackerRolls.length, defenderRolls.length);
  for (let i = 0; i < n; i++) {
    const a = attackerRolls[i]!;
    const d = defenderRolls[i]!;
    pairs.push({ attackerDie: a, defenderDie: d, attackerWins: a > d });
  }
  const unpairedAttackerDice = attackerRolls.slice(n);
  return { pairs, unpairedAttackerDice };
}

// ─── Main derivation ─────────────────────────────────────────────────────────

/**
 * Derives a BattleReport from the most recent `attack_resolved` event.
 *
 * Returns null when:
 *  - there are no attack events
 *  - the most recent attack was followed by a `turn_ended` (turn is over)
 */
export function deriveBattleReport(
  history: GameEvent[],
  players: Player[],
  mapBundle: MapBundle
): BattleReport | null {
  // Scan backwards to find the most recent attack_resolved
  let lastAttackIndex = -1;
  for (let i = history.length - 1; i >= 0; i--) {
    const ev = history[i]!;
    if (ev.type === "attack_resolved") { lastAttackIndex = i; break; }
    // A turn_ended after the last attack hides the panel
    if (ev.type === "turn_ended") return null;
  }
  if (lastAttackIndex < 0) return null;

  const lastAttack = history[lastAttackIndex] as Extract<GameEvent, { type: "attack_resolved" }>;

  // --- Engagement aggregation ---
  // Walk backwards from lastAttackIndex, collecting consecutive attacks
  // on the SAME source→target pair. Stop when we hit a different attack,
  // phase_changed, turn_ended, or the beginning of history.
  const engagementEvents: Array<Extract<GameEvent, { type: "attack_resolved" }>> = [];
  for (let i = lastAttackIndex; i >= 0; i--) {
    const ev = history[i]!;
    if (ev.type === "attack_resolved") {
      if (
        ev.sourceTerritoryId === lastAttack.sourceTerritoryId &&
        ev.targetTerritoryId === lastAttack.targetTerritoryId
      ) {
        engagementEvents.unshift(ev);
      } else {
        // Different attack pair → stop the run
        break;
      }
    } else if (
      ev.type === "phase_changed" ||
      ev.type === "turn_ended" ||
      ev.type === "game_started"
    ) {
      break;
    }
    // Ignore chat, player_reconnected, etc. — they don't break the engagement
  }

  const engagementRound = engagementEvents.length;
  const engagementAttackerLosses = engagementEvents.reduce((s, e) => s + e.attackerLosses, 0);
  const engagementDefenderLosses = engagementEvents.reduce((s, e) => s + e.defenderLosses, 0);

  // --- Build the view model ---
  const attacker = getPlayerById(players, lastAttack.attackerId);
  const defender = getPlayerById(players, lastAttack.defenderId);

  const { pairs, unpairedAttackerDice } = buildPairs(
    [...lastAttack.attackerRolls].sort((a, b) => b - a),
    [...lastAttack.defenderRolls].sort((a, b) => b - a),
  );

  const unitsMoved = lastAttack.conquered ? (lastAttack.unitsMoved ?? 0) : undefined;
  // For conquest: source loses attackerLosses AND unitsMoved units depart → remaining = before - losses - moved
  // For normal attack: source loses attackerLosses → remaining = before - losses
  const attackerUnitsAfter = lastAttack.attackerUnitsBefore !== undefined
    ? lastAttack.attackerUnitsBefore - lastAttack.attackerLosses - (unitsMoved ?? 0)
    : undefined;
  const defenderUnitsAfter = lastAttack.defenderUnitsBefore !== undefined
    ? lastAttack.defenderUnitsBefore - lastAttack.defenderLosses
    : undefined;

  return {
    key: `${lastAttack.timestamp}-${lastAttack.attackerId}-${lastAttack.defenderId}`,
    attackerName: attacker?.name ?? lastAttack.attackerId,
    attackerColor: attacker?.colorHex ?? "#00d2ff",
    defenderName: defender?.name ?? lastAttack.defenderId,
    defenderColor: defender?.colorHex ?? "#ffaa00",
    sourceTerritoryName: getTerritoryDisplayName(mapBundle, lastAttack.sourceTerritoryId),
    targetTerritoryName: getTerritoryDisplayName(mapBundle, lastAttack.targetTerritoryId),
    attackerRolls: [...lastAttack.attackerRolls].sort((a, b) => b - a),
    defenderRolls: [...lastAttack.defenderRolls].sort((a, b) => b - a),
    pairs,
    unpairedAttackerDice,
    attackerLosses: lastAttack.attackerLosses,
    defenderLosses: lastAttack.defenderLosses,
    attackerUnitsBefore: lastAttack.attackerUnitsBefore,
    defenderUnitsBefore: lastAttack.defenderUnitsBefore,
    attackerUnitsAfter,
    defenderUnitsAfter,
    unitsMoved,
    conquered: lastAttack.conquered,
    engagementRound,
    engagementAttackerLosses,
    engagementDefenderLosses,
  };
}

// ─── Panel corner finder ──────────────────────────────────────────────────────

export type PanelCorner = "bottom-left" | "bottom-right" | "top-left" | "top-right";

/**
 * Returns the first corner (from `preferred`) where a W×H rectangle in the
 * grid's cell coordinates contains no land cells, or null if none works.
 *
 * Grid coords are in the raster's own space (0..width-1, 0..height-1).
 * The function checks the rectangle against template cells.
 *
 * @param maxRows - Optional ceiling on the effective land height.  Pass
 *   `innerH − vOffset` from MapCanvas (where innerH = availableContentH − 2)
 *   so that bottom-corner panels do not overflow the map's inner canvas area.
 */
export function findPanelCorner(
  grid: GridMapDefinition,
  panelW: number,
  panelH: number,
  preferred: PanelCorner[] = ["bottom-left", "bottom-right", "top-left", "top-right"],
  maxRows?: number,
): { corner: PanelCorner; col: number; row: number } | null {
  const land = getGeographyBoundingBox(grid);
  // Crop to the geography bounding box (same as getMapRenderLayout sourceX/Y)
  const originX = land.minX;
  const originY = land.minY;
  const landW = land.width;
  // Effective land height for bottom placement: capped by the caller's inner canvas
  // so the panel doesn't overflow beyond the map's visible area.
  const landH = maxRows !== undefined ? Math.min(land.height, maxRows) : land.height;

  for (const corner of preferred) {
    let startX: number;
    let startY: number;
    switch (corner) {
      case "bottom-left":  startX = 0;              startY = landH - panelH; break;
      case "bottom-right": startX = landW - panelW;  startY = landH - panelH; break;
      case "top-left":     startX = 0;              startY = 0;               break;
      case "top-right":    startX = landW - panelW;  startY = 0;               break;
    }
    // Clamp to grid
    if (startX < 0 || startY < 0 || startX + panelW > landW || startY + panelH > landH) continue;

    // Check every cell in the rectangle for land.
    // Use micro-territory checks (both half-rows per cell) so that coastal cells
    // rendered as ▀/▄ (one micro-half is land, the other ocean) are also rejected.
    // getTerritoryAt alone misses these: the normal template marks them as ocean.
    let hasLand = false;
    outer: for (let dy = 0; dy < panelH && !hasLand; dy++) {
      for (let dx = 0; dx < panelW; dx++) {
        const gx = originX + startX + dx;
        const gy = originY + startY + dy;
        if (
          getMicroTerritoryAt(gx, 2 * gy, grid) !== null ||
          getMicroTerritoryAt(gx, 2 * gy + 1, grid) !== null
        ) { hasLand = true; break outer; }
      }
    }

    if (!hasLand) {
      return { corner, col: startX, row: startY };
    }
  }
  return null;
}
