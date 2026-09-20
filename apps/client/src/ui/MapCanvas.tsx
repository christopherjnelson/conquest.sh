import React from "react";
import type { GamePhase, Player, TerritoryState } from "@conquest/protocol";
import {
  MAP_GRID_IRONREACH,
  MAP_GRID_IRONREACH_COMPACT,
  MAP_GRID_IRONREACH_WIDE,
  type GridMapDefinition,
  getBorderInfo,
  getGeographyBoundingBox,
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
  // Owned interiors need enough chroma to read as connected realms at a
  // whole-screen glance, while coastlines and selected cyan stay brighter.
  const weight = isOdd ? 0.42 : 0.36;
  return mixColors(color, "#080f1a", weight);
}

/**
 * Neutral regions still carry a little of their sector identity.  Keeping this
 * darker than owned land makes ownership the first thing the eye reads.
 */
function getUnclaimedTint(color: string, tid?: string | null): string {
  // Explicit xterm-cube shades prevent RGB blending from being quantized into
  // a shared charcoal while keeping every unclaimed sector very dark.
  const xtermTint: Record<string, string> = {
    "#00ff66": "#005f00", // Verdant Fringe
    "#ffaa00": "#5f5f00", // Amber Steppes
    "#00d2ff": "#005f87", // Northreach
    "#ff4444": "#5f0000", // Crimson Caldera
    "#9966ff": "#5f005f", // The Blackfen
    "#22c55e": "#005f5f", // Emerald Isles
  };
  return xtermTint[color.toLowerCase()] ?? mixColors(color, "#080f1a", 0.34);
}

function getHoverTint(color: string): string {
  return mixColors(color, "#080f1a", 0.45);
}

function getPoliticalBorderTint(color: string, tid?: string | null): string {
  const isOdd = tid ? (tid.charCodeAt(1) || 0) % 2 === 1 : false;
  const weight = isOdd ? 0.65 : 0.55;
  return mixColors(color, "#080f1a", weight);
}

/**
 * A small, stable terrain grain for otherwise flat territory interiors.  The
 * seed uses authored map coordinates, so it neither flickers nor turns into a
 * screen-aligned checkerboard when a pane is resized.  It deliberately uses a
 * sparse pair of low-contrast marks instead of lines or repeated tiles: this
 * reads as printed terrain texture at a glance and stays secondary to owners,
 * borders, and tactical highlights.
 */
export function getTerrainTextureMark(
  territoryId: string,
  x: number,
  microY: number
): "" | "·" | "░" {
  // Avalanche the two coordinates before reducing them. A simple linear
  // modulus creates visible diagonals/columns on a grid, which reads like a
  // circuit trace rather than terrain. This mix has no repeating row or
  // column relationship at the map's scale.
  const territorySeed = territoryId.charCodeAt(0) * 0x9e37 + territoryId.charCodeAt(1) * 0x85eb;
  let value = Math.imul(x + territorySeed, 0x85ebca6b) ^ Math.imul(microY + territorySeed, 0xc2b2ae35);
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  const bucket = (value >>> 0) % 71;
  if (bucket === 0) return "░";
  if (bucket === 1) return "·";
  return "";
}

