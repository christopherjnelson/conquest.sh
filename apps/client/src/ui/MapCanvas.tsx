import React from "react";
import type { GamePhase, Player, TerritoryState } from "@conquest/protocol";
import {
  MAP_GRID_IRONREACH,
  getBorderInfo,
  getTerritoryAt,
} from "@conquest/map-engine";

export interface MapCanvasProps {
  territories: Record<string, TerritoryState>;
  players: Player[];
  myPlayerId: string | null;
  phase: GamePhase;
  selectedTerritoryId: string | null;
  targetTerritoryId: string | null;
  hoveredTerritoryId?: string | null;
  onHoverTerritory?: (territoryId: string | null) => void;
  onSelectTerritory: (territoryId: string) => void;
  onSelectTarget: (territoryId: string) => void;
  onDeselect: () => void;
}

interface CellStyle {
  char: string;
  fg: string;
  bg: string;
  bold?: boolean;
}

interface SpanRun {
  text: string;
  fg: string;
  bg: string;
  bold?: boolean;
}

// Background tint based on owner/region color
function getDarkTint(color: string): string {
  const lower = color.toLowerCase();
  if (lower === "#00ff66" || lower === "#22c55e" || lower.includes("green")) {
    return "#072114";
  }
  if (lower === "#ffaa00" || lower === "#eab308" || lower.includes("amber") || lower.includes("gold")) {
    return "#241805";
  }
  if (lower === "#00d2ff" || lower === "#38bdf8" || lower === "#00ffff" || lower.includes("cyan") || lower.includes("blue")) {
    return "#071f2e";
  }
  if (lower === "#ff4444" || lower === "#ef4444" || lower.includes("red")) {
    return "#260b0f";
  }
  if (lower === "#9966ff" || lower === "#a855f7" || lower.includes("purple") || lower.includes("violet")) {
    return "#1b0b2e";
  }
  return "#0e1726";
}

function getHoverTint(color: string): string {
  const lower = color.toLowerCase();
  if (lower.includes("green")) return "#0e3a24";
  if (lower.includes("amber") || lower.includes("gold") || lower === "#ffaa00") return "#382509";
  if (lower.includes("cyan") || lower.includes("blue") || lower === "#00d2ff") return "#0e314a";
  if (lower.includes("red") || lower === "#ff4444") return "#3d131a";
  if (lower.includes("purple") || lower === "#9966ff") return "#2c144a";
  return "#1e293b";
}

// Module-level precomputed sea route grid
const STATIC_SEA_ROUTES: Record<number, Record<number, { char: string; fg: string; bold?: boolean }>> = (() => {
  const grid: Record<number, Record<number, { char: string; fg: string; bold?: boolean }>> = {};

  const setPoint = (x: number, y: number, char: string, fg: string, bold = false) => {
    if (!grid[y]) grid[y] = {};
    grid[y][x] = { char, fg, bold };
  };

  for (const route of MAP_GRID_IRONREACH.seaRoutes) {
    const path = route.path;
    for (let i = 0; i < path.length; i++) {
      const curr = path[i];
      if (getTerritoryAt(curr.x, curr.y, MAP_GRID_IRONREACH)) {
        if (i === 0 || i === path.length - 1) {
          setPoint(curr.x, curr.y, "○", "#38bdf8", true);
        }
        continue;
      }

      if (i === 0 || i === path.length - 1) {
        setPoint(curr.x, curr.y, "○", "#38bdf8", true);
      } else {
        const prev = path[i - 1];
        const next = path[i + 1];
        if (prev && next) {
          if (prev.y === next.y) {
            setPoint(curr.x, curr.y, "─", "#64748b");
          } else if (prev.x === next.x) {
            setPoint(curr.x, curr.y, "│", "#64748b");
          } else {
            const diagChar =
              (next.x > prev.x && next.y > prev.y) || (prev.x > next.x && prev.y > next.y)
                ? "╲"
                : "╱";
            setPoint(curr.x, curr.y, diagChar, "#64748b");
          }
        } else {
          setPoint(curr.x, curr.y, "─", "#64748b");
        }
      }
    }
  }

  return grid;
})();

