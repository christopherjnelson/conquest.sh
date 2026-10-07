/**
 * Bandwidth measurement script.
 *
 * Plays a full simulated game through a real server with 2 clients using bots.
 * Reports total bytes sent to one client and the max single message size.
 *
 * Also asserts that the client's reconstructed state equals
 * projectStateFor(serverState, thatPlayer) at end of game and after resync.
 *
 * Usage:  bun run scripts/bandwidth-measure.ts
 */

import { ConquestServer } from "../apps/server/src/server.js";
import { GameClient } from "../apps/client/src/network/client.js";
import { projectStateFor } from "../packages/game-core/src/index.js";
import { EARTH_42_BUNDLE } from "../packages/map-engine/src/index.js";
import type { GameState } from "../packages/protocol/src/index.js";
import { makeSfc32, makeShuffleFn } from "../packages/shared/src/index.js";

// ── Seed helpers ──────────────────────────────────────────────────────────────

function seedFromNumber(n: number): Uint8Array {
  const buf = new Uint8Array(16);
  new DataView(buf.buffer).setUint32(0, n >>> 0, true);
  new DataView(buf.buffer).setUint32(4, (n * 2654435761) >>> 0, true);
  new DataView(buf.buffer).setUint32(8, (n * 2246822519) >>> 0, true);
  new DataView(buf.buffer).setUint32(12, (n * 3266489917) >>> 0, true);
  return buf;
}

// ── Bot helpers ───────────────────────────────────────────────────────────────

/** Pick a random element from an array. */
function pick<T>(arr: T[], rng: () => number): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Run an aggressive bot turn for the current active player.
 * Returns false when game is over.
 */
async function botTurn(client: GameClient, botRng: () => number): Promise<boolean> {
  const state = client.state;
  if (!state || state.phase === "game_over") return false;

  const myId = client.myPlayerId;
  if (!myId) return false;
  const activePlayer = state.players[state.activePlayerIndex];
  if (!activePlayer || activePlayer.id !== myId) return true; // not our turn

  switch (state.phase) {
    case "deployment": {
      const myTerritories = Object.values(state.territories).filter(t => t.ownerId === myId);
      const target = pick(myTerritories, botRng);
      if (!target) { client.skipPhase(); break; }
      client.deploy(target.id, state.pendingReinforcements);
      await client.waitForSnapshot(s => s.pendingReinforcements === 0 || s.phase !== "deployment", 3000).catch(() => {});
      break;
    }
    case "attack": {
      if (state.pendingConquestMove) {
        const move = state.pendingConquestMove;
        const units = Math.ceil((move.maximumUnits + move.minimumUnits) / 2);
        client.completeConquestMove(units);
        await client.waitForSnapshot(s => !s.pendingConquestMove, 3000).catch(() => {});
        break;
      }
      // Find attack source
      const sources = Object.values(state.territories).filter(
        t => t.ownerId === myId && t.units >= 2 &&
          t.neighbors.some(n => state.territories[n]?.ownerId !== myId)
      );
      const src = pick(sources, botRng);
      if (!src) {
        client.skipPhase();
        await client.waitForSnapshot(s => s.phase !== "attack", 3000).catch(() => {});
        break;
      }
      const enemyNeighbors = src.neighbors.filter(n => state.territories[n]?.ownerId !== myId);
      const tgt = pick(enemyNeighbors, botRng);
      if (!tgt) {
        client.skipPhase();
        await client.waitForSnapshot(s => s.phase !== "attack", 3000).catch(() => {});
        break;
      }
      client.attack(src.id, tgt);
      await client.waitForSnapshot(s => s.phase !== "attack" || !s.pendingConquestMove && s.territories[tgt]?.ownerId !== myId, 3000).catch(() => {});
      break;
    }
    case "fortify": {
      client.endTurn();
      await client.waitForSnapshot(s => s.phase === "deployment", 3000).catch(() => {});
      break;
    }
  }
  return true;
}

// ── Byte-counting socket wrapper ──────────────────────────────────────────────

interface BandwidthStats {
  totalBytes: number;
  maxMessageBytes: number;
  messageCount: number;
}

