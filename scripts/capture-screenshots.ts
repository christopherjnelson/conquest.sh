#!/usr/bin/env bun
/**
 * capture-screenshots.ts
 *
 * Render real game UI states and save PNGs to docs/images/.
 *
 * Approach:
 *  - Use OpenTUI's testRender + captureSpans() to get character+color data per cell.
 *  - Convert to a styled HTML page (monospace font, dark background #080f1a).
 *  - Screenshot with Playwright's Chromium (using the locally cached binary).
 *
 * Run via: bun run screenshots
 */

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "docs", "images");

mkdirSync(OUT_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Types from @opentui/core
// ---------------------------------------------------------------------------
interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
  intent: "rgb" | "indexed" | "default";
}

interface CapturedSpan {
  text: string;
  fg: RGBA;
  bg: RGBA;
  attributes: number;
  width: number;
}

interface CapturedLine {
  spans: CapturedSpan[];
}

interface CapturedFrame {
  cols: number;
  rows: number;
  cursor: [number, number];
  lines: CapturedLine[];
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------
const DEFAULT_FG = { r: 204, g: 213, b: 228 }; // light gray
const DEFAULT_BG = { r: 8, g: 15, b: 26 };      // #080f1a

function rgbaCss(rgba: RGBA, defaultRgb: { r: number; g: number; b: number }): string {
  if (rgba.intent === "default") {
    return `rgb(${defaultRgb.r},${defaultRgb.g},${defaultRgb.b})`;
  }
  // RGBA values from OpenTUI are in 0..1 float range
  const r = Math.round(rgba.r * 255);
  const g = Math.round(rgba.g * 255);
  const b = Math.round(rgba.b * 255);
  return `rgb(${r},${g},${b})`;
}

function isBold(attributes: number): boolean {
  return (attributes & 1) !== 0;
}

function isItalic(attributes: number): boolean {
  return (attributes & 2) !== 0;
}

function isUnderline(attributes: number): boolean {
  return (attributes & 4) !== 0;
}

// ---------------------------------------------------------------------------
// Convert a CapturedFrame to an HTML string
// ---------------------------------------------------------------------------
function frameToHtml(frame: CapturedFrame, title: string): string {
  const FONT_SIZE = 14;
  const LINE_HEIGHT = 18;
  const CHAR_WIDTH = 8.4;

  const pageW = Math.ceil(frame.cols * CHAR_WIDTH) + 8;
  const pageH = frame.rows * LINE_HEIGHT + 8;

  let spans = "";
  for (const line of frame.lines) {
    spans += `<div style="height:${LINE_HEIGHT}px;display:flex;align-items:center;">`;
    for (const span of line.spans) {
      if (!span.text) continue;
      const fg = rgbaCss(span.fg, DEFAULT_FG);
      const bg = rgbaCss(span.bg, DEFAULT_BG);
      const bold = isBold(span.attributes) ? "font-weight:bold;" : "";
      const italic = isItalic(span.attributes) ? "font-style:italic;" : "";
      const underline = isUnderline(span.attributes) ? "text-decoration:underline;" : "";
      // Escape HTML
      const escaped = span.text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      spans += `<span style="color:${fg};background:${bg};${bold}${italic}${underline}white-space:pre;">${escaped}</span>`;
    }
    spans += `</div>`;
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  background: rgb(${DEFAULT_BG.r},${DEFAULT_BG.g},${DEFAULT_BG.b});
  font-family: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Courier New', monospace;
  font-size: ${FONT_SIZE}px;
  line-height: ${LINE_HEIGHT}px;
  letter-spacing: 0;
  width: ${pageW}px;
  height: ${pageH}px;
  overflow: hidden;
  padding: 4px;
}
</style>
</head>
<body>${spans}</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Screenshot HTML to PNG using Playwright
// ---------------------------------------------------------------------------
async function htmlToPng(html: string, outPath: string, width: number, height: number): Promise<void> {
  // We use playwright-core and the cached Chromium binary
  const { chromium } = await import("playwright-core");

  // Try the cached ms-playwright binary first, fall back to system chrome
  const executablePath =
    "/home/chris/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome";

  const browser = await chromium.launch({
    executablePath,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  const page = await browser.newPage();
  await page.setViewportSize({ width, height: height + 8 });
  await page.setContent(html, { waitUntil: "load" });
  // Wait for fonts
  await page.waitForTimeout(200);
  await page.screenshot({ path: outPath, type: "png", clip: { x: 0, y: 0, width, height: height + 8 } });
  await browser.close();
  console.log(`  saved: ${outPath}`);
}

// ---------------------------------------------------------------------------
// Render a component using OpenTUI test renderer, return CapturedFrame
// ---------------------------------------------------------------------------
async function captureComponent(
  element: any,
  cols: number,
  rows: number,
): Promise<CapturedFrame> {
  // @ts-ignore runtime-only OpenTUI modules
  const { act } = await import("../apps/client/node_modules/react/index.js");
  // @ts-ignore runtime-only OpenTUI modules
  const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");

  const setup = await testRender(element, { width: cols, height: rows });
  await act(async () => { await setup.renderOnce(); });
  // Wait for any animations to settle
  await act(async () => { await setup.renderOnce(); });
  const frame = setup.captureSpans();
  await act(async () => { setup.renderer.destroy(); });
  return frame;
}

// ---------------------------------------------------------------------------
// Compute HTML/PNG dimensions from frame
// ---------------------------------------------------------------------------
function frameDimensions(frame: CapturedFrame): { width: number; height: number } {
  const CHAR_WIDTH = 8.4;
  const LINE_HEIGHT = 18;
  return {
    width: Math.ceil(frame.cols * CHAR_WIDTH) + 8,
    height: frame.rows * LINE_HEIGHT + 8,
  };
}

// ---------------------------------------------------------------------------
// Helper: build a mid-game Earth-42 GameState
// ---------------------------------------------------------------------------
async function buildMidGameState() {
  const { EARTH_42 } = await import("../packages/map-engine/src/maps/earth-42.js");
  const { createInitialGameState } = await import("../packages/game-core/src/index.js");

  const players: any[] = [
    { id: "p1", name: "Commander Atlas", colorIndex: 0, colorHex: "#00d2ff", connected: true, isAlive: true, ready: true, rematchReady: false },
    { id: "p2", name: "General Bravo", colorIndex: 1, colorHex: "#ff4444", connected: true, isAlive: true, ready: true, rematchReady: false },
    { id: "p3", name: "Admiral Crest", colorIndex: 2, colorHex: "#00ff99", connected: true, isAlive: true, ready: true, rematchReady: false },
    { id: "p4", name: "Baron Dusk", colorIndex: 3, colorHex: "#ff9900", connected: true, isAlive: true, ready: true, rematchReady: false },
  ];

  // Use a fixed shuffle to get deterministic territory assignment
  function seededShuffle<T>(arr: T[]): T[] {
    // sfc32 seed
    let a = 0xdeadbeef, b = 0xcafebabe, c = 0x12345678, d = 0x87654321;
    function rand() {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
      let t = (a + b) | 0;
      a = b ^ (b >>> 9);
      b = c + (c << 3) | 0;
      c = c << 21 | c >>> 11;
      d = d + 1 | 0;
      t = t + d | 0;
      c = c + t | 0;
      return (t >>> 0) / 4294967296;
    }
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  const state = createInitialGameState("mid-game", "DEMO", players, EARTH_42, 3, seededShuffle);

  // Boost some army counts for visual interest
  const territories = state.territories;
  const tIds = Object.keys(territories);
  for (let i = 0; i < tIds.length; i++) {
    const t = territories[tIds[i]];
    if (i % 3 === 0) t.units = Math.max(1, Math.floor(Math.random() * 8) + 2);
  }

  // Force phase to attack
  state.phase = "attack";
  state.turnNumber = 5;
  state.pendingReinforcements = 0;

  return { state, players };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  // @ts-ignore runtime-only OpenTUI modules
  const React = (await import("../apps/client/node_modules/react/index.js")).default;
  const { HomeScreen } = await import("../apps/client/src/ui/HomeScreen.js");
  const { App } = await import("../apps/client/src/ui/App.js");
  const { MatchResultsScreen } = await import("../apps/client/src/ui/MatchResultsScreen.js");
  const { EARTH_42_BUNDLE } = await import("../packages/map-engine/src/maps/earth-42.js");
  const { createInitialGameState, finalizeMatch } = await import("../packages/game-core/src/index.js");
  const { EARTH_42 } = await import("../packages/map-engine/src/maps/earth-42.js");

  // -------------------------------------------------------------------------
  // (a) Home screen
  // -------------------------------------------------------------------------
  console.log("\n[a] Rendering home screen...");
  {
    const cols = 120;
    const rows = 36;
    const el = React.createElement(HomeScreen, {
      serverName: "conquest.sh-server",
      serverHost: "localhost:4000",
      connectionStatus: "connected",
      playerName: "Commander",
      cachedSession: null,
      errorMessage: null,
      onBrowseGames: () => {},
      onCreateGame: () => {},
      onJoinByCode: () => {},
      onServerInfo: () => {},
      onQuit: () => {},
      terminalDimensions: { columns: cols, rows },
    });
    const frame = await captureComponent(el, cols, rows);
    const html = frameToHtml(frame, "conquest.sh – Home Screen");
    const { width, height } = frameDimensions(frame);
    const htmlPath = "/tmp/conquest-screen-a.html";
    writeFileSync(htmlPath, html);
    await htmlToPng(html, join(OUT_DIR, "home-screen.png"), width, height);
  }

  // -------------------------------------------------------------------------
  // (b) Lobby with players and ready states
  // -------------------------------------------------------------------------
  console.log("\n[b] Rendering lobby...");
  {
    const cols = 180;
    const rows = 51;
    const lobbyState: any = {
      gameId: "lobby-demo",
      mapId: "earth-42",
      roomCode: "DEMO",
      turnNumber: 0,
      activePlayerIndex: 0,
      phase: "lobby",
      players: [
        { id: "p1", name: "Commander Atlas", colorIndex: 0, colorHex: "#00d2ff", connected: true, isAlive: true, ready: true, rematchReady: false },
        { id: "p2", name: "General Bravo", colorIndex: 1, colorHex: "#ff4444", connected: true, isAlive: true, ready: false, rematchReady: false },
        { id: "p3", name: "Admiral Crest", colorIndex: 2, colorHex: "#00ff99", connected: true, isAlive: true, ready: true, rematchReady: false },
        { id: "p4", name: "Baron Dusk", colorIndex: 3, colorHex: "#ff9900", connected: false, isAlive: true, ready: false, rematchReady: false },
      ],
      territories: {},
      sectors: {},
      pendingReinforcements: 0,
      pendingConquestMove: null,
      hasConqueredThisTurn: false,
      winnerId: null,
      result: null,
      matchNumber: 1,
      history: [],
      turnDeadlineAt: null,
    };
    const client: any = {
      state: lobbyState,
      myPlayerId: "p1",
      status: "connected",
      roomCode: "DEMO",
      onSnapshot: () => () => {},
      onEvent: () => () => {},
      onStatusChange: () => () => {},
      onError: () => () => {},
      sendChat: () => {},
      deploy: () => {},
      attack: () => {},
      fortify: () => {},
      skipPhase: () => {},
      endTurn: () => {},
      ready: () => {},
    };
    const el = React.createElement(App, {
      client,
      terminalDimensions: { columns: cols, rows },
    });
    const frame = await captureComponent(el, cols, rows);
    const html = frameToHtml(frame, "conquest.sh – Lobby");
    const { width, height } = frameDimensions(frame);
    await htmlToPng(html, join(OUT_DIR, "lobby.png"), width, height);
  }

  // -------------------------------------------------------------------------
  // Build mid-game state for (c), (d), (e)
  // -------------------------------------------------------------------------
  console.log("\n[c,d,e] Building mid-game state...");

  function seededShuffle<T>(arr: T[]): T[] {
    let a = 0xdeadbeef, b = 0xcafebabe, c = 0x12345678, d = 0x87654321;
    function rand() {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
      let t = (a + b) | 0;
      a = b ^ (b >>> 9);
      b = c + (c << 3) | 0;
      c = (c << 21) | (c >>> 11);
      d = (d + 1) | 0;
      t = (t + d) | 0;
      c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    }
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  const players: any[] = [
    { id: "p1", name: "Atlas", colorIndex: 0, colorHex: "#00d2ff", connected: true, isAlive: true, ready: true, rematchReady: false },
    { id: "p2", name: "Bravo", colorIndex: 1, colorHex: "#ff4444", connected: true, isAlive: true, ready: true, rematchReady: false },
    { id: "p3", name: "Crest", colorIndex: 2, colorHex: "#00ff99", connected: true, isAlive: true, ready: true, rematchReady: false },
  ];

  const midState = createInitialGameState("mid-game-demo", "E42D", players, EARTH_42, 3, seededShuffle);
  midState.phase = "attack";
  midState.turnNumber = 7;
  midState.pendingReinforcements = 0;
  midState.hasConqueredThisTurn = false;

  // Boost some territory armies for interest
  const tIds = Object.keys(midState.territories);
  for (let i = 0; i < tIds.length; i++) {
    if (i % 4 === 0) midState.territories[tIds[i]].units = 5 + (i % 7);
    if (i % 7 === 0) midState.territories[tIds[i]].units = 10 + (i % 5);
  }

  // Pick selected territory (owned by p1) and a target (owned by someone else adjacent)
  let selectedTerritoryId: string | null = null;
  let targetTerritoryId: string | null = null;
  for (const [id, t] of Object.entries(midState.territories)) {
    if (t.ownerId === "p1" && t.units >= 3 && !selectedTerritoryId) {
      // Find an adjacent enemy
      for (const neighborId of (EARTH_42.territories.find((x) => x.id === id)?.neighbors ?? [])) {
        const neighbor = midState.territories[neighborId];
        if (neighbor && neighbor.ownerId !== "p1") {
          selectedTerritoryId = id;
          targetTerritoryId = neighborId;
          break;
        }
      }
    }
    if (selectedTerritoryId) break;
  }

  // -------------------------------------------------------------------------
  // (c) Wide layout, mid-game
  // -------------------------------------------------------------------------
  console.log("\n[c] Rendering wide mid-game...");
  {
    const cols = 200;
    const rows = 55;
    const client: any = {
      state: midState,
      myPlayerId: "p1",
      status: "connected",
      roomCode: "E42D",
      onSnapshot: () => () => {},
      onEvent: () => () => {},
      onStatusChange: () => () => {},
      onError: () => () => {},
      sendChat: () => {},
      deploy: () => {},
      attack: () => {},
      fortify: () => {},
      skipPhase: () => {},
      endTurn: () => {},
      ready: () => {},
    };
    const el = React.createElement(App, {
      client,
      terminalDimensions: { columns: cols, rows },
      initialSelectedTerritoryId: selectedTerritoryId,
      initialTargetTerritoryId: targetTerritoryId,
    });
    const frame = await captureComponent(el, cols, rows);
    const html = frameToHtml(frame, "conquest.sh – Wide Map");
    const { width, height } = frameDimensions(frame);
    await htmlToPng(html, join(OUT_DIR, "ingame-wide.png"), width, height);
  }

  // -------------------------------------------------------------------------
  // (d) Same, with battle report panel
  // -------------------------------------------------------------------------
  console.log("\n[d] Rendering battle report panel...");
  {
    const { MapCanvas } = await import("../apps/client/src/ui/MapCanvas.js");
    const { getMapContentDimensionsForLayout } = await import("../packages/map-engine/src/index.js");
    const cols = 200;
    const rows = 55;
    const paneDims = getMapContentDimensionsForLayout(cols, rows, "wide");

    const battleReport: any = {
      key: "demo-battle",
      attackerName: "Atlas",
      attackerColor: "#00d2ff",
      defenderName: "Bravo",
      defenderColor: "#ff4444",
      sourceTerritoryName: selectedTerritoryId
        ? (EARTH_42.territories.find((t) => t.id === selectedTerritoryId)?.name ?? "Alaska Range")
        : "Alaska Range",
      targetTerritoryName: targetTerritoryId
        ? (EARTH_42.territories.find((t) => t.id === targetTerritoryId)?.name ?? "Kamchatka")
        : "Kamchatka",
      attackerRolls: [6, 5, 2],
      defenderRolls: [4, 3],
      pairs: [
        { attackerDie: 6, defenderDie: 4, attackerWins: true },
        { attackerDie: 5, defenderDie: 3, attackerWins: true },
      ],
      unpairedAttackerDice: [2],
      attackerLosses: 0,
      defenderLosses: 2,
      attackerUnitsBefore: 7,
      defenderUnitsBefore: 4,
      attackerUnitsAfter: 7,
      defenderUnitsAfter: 2,
      conquered: false,
      engagementRound: 2,
      engagementAttackerLosses: 0,
      engagementDefenderLosses: 3,
    };

    const el = React.createElement(MapCanvas, {
      mapBundle: EARTH_42_BUNDLE,
      contentDimensions: paneDims,
      territories: midState.territories,
      players: midState.players,
      myPlayerId: "p1",
      phase: "attack" as const,
      selectedTerritoryId,
      targetTerritoryId,
      onSelectTerritory: () => {},
      onSelectTarget: () => {},
      onDeselect: () => {},
      battle: battleReport,
      battleAnimate: false,
    });
    const frame = await captureComponent(el, paneDims.width, paneDims.height);
    const html = frameToHtml(frame, "conquest.sh – Battle Panel");
    const { width, height } = frameDimensions(frame);
    await htmlToPng(html, join(OUT_DIR, "ingame-battle-panel.png"), width, height);
  }

  // -------------------------------------------------------------------------
  // (e) Compact layout
  // -------------------------------------------------------------------------
  console.log("\n[e] Rendering compact layout...");
  {
    const cols = 100;
    const rows = 38;
    const client: any = {
      state: midState,
      myPlayerId: "p1",
      status: "connected",
      roomCode: "E42D",
      onSnapshot: () => () => {},
      onEvent: () => () => {},
      onStatusChange: () => () => {},
      onError: () => () => {},
      sendChat: () => {},
      deploy: () => {},
      attack: () => {},
      fortify: () => {},
      skipPhase: () => {},
      endTurn: () => {},
      ready: () => {},
    };
    const el = React.createElement(App, {
      client,
      terminalDimensions: { columns: cols, rows },
    });
    const frame = await captureComponent(el, cols, rows);
    const html = frameToHtml(frame, "conquest.sh – Compact Layout");
    const { width, height } = frameDimensions(frame);
    await htmlToPng(html, join(OUT_DIR, "ingame-compact.png"), width, height);
  }

  // -------------------------------------------------------------------------
  // (f) Match results screen
  // -------------------------------------------------------------------------
  console.log("\n[f] Rendering match results...");
  {
    const cols = 140;
    const rows = 45;

    const resultPlayers: any[] = [
      { id: "p1", name: "Atlas", colorIndex: 0, colorHex: "#00d2ff", connected: true, isAlive: true, ready: true, rematchReady: false },
      { id: "p2", name: "Bravo", colorIndex: 1, colorHex: "#ff4444", connected: true, isAlive: false, ready: true, rematchReady: true },
      { id: "p3", name: "Crest", colorIndex: 2, colorHex: "#00ff99", connected: true, isAlive: false, ready: true, rematchReady: false },
    ];

    const resultState: any = {
      gameId: "result-demo",
      mapId: "earth-42",
      roomCode: "E42R",
      turnNumber: 24,
      activePlayerIndex: 0,
      phase: "game_over",
      players: resultPlayers,
      territories: {},
      sectors: {},
      pendingReinforcements: 0,
      pendingConquestMove: null,
      hasConqueredThisTurn: false,
      winnerId: "p1",
      result: {
        winnerId: "p1",
        winnerName: "Atlas",
        reason: "conquest",
        turnNumber: 24,
        startedAt: Date.now() - 18 * 60000,
        endedAt: Date.now(),
        durationMs: 18 * 60000,
        players: [
          { playerId: "p1", playerName: "Atlas", placement: 1, finalTerritories: 42, finalArmies: 127, eliminated: false },
          { playerId: "p2", playerName: "Bravo", placement: 2, finalTerritories: 0, finalArmies: 0, eliminated: true, eliminatedBy: "Atlas" },
          { playerId: "p3", playerName: "Crest", placement: 3, finalTerritories: 0, finalArmies: 0, eliminated: true, eliminatedBy: "Atlas" },
        ],
      },
      matchNumber: 1,
      startedAt: Date.now() - 18 * 60000,
      endedAt: Date.now(),
      history: [],
      turnDeadlineAt: null,
    };

    const el = React.createElement(MatchResultsScreen, {
      mapBundle: EARTH_42_BUNDLE,
      state: resultState,
      myPlayerId: "p1",
      onRematch: () => {},
      onReturnHome: () => {},
      onQuit: () => {},
      terminalDimensions: { columns: cols, rows },
    });
    const frame = await captureComponent(el, cols, rows);
    const html = frameToHtml(frame, "conquest.sh – Match Results");
    const { width, height } = frameDimensions(frame);
    await htmlToPng(html, join(OUT_DIR, "match-results.png"), width, height);
  }

  console.log("\nAll screenshots saved to docs/images/");
  console.log("Files:");
  for (const f of ["home-screen.png", "lobby.png", "ingame-wide.png", "ingame-battle-panel.png", "ingame-compact.png", "match-results.png"]) {
    const { statSync } = await import("fs");
    try {
      const st = statSync(join(OUT_DIR, f));
      console.log(`  ${f}: ${Math.round(st.size / 1024)} KB`);
    } catch {
      console.log(`  ${f}: MISSING`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
