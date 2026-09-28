/**
 * BattlePanel – visual battle-report overlay for the WORLD MAP pane.
 *
 * FULL panel  : FULL_W × FULL_H  columns/rows (exported, used by MapCanvas)
 * COND panel  : COND_W × COND_H  columns/rows
 *
 * Colors match the existing Conquest palette: #080f1a background, #00d2ff borders.
 */
import React, { useEffect, useRef, useState } from "react";
import type { BattleReport } from "./battle-report.js";

// ---------------------------------------------------------------------------
// Exported size constants  (MapCanvas imports these to avoid drift)
// ---------------------------------------------------------------------------

/** Outer width (cols) of the full panel, including its 1-char border on each side. */
export const FULL_W = 30;
/**
 * Outer height (rows) of the full panel.
 * Worst-case content: header + attackerName + route + 2 pairs + 1 unpaired +
 *   ATK troop line + DEF troop line + engagement line = 9 inner rows
 *   + 2 border rows = 11 total.
 */
export const FULL_H = 11;

/** Outer width of the condensed panel. */
export const COND_W = 24;
/**
 * Outer height of the condensed panel.
 * Content: header + route + dice + losses = 4 inner rows + 2 border = 6.
 */
export const COND_H = 6;

// ---------------------------------------------------------------------------
// Inner text widths (panel width − 2 border − 2 padding)
// ---------------------------------------------------------------------------
const FULL_INNER = FULL_W - 4; // 26
const COND_INNER = COND_W - 4; // 20

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface BattlePanelProps {
  report: BattleReport;
  /** When true (default), show a short ~400ms dice animation on a new battle key. */
  animate?: boolean;
  condensed?: boolean;
  /** Positioning props forwarded to the outer box for absolute placement inside MapCanvas. */
  position?: "absolute" | "relative";
  top?: number;
  left?: number;
  zIndex?: number;
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

/** Truncate a string to maxW chars, appending '…' if truncated. */
function trunc(s: string, maxW: number): string {
  if (s.length <= maxW) return s;
  return s.slice(0, maxW - 1) + "…";
}

// ---------------------------------------------------------------------------
// Dice animation helpers
// ---------------------------------------------------------------------------

const ANIMATE_MS = 400;
const TICK_MS = 60;

function randomFace(): number {
  return Math.floor(Math.random() * 6) + 1;
}

function useDiceAnimation(report: BattleReport, animate: boolean): {
  displayAttackerRolls: number[];
  displayDefenderRolls: number[];
  rolling: boolean;
} {
  const [settling, setSettling] = useState(false);
  const [frame, setFrame] = useState(0);
  const keyRef = useRef<string>("");

  useEffect(() => {
    if (!animate || report.key === keyRef.current) return;
    keyRef.current = report.key;
    setSettling(true);
    setFrame(0);

    const ticks = Math.floor(ANIMATE_MS / TICK_MS);
    let t = 0;
    const id = setInterval(() => {
      t++;
      setFrame(t);
      if (t >= ticks) {
        clearInterval(id);
        setSettling(false);
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [report.key, animate]);

  const rolling = settling && frame < Math.floor(ANIMATE_MS / TICK_MS);
  if (rolling) {
    return {
      displayAttackerRolls: report.attackerRolls.map(() => randomFace()),
      displayDefenderRolls: report.defenderRolls.map(() => randomFace()),
      rolling: true,
    };
  }
  return {
    displayAttackerRolls: report.attackerRolls,
    displayDefenderRolls: report.defenderRolls,
    rolling: false,
  };
}

// ---------------------------------------------------------------------------
// Palette constants
// ---------------------------------------------------------------------------

const BG = "#080f1a";
const BORDER = "#00d2ff";
const SUCCESS = "#00ff66";
const DANGER = "#ff4444";
const DIM = "#475569";
const LABEL = "#94a3b8";
const WHITE = "#f8fafc";
const CONQUERED_BG = "#ff3399";

// ---------------------------------------------------------------------------
// Troop line helpers
// ---------------------------------------------------------------------------

/**
 * Returns [atkLine, defLine] – two compact single-row strings, each ≤ FULL_INNER chars.
 * Conquest shows source remaining + advance; non-conquest shows before→after.
 */
function buildTroopLines(report: BattleReport): [string, string] {
  const { attackerLosses, defenderLosses, attackerUnitsBefore, attackerUnitsAfter,
          defenderUnitsBefore, defenderUnitsAfter, conquered, unitsMoved } = report;

  let atkLine: string;
  let defLine: string;

  if (conquered) {
    // Source perspective: lost attackerLosses, then unitsMoved advanced into target
    if (attackerUnitsBefore !== undefined && attackerUnitsAfter !== undefined) {
      const moved = unitsMoved ?? 0;
      atkLine = trunc(`ATK ${attackerUnitsBefore}→${attackerUnitsAfter} −${attackerLosses} (${moved} adv)`, FULL_INNER);
    } else {
      atkLine = trunc(`ATK −${attackerLosses} (${unitsMoved ?? "?"} adv)`, FULL_INNER);
    }
    defLine = trunc(`DEF ${defenderUnitsBefore !== undefined ? defenderUnitsBefore + "→0" : ""} conquered`, FULL_INNER).trim();
  } else {
    if (attackerUnitsBefore !== undefined && attackerUnitsAfter !== undefined) {
      atkLine = trunc(`ATK ${attackerUnitsBefore}→${attackerUnitsAfter} −${attackerLosses}`, FULL_INNER);
    } else {
      atkLine = `ATK −${attackerLosses}`;
    }
    if (defenderUnitsBefore !== undefined && defenderUnitsAfter !== undefined) {
      defLine = trunc(`DEF ${defenderUnitsBefore}→${defenderUnitsAfter} −${defenderLosses}`, FULL_INNER);
    } else {
      defLine = `DEF −${defenderLosses}`;
    }
  }

  return [atkLine, defLine!];
}

// ---------------------------------------------------------------------------
// Full panel (FULL_W × FULL_H)
// ---------------------------------------------------------------------------

export function BattlePanel({ report, animate = true, condensed = false, position, top, left, zIndex }: BattlePanelProps) {
  const { displayAttackerRolls, displayDefenderRolls, rolling } = useDiceAnimation(report, animate);

  if (condensed) {
    return (
      <CondensedBattlePanel
        report={report}
        displayAttackerRolls={displayAttackerRolls}
        displayDefenderRolls={displayDefenderRolls}
        rolling={rolling}
        position={position}
        top={top}
        left={left}
        zIndex={zIndex}
      />
    );
  }

  const header = trunc(`BATTLE · Round ${report.engagementRound}`, FULL_INNER);
  const attackerName = trunc(report.attackerName, FULL_INNER);
  const route = trunc(`${report.sourceTerritoryName} ▸ ${report.targetTerritoryName}`, FULL_INNER);
  const conqueredLine = trunc(`CONQUERED ${report.targetTerritoryName}`, FULL_INNER);

  const [atkLine, defLine] = buildTroopLines(report);
  const engLine = report.engagementRound > 1
    ? trunc(`Eng: −${report.engagementAttackerLosses} ATK / −${report.engagementDefenderLosses} DEF`, FULL_INNER)
    : null;

  return (
    <box
      border
      borderStyle="single"
      borderColor={BORDER}
      backgroundColor={BG}
      flexDirection="column"
      paddingLeft={1}
      paddingRight={1}
      width={FULL_W}
      height={FULL_H}
      position={position}
      top={top}
      left={left}
      zIndex={zIndex}
    >
      <text fg={BORDER}>{header}</text>
      <text fg={report.attackerColor}>{attackerName}</text>
      <text fg={LABEL}>{route}</text>

      {report.conquered ? (
        <box backgroundColor={CONQUERED_BG} paddingLeft={1} paddingRight={1}>
          <text fg={WHITE}>{conqueredLine}</text>
        </box>
      ) : (
        <box flexDirection="column">
          {report.pairs.map((pair, i) => {
            const aRoll = displayAttackerRolls[i] ?? pair.attackerDie;
            const dRoll = displayDefenderRolls[i] ?? pair.defenderDie;
            return (
              <box key={i} flexDirection="row" gap={1}>
                <box backgroundColor={report.attackerColor} paddingLeft={1} paddingRight={1}>
                  <text fg={BG}>{aRoll}</text>
                </box>
                <text fg={rolling ? DIM : (pair.attackerWins ? SUCCESS : DANGER)}>
                  {rolling ? "·" : (pair.attackerWins ? "✓" : "✗")}
                </text>
                <box backgroundColor={report.defenderColor} paddingLeft={1} paddingRight={1}>
                  <text fg={BG}>{dRoll}</text>
                </box>
                {!rolling && !pair.attackerWins && pair.attackerDie === pair.defenderDie && (
                  <text fg={DIM}> tie→DEF</text>
                )}
              </box>
            );
          })}
          {report.unpairedAttackerDice.map((die, i) => {
            const dRoll = displayAttackerRolls[report.pairs.length + i] ?? die;
            return (
              <box key={`u${i}`} flexDirection="row" gap={1}>
                <box backgroundColor={DIM} paddingLeft={1} paddingRight={1}>
                  <text fg={BG}>{dRoll}</text>
                </box>
              </box>
            );
          })}
        </box>
      )}

      {!rolling && <text fg={LABEL}>{atkLine}</text>}
      {!rolling && <text fg={LABEL}>{defLine}</text>}
      {!rolling && engLine && <text fg={DIM}>{engLine}</text>}
    </box>
  );
}

// ---------------------------------------------------------------------------
// Condensed panel (COND_W × COND_H)
// ---------------------------------------------------------------------------

function CondensedBattlePanel({
  report,
  displayAttackerRolls,
  displayDefenderRolls,
  rolling,
  position,
  top,
  left,
  zIndex,
}: {
  report: BattleReport;
  displayAttackerRolls: number[];
  displayDefenderRolls: number[];
  rolling: boolean;
  position?: "absolute" | "relative";
  top?: number;
  left?: number;
  zIndex?: number;
}) {
  const header = trunc(`BATTLE R${report.engagementRound}`, COND_INNER);
  const route = trunc(`${report.sourceTerritoryName} ▸ ${report.targetTerritoryName}`, COND_INNER);
  const diceStr = trunc(`[${displayAttackerRolls.join(" ")}] vs [${displayDefenderRolls.join(" ")}]`, COND_INNER);
  const lossStr = trunc(`−${report.attackerLosses} ATK / −${report.defenderLosses} DEF`, COND_INNER);

  return (
    <box
      border
      borderStyle="single"
      borderColor={BORDER}
      backgroundColor={BG}
      flexDirection="column"
      paddingLeft={1}
      paddingRight={1}
      width={COND_W}
      height={COND_H}
      position={position}
      top={top}
      left={left}
      zIndex={zIndex}
    >
      <text fg={BORDER}>{header}</text>
      <text fg={LABEL}>{route}</text>
      <text fg={WHITE}>{diceStr}</text>
      {!rolling && <text fg={LABEL}>{lossStr}</text>}
    </box>
  );
}
