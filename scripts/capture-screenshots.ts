#!/usr/bin/env bun
/**
 * capture-screenshots.ts
 *
 * Render real game UI states and save PNGs to docs/images/.
 *
 * Approach:
 *  - Start a real ConquestServer in-process (port 0, fixed rngSeed for
 *    deterministic territory deals).
 *  - Drive 3 real GameClients through real game actions (bot logic
 *    reused from tests/simulation.test.ts) to reach each target state.
 *  - Render the live client.state into the real App/screen components
 *    using OpenTUI's testRender + captureSpans() to get per-span fg/bg
 *    colors.
 *  - Convert the CapturedFrame to styled HTML (monospace font, dark
 *    background #080f1a) and screenshot with Playwright's Chromium.
 *
 * Run via:  bun run screenshots
 */

import { writeFileSync, mkdirSync, statSync, mkdtempSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "docs", "images");

mkdirSync(OUT_DIR, { recursive: true });

// Use a temp session dir so we never write .conquest-session files into cwd.
const SESSION_DIR = mkdtempSync(join(tmpdir(), "conquest-screenshots-sessions-"));
process.env["CONQUEST_SESSION_DIR"] = SESSION_DIR;

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------
interface RGBA { r: number; g: number; b: number; a: number; intent: string; }
interface CapturedSpan { text: string; fg: RGBA; bg: RGBA; attributes: number; width: number; }
interface CapturedLine { spans: CapturedSpan[]; }
interface CapturedFrame { cols: number; rows: number; cursor: [number, number]; lines: CapturedLine[]; }

const DEFAULT_FG = { r: 204, g: 213, b: 228 };
const DEFAULT_BG = { r: 8, g: 15, b: 26 };

function rgbaCss(rgba: RGBA, def: typeof DEFAULT_FG): string {
  if (rgba.intent === "default") return `rgb(${def.r},${def.g},${def.b})`;
  // OpenTUI RGBA values are in 0–1 float range
  return `rgb(${Math.round(rgba.r * 255)},${Math.round(rgba.g * 255)},${Math.round(rgba.b * 255)})`;
}

function isBold(a: number)      { return (a & 1) !== 0; }
function isItalic(a: number)    { return (a & 2) !== 0; }
function isUnderline(a: number) { return (a & 4) !== 0; }