// Module-level precomputed decoration grid
const STATIC_DECORATIONS: Record<number, Record<number, { char: string; fg: string; bold?: boolean }>> = (() => {
  const grid: Record<number, Record<number, { char: string; fg: string; bold?: boolean }>> = {};

  const setStr = (x: number, y: number, str: string, fg: string, bold = false) => {
    if (!grid[y]) grid[y] = {};
    for (let i = 0; i < str.length; i++) {
      grid[y][x + i] = { char: str[i], fg, bold };
    }
  };

  // Waves
  for (const wave of MAP_GRID_IRONREACH.decorations.waves) {
    setStr(wave.x, wave.y, wave.text, "#1e293b");
  }

  // Mountains
  for (const mtn of MAP_GRID_IRONREACH.decorations.mountains) {
    setStr(mtn.x, mtn.y, mtn.text, "#475569", true);
  }

  // Trees (use single-cell width ↟ for strict terminal alignment)
  for (const tree of MAP_GRID_IRONREACH.decorations.trees) {
    const cleanText = tree.text.replace(/🌲/g, "↟");
    setStr(tree.x, tree.y, cleanText, "#16a34a");
  }

  // Compass rose at bottom-left
  const { compass, scaleBar } = MAP_GRID_IRONREACH.decorations;
  setStr(compass.x + 2, compass.y, "N", "#94a3b8", true);
  setStr(compass.x, compass.y + 1, "W ┼ E", "#64748b");
  setStr(compass.x + 2, compass.y + 1, "┼", "#38bdf8", true);
  setStr(compass.x + 2, compass.y + 2, "S", "#94a3b8", true);

  // Scale bar at bottom-right
  setStr(scaleBar.x, scaleBar.y, "0   250  500  750  1000 km", "#64748b");
  setStr(scaleBar.x, scaleBar.y + 1, "├───┼────┼────┼────┤", "#475569");

  return grid;
})();