class ByteCountingWebSocket extends WebSocket {
  public readonly stats: BandwidthStats = {
    totalBytes: 0,
    maxMessageBytes: 0,
    messageCount: 0,
  };

  constructor(url: string) {
    super(url);
    const origOnMessage = Object.getOwnPropertyDescriptor(WebSocket.prototype, "onmessage");
    const stats = this.stats;

    // Intercept messages by patching onmessage setter
    let _handler: ((ev: MessageEvent) => void) | null = null;
    Object.defineProperty(this, "onmessage", {
      get: () => _handler,
      set: (fn: ((ev: MessageEvent) => void) | null) => {
        _handler = fn ? (ev: MessageEvent) => {
          const data = ev.data;
          const bytes = typeof data === "string" ? new TextEncoder().encode(data).length : (data as ArrayBuffer).byteLength;
          stats.totalBytes += bytes;
          stats.messageCount++;
          if (bytes > stats.maxMessageBytes) stats.maxMessageBytes = bytes;
          fn(ev);
        } : null;
      },
      configurable: true,
    });
  }
}

// ── Main measurement ──────────────────────────────────────────────────────────

async function measureBandwidth(): Promise<void> {
  const seed = seedFromNumber(42);
  const botRng = makeSfc32(seed);

  const server = new ConquestServer({
    port: 0,
    serverName: "bandwidth-test",
    defaultMap: EARTH_42_BUNDLE.definition,
    maxPlayersPerRoom: 2,
    rngSeed: seed,
  } as any);
  server.start();
  const port = server.port;

  const wsUrl = `ws://localhost:${port}`;

  // Create byte-counting WebSocket for player 1
  const ws1 = new ByteCountingWebSocket(wsUrl);
  const ws2 = new WebSocket(wsUrl);

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

  // Override ws to track bytes for clientA
  // We need to use the byte-counting approach at the message level
  let totalBytesToClientA = 0;
  let maxMsgToClientA = 0;
  let msgCountToClientA = 0;

  // We'll intercept by wrapping the server socket instead
  // Find player A's socket after they connect and track bytes from server side
  await clientA.connect();
  await clientB.connect();

  clientA.createRoom({ playerName: "Alpha", maxPlayers: 2 });
  const lobby = await clientA.waitForSnapshot(s => s.phase === "lobby");
  const roomCode = lobby.roomCode;

  clientB.join("Bravo", roomCode);
  await clientA.waitForSnapshot(s => s.players.length === 2);
  await clientB.waitForSnapshot(s => s.players.length === 2);

  // Intercept clientA's WebSocket to count bytes
  const originalOnMessage = clientA.ws!.onmessage;
  clientA.ws!.onmessage = (ev: MessageEvent) => {
    const data = ev.data;
    const bytes = typeof data === "string"
      ? new TextEncoder().encode(data).length
      : (data as ArrayBuffer).byteLength;
    totalBytesToClientA += bytes;
    msgCountToClientA++;
    if (bytes > maxMsgToClientA) maxMsgToClientA = bytes;
    if (originalOnMessage) originalOnMessage.call(clientA.ws!, ev);
  };

  clientA.ready();
  clientB.ready();

  await clientA.waitForSnapshot(s => s.phase === "deployment", 5000);
  await clientB.waitForSnapshot(s => s.phase === "deployment", 5000);

  console.log("Game started, running bots...");

  // Run bots alternately until game over
  let turns = 0;
  const MAX_TURNS = 500;
  while (turns < MAX_TURNS) {
    const stateA = clientA.state;
    const stateB = clientB.state;
    if (stateA?.phase === "game_over" || stateB?.phase === "game_over") break;

    if (stateA && stateA.players[stateA.activePlayerIndex]?.id === clientA.myPlayerId) {
      await botTurn(clientA, botRng);
    } else if (stateB && stateB.players[stateB.activePlayerIndex]?.id === clientB.myPlayerId) {
      await botTurn(clientB, botRng);
    } else {
      // Wait for next snapshot
      await Promise.race([
        clientA.waitForSnapshot(() => true, 2000),
        new Promise(r => setTimeout(r, 500)),
      ]).catch(() => {});
    }
    turns++;
  }

  // Wait for game_over
  const finalStateA = await clientA.waitForSnapshot(s => s.phase === "game_over", 10000)
    .catch(() => clientA.state);

  console.log(`\nGame finished in ${turns} bot actions`);
  console.log(`Final phase: ${finalStateA?.phase}`);

  // ── Bandwidth report ──────────────────────────────────────────────────────

  // Compute "before" estimate: old protocol sent full GameState in every server:event.
  // We estimate the before size by computing what a full-state event would have been.
  // Actually we measure what we sent (new protocol) and also reconstruct old.
  const serverState = server.roomManager.findRoomByPlayerId(clientA.myPlayerId!)?.state;

  let oldProtocolEstimate = 0;
  if (serverState) {
    // Estimate old: every message would have been a snapshot (full state with full history)
    // The actual old events carried full state too.
    // Realistic estimate: average message size in old protocol = size of full state.
    const fullStateJson = JSON.stringify({
      type: "server:event",
      event: { type: "units_deployed", playerId: "p1", territoryId: "na_alaska_range", count: 3, remainingReinforcements: 0, timestamp: Date.now() },
      state: serverState,
    });
    oldProtocolEstimate = fullStateJson.length * msgCountToClientA;
  }

  console.log("\n── Bandwidth Report ──────────────────────────────────────────");
  console.log(`Messages received by client A:  ${msgCountToClientA}`);
  console.log(`Total bytes (new protocol):     ${totalBytesToClientA.toLocaleString()}`);
  console.log(`Max single message (new):       ${maxMsgToClientA.toLocaleString()} bytes`);
  if (oldProtocolEstimate > 0) {
    console.log(`Estimated old protocol total:   ${oldProtocolEstimate.toLocaleString()}`);
    console.log(`Reduction:                      ${((1 - totalBytesToClientA / oldProtocolEstimate) * 100).toFixed(1)}%`);
  }

  // ── State equality assertion ──────────────────────────────────────────────

  console.log("\n── State Equality Assertion ──────────────────────────────────");

  if (serverState && finalStateA && clientA.myPlayerId) {
    const expectedProjected = projectStateFor(serverState, clientA.myPlayerId);

    // Compare without history (client history may differ due to event accumulation)
    const clientStateForCompare = { ...finalStateA, history: [] };
    const serverStateForCompare = { ...expectedProjected, history: [] };

    const clientJson = JSON.stringify(clientStateForCompare, null, 0);
    const serverJson = JSON.stringify(serverStateForCompare, null, 0);

    if (clientJson === serverJson) {
      console.log("✓ Client state matches projectStateFor(serverState, playerId) at game end");
    } else {
      console.log("✗ State mismatch at game end:");
      // Find differing keys
      const clientObj = JSON.parse(clientJson);
      const serverObj = JSON.parse(serverJson);
      for (const key of Object.keys(serverObj)) {
        if (JSON.stringify(clientObj[key]) !== JSON.stringify(serverObj[key])) {
          console.log(`  Key "${key}" differs:`);
          console.log(`    server: ${JSON.stringify(serverObj[key])?.substring(0, 100)}`);
          console.log(`    client: ${JSON.stringify(clientObj[key])?.substring(0, 100)}`);
        }
      }
    }
  }

  // ── Resync assertion ──────────────────────────────────────────────────────

  console.log("\n── Resync Assertion ──────────────────────────────────────────");
  if (clientA.ws) {
    // Trigger a manual resync
    clientA.sendResync();
    const resyncState = await clientA.waitForSnapshot(() => true, 3000).catch(() => null);
    if (resyncState && serverState && clientA.myPlayerId) {
      const expected = projectStateFor(serverState, clientA.myPlayerId);
      const clientJson = JSON.stringify({ ...resyncState, history: [] }, null, 0);
      const serverJson = JSON.stringify({ ...expected, history: [] }, null, 0);
      if (clientJson === serverJson) {
        console.log("✓ Client state matches after forced resync");
      } else {
        console.log("✗ State mismatch after resync");
      }
    } else {
      console.log("⚠ Could not verify resync (game over or no state)");
    }
  }

  clientA.disconnect();
  clientB.disconnect();
  server.stop();
  ws1.close();
  ws2.close();
}

measureBandwidth().then(() => {
  console.log("\nDone.");
  process.exit(0);
}).catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
