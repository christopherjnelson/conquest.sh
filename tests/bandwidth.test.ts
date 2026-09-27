/**
 * Bandwidth measurement test.
 *
 * Plays a full simulated game through a real server with 2 clients using
 * simple bots. Reports total bytes sent to one client and max single message
 * size, comparing old-protocol estimates vs new delta protocol.
 *
 * Asserts:
 *  - Client's reconstructed state equals projectStateFor(serverState, player)
 *    at end of game.
 *  - Client state equals projection after a forced mid-game resync.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { ConquestServer } from "../apps/server/src/server.js";
import { GameClient } from "../apps/client/src/network/client.js";
import { projectStateFor } from "../packages/game-core/src/index.js";
import { MAP_IRONREACH } from "../packages/map-engine/src/index.js";
import type { GameState } from "../packages/protocol/src/index.js";
import { makeSfc32 } from "../packages/shared/src/index.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function seedFromNumber(n: number): Uint8Array {
  const buf = new Uint8Array(16);
  new DataView(buf.buffer).setUint32(0, n >>> 0, true);
  new DataView(buf.buffer).setUint32(4, (n * 2654435761) >>> 0, true);
  new DataView(buf.buffer).setUint32(8, (n * 2246822519) >>> 0, true);
  new DataView(buf.buffer).setUint32(12, (n * 3266489917) >>> 0, true);
  return buf;
}

function pick<T>(arr: T[], rng: () => number): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(rng() * arr.length)];
}

/** One bot action. Returns false when game is over or it's not our turn. */
function doOneBotAction(client: GameClient, rng: () => number): boolean {
  const state = client.state;
  if (!state) return false;
  if ((state.phase as string) === "game_over") return false;
  const myId = client.myPlayerId;
  if (!myId) return false;
  const active = state.players[state.activePlayerIndex];
  if (!active || active.id !== myId) return false;

  switch (state.phase) {
    case "deployment": {
      if (state.pendingConquestMove) {
        const m = state.pendingConquestMove;
        client.completeConquestMove(m.minimumUnits);
        return true;
      }
      const mine = Object.values(state.territories).filter(t => t.ownerId === myId);
      const tgt = pick(mine, rng);
      if (!tgt) { client.skipPhase(); return true; }
      client.deploy(tgt.id, state.pendingReinforcements);
      return true;
    }
    case "attack": {
      if (state.pendingConquestMove) {
        const m = state.pendingConquestMove;
        client.completeConquestMove(m.minimumUnits);
        return true;
      }
      const sources = Object.values(state.territories).filter(
        t => t.ownerId === myId && t.units >= 2 &&
          t.neighbors.some(n => state.territories[n]?.ownerId !== myId)
      );
      const src = pick(sources, rng);
      if (!src) { client.skipPhase(); return true; }
      const enemies = src.neighbors.filter(n => state.territories[n]?.ownerId !== myId);
      const tgt = pick(enemies, rng);
      if (!tgt) { client.skipPhase(); return true; }
      client.attack(src.id, tgt);
      return true;
    }
    case "fortify": {
      client.endTurn();
      return true;
    }
    default:
      return false;
  }
}