function getTerrainTextureColor(ownerColor: string, base: string, mark: "·" | "░"): string {
  // Keep the texture within the territory's palette. The denser mark is only
  // slightly stronger, which avoids giving quiet land a noisy, tiled surface.
  return mixColors(ownerColor, base, mark === "░" ? 0.42 : 0.28);
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
  const land = getGeographyBoundingBox(mapDef);

  const findOceanPocket = (width: number, height: number, preferredX: number, preferredY: number) => {
    let best: { x: number; y: number; score: number } | null = null;
    for (let y = land.minY; y <= land.maxY - height + 1; y++) {
      for (let x = land.minX; x <= land.maxX - width + 1; x++) {
        let waterOnly = true;
        for (let my = 2 * y; my < 2 * (y + height) && waterOnly; my++) {
          for (let mx = x; mx < x + width; mx++) {
            if (mapDef.microTemplate[my]?.[mx] !== ".") {
              waterOnly = false;
              break;
            }
          }
        }
        if (!waterOnly) continue;
        const score = Math.abs(x - preferredX) + 2 * Math.abs(y - preferredY);
        if (!best || score < best.score) best = { x, y, score };
      }
    }
    return best;
  };

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
  // Decorations must occupy a fully water-filled pocket; simply clamping an
  // authored coordinate to the crop can place them under land and clip letters.
  const compassPocket = findOceanPocket(5, 3, land.minX + 2, land.maxY - 3);
  const compassX = compassPocket?.x ?? compass.x;
  const compassY = compassPocket?.y ?? compass.y;
  setStr(compassX + 2, compassY, "N", "#94a3b8", true);
  setStr(compassX, compassY + 1, "W ┼ E", "#64748b");
  setStr(compassX + 2, compassY + 1, "┼", "#38bdf8", true);
  setStr(compassX + 2, compassY + 2, "S", "#94a3b8", true);

  // Scale bar
  const scalePocket = findOceanPocket(27, 2, scaleBar.x, land.maxY - 1);
  const scaleX = scalePocket?.x ?? scaleBar.x;
  const scaleY = scalePocket?.y ?? scaleBar.y;
  setStr(scaleX, scaleY, "0   250  500  750  1000 km", "#64748b");
  setStr(scaleX, scaleY + 1, "├───┼────┼────┼────┤", "#475569");

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

export interface MapRenderLayout {
  width: number;
  height: number;
  sourceX: number;
  sourceY: number;
  land: ReturnType<typeof getGeographyBoundingBox>;
  landWidthRatio: number;
  landHeightRatio: number;
}

/**
 * The renderer owns no magic placement offsets: its usable map extent is the
 * geography extent supplied by map-engine.  Keeping this small, exported
 * description lets visual regressions measure what is actually painted as
 * land, while decoration remains deliberately outside that measurement.
 */
export function getMapRenderLayout(
  map: GridMapDefinition,
  available?: { width: number; height: number }
): MapRenderLayout {
  const land = getGeographyBoundingBox(map);
  return {
    // Crop only ocean margins. This makes the rendered raster track authored
    // geography instead of relying on a hand-tuned screen offset.
    width: land.width,
    height: land.height,
    sourceX: land.minX,
    sourceY: land.minY,
    land,
    landWidthRatio: !available || available.width <= 0 ? 1 : land.width / available.width,
    landHeightRatio: !available || available.height <= 0 ? 1 : land.height / available.height,
  };
}

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
  const renderLayout = getMapRenderLayout(activeMap, {
    width: Number.isFinite(availableContentW) ? availableContentW : activeMap.width,
    height: Number.isFinite(availableContentH) ? availableContentH : activeMap.height,
  });

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

    type SafeRun = { minX: number; maxX: number };
    const findSafeRun = (row: number, needed: number): SafeRun | null => {
      const candidates: SafeRun[] = [];
      let start: number | null = null;
      for (let x = 0; x <= activeMap.width; x++) {
        const safe =
          x < activeMap.width &&
          getTerritoryAt(x, row, activeMap) === t.id &&
          !getBorderInfo(x, row, activeMap).isBorder;
        if (safe && start === null) start = x;
        if (!safe && start !== null) {
          if (x - start >= needed) candidates.push({ minX: start, maxX: x - 1 });
          start = null;
        }
      }
      return candidates.sort((a, b) => {
        const distanceA = Math.abs((a.minX + a.maxX) / 2 - t.labelPos.x);
        const distanceB = Math.abs((b.minX + b.maxX) / 2 - t.labelPos.x);
        return distanceA - distanceB || (b.maxX - b.minX) - (a.maxX - a.minX);
      })[0] ?? null;
    };
    const startInRun = (run: SafeRun, textWidth: number) =>
      Math.round(run.minX + (run.maxX - run.minX + 1 - textWidth) / 2);

    const nameWords = t.name.toUpperCase().split(" ");
    const shortName = nameWords[0].slice(0, 4);
    const nameCandidates = [
      t.name.toUpperCase(),
      nameWords.length > 1 ? `${nameWords[0][0]}. ${nameWords.slice(1).join(" ")}` : "",
      nameWords[0],
      shortName,
      t.id,
    ].filter((value, index, values) => value.length > 0 && values.indexOf(value) === index);
    const candidateRows = [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5]
      .map((offset) => t.labelPos.y + offset)
      .filter((row, index, rows) => row >= 0 && row < activeMap.height && rows.indexOf(row) === index);
    const line1Placement = nameCandidates
      .flatMap((text) => candidateRows.map((row) => ({ text, row, run: findSafeRun(row, text.length) })))
      .find((placement) => placement.run !== null);
    const line1Text = line1Placement?.text ?? t.id;
    const line1Y = line1Placement?.row ?? t.labelPos.y;
    const line1Run = line1Placement?.run ?? null;
    const line1StartX = line1Run ? startInRun(line1Run, line1Text.length) : t.labelPos.x;

    // Line 1 is the visual anchor. The name is primary; the concise ID and
    // army count sit beneath it so dense territories remain scannable.
    if (line1Run) {
      for (let i = 0; i < line1Text.length; i++) {
        setLabelPoint(
          line1StartX + i,
          line1Y,
          line1Text[i],
          "#f8fafc",
          true
        );
      }
    }

    // Line 2: secondary ID, icon and immediately readable unit count.
    const unitDigits = String(units);
    const line2TextWidth = t.id.length + 3 + unitDigits.length;
    const line2Rows = [line1Y + 1, line1Y - 1, ...candidateRows]
      .filter((row, index, rows) => row >= 0 && row < activeMap.height && row !== line1Y && rows.indexOf(row) === index);
    const line2Placement = line2Rows
      .map((row) => ({ row, run: findSafeRun(row, line2TextWidth) }))
      .find((placement) => placement.run !== null);
    const line2Run = line2Placement?.run ?? null;
    // If a narrow territory cannot carry the icon, keep the compact ID/count
    // on owned land rather than allowing any label glyph to cross a coastline.
    const compactLine2Width = t.id.length + 1 + unitDigits.length;
    const compactLine2Placement = line2Run
      ? null
      : line2Rows
          .map((row) => ({ row, run: findSafeRun(row, compactLine2Width) }))
          .find((placement) => placement.run !== null);
    const compactLine2Run = compactLine2Placement?.run ?? null;
    const line2Y = line2Placement?.row ?? compactLine2Placement?.row ?? null;
    const line2StartX = line2Run
      ? startInRun(line2Run, line2TextWidth)
      : compactLine2Run
      ? startInRun(compactLine2Run, compactLine2Width)
      : null;
    if (line2StartX === null || line2Y === null) continue;
    for (let i = 0; i < t.id.length; i++) {
      setLabelPoint(line2StartX + i, line2Y, t.id[i], "#67e8f9", true);
    }
    if (line2Run) {
      setLabelPoint(line2StartX + t.id.length, line2Y, " ", "#94a3b8", false);
      setLabelPoint(line2StartX + t.id.length + 1, line2Y, t.icon, ownerColor, true);
      setLabelPoint(line2StartX + t.id.length + 2, line2Y, " ", "#ffffff", false);
    } else {
      setLabelPoint(line2StartX + t.id.length, line2Y, " ", "#94a3b8", false);
    }
    for (let i = 0; i < unitDigits.length; i++) {
      setLabelPoint(line2StartX + t.id.length + (line2Run ? 3 : 1) + i, line2Y, unitDigits[i], "#ffffff", true);
    }
  }

  // Generate lines of cellular characters
  const rows: SpanRun[][] = [];

  for (let y = renderLayout.sourceY; y <= renderLayout.land.maxY; y++) {
    const runs: SpanRun[] = [];

    for (let x = renderLayout.sourceX; x <= renderLayout.land.maxX; x++) {
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

          const neutralTint = getUnclaimedTint(territory?.regionColor ?? "#64748b", cellTid);
          labelBg = isSelected
            ? "#0c2b3d"
            : isTarget
            ? isEnemy
              ? "#280a0e"
              : "#082115"
            : isHovered
            ? hoverBg
            : isLobby || !hasOwner
            ? neutralTint
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
              color: isPerimeter ? "#00bcd4" : "#0b2735",
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
              color: isCoast
                ? mixColors(territory?.regionColor ?? "#64748b", "#080f1a", 0.54)
                : isPoliticalBorder
                ? mixColors(territory?.regionColor ?? "#64748b", "#080f1a", 0.39)
                : getUnclaimedTint(territory?.regionColor ?? "#64748b", tid),
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
          const isHovered = hoveredTerritoryId === tid;
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
              fg: "#00bcd4",
              bg: "#0b2735",
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
              fg: isLobby || !hasOwner
                ? mixColors(activeMap.territories.find((t) => t.id === tid)?.regionColor ?? "#64748b", "#080f1a", 0.48)
                : getPoliticalBorderTint(ownerColor, tid),
              bg: topStyle.color,
              bold: true,
            };
          } else {
            // Quiet interior land gets a sparse, owner/region-derived grain.
            // Interaction states remain clear solid fields so the cyan/red/
            // green tactical signals are never diluted by the texture.
            const territory = activeMap.territories.find((candidate) => candidate.id === tid);
            const terrainColor = isLobby || !hasOwner
              ? (territory?.regionColor ?? "#64748b")
              : ownerColor;
            // Tactical fills must stay genuinely solid throughout their
            // interiors. A textured selected or target field makes a sparse
            // terrain mark look like a state indicator at terminal scale.
            const mark = tid && !isHovered && !isSelected && !isTarget
              ? getTerrainTextureMark(tid, x, 2 * y)
              : "";
            cell = {
              char: mark || " ",
              fg: mark
                ? getTerrainTextureColor(terrainColor, topStyle.color, mark)
                : isLobby || !hasOwner
                ? mixColors(terrainColor, "#080f1a", 0.44)
                : ownerColor,
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

  const canCenterH = availableContentW >= renderLayout.width;
  const canCenterV = availableContentH >= renderLayout.height;
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
        style={{ width: renderLayout.width, height: renderLayout.height }}
        onMouseDown={(event: any) => {
          const cell = mouseEventToMapCell(event);
          if (!cell) return;
          const mapX = cell.x + renderLayout.sourceX;
          const mapY = cell.y + renderLayout.sourceY;
          const clickedId =
            getTerritoryAtCell(mapX, mapY, activeMap) ?? getTerritoryAt(mapX, mapY, activeMap);
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
          const mapX = cell.x + renderLayout.sourceX;
          const mapY = cell.y + renderLayout.sourceY;
          const hoveredId =
            getTerritoryAtCell(mapX, mapY, activeMap) ?? getTerritoryAt(mapX, mapY, activeMap);
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
