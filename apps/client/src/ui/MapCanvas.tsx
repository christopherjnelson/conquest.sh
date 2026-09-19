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

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16),
      parseInt(clean[1] + clean[1], 16),
      parseInt(clean[2] + clean[2], 16),
    ];
  }
  if (clean.length >= 6) {
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ];
  }
  return [100, 116, 139];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const toHex = (v: number) => clamp(v).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function mixColors(c1: string, c2: string, weight1: number): string {
  const rgb1 = hexToRgb(c1);
  const rgb2 = hexToRgb(c2);
  const w1 = Math.max(0, Math.min(1, weight1));
  const w2 = 1 - w1;
  return rgbToHex(
    rgb1[0] * w1 + rgb2[0] * w2,
    rgb1[1] * w1 + rgb2[1] * w2,
    rgb1[2] * w1 + rgb2[2] * w2
  );
}

// Background tint based on owner/region color
function getDarkTint(color: string, tid?: string | null): string {
  const isOdd = tid ? (tid.charCodeAt(1) || 0) % 2 === 1 : false;
  const weight = isOdd ? 0.28 : 0.20;
  return mixColors(color, "#080f1a", weight);
}

function getHoverTint(color: string): string {
  return mixColors(color, "#080f1a", 0.45);
}

function getPoliticalBorderTint(color: string, tid?: string | null): string {
  const isOdd = tid ? (tid.charCodeAt(1) || 0) % 2 === 1 : false;
  const weight = isOdd ? 0.65 : 0.55;
  return mixColors(color, "#080f1a", weight);
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
        (s) => s.name?.toLowerCase() === t.name.toLowerCase()
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
              (s) => s.name?.toLowerCase() === territory?.name.toLowerCase()
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
            : getDarkTint(ownerColor, cellTid);
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
        // 3. High-resolution terrain & political boundary rendering
        const getMicroStyle = (tid: string | null, isTop: boolean) => {
          if (!tid) {
            return { color: "#080f1a", isPerimeter: false, isPoliticalBorder: false, isOwner: false };
          }
          const territory = activeMap.territories.find((t) => t.id === tid);
          const tState =
            territories[tid] ??
            Object.values(territories).find(
              (s) => s.name?.toLowerCase() === territory?.name.toLowerCase()
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
          const isPoliticalBorder =
            (nT !== null && nT !== tid) ||
            (sT !== null && sT !== tid) ||
            (wT !== null && wT !== tid) ||
            (eT !== null && eT !== tid);
          const isPerimeter = isCoast || isPoliticalBorder;

          if (isSelected) {
            return {
              color: isPerimeter ? "#00ffff" : "#0c2b3d",
              isPerimeter,
              isPoliticalBorder,
              isOwner: true,
            };
          }
          if (isTarget) {
            return {
              color: isPerimeter
                ? (isEnemy ? "#ff4444" : "#00ff66")
                : (isEnemy ? "#280a0e" : "#082115"),
              isPerimeter,
              isPoliticalBorder,
              isOwner: true,
            };
          }
          if (isHovered) {
            const hoverBg = isLobby || !hasOwner ? "#1e293b" : getHoverTint(ownerColor);
            return {
              color: isPerimeter ? "#ffffff" : hoverBg,
              isPerimeter,
              isPoliticalBorder,
              isOwner: true,
            };
          }

          if (isLobby || !hasOwner) {
            return {
              color: isCoast ? "#475569" : isPoliticalBorder ? "#1e293b" : "#0f172a",
              isPerimeter,
              isPoliticalBorder,
              isOwner: false,
            };
          }

          return {
            color: isCoast
              ? ownerColor
              : isPoliticalBorder
              ? getPoliticalBorderTint(ownerColor, tid)
              : getDarkTint(ownerColor, tid),
            isPerimeter,
            isPoliticalBorder,
            isOwner: true,
          };
        };

        const topStyle = getMicroStyle(topTid, true);
        const bottomStyle = getMicroStyle(bottomTid, false);

        if (topTid !== bottomTid) {
          // Half-block microcell boundary between two different territories (or coastline)
          cell = {
            char: "▀",
            fg: topStyle.color,
            bg: bottomStyle.color,
            bold: topStyle.isPerimeter || bottomStyle.isPerimeter,
          };
        } else {
          // Both microcells belong to the same territory (cellTid = topTid)
          const tid = topTid;
          const isLobby = phase === "lobby";
          const hasOwner = Boolean(
            tid &&
              territories[tid]?.ownerId &&
              !isLobby
          );
          const owner =
            hasOwner && tid
              ? players.find((p) => p.id === territories[tid]?.ownerId)
              : undefined;
          const ownerColor = owner?.colorHex ?? "#00d2ff";

          const isSelected = selectedTerritoryId === tid;
          const isTarget = targetTerritoryId === tid;
          const isEnemy = Boolean(hasOwner && territories[tid!]?.ownerId && myPlayerId && territories[tid!]?.ownerId !== myPlayerId);

          // Check if horizontally adjacent to another land territory
          const eastTop = getMicroTerritoryAt(x + 1, 2 * y, activeMap);
          const eastBot = getMicroTerritoryAt(x + 1, 2 * y + 1, activeMap);
          const westTop = getMicroTerritoryAt(x - 1, 2 * y, activeMap);
          const westBot = getMicroTerritoryAt(x - 1, 2 * y + 1, activeMap);

          const isEastLandBorder = (eastTop !== null && eastTop !== tid) || (eastBot !== null && eastBot !== tid);
          const isWestLandBorder = (westTop !== null && westTop !== tid) || (westBot !== null && westBot !== tid);

          if (isSelected && (isEastLandBorder || isWestLandBorder || topStyle.isPerimeter)) {
            // Selected perimeter: strongest neon
            cell = {
              char: isWestLandBorder ? "▌" : isEastLandBorder ? "▐" : "█",
              fg: "#00ffff",
              bg: topStyle.color,
              bold: true,
            };
          } else if (isTarget && (isEastLandBorder || isWestLandBorder || topStyle.isPerimeter)) {
            // Target perimeter: strong red/green
            cell = {
              char: isWestLandBorder ? "▌" : isEastLandBorder ? "▐" : "█",
              fg: isEnemy ? "#ff4444" : "#00ff66",
              bg: topStyle.color,
              bold: true,
            };
          } else if (isEastLandBorder || isWestLandBorder) {
            // Political boundary: subtle but visible separator between adjacent territories
            cell = {
              char: "·",
              fg: isLobby || !hasOwner ? "#64748b" : getPoliticalBorderTint(ownerColor, tid),
              bg: topStyle.color,
              bold: true,
            };
          } else {
            // Quiet interior land
            cell = {
              char: " ",
              fg: isLobby || !hasOwner ? "#475569" : ownerColor,
              bg: topStyle.color,
              bold: false,
            };
          }
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
