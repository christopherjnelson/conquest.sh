import React from "react";
import type { GamePhase, Player, TerritoryState } from "@conquest/protocol";
import {
  MAP_GRID_IRONREACH,
  MAP_GRID_IRONREACH_COMPACT,
  MAP_GRID_IRONREACH_WIDE,
  type GridMapDefinition,
  getBorderInfo,
  getTerritoryAt,
  getMicroTerritoryAt,
  getTerritoryAtCell,
  getMapForDimensions,
  getMapContentDimensionsForTerminal,
  getMapForTerminalDimensions,
} from "@conquest/map-engine";

export interface MapCanvasProps {
  territories: Record<string, TerritoryState>;
  players: Player[];
  myPlayerId: string | null;
  phase: GamePhase;
  selectedTerritoryId: string | null;
  targetTerritoryId: string | null;
  hoveredTerritoryId?: string | null;
  viewport?: "compact" | "wide";
  terminalDimensions?: { columns: number; rows: number };
  contentDimensions?: { width: number; height: number };
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

function buildSeaRoutesGrid(mapDef: GridMapDefinition) {
  const grid: Record<number, Record<number, { char: string; fg: string; bold?: boolean }>> = {};

  const setPoint = (x: number, y: number, char: string, fg: string, bold = false) => {
    if (!grid[y]) grid[y] = {};
    grid[y][x] = { char, fg, bold };
  };

  for (const route of mapDef.seaRoutes) {
    const path = route.path;
    for (let i = 0; i < path.length; i++) {
      const curr = path[i];
      if (getTerritoryAt(curr.x, curr.y, mapDef)) {
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
}

function buildDecorationsGrid(mapDef: GridMapDefinition) {
  const grid: Record<number, Record<number, { char: string; fg: string; bold?: boolean }>> = {};

  const setStr = (x: number, y: number, str: string, fg: string, bold = false) => {
    if (!grid[y]) grid[y] = {};
    for (let i = 0; i < str.length; i++) {
      grid[y][x + i] = { char: str[i], fg, bold };
    }
  };

  // Waves
  for (const wave of mapDef.decorations.waves) {
    setStr(wave.x, wave.y, wave.text, "#1e293b");
  }

  // Mountains
  for (const mtn of mapDef.decorations.mountains) {
    setStr(mtn.x, mtn.y, mtn.text, "#475569", true);
  }

  // Trees (use single-cell width ↟ for strict terminal alignment)
  for (const tree of mapDef.decorations.trees) {
    const cleanText = tree.text.replace(/🌲/g, "↟");
    setStr(tree.x, tree.y, cleanText, "#16a34a");
  }

  // Compass rose
  const { compass, scaleBar } = mapDef.decorations;
  setStr(compass.x + 2, compass.y, "N", "#94a3b8", true);
  setStr(compass.x, compass.y + 1, "W ┼ E", "#64748b");
  setStr(compass.x + 2, compass.y + 1, "┼", "#38bdf8", true);
  setStr(compass.x + 2, compass.y + 2, "S", "#94a3b8", true);

  // Scale bar
  setStr(scaleBar.x, scaleBar.y, "0   250  500  750  1000 km", "#64748b");
  setStr(scaleBar.x, scaleBar.y + 1, "├───┼────┼────┼────┤", "#475569");

  // Ocean labels (naval chart water annotations)
  if (mapDef.decorations.oceanLabels) {
    for (const lbl of mapDef.decorations.oceanLabels) {
      setStr(lbl.x, lbl.y, lbl.text, "#1e293b", false);
    }
  }

  return grid;
}

// Module-level precomputed sea routes and decorations for compact and wide
const COMPACT_SEA_ROUTES = buildSeaRoutesGrid(MAP_GRID_IRONREACH_COMPACT);
const WIDE_SEA_ROUTES = buildSeaRoutesGrid(MAP_GRID_IRONREACH_WIDE);
const COMPACT_DECORATIONS = buildDecorationsGrid(MAP_GRID_IRONREACH_COMPACT);
const WIDE_DECORATIONS = buildDecorationsGrid(MAP_GRID_IRONREACH_WIDE);

export function mouseEventToMapCell(event: any): { x: number; y: number } | null {
  const target = event?.currentTarget;
  if (!target) return null;
  const originX = typeof target.x === "number" ? target.x : (target.screenX ?? 0);
  const originY = typeof target.y === "number" ? target.y : (target.screenY ?? 0);
  return {
    x: event.x - originX,
    y: event.y - originY,
  };
}

export function MapCanvas({
  territories,
  players,
  myPlayerId,
  phase,
  selectedTerritoryId,
  targetTerritoryId,
  hoveredTerritoryId,
  viewport,
  terminalDimensions,
  contentDimensions,
  onHoverTerritory,
  onSelectTerritory,
  onSelectTarget,
  onDeselect,
}: MapCanvasProps) {
  const activeMap: GridMapDefinition =
    viewport === "compact"
      ? MAP_GRID_IRONREACH_COMPACT
      : viewport === "wide"
      ? MAP_GRID_IRONREACH_WIDE
      : contentDimensions
      ? getMapForDimensions(contentDimensions.width, contentDimensions.height)
      : terminalDimensions
      ? getMapForTerminalDimensions(terminalDimensions.columns, terminalDimensions.rows)
      : MAP_GRID_IRONREACH_COMPACT;

  const staticSeaRoutes =
    activeMap.width === MAP_GRID_IRONREACH_WIDE.width ? WIDE_SEA_ROUTES : COMPACT_SEA_ROUTES;
  const staticDecorations =
    activeMap.width === MAP_GRID_IRONREACH_WIDE.width ? WIDE_DECORATIONS : COMPACT_DECORATIONS;

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
        activeMap.territories.find((t) => t.id === selectedTerritoryId)?.neighbors.includes(territoryId)
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

  for (const t of activeMap.territories) {
    const tState =
      territories[t.id] ??
      Object.values(territories).find(
        (s) => s.name.toLowerCase() === t.name.toLowerCase()
      );
    const units = tState?.units ?? 0;
    const isLobby = phase === "lobby";
    const rawOwnerId = tState?.ownerId;
    const hasOwner = !isLobby && Boolean(rawOwnerId);
    const owner = hasOwner ? players.find((p) => p.id === rawOwnerId) : undefined;
    const ownerColor = isLobby || !hasOwner
      ? (t.regionColor ?? "#64748b")
      : (owner?.colorHex ?? t.regionColor ?? "#64748b");

    // Check available non-border width of territory t.id on row t.labelPos.y
    let minX = t.labelPos.x;
    while (
      minX > 0 &&
      getTerritoryAt(minX - 1, t.labelPos.y, activeMap) === t.id &&
      !getBorderInfo(minX - 1, t.labelPos.y, activeMap).isBorder
    ) {
      minX--;
    }
    let maxX = t.labelPos.x;
    while (
      maxX < activeMap.width - 1 &&
      getTerritoryAt(maxX + 1, t.labelPos.y, activeMap) === t.id &&
      !getBorderInfo(maxX + 1, t.labelPos.y, activeMap).isBorder
    ) {
      maxX++;
    }
    const availableWidth = maxX - minX + 1;

    let line1Text = t.id;
    let line1StartX = t.labelPos.x;

    const fullName = `${t.id} ${t.name.toUpperCase()}`;
    if (availableWidth >= fullName.length) {
      line1Text = fullName;
      line1StartX = Math.max(
        minX,
        Math.min(maxX - fullName.length + 1, Math.round(minX + (availableWidth - fullName.length) / 2))
      );
    } else {
      const firstWord = `${t.id} ${t.name.split(" ")[0].toUpperCase()}`;
      if (availableWidth >= firstWord.length) {
        line1Text = firstWord;
        line1StartX = Math.max(
          minX,
          Math.min(maxX - firstWord.length + 1, Math.round(minX + (availableWidth - firstWord.length) / 2))
        );
      }
    }

    // Line 1: ID + Name
    for (let i = 0; i < line1Text.length; i++) {
      const isIdChar = i < t.id.length;
      setLabelPoint(
        line1StartX + i,
        t.labelPos.y,
        line1Text[i],
        isIdChar ? "#ffffff" : "#e2e8f0",
        true
      );
    }

    // Line 2: Icon + Unit count (e.g. ▲ 5 or ▲ 0)
    const unitDigits = String(units);
    const line2StartX = line1StartX;
    setLabelPoint(line2StartX, t.labelPos.y + 1, t.icon, ownerColor, true);
    setLabelPoint(line2StartX + 1, t.labelPos.y + 1, " ", "#ffffff", false);
    for (let i = 0; i < unitDigits.length; i++) {
      setLabelPoint(line2StartX + 2 + i, t.labelPos.y + 1, unitDigits[i], "#ffffff", true);
    }
  }

  // Generate lines of cellular characters
  const rows: SpanRun[][] = [];

  for (let y = 0; y < activeMap.height; y++) {
    const runs: SpanRun[] = [];

    for (let x = 0; x < activeMap.width; x++) {
      const topTid = getMicroTerritoryAt(x, 2 * y, activeMap);
      const bottomTid = getMicroTerritoryAt(x, 2 * y + 1, activeMap);
      const cellTid = getTerritoryAt(x, y, activeMap) ?? topTid ?? bottomTid;

      let cell: CellStyle;

      // 1. Label overlay sits directly on top of land terrain without card boxes
      const labelCell = labelMap[y]?.[x];
      if (labelCell) {
        let labelBg = "#0f172a";
        if (cellTid) {
          const territory = activeMap.territories.find((t) => t.id === cellTid);
          const tState =
            territories[cellTid] ??
            Object.values(territories).find(
              (s) => s.name.toLowerCase() === territory?.name.toLowerCase()
            );
          const isLobby = phase === "lobby";
          const rawOwnerId = tState?.ownerId;
          const hasOwner = !isLobby && Boolean(rawOwnerId);
          const owner = hasOwner ? players.find((p) => p.id === rawOwnerId) : undefined;
          const ownerColor =
            isLobby || !hasOwner
              ? (territory?.regionColor ?? "#64748b")
              : (owner?.colorHex ?? territory?.regionColor ?? "#00d2ff");
          const isSelected = selectedTerritoryId === cellTid;
          const isTarget = targetTerritoryId === cellTid;
          const isHovered = hoveredTerritoryId === cellTid;
          const isEnemy = Boolean(hasOwner && rawOwnerId && myPlayerId && rawOwnerId !== myPlayerId);
          const hoverBg = isLobby || !hasOwner ? "#1e293b" : getHoverTint(ownerColor);

          labelBg = isSelected
            ? "#0c2b3d"
            : isTarget
            ? isEnemy
              ? "#280a0e"
              : "#082115"
            : isHovered
            ? hoverBg
            : isLobby || !hasOwner
            ? "#0f172a"
            : getDarkTint(ownerColor);
        }

        cell = {
          char: labelCell.char,
          fg: labelCell.fg,
          bg: labelBg,
          bold: labelCell.bold,
        };
      } else if (!topTid && !bottomTid) {
        // 2. Pure water cell (naval chart void, sea routes, decorations, ocean labels)
        const route = staticSeaRoutes[y]?.[x];
        const deco = staticDecorations[y]?.[x];

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
      } else {
        // 3. High-resolution half-block terrain rendering (2 microcells per character row)
        const getMicroStyle = (tid: string | null, isTop: boolean) => {
          if (!tid) {
            return { color: "#080f1a", isPerimeter: false, isOwner: false };
          }
          const territory = activeMap.territories.find((t) => t.id === tid);
          const tState =
            territories[tid] ??
            Object.values(territories).find(
              (s) => s.name.toLowerCase() === territory?.name.toLowerCase()
            );
          const isLobby = phase === "lobby";
          const rawOwnerId = tState?.ownerId;
          const hasOwner = !isLobby && Boolean(rawOwnerId);
          const owner = hasOwner ? players.find((p) => p.id === rawOwnerId) : undefined;
          const ownerColor =
            isLobby || !hasOwner
              ? (territory?.regionColor ?? "#64748b")
              : (owner?.colorHex ?? territory?.regionColor ?? "#00d2ff");

          const isSelected = selectedTerritoryId === tid;
          const isTarget = targetTerritoryId === tid;
          const isHovered = hoveredTerritoryId === tid;
          const isEnemy = Boolean(hasOwner && rawOwnerId && myPlayerId && rawOwnerId !== myPlayerId);

          const my = isTop ? 2 * y : 2 * y + 1;
          const nT = getMicroTerritoryAt(x, my - 1, activeMap);
          const sT = getMicroTerritoryAt(x, my + 1, activeMap);
          const wT = getMicroTerritoryAt(x - 1, my, activeMap);
          const eT = getMicroTerritoryAt(x + 1, my, activeMap);
          const isCoast = nT === null || sT === null || wT === null || eT === null;
          const isPerimeter = isCoast || nT !== tid || sT !== tid || wT !== tid || eT !== tid;

          if (isSelected) {
            return {
              color: isPerimeter ? "#00ffff" : "#0c2b3d",
              isPerimeter,
              isOwner: true,
            };
          }
          if (isTarget) {
            return {
              color: isPerimeter
                ? (isEnemy ? "#ff4444" : "#00ff66")
                : (isEnemy ? "#280a0e" : "#082115"),
              isPerimeter,
              isOwner: true,
            };
          }
          if (isHovered) {
            const hoverBg = isLobby || !hasOwner ? "#1e293b" : getHoverTint(ownerColor);
            return {
              color: isPerimeter ? "#ffffff" : hoverBg,
              isPerimeter,
              isOwner: true,
            };
          }

          if (isLobby || !hasOwner) {
            return {
              color: isCoast ? "#475569" : "#0f172a",
              isPerimeter,
              isOwner: false,
            };
          }

          return {
            color: isCoast ? ownerColor : getDarkTint(ownerColor),
            isPerimeter,
            isOwner: true,
          };
        };

        const topStyle = getMicroStyle(topTid, true);
        const bottomStyle = getMicroStyle(bottomTid, false);

        if (topStyle.color === bottomStyle.color) {
          // Solid microcell fill
          const isLobby = phase === "lobby";
          const hasOwner = Boolean(
            cellTid &&
              territories[cellTid]?.ownerId &&
              !isLobby
          );
          const owner =
            hasOwner && cellTid
              ? players.find((p) => p.id === territories[cellTid]?.ownerId)
              : undefined;
          const ownerColor = owner?.colorHex ?? "#00d2ff";

          const isSelected =
            Boolean(selectedTerritoryId && (selectedTerritoryId === topTid || selectedTerritoryId === bottomTid));
          const isTarget =
            Boolean(targetTerritoryId && (targetTerritoryId === topTid || targetTerritoryId === bottomTid));

          let fg = isLobby || !hasOwner ? "#475569" : ownerColor;
          let bg = topStyle.color;
          let bold = isSelected || isTarget;

          if (isSelected) {
            fg = "#00ffff";
            bg = "#0c2b3d";
          } else if (isTarget) {
            fg = "#ff4444";
          }

          cell = {
            char: " ",
            fg,
            bg,
            bold,
          };
        } else {
          // Half-block microcell boundary (▀)
          cell = {
            char: "▀",
            fg: topStyle.color,
            bg: bottomStyle.color,
            bold: topStyle.isPerimeter || bottomStyle.isPerimeter,
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

  const availableContentW = contentDimensions
    ? contentDimensions.width
    : terminalDimensions
    ? Math.max(0, Math.floor(Math.max(0, terminalDimensions.columns - 1) * 0.75) - 2)
    : Infinity;
  const availableContentH = contentDimensions
    ? contentDimensions.height
    : terminalDimensions
    ? Math.max(0, terminalDimensions.rows - 19)
    : Infinity;
  const canCenterH = availableContentW >= activeMap.width;
  const canCenterV = availableContentH >= activeMap.height;
  const title =
    terminalDimensions && terminalDimensions.columns < 130
      ? "! WORLD MAP                  Territories • Connections • Empires"
      : "! WORLD MAP                                   Territories • Connections • Empires";

  return (
    <box
      title={title}
      titleColor="#00d2ff"
      border
      borderStyle="single"
      borderColor="#00d2ff"
      backgroundColor="#080f1a"
      alignItems={canCenterH ? "center" : undefined}
      justifyContent={canCenterV ? "center" : undefined}
      style={{ width: "100%", height: "100%" }}
    >
      <box
        flexDirection="column"
        style={{ width: activeMap.width, height: activeMap.height }}
        onMouseDown={(event: any) => {
          const cell = mouseEventToMapCell(event);
          if (!cell) return;
          const clickedId =
            getTerritoryAtCell(cell.x, cell.y, activeMap) ?? getTerritoryAt(cell.x, cell.y, activeMap);
          if (clickedId) {
            handleTerritoryClick(clickedId);
          }
        }}
        onMouseMove={(event: any) => {
          const cell = mouseEventToMapCell(event);
          if (!cell) {
            onHoverTerritory?.(null);
            return;
          }
          const hoveredId =
            getTerritoryAtCell(cell.x, cell.y, activeMap) ?? getTerritoryAt(cell.x, cell.y, activeMap);
          onHoverTerritory?.(hoveredId);
        }}
        onMouseOut={() => {
          onHoverTerritory?.(null);
        }}
      >
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