export function MapCanvas({
  territories,
  players,
  myPlayerId,
  phase,
  selectedTerritoryId,
  targetTerritoryId,
  hoveredTerritoryId,
  onHoverTerritory,
  onSelectTerritory,
  onSelectTarget,
  onDeselect,
}: MapCanvasProps) {
  const selectedTerritory = selectedTerritoryId ? territories[selectedTerritoryId] : null;

  const handleTerritoryClick = (territoryId: string) => {
    if (!selectedTerritoryId) {
      onSelectTerritory(territoryId);
      return;
    }

    if (selectedTerritoryId === territoryId) {
      onDeselect();
      return;
    }

    // A territory is already selected
    const isNeighbor = Boolean(
      selectedTerritory?.neighbors.includes(territoryId) ||
        MAP_GRID_IRONREACH.territories.find((t) => t.id === selectedTerritoryId)?.neighbors.includes(territoryId)
    );

    if (isNeighbor) {
      if (targetTerritoryId === territoryId) {
        onSelectTarget("");
      } else {
        onSelectTarget(territoryId);
      }
    } else {
      onSelectTerritory(territoryId);
    }
  };

  // Precompute label and unit positions
  const labelMap: Record<number, Record<number, { char: string; fg: string; bold?: boolean }>> = {};

  const setLabelPoint = (x: number, y: number, char: string, fg: string, bold = true) => {
    if (!labelMap[y]) labelMap[y] = {};
    labelMap[y][x] = { char, fg, bold };
  };

  for (const t of MAP_GRID_IRONREACH.territories) {
    const tState =
      territories[t.id] ??
      Object.values(territories).find(
        (s) => s.name.toLowerCase() === t.name.toLowerCase()
      );
    const units = tState?.units ?? 2;
    const ownerId = tState?.ownerId;
    const owner = players.find((p) => p.id === ownerId);
    const ownerColor = owner?.colorHex ?? t.regionColor;

    // Line 1: 2-char ID (e.g. C2, A1)
    setLabelPoint(t.labelPos.x, t.labelPos.y, t.id[0], "#ffffff", true);
    setLabelPoint(t.labelPos.x + 1, t.labelPos.y, t.id[1], "#ffffff", true);

    // Line 2: Icon + Unit count (e.g. ▲ 1, ● 6)
    const unitDigits = String(units);
    setLabelPoint(t.labelPos.x - 1, t.labelPos.y + 1, t.icon, ownerColor, true);
    setLabelPoint(t.labelPos.x, t.labelPos.y + 1, " ", "#ffffff", false);
    for (let i = 0; i < unitDigits.length; i++) {
      setLabelPoint(t.labelPos.x + 1 + i, t.labelPos.y + 1, unitDigits[i], "#ffffff", true);
    }
  }

  // Generate the 28 lines of cellular characters
  const rows: SpanRun[][] = [];

  for (let y = 0; y < MAP_GRID_IRONREACH.height; y++) {
    const runs: SpanRun[] = [];

    for (let x = 0; x < MAP_GRID_IRONREACH.width; x++) {
      const territoryId = getTerritoryAt(x, y, MAP_GRID_IRONREACH);

      let cell: CellStyle;

      if (territoryId) {
        const territory = MAP_GRID_IRONREACH.territories.find((t) => t.id === territoryId);
        const tState =
          territories[territoryId] ??
          Object.values(territories).find(
            (s) => s.name.toLowerCase() === territory?.name.toLowerCase()
          );

        const ownerId = tState?.ownerId;
        const owner = players.find((p) => p.id === ownerId);
        const ownerColor = owner?.colorHex ?? territory?.regionColor ?? "#00d2ff";

        const isSelected = selectedTerritoryId === territoryId;
        const isTarget = targetTerritoryId === territoryId;
        const isHovered = hoveredTerritoryId === territoryId;
        const isEnemy = Boolean(ownerId && myPlayerId && ownerId !== myPlayerId);

        const border = getBorderInfo(x, y, MAP_GRID_IRONREACH);

        // Check if this coordinate has a label or unit count
        const labelCell = labelMap[y]?.[x];

        if (labelCell) {
          const bg = isSelected
            ? "#0c2b3d"
            : isTarget
            ? isEnemy
              ? "#280a0e"
              : "#082115"
            : isHovered
            ? getHoverTint(ownerColor)
            : getDarkTint(ownerColor);

          cell = {
            char: labelCell.char,
            fg: labelCell.fg,
            bg,
            bold: labelCell.bold,
          };
        } else if (border.isBorder) {
          let borderChar = "─";
          let borderFg = ownerColor;
          let borderBg = getDarkTint(ownerColor);
          let bold = false;

          if (isSelected) {
            // Glowing cyan/white double neon border for selected territory (C2 in ref.png)
            borderFg = "#00ffff";
            borderBg = "#0a2d40";
            bold = true;
            if (border.north && border.west) borderChar = "╔";
            else if (border.north && border.east) borderChar = "╗";
            else if (border.south && border.west) borderChar = "╚";
            else if (border.south && border.east) borderChar = "╝";
            else if (border.north || border.south) borderChar = "═";
            else if (border.west || border.east) borderChar = "║";
          } else if (isTarget) {
            // Target border: bright red for attack, bright green for fortify
            borderFg = isEnemy ? "#ff4444" : "#00ff66";
            borderBg = isEnemy ? "#330c12" : "#092e18";
            bold = true;
            if (border.north && border.west) borderChar = "┌";
            else if (border.north && border.east) borderChar = "┐";
            else if (border.south && border.west) borderChar = "└";
            else if (border.south && border.east) borderChar = "┘";
            else if (border.north || border.south) borderChar = "─";
            else if (border.west || border.east) borderChar = "│";
          } else {
            // Normal territory border
            if (isHovered) {
              borderFg = "#ffffff";
              borderBg = getHoverTint(ownerColor);
              bold = true;
            }
            if (border.north && border.west) borderChar = "┌";
            else if (border.north && border.east) borderChar = "┐";
            else if (border.south && border.west) borderChar = "└";
            else if (border.south && border.east) borderChar = "┘";
            else if (border.north || border.south) borderChar = "─";
            else if (border.west || border.east) borderChar = "│";
          }

          cell = {
            char: borderChar,
            fg: borderFg,
            bg: borderBg,
            bold,
          };
        } else {
          // Interior land cell
          const interiorBg = isSelected
            ? "#0c2b3d"
            : isTarget
            ? isEnemy
              ? "#280a0e"
              : "#082115"
            : isHovered
            ? getHoverTint(ownerColor)
            : getDarkTint(ownerColor);

          cell = {
            char: " ",
            fg: ownerColor,
            bg: interiorBg,
            bold: false,
          };
        }
      } else {
        // Water / empty cell
        const route = STATIC_SEA_ROUTES[y]?.[x];
        const deco = STATIC_DECORATIONS[y]?.[x];

        if (route) {
          cell = {
            char: route.char,
            fg: route.fg,
            bg: "#080f1a",
            bold: route.bold,
          };
        } else if (deco) {
          cell = {
            char: deco.char,
            fg: deco.fg,
            bg: "#080f1a",
            bold: deco.bold,
          };
        } else {
          cell = {
            char: " ",
            fg: "#080f1a",
            bg: "#080f1a",
            bold: false,
          };
        }
      }

      // Run-length merge
      const last = runs[runs.length - 1];
      if (
        last &&
        last.fg === cell.fg &&
        last.bg === cell.bg &&
        Boolean(last.bold) === Boolean(cell.bold)
      ) {
        last.text += cell.char;
      } else {
        runs.push({
          text: cell.char,
          fg: cell.fg,
          bg: cell.bg,
          bold: cell.bold,
        });
      }
    }

    rows.push(runs);
  }

  return (
    <box
      title="! WORLD MAP                                   Territories • Connections • Empires"
      titleColor="#00d2ff"
      border
      borderStyle="single"
      borderColor="#00d2ff"
      backgroundColor="#080f1a"
      style={{ width: 78, height: 30 }}
      onMouseDown={(event: any) => {
        const ex = event?.x ?? event?.offsetX ?? 0;
        const ey = event?.y ?? event?.offsetY ?? 0;
        const directTid = getTerritoryAt(ex, ey);
        const offsetTid = getTerritoryAt(ex - 1, ey - 1);
        const clickedId = directTid ?? offsetTid;
        if (clickedId) {
          handleTerritoryClick(clickedId);
        }
      }}
      onMouseMove={(event: any) => {
        const ex = event?.x ?? event?.offsetX ?? 0;
        const ey = event?.y ?? event?.offsetY ?? 0;
        const directTid = getTerritoryAt(ex, ey);
        const offsetTid = getTerritoryAt(ex - 1, ey - 1);
        const hoveredId = directTid ?? offsetTid;
        onHoverTerritory?.(hoveredId);
      }}
      onMouseOut={() => {
        onHoverTerritory?.(null);
      }}
    >
      <box flexDirection="column" style={{ width: 76, height: 28 }}>
        {rows.map((runs, y) => (
          <text key={y}>
            {runs.map((run, i) =>
              run.bold ? (
                <span key={i} fg={run.fg} bg={run.bg}>
                  <b>{run.text}</b>
                </span>
              ) : (
                <span key={i} fg={run.fg} bg={run.bg}>
                  {run.text}
                </span>
              )
            )}
          </text>
        ))}
      </box>
    </box>
  );
}