// ---------------------------------------------------------------------------
// Convert a CapturedFrame to HTML
// ---------------------------------------------------------------------------
function frameToHtml(frame: CapturedFrame, title: string): string {
  const FONT_SIZE = 14;
  const LINE_HEIGHT = 18;
  const CHAR_WIDTH = 8.4;

  const pageW = Math.ceil(frame.cols * CHAR_WIDTH) + 8;
  const pageH = frame.rows * LINE_HEIGHT + 8;

  let body = "";
  for (const line of frame.lines) {
    body += `<div style="height:${LINE_HEIGHT}px;display:flex;align-items:center;">`;
    for (const span of line.spans) {
      if (!span.text) continue;
      const fg = rgbaCss(span.fg, DEFAULT_FG);
      const bg = rgbaCss(span.bg, DEFAULT_BG);
      const bold      = isBold(span.attributes)      ? "font-weight:bold;" : "";
      const italic    = isItalic(span.attributes)    ? "font-style:italic;" : "";
      const underline = isUnderline(span.attributes) ? "text-decoration:underline;" : "";
      const escaped   = span.text
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      body += `<span style="color:${fg};background:${bg};${bold}${italic}${underline}white-space:pre;">${escaped}</span>`;
    }
    body += `</div>`;
  }

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{
  background:rgb(${DEFAULT_BG.r},${DEFAULT_BG.g},${DEFAULT_BG.b});
  font-family:'Cascadia Code','Fira Code','JetBrains Mono','Courier New',monospace;
  font-size:${FONT_SIZE}px;line-height:${LINE_HEIGHT}px;letter-spacing:0;
  width:${pageW}px;height:${pageH}px;overflow:hidden;padding:4px;
}
</style></head><body>${body}</body></html>`;
}

// ---------------------------------------------------------------------------
// Screenshot HTML → PNG via Playwright
// ---------------------------------------------------------------------------
const CHROMIUM_PATH = "/home/chris/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome";
let browser: any = null;

async function ensureBrowser() {
  if (browser) return browser;
  const { chromium } = await import("playwright-core");
  browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  return browser;
}

async function htmlToPng(html: string, outPath: string, cols: number, rows: number): Promise<void> {
  const CHAR_WIDTH = 8.4;
  const LINE_HEIGHT = 18;
  const width  = Math.ceil(cols * CHAR_WIDTH) + 8;
  const height = rows * LINE_HEIGHT + 8;

  const b = await ensureBrowser();
  const page = await b.newPage();
  await page.setViewportSize({ width, height });
  await page.setContent(html, { waitUntil: "load" });
  await page.waitForTimeout(300);
  await page.screenshot({ path: outPath, type: "png", clip: { x: 0, y: 0, width, height } });
  await page.close();
  const size = Math.round(statSync(outPath).size / 1024);
  console.log(`  saved: ${outPath} (${size} KB)`);
}

// ---------------------------------------------------------------------------
// Render a component and capture its span frame
// ---------------------------------------------------------------------------
async function captureComponent(element: any, cols: number, rows: number): Promise<CapturedFrame> {
  // @ts-ignore
  const { act } = await import("../apps/client/node_modules/react/index.js");
  // @ts-ignore
  const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");

  const setup = await testRender(element, { width: cols, height: rows });
  await act(async () => { await setup.renderOnce(); });
  await act(async () => { await setup.renderOnce(); });
  const frame = setup.captureSpans();
  await act(async () => { setup.renderer.destroy(); });
  return frame;
}

// ---------------------------------------------------------------------------
// Helper: seed bytes from a number (same as simulation.test.ts)
// ---------------------------------------------------------------------------
function seedFromNumber(n: number): Uint8Array {
  const buf = new Uint8Array(16);
  const dv = new DataView(buf.buffer);
  dv.setUint32(0, n >>> 0, true);
  dv.setUint32(4, (n * 2654435761) >>> 0, true);
  dv.setUint32(8, (n * 2246822519) >>> 0, true);
  dv.setUint32(12, (n * 3266489917) >>> 0, true);
  return buf;
}

// ---------------------------------------------------------------------------
// Bot logic (derived from tests/simulation.test.ts)
// Returns the move to make for the active player given the current state.
// ---------------------------------------------------------------------------
type BotMove =
  | { kind: "deploy"; territoryId: string; count: number }
  | { kind: "attack"; srcId: string; tgtId: string }
  | { kind: "conquestMove"; units: number }
  | { kind: "skipPhase" }
  | { kind: "endTurn" };

function computeBotMove(state: any, rng: () => number): BotMove | null {
  const playerId = state.players[state.activePlayerIndex]?.id;
  if (!playerId) return null;

  const myTerritories = () =>
    Object.values(state.territories as Record<string, any>).filter(t => t.ownerId === playerId);

  if (state.phase === "deployment") {
    const remaining = state.pendingReinforcements;
    if (remaining <= 0) return { kind: "skipPhase" };
    const borderTerrs = myTerritories().filter(t =>
      t.neighbors.some((n: string) => state.territories[n]?.ownerId !== playerId)
    );
    const candidates = borderTerrs.length > 0 ? borderTerrs : myTerritories();
    if (!candidates.length) return { kind: "skipPhase" };
    const target = candidates[Math.floor(rng() * candidates.length)];
    return { kind: "deploy", territoryId: target.id, count: remaining };
  }

  if (state.phase === "attack") {
    if (state.pendingConquestMove) {
      const p = state.pendingConquestMove;
      const range = p.maximumUnits - p.minimumUnits;
      const units = p.minimumUnits + (range > 0 ? Math.floor(rng() * (range + 1)) : 0);
      return { kind: "conquestMove", units };
    }
    const allAttackables = myTerritories()
      .filter((src: any) => src.units >= 2)
      .flatMap((src: any) =>
        src.neighbors
          .filter((nid: string) => {
            const tgt = state.territories[nid];
            return tgt && tgt.ownerId !== playerId;
          })
          .map((nid: string) => ({ src, tgt: state.territories[nid] }))
      );
    if (!allAttackables.length) return { kind: "skipPhase" };

    const strictly = allAttackables.filter(({ src, tgt }: any) => src.units > tgt.units);
    const equal    = allAttackables.filter(({ src, tgt }: any) => src.units >= tgt.units);
    const pool     = strictly.length > 0 ? strictly : equal.length > 0 ? equal : allAttackables;
    const { src, tgt } = pool[Math.floor(rng() * pool.length)];
    return { kind: "attack", srcId: src.id, tgtId: tgt.id };
  }

  if (state.phase === "fortify") {
    return { kind: "endTurn" };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Run one full bot turn for the active player via the owning GameClient.
// Resolves when the state advances to the next player's turn (or game over).
// ---------------------------------------------------------------------------
async function runBotTurnViaClient(clients: Map<string, any>, state: any, botRng: () => number) {
  const activePlayerId = state.players[state.activePlayerIndex]?.id;
  if (!activePlayerId) return;
  const client = clients.get(activePlayerId);
  if (!client) return;

  // Run moves until the active player changes or game over.
  while (true) {
    const s = client.state;
    if (!s || s.phase === "game_over") return;
    const curActive = s.players[s.activePlayerIndex]?.id;
    if (curActive !== activePlayerId) return;

    const move = computeBotMove(s, botRng);
    if (!move) return;

    // Capture a fingerprint before sending the move so we can wait for a
    // state change. Covers every transition the bot can trigger.
    const fp = `${s.turnNumber}:${s.phase}:${s.pendingReinforcements ?? 0}:${s.pendingConquestMove?.targetTerritoryId ?? ""}`;

    if (move.kind === "deploy") {
      client.deploy(move.territoryId, move.count);
    } else if (move.kind === "attack") {
      client.attack(move.srcId, move.tgtId);
    } else if (move.kind === "conquestMove") {
      client.completeConquestMove(move.units);
    } else if (move.kind === "skipPhase") {
      client.skipPhase();
    } else if (move.kind === "endTurn") {
      client.endTurn();
    }

    // Wait for the server to acknowledge the move with a new state.
    // waitForSnapshot only resolves early when the predicate is already true
    // for the current state; since fp was built from the current state the
    // predicate starts false and correctly blocks until a new snapshot arrives.
    try {
      await client.waitForSnapshot((newS: any) => {
        const newFp = `${newS.turnNumber}:${newS.phase}:${newS.pendingReinforcements ?? 0}:${newS.pendingConquestMove?.targetTerritoryId ?? ""}`;
        return newFp !== fp;
      }, 5000);
    } catch {
      // Timed out — move was rejected or server stalled; stop this turn.
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Wait for game to reach a specific phase for any client
// ---------------------------------------------------------------------------
async function waitForPhase(client: any, phase: string, timeoutMs = 10000): Promise<any> {
  return client.waitForSnapshot((s: any) => s.phase === phase, timeoutMs);
}

// ---------------------------------------------------------------------------
// Wait for an attack_resolved event (real dice/battle result)
// ---------------------------------------------------------------------------
async function waitForAttack(client: any, timeoutMs = 5000): Promise<any> {
  return client.waitForEvent(
    (e: any) => e.type === "attack_resolved",
    timeoutMs
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("Starting conquest.sh screenshot capture...\n");

  // @ts-ignore
  const React = (await import("../apps/client/node_modules/react/index.js")).default;
  const { ConquestServer } = await import("../apps/server/src/server.js");
  const { GameClient } = await import("../apps/client/src/network/client.js");
  const { EARTH_42 } = await import("../packages/map-engine/src/maps/earth-42.js");
  const { EARTH_42_BUNDLE } = await import("../packages/map-engine/src/maps/earth-42.js");
  const { makeSfc32 } = await import("../packages/shared/src/index.js");
  const { App } = await import("../apps/client/src/ui/App.js");
  const { HomeScreen } = await import("../apps/client/src/ui/HomeScreen.js");
  const { MatchResultsScreen } = await import("../apps/client/src/ui/MatchResultsScreen.js");

  const botRng = makeSfc32(seedFromNumber(77)); // bot decision RNG

  // -------------------------------------------------------------------------
  // Start server
  // -------------------------------------------------------------------------
  const server = new ConquestServer({
    port: 0,
    serverName: "screenshot-server",
    defaultMap: EARTH_42,
    maxPlayersPerRoom: 4,
  });
  server.start();
  const port = server.port;
  console.log(`Server started on port ${port}`);

  // -------------------------------------------------------------------------
  // (a) Home screen — no server connection needed for rendering
  // -------------------------------------------------------------------------
  console.log("\n[a] Home screen...");
  {
    const cols = 120; const rows = 36;
    const el = React.createElement(HomeScreen, {
      serverName: "conquest.sh-server",
      serverHost: "localhost:4000",
      connectionStatus: "connected",
      playerName: "Commander",
      cachedSession: null,
      errorMessage: null,
      onBrowseGames: () => {}, onCreateGame: () => {}, onJoinByCode: () => {},
      onServerInfo: () => {}, onQuit: () => {},
      terminalDimensions: { columns: cols, rows },
    });
    const frame = await captureComponent(el, cols, rows);
    const html = frameToHtml(frame, "conquest.sh – Home Screen");
    await htmlToPng(html, join(OUT_DIR, "home-screen.png"), cols, rows);
  }

  // -------------------------------------------------------------------------
  // Create room and connect all clients
  // -------------------------------------------------------------------------
  const PLAYER_DEFS = [
    { name: "Atlas",  file: join(SESSION_DIR, "atlas.json")  },
    { name: "Bravo",  file: join(SESSION_DIR, "bravo.json")  },
    { name: "Crest",  file: join(SESSION_DIR, "crest.json")  },
  ];

  // Client A creates the room
  const clientAtlas = new GameClient({
    host: `localhost:${port}`,
    sessionFilePath: PLAYER_DEFS[0].file,
    forceNewSession: true,
    autoReconnect: true,
  });
  await clientAtlas.connect();
  clientAtlas.createRoom({
    playerName: "Atlas",
    displayName: "Earth Global Front",
    visibility: "public",
    maxPlayers: 3,
    mapId: "earth-42",
  });
  const lobbySnap = await clientAtlas.waitForSnapshot(s => s.phase === "lobby");
  const roomCode = clientAtlas.roomCode!;
  console.log(`Room: ${roomCode}`);

  // Client B and C join
  const clientBravo = new GameClient({
    host: `localhost:${port}`,
    sessionFilePath: PLAYER_DEFS[1].file,
    forceNewSession: true,
    autoReconnect: true,
  });
  await clientBravo.connect();
  clientBravo.join("Bravo", roomCode);
  await clientBravo.waitForSnapshot(s => s.phase === "lobby");

  const clientCrest = new GameClient({
    host: `localhost:${port}`,
    sessionFilePath: PLAYER_DEFS[2].file,
    forceNewSession: true,
    autoReconnect: true,
  });
  await clientCrest.connect();
  clientCrest.join("Crest", roomCode);
  await clientCrest.waitForSnapshot(s => s.phase === "lobby");

  // Wait for all 3 in lobby
  await clientAtlas.waitForSnapshot(s => s.players.length === 3);

  // -------------------------------------------------------------------------
  // (b) Lobby with players — capture before readying up
  // -------------------------------------------------------------------------
  console.log("\n[b] Lobby with players...");
  {
    const cols = 180; const rows = 51;
    const client: any = {
      state: clientAtlas.state,
      myPlayerId: clientAtlas.myPlayerId,
      status: "connected",
      roomCode,
      onSnapshot: () => () => {},
      onEvent: () => () => {},
      onStatusChange: () => () => {},
      onError: () => () => {},
      sendChat: () => {}, deploy: () => {}, attack: () => {}, fortify: () => {},
      skipPhase: () => {}, endTurn: () => {}, ready: () => {},
    };
    const el = React.createElement(App, {
      client,
      terminalDimensions: { columns: cols, rows },
    });
    const frame = await captureComponent(el, cols, rows);
    const html = frameToHtml(frame, "conquest.sh – Lobby");
    await htmlToPng(html, join(OUT_DIR, "lobby.png"), cols, rows);
  }

  // -------------------------------------------------------------------------
  // Start the match: all ready
  // -------------------------------------------------------------------------
  clientAtlas.ready(true);
  clientBravo.ready(true);
  clientCrest.ready(true);
  await clientAtlas.waitForSnapshot(s => s.phase === "deployment", 8000);
  await clientBravo.waitForSnapshot(s => s.phase === "deployment", 8000);
  await clientCrest.waitForSnapshot(s => s.phase === "deployment", 8000);
  console.log("Game started! Turn 1");

  // Build the client map (playerId → client)
  const clientMap = new Map<string, any>([
    [clientAtlas.myPlayerId!, clientAtlas],
    [clientBravo.myPlayerId!, clientBravo],
    [clientCrest.myPlayerId!, clientCrest],
  ]);

  // Play several full turns with bots so army counts / events build up
  const TARGET_TURNS = 6; // enough for interesting army distribution
  let turns = 0;

  while (turns < TARGET_TURNS) {
    const s = clientAtlas.state;
    if (!s || s.phase === "game_over") break;
    if (turns >= TARGET_TURNS) break;
    await runBotTurnViaClient(clientMap, s, botRng);
    turns++;
    const newState = clientAtlas.state;
    if (!newState) break;
    console.log(`  Turn ${newState.turnNumber}, phase ${newState.phase}, armies: ${Object.values(newState.territories as any).reduce((s: any, t: any) => s + t.units, 0)}`);
    await Bun.sleep(50);
  }

  // -------------------------------------------------------------------------
  // Capture mid-game state (wide layout), picking active player's client
  // -------------------------------------------------------------------------
  {
    const state = clientAtlas.state!;
    const activeIdx = state.activePlayerIndex;
    const activeId = state.players[activeIdx]?.id;
    const activeClient = clientMap.get(activeId ?? "") ?? clientAtlas;

    // Find a territory with ≥3 armies owned by the active player
    let selectedTerritoryId: string | null = null;
    let targetTerritoryId: string | null = null;
    for (const [id, t] of Object.entries(state.territories as Record<string, any>)) {
      if (t.ownerId === activeId && t.units >= 3 && !selectedTerritoryId) {
        for (const nid of (EARTH_42.territories.find(x => x.id === id)?.neighbors ?? [])) {
          const neighbor = state.territories[nid as string];
          if (neighbor && neighbor.ownerId !== activeId) {
            selectedTerritoryId = id;
            targetTerritoryId = nid;
            break;
          }
        }
      }
      if (selectedTerritoryId) break;
    }

    // -------------------------------------------------------------------------
    // (c) Wide layout mid-game
    // -------------------------------------------------------------------------
    console.log("\n[c] Wide mid-game...");
    {
      const cols = 200; const rows = 55;
      const client: any = {
        state: activeClient.state,
        myPlayerId: activeClient.myPlayerId,
        status: "connected",
        roomCode,
        onSnapshot: () => () => {},
        onEvent: () => () => {},
        onStatusChange: () => () => {},
        onError: () => () => {},
        sendChat: () => {}, deploy: () => {}, attack: () => {}, fortify: () => {},
        skipPhase: () => {}, endTurn: () => {}, ready: () => {},
      };
      const el = React.createElement(App, {
        client,
        terminalDimensions: { columns: cols, rows },
        initialSelectedTerritoryId: selectedTerritoryId,
        initialTargetTerritoryId: targetTerritoryId,
      });
      const frame = await captureComponent(el, cols, rows);
      const html = frameToHtml(frame, "conquest.sh – Wide Map");
      await htmlToPng(html, join(OUT_DIR, "ingame-wide.png"), cols, rows);
    }

    // -------------------------------------------------------------------------
    // (e) Compact layout
    // -------------------------------------------------------------------------
    console.log("\n[e] Compact layout...");
    {
      const cols = 100; const rows = 38;
      const client: any = {
        state: activeClient.state,
        myPlayerId: activeClient.myPlayerId,
        status: "connected",
        roomCode,
        onSnapshot: () => () => {},
        onEvent: () => () => {},
        onStatusChange: () => () => {},
        onError: () => () => {},
        sendChat: () => {}, deploy: () => {}, attack: () => {}, fortify: () => {},
        skipPhase: () => {}, endTurn: () => {}, ready: () => {},
      };
      const el = React.createElement(App, {
        client,
        terminalDimensions: { columns: cols, rows },
        initialSelectedTerritoryId: selectedTerritoryId,
        initialTargetTerritoryId: targetTerritoryId,
      });
      const frame = await captureComponent(el, cols, rows);
      const html = frameToHtml(frame, "conquest.sh – Compact Layout");
      await htmlToPng(html, join(OUT_DIR, "ingame-compact.png"), cols, rows);
    }
  }

  // -------------------------------------------------------------------------
  // Advance to get a real attack event for the battle report panel
  // -------------------------------------------------------------------------
  console.log("\n[d] Getting a real attack for battle panel...");

  // Keep running bot turns until we see an attack_resolved event on any client
  let battleReport: any = null;
  let battleState: any = null;
  let battleClientId: string | null = null;
  const MAX_BATTLE_TURNS = 15;
  let battleTurns = 0;

  // Look in existing event history first
  for (const [pid, c] of clientMap.entries()) {
    const attackEvent = c.eventHistory.find((e: any) => e.type === "attack_resolved");
    if (attackEvent) {
      const s = c.state;
      const attacker = s?.players.find((p: any) => p.id === attackEvent.attackerId);
      const defender = s?.players.find((p: any) => p.id === attackEvent.defenderId);
      const srcTerr = EARTH_42.territories.find(t => t.id === attackEvent.sourceTerritoryId);
      const tgtTerr = EARTH_42.territories.find(t => t.id === attackEvent.targetTerritoryId);
      if (attacker && defender && srcTerr && tgtTerr) {
        battleReport = {
          key: attackEvent.timestamp?.toString() ?? "battle",
          attackerName: attacker.name,
          attackerColor: attacker.colorHex,
          defenderName: defender.name,
          defenderColor: defender.colorHex,
          sourceTerritoryName: srcTerr.name,
          targetTerritoryName: tgtTerr.name,
          attackerRolls: attackEvent.attackerRolls,
          defenderRolls: attackEvent.defenderRolls,
          pairs: attackEvent.attackerRolls.slice(0, attackEvent.defenderRolls.length).map((ar: number, i: number) => ({
            attackerDie: ar,
            defenderDie: attackEvent.defenderRolls[i],
            attackerWins: ar > attackEvent.defenderRolls[i],
          })),
          unpairedAttackerDice: attackEvent.attackerRolls.slice(attackEvent.defenderRolls.length),
          attackerLosses: attackEvent.attackerLosses,
          defenderLosses: attackEvent.defenderLosses,
          attackerUnitsBefore: (s?.territories[attackEvent.sourceTerritoryId]?.units ?? 0) + attackEvent.attackerLosses,
          defenderUnitsBefore: (s?.territories[attackEvent.targetTerritoryId]?.units ?? 0) + attackEvent.defenderLosses,
          attackerUnitsAfter: s?.territories[attackEvent.sourceTerritoryId]?.units ?? 0,
          defenderUnitsAfter: s?.territories[attackEvent.targetTerritoryId]?.units ?? 0,
          conquered: attackEvent.conquered ?? false,
          engagementRound: 1,
          engagementAttackerLosses: attackEvent.attackerLosses,
          engagementDefenderLosses: attackEvent.defenderLosses,
        };
        battleState = s;
        battleClientId = pid;
        break;
      }
    }
  }

  // If no attack yet, run more turns until we get one
  while (!battleReport && battleTurns < MAX_BATTLE_TURNS) {
    const s = clientAtlas.state;
    if (!s || s.phase === "game_over") break;
    await runBotTurnViaClient(clientMap, s, botRng);
    battleTurns++;

    for (const [pid, c] of clientMap.entries()) {
      const attacks = c.eventHistory.filter((e: any) => e.type === "attack_resolved");
      const attackEvent = attacks[attacks.length - 1]; // latest
      if (attackEvent) {
        const cs = c.state;
        const attacker = cs?.players.find((p: any) => p.id === attackEvent.attackerId);
        const defender = cs?.players.find((p: any) => p.id === attackEvent.defenderId);
        const srcTerr = EARTH_42.territories.find(t => t.id === attackEvent.sourceTerritoryId);
        const tgtTerr = EARTH_42.territories.find(t => t.id === attackEvent.targetTerritoryId);
        if (attacker && defender && srcTerr && tgtTerr) {
          battleReport = {
            key: attackEvent.timestamp?.toString() ?? "battle",
            attackerName: attacker.name,
            attackerColor: attacker.colorHex,
            defenderName: defender.name,
            defenderColor: defender.colorHex,
            sourceTerritoryName: srcTerr.name,
            targetTerritoryName: tgtTerr.name,
            attackerRolls: attackEvent.attackerRolls,
            defenderRolls: attackEvent.defenderRolls,
            pairs: attackEvent.attackerRolls.slice(0, attackEvent.defenderRolls.length).map((ar: number, i: number) => ({
              attackerDie: ar,
              defenderDie: attackEvent.defenderRolls[i],
              attackerWins: ar > attackEvent.defenderRolls[i],
            })),
            unpairedAttackerDice: attackEvent.attackerRolls.slice(attackEvent.defenderRolls.length),
            attackerLosses: attackEvent.attackerLosses,
            defenderLosses: attackEvent.defenderLosses,
            attackerUnitsBefore: (cs?.territories[attackEvent.sourceTerritoryId]?.units ?? 0) + attackEvent.attackerLosses,
            defenderUnitsBefore: (cs?.territories[attackEvent.targetTerritoryId]?.units ?? 0) + attackEvent.defenderLosses,
            attackerUnitsAfter: cs?.territories[attackEvent.sourceTerritoryId]?.units ?? 0,
            defenderUnitsAfter: cs?.territories[attackEvent.targetTerritoryId]?.units ?? 0,
            conquered: attackEvent.conquered ?? false,
            engagementRound: attacks.filter((e: any) =>
              e.sourceTerritoryId === attackEvent.sourceTerritoryId &&
              e.targetTerritoryId === attackEvent.targetTerritoryId
            ).length,
            engagementAttackerLosses: attackEvent.attackerLosses,
            engagementDefenderLosses: attackEvent.defenderLosses,
          };
          battleState = cs;
          battleClientId = pid;
          break;
        }
      }
    }
    if (battleReport) break;
    await Bun.sleep(50);
  }

  // -------------------------------------------------------------------------
  // (d) & hero: Full App with battle report panel visible
  // -------------------------------------------------------------------------
  console.log("\n[d] Battle report + hero capture...");
  if (battleReport && battleState) {
    const { MapCanvas } = await import("../apps/client/src/ui/MapCanvas.js");
    const { getMapContentDimensionsForLayout } = await import("../packages/map-engine/src/index.js");

    // Find selected/target territory from the battle event
    const lastAttack = (clientMap.get(battleClientId ?? "")?.eventHistory ?? [])
      .filter((e: any) => e.type === "attack_resolved")
      .slice(-1)[0];
    const selectedTerritoryId = lastAttack?.sourceTerritoryId ?? null;
    const targetTerritoryId   = lastAttack?.targetTerritoryId ?? null;

    // Hero: Full App (wide) with battle report — use attack phase state
    // We build a battle-aware mock client on the real state so the App
    // renders the panel. App receives `battle` via MapCanvas internally
    // based on a deriveBattleReport call — we need to ensure the event
    // is in client.eventHistory.  Use the client that has the event.
    const heroClient = clientMap.get(battleClientId ?? "") ?? clientAtlas;

    // (d) MapCanvas-only battle panel capture (detailed dice view)
    {
      const paneCols = 200; const paneRows = 55;
      const paneDims = getMapContentDimensionsForLayout(paneCols, paneRows, "wide");
      const el = React.createElement(MapCanvas, {
        mapBundle: EARTH_42_BUNDLE,
        contentDimensions: paneDims,
        territories: battleState.territories,
        players: battleState.players,
        myPlayerId: heroClient.myPlayerId,
        phase: "attack" as const,
        selectedTerritoryId,
        targetTerritoryId,
        onSelectTerritory: () => {}, onSelectTarget: () => {}, onDeselect: () => {},
        battle: battleReport,
        battleAnimate: false,
      });
      const frame = await captureComponent(el, paneDims.width, paneDims.height);
      const html = frameToHtml(frame, "conquest.sh – Battle Panel");
      await htmlToPng(html, join(OUT_DIR, "ingame-battle-panel.png"), paneDims.width, paneDims.height);
    }

    // Hero: Full App with battle panel in the event log (wide layout)
    {
      const cols = 200; const rows = 55;
      const mockClient: any = {
        state: heroClient.state,
        myPlayerId: heroClient.myPlayerId,
        status: "connected",
        roomCode,
        onSnapshot: (cb: any) => { cb(heroClient.state); return () => {}; },
        onEvent: () => () => {},
        onStatusChange: () => () => {},
        onError: () => () => {},
        sendChat: () => {}, deploy: () => {}, attack: () => {}, fortify: () => {},
        skipPhase: () => {}, endTurn: () => {}, ready: () => {},
      };
      const el = React.createElement(App, {
        client: mockClient,
        terminalDimensions: { columns: cols, rows },
        initialSelectedTerritoryId: selectedTerritoryId,
        initialTargetTerritoryId: targetTerritoryId,
      });
      const frame = await captureComponent(el, cols, rows);
      const html = frameToHtml(frame, "conquest.sh – Hero (full app with battle)");
      await htmlToPng(html, join(OUT_DIR, "ingame-hero.png"), cols, rows);
    }
  } else {
    console.warn("  No attack event found; skipping battle panel captures.");
  }

  // -------------------------------------------------------------------------
  // Finish the game with bots for match results
  // Use game-core pure simulation (no WebSocket) for speed + reliability.
  // We pull the current server state from any live client and simulate from
  // there to game_over using the same bot logic, then render the results screen.
  // -------------------------------------------------------------------------
  console.log("\n[f] Finishing game for match results...");

  const { deployUnits, attackTerritory, completeConquestMove: completeConquest, skipPhase: gcSkipPhase } =
    await import("../packages/game-core/src/index.js");

  // Helper: return the freshest live state from any client
  const getAnyState = () => {
    const states = [clientAtlas.state, clientBravo.state, clientCrest.state].filter(Boolean);
    return states[0] ?? null;
  };

  // Pull the current game state from a connected client (server-authoritative snapshot)
  let simState: any = getAnyState();
  if (!simState || simState.phase === "game_over") {
    console.log("  Game already over (or no state), using current state.");
  } else {
    // Simulate to game_over using game-core pure functions
    const MAX_SIM_ACTIONS = 5000;
    let simActions = 0;
    while (simState.phase !== "game_over" && simActions < MAX_SIM_ACTIONS) {
      const player = simState.players[simState.activePlayerIndex];
      if (!player) break;
      const pid = player.id;

      // Deployment
      while (simState.phase === "deployment" && simState.pendingReinforcements > 0) {
        const myTerrs = Object.values(simState.territories as Record<string, any>)
          .filter((t: any) => t.ownerId === pid);
        const borders = myTerrs.filter((t: any) =>
          t.neighbors.some((n: string) => simState.territories[n]?.ownerId !== pid)
        );
        const candidates = borders.length > 0 ? borders : myTerrs;
        if (!candidates.length) break;
        const target = candidates[Math.floor(botRng() * candidates.length)];
        const r = deployUnits(simState, pid, target.id, simState.pendingReinforcements);
        if (!r.ok) break;
        simState = r.state;
      }
      if (simState.phase === "game_over") break;

      // Attack
      while (simState.phase === "attack") {
        if (simState.pendingConquestMove) {
          const p = simState.pendingConquestMove;
          const range = p.maximumUnits - p.minimumUnits;
          const units = p.minimumUnits + (range > 0 ? Math.floor(botRng() * (range + 1)) : 0);
          const r = completeConquest(simState, pid, units);
          if (!r.ok) break;
          simState = r.state;
          if (simState.phase === "game_over") break;
          continue;
        }
        const myTerrs = Object.values(simState.territories as Record<string, any>)
          .filter((t: any) => t.ownerId === pid);
        const attackables = myTerrs
          .filter((src: any) => src.units >= 2)
          .flatMap((src: any) =>
            src.neighbors
              .filter((nid: string) => {
                const tgt = simState.territories[nid];
                return tgt && tgt.ownerId !== pid;
              })
              .map((nid: string) => ({ src, tgt: simState.territories[nid] }))
          );
        if (!attackables.length) break;
        const stronger = attackables.filter(({ src, tgt }: any) => src.units > tgt.units);
        const equal = attackables.filter(({ src, tgt }: any) => src.units >= tgt.units);
        const pool = stronger.length > 0 ? stronger : equal.length > 0 ? equal : attackables;
        const { src, tgt } = pool[Math.floor(botRng() * pool.length)];
        const r = attackTerritory(simState, pid, src.id, tgt.id, undefined, botRng);
        if (!r.ok) break;
        simState = r.state;
        if (simState.phase === "game_over") break;
      }
      if (simState.phase === "game_over") break;

      // Skip attack → fortify → end turn
      if (simState.phase === "attack") {
        const r = gcSkipPhase(simState, pid);
        if (r.ok) simState = r.state;
        if (simState.phase === "game_over") break;
      }
      if (simState.phase === "fortify") {
        const r = gcSkipPhase(simState, pid);
        if (r.ok) simState = r.state;
      }

      simActions++;
    }
    console.log(`  Simulation complete: ${simActions} actions, phase: ${simState?.phase}, winner: ${simState?.players?.find((p: any) => p.id === simState?.winnerId)?.name ?? "?"}`);
  }

  const finalState = simState;
  if (finalState?.phase === "game_over") {
    const cols = 140; const rows = 45;
    const winnerId = finalState.winnerId;
    // Find the winner's player ID and use any connected client for myPlayerId
    const winnerClient = clientMap.get(winnerId ?? "") ?? clientAtlas;
    const myPlayerId = winnerClient.myPlayerId ?? finalState.players[0]?.id;

    const el = React.createElement(MatchResultsScreen, {
      mapBundle: EARTH_42_BUNDLE,
      state: finalState,  // use simulation-derived game_over state
      myPlayerId: myPlayerId,
      onRematch: () => {}, onReturnHome: () => {}, onQuit: () => {},
      terminalDimensions: { columns: cols, rows },
    });
    const frame = await captureComponent(el, cols, rows);
    const html = frameToHtml(frame, "conquest.sh – Match Results");
    await htmlToPng(html, join(OUT_DIR, "match-results.png"), cols, rows);
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------
  clientAtlas.disconnect?.();
  clientBravo.disconnect?.();
  clientCrest.disconnect?.();
  server.stop();
  if (browser) await browser.close();

  // -------------------------------------------------------------------------
  // Report
  // -------------------------------------------------------------------------
  console.log("\nAll screenshots saved to docs/images/");
  const files = [
    "home-screen.png",
    "lobby.png",
    "ingame-wide.png",
    "ingame-battle-panel.png",
    "ingame-hero.png",
    "ingame-compact.png",
    "match-results.png",
  ];
  let total = 0;
  for (const f of files) {
    try {
      const s = statSync(join(OUT_DIR, f));
      total += s.size;
      console.log(`  ${f}: ${Math.round(s.size / 1024)} KB`);
    } catch {
      console.log(`  ${f}: MISSING`);
    }
  }
  console.log(`  Total: ${Math.round(total / 1024)} KB`);
}

main().catch(err => { console.error(err); process.exit(1); });