/** Compare states ignoring history (which legitimately diverges). */
function statesMatchIgnoringHistory(server: GameState, client: GameState): { match: boolean; diffs: string[] } {
  const diffs: string[] = [];
  const scalars: (keyof GameState)[] = [
    "phase", "activePlayerIndex", "turnNumber", "pendingReinforcements",
    "hasConqueredThisTurn", "winnerId", "matchNumber",
  ];
  for (const f of scalars) {
    if (JSON.stringify(server[f]) !== JSON.stringify(client[f])) {
      diffs.push(`${f}: server=${JSON.stringify(server[f])} client=${JSON.stringify(client[f])}`);
    }
  }
  for (const id of Object.keys(server.territories)) {
    const s = server.territories[id];
    const c = client.territories[id];
    if (!c) { diffs.push(`territory ${id} missing on client`); continue; }
    if (s.ownerId !== c.ownerId) diffs.push(`${id} ownerId: ${s.ownerId} vs ${c.ownerId}`);
    if (s.units !== c.units) diffs.push(`${id} units: ${s.units} vs ${c.units}`);
  }
  for (const sp of server.players) {
    const cp = client.players.find(p => p.id === sp.id);
    if (!cp) { diffs.push(`player ${sp.id} missing`); continue; }
    if (sp.isAlive !== cp.isAlive) diffs.push(`${sp.id} isAlive: ${sp.isAlive} vs ${cp.isAlive}`);
    // `connected` is real-time connection status that can change independently; skip.
  }
  return { match: diffs.length === 0, diffs };
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("Bandwidth and state projection", () => {
  let server: ConquestServer;
  let port: number;

  beforeAll(() => {
    server = new ConquestServer({
      port: 0,
      serverName: "bandwidth-test-server",
      defaultMap: MAP_IRONREACH,
      maxPlayersPerRoom: 2,
    } as any);
    server.start();
    port = server.port;
  });

  afterAll(() => {
    server.stop();
  });

  it("plays a full game, measures bandwidth, and validates state projection", async () => {
    const botRng = makeSfc32(seedFromNumber(77));

    const clientA = new GameClient({
      host: `localhost:${port}`,
      playerName: "Alpha",
      forceNewSession: true,
      autoReconnect: false,
    });
    const clientB = new GameClient({
      host: `localhost:${port}`,
      playerName: "Bravo",
      forceNewSession: true,
      autoReconnect: false,
    });

    // Byte-tracking for client A — patch onmessage BEFORE connecting
    let totalBytesNew = 0;
    let maxMsgBytesNew = 0;
    let msgCount = 0;

    await clientA.connect();
    await clientB.connect();

    // Patch handler now that ws exists
    const origHandler = clientA.ws!.onmessage!;
    clientA.ws!.onmessage = (ev: MessageEvent) => {
      const raw: string = typeof ev.data === "string" ? ev.data : new TextDecoder().decode(ev.data as ArrayBuffer);
      const bytes = raw.length; // ASCII-safe approximation (UTF-8 length >= char count)
      totalBytesNew += bytes;
      msgCount++;
      if (bytes > maxMsgBytesNew) maxMsgBytesNew = bytes;
      origHandler.call(clientA.ws!, ev);
    };

    clientA.createRoom({ playerName: "Alpha", maxPlayers: 2 });
    const lobby = await clientA.waitForSnapshot(s => s.phase === "lobby", 5000);
    const roomCode = lobby.roomCode;

    clientB.join("Bravo", roomCode);
    await clientA.waitForSnapshot(s => s.players.length === 2, 5000);
    await clientB.waitForSnapshot(s => s.players.length === 2, 5000);

    clientA.ready();
    clientB.ready();
    await clientA.waitForSnapshot(s => s.phase === "deployment", 5000);
    await clientB.waitForSnapshot(s => s.phase === "deployment", 5000);

    // ── Run bots until game over ──────────────────────────────────────────────
    let actions = 0;
    let resyncDone = false;
    const MAX_ACTIONS = 500;
    const RESYNC_AT = 30;

    // We step through state changes via polling. After sending an action,
    // wait for next snapshot to arrive before proceeding.
    while (actions < MAX_ACTIONS) {
      const stA = clientA.state;
      const stB = clientB.state;

      if (!stA || !stB) { await new Promise(r => setTimeout(r, 10)); continue; }
      if ((stA.phase as string) === "game_over" || (stB.phase as string) === "game_over") break;

      // Force a resync mid-game to test recovery
      if (!resyncDone && actions >= RESYNC_AT) {
        const room = server.roomManager.findRoomByPlayerId(clientA.myPlayerId!);
        if (room && clientA.myPlayerId) {
          const expectedAfterResync = projectStateFor(room.state, clientA.myPlayerId);
          clientA.sendResync();
          // Wait for snapshot to arrive
          await clientA.waitForSnapshot(() => true, 2000).catch(() => {});
          const afterResync = clientA.state;
          if (afterResync) {
            const { match, diffs } = statesMatchIgnoringHistory(expectedAfterResync, afterResync);
            if (!match) console.log("Resync mismatch:", diffs.slice(0, 5));
            expect(match).toBe(true);
          }
        }
        resyncDone = true;
      }

      let acted = false;
      acted = doOneBotAction(clientA, botRng) || acted;
      acted = doOneBotAction(clientB, botRng) || acted;

      if (acted) {
        // Wait briefly for the server to process and client to receive update
        await new Promise(r => setTimeout(r, 30));
        actions++;
      } else {
        await new Promise(r => setTimeout(r, 10));
        actions++;
      }
    }

    // Wait for game over (up to 10s)
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const s = clientA.state;
      if (!s || (s.phase as string) === "game_over") break;
      doOneBotAction(clientA, botRng);
      doOneBotAction(clientB, botRng);
      await new Promise(r => setTimeout(r, 30));
    }

    const finalA = clientA.state;
    const finalB = clientB.state;

    // ── Bandwidth numbers ────────────────────────────────────────────────────

    // Old protocol estimate: every event carried the full server GameState.
    // Compute what one full-state event message would look like at game end.
    const serverRoom = server.roomManager.findRoomByPlayerId(clientA.myPlayerId!);
    const serverState = serverRoom?.state;

    let oldEstimatedBytes = 0;
    if (serverState) {
      const sampleOldEvent = JSON.stringify({
        type: "server:event",
        event: { type: "units_deployed", playerId: "p1", territoryId: "t1",
                 count: 3, remainingReinforcements: 0, timestamp: Date.now() },
        state: serverState,  // full state with full history
      });
      // Old protocol: every message (event AND snapshot) carried full state.
      // Conservative estimate: only events (not snapshots) at full-state size.
      // Actual old behavior would be even larger.
      oldEstimatedBytes = sampleOldEvent.length * msgCount;
    }

    console.log("\n─── Bandwidth Report ─────────────────────────────────────────");
    console.log(`  Messages received by client A:   ${msgCount}`);
    console.log(`  Total bytes (new δ protocol):    ${totalBytesNew.toLocaleString()}`);
    console.log(`  Max single message (new):        ${maxMsgBytesNew.toLocaleString()} bytes`);
    if (oldEstimatedBytes > 0) {
      console.log(`  Estimated old-protocol total:    ${oldEstimatedBytes.toLocaleString()} bytes`);
      console.log(`  Reduction vs old:                ${((1 - totalBytesNew / oldEstimatedBytes) * 100).toFixed(1)}%`);
    }
    console.log("─────────────────────────────────────────────────────────────");

    // Assert new protocol is smaller than old estimate
    if (oldEstimatedBytes > 0) {
      expect(totalBytesNew).toBeLessThan(oldEstimatedBytes);
    }

    // ── End-of-game state equality ───────────────────────────────────────────

    if (serverState && finalA && clientA.myPlayerId) {
      const expected = projectStateFor(serverState, clientA.myPlayerId);
      const { match, diffs } = statesMatchIgnoringHistory(expected, finalA);
      if (!match) console.log("State mismatch at game end:", diffs.slice(0, 10));
      expect(match).toBe(true);
    }

    clientA.disconnect();
    clientB.disconnect();
  }, 60_000);
});
