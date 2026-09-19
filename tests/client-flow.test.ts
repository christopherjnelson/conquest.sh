import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { ConquestServer } from "../apps/server/src/server.js";
import { GameClient } from "../apps/client/src/network/client.js";
import { MAP_IRONREACH } from "../packages/map-engine/src/index.js";
import type { GameEvent, ServerEvent } from "@conquest/protocol";

describe("GameClient: Client Flow & State Synchronization", () => {
  let server: ConquestServer;
  let port: number;

  const sessionFileAlice = path.resolve(process.cwd(), ".conquest-test-session-alice.json");
  const sessionFileBob = path.resolve(process.cwd(), ".conquest-test-session-bob.json");
  const sessionFileRecon = path.resolve(process.cwd(), ".conquest-test-session-recon.json");

  const cleanupSessionFiles = () => {
    try {
      if (fs.existsSync(sessionFileAlice)) fs.unlinkSync(sessionFileAlice);
      if (fs.existsSync(sessionFileBob)) fs.unlinkSync(sessionFileBob);
      if (fs.existsSync(sessionFileRecon)) fs.unlinkSync(sessionFileRecon);
    } catch {
      // Ignore cleanup error
    }
  };

  beforeAll(() => {
    cleanupSessionFiles();
    server = new ConquestServer({
      port: 0,
      serverName: "test-client-flow-server",
      maxPlayersPerRoom: 2,
      defaultMap: MAP_IRONREACH,
    });
    server.start();
    port = server.port;
  });

  afterAll(() => {
    server.stop();
    cleanupSessionFiles();
  });

  it("executes the full game flow: join, deploy, attack, chat, end turn, disconnect, and reconnect with session token", async () => {
    // 1. Instantiate Client A (Alice)
    const clientA = new GameClient({
      host: `localhost:${port}`,
      sessionFilePath: sessionFileAlice,
      forceNewSession: true,
      autoReconnect: false,
    });

    await clientA.connect();
    expect(clientA.status).toBe("connected");

    // Alice joins without a roomCode -> creates quick-match room
    clientA.join("Alice");

    // Wait for snapshot
    const snapshotA = await clientA.waitForSnapshot((s) => s.phase === "lobby" || s.phase === "deployment");
    expect(snapshotA).toBeDefined();
    expect(clientA.roomCode).toBeDefined();
    expect(clientA.sessionToken).toBeDefined();
    expect(clientA.myPlayerId).toBeDefined();

    const roomCode = clientA.roomCode!;
    const aliceId = clientA.myPlayerId!;
    const aliceToken = clientA.sessionToken!;

    // Verify session file was written for Alice
    expect(fs.existsSync(sessionFileAlice)).toBe(true);
    const savedAlice = JSON.parse(fs.readFileSync(sessionFileAlice, "utf-8"));
    expect(savedAlice.token).toBe(aliceToken);
    expect(savedAlice.playerName).toBe("Alice");
    expect(savedAlice.roomCode).toBe(roomCode);

    // 2. Instantiate Client B (Bob) and join the same room
    const clientB = new GameClient({
      host: `localhost:${port}`,
      sessionFilePath: sessionFileBob,
      forceNewSession: true,
      autoReconnect: false,
    });

    await clientB.connect();
    expect(clientB.status).toBe("connected");

    clientB.join("Bob", roomCode);

    // Since maxPlayersPerRoom is 2, the server auto-starts the game!
    // Wait for deployment phase snapshot on both clients
    const gameSnapshotA = await clientA.waitForSnapshot((s) => s.phase === "deployment");
    const gameSnapshotB = await clientB.waitForSnapshot((s) => s.phase === "deployment");

    expect(gameSnapshotA.phase).toBe("deployment");
    expect(gameSnapshotB.phase).toBe("deployment");
    expect(gameSnapshotA.players.length).toBe(2);
    expect(gameSnapshotB.players.length).toBe(2);

    const bobId = clientB.myPlayerId!;
    const bobToken = clientB.sessionToken!;
    expect(bobId).not.toBe(aliceId);
    expect(bobToken).toBeDefined();

    // Verify 20 territories of Ironreach are initialized
    const territoryIds = Object.keys(gameSnapshotA.territories);
    expect(territoryIds.length).toBe(20);
    expect(territoryIds).toContain("A1");
    expect(territoryIds).toContain("A2");
    expect(territoryIds).toContain("C1");

    // Alice is active player (index 0)
    expect(gameSnapshotA.activePlayerIndex).toBe(0);
    expect(gameSnapshotA.players[0].id).toBe(aliceId);
    expect(gameSnapshotA.pendingReinforcements).toBeGreaterThanOrEqual(3);

    // 3. Alice deploys reinforcements to territory A1
    const alicePending = clientA.state!.pendingReinforcements;
    clientA.deploy("A1", alicePending);

    // Both clients receive units_deployed event
    const deployEventA = await clientA.waitForEvent((e) => e.type === "units_deployed");
    const deployEventB = await clientB.waitForEvent((e) => e.type === "units_deployed");

    expect(deployEventA.type).toBe("units_deployed");
    if (deployEventA.type === "units_deployed") {
      expect(deployEventA.playerId).toBe(aliceId);
      expect(deployEventA.territoryId).toBe("A1");
      expect(deployEventA.count).toBe(alicePending);
    }
    expect(deployEventB.type).toBe("units_deployed");

    // State should now transition to "attack" phase
    const attackPhaseA = await clientA.waitForSnapshot((s) => s.phase === "attack");
    expect(attackPhaseA.phase).toBe("attack");
    expect(clientA.state?.territories["A1"].units).toBeGreaterThanOrEqual(alicePending);

    // 4. Alice attacks Bob's adjacent territory (A2)
    // In Ironreach, A1 is adjacent to A2
    clientA.attack("A1", "A2", 3);

    const attackEventA = await clientA.waitForEvent((e) => e.type === "attack_resolved");
    const attackEventB = await clientB.waitForEvent((e) => e.type === "attack_resolved");

    expect(attackEventA.type).toBe("attack_resolved");
    if (attackEventA.type === "attack_resolved") {
      expect(attackEventA.attackerId).toBe(aliceId);
      expect(attackEventA.defenderId).toBe(bobId);
      expect(attackEventA.sourceTerritoryId).toBe("A1");
      expect(attackEventA.targetTerritoryId).toBe("A2");
      expect(attackEventA.attackerRolls.length).toBeGreaterThan(0);
      expect(attackEventA.defenderRolls.length).toBeGreaterThan(0);
    }
    expect(attackEventB.type).toBe("attack_resolved");

    // 5. Send Chat message
    clientA.sendChat("Entering subnet perimeter!");

    const chatEventB = await clientB.waitForEvent((e) => e.type === "chat_message");
    expect(chatEventB.type).toBe("chat_message");
    if (chatEventB.type === "chat_message") {
      expect(chatEventB.senderName).toBe("Alice");
      expect(chatEventB.text).toBe("Entering subnet perimeter!");
    }

    // 6. Alice skips Attack phase to advance to Fortify phase
    clientA.skipPhase();
    const fortifyPhaseA = await clientA.waitForSnapshot((s) => s.phase === "fortify");
    expect(fortifyPhaseA.phase).toBe("fortify");

    // 7. Alice ends turn -> Bob becomes active player
    clientA.endTurn();

    const turnEndedEventA = await clientA.waitForEvent((e) => e.type === "turn_ended");
    expect(turnEndedEventA.type).toBe("turn_ended");
    if (turnEndedEventA.type === "turn_ended") {
      expect(turnEndedEventA.previousPlayerId).toBe(aliceId);
      expect(turnEndedEventA.nextPlayerId).toBe(bobId);
    }

    const bobTurnSnapshotB = await clientB.waitForSnapshot(
      (s) => s.phase === "deployment" && s.activePlayerIndex === 1
    );
    expect(bobTurnSnapshotB.activePlayerIndex).toBe(1);
    expect(bobTurnSnapshotB.players[1].id).toBe(bobId);
    expect(bobTurnSnapshotB.pendingReinforcements).toBeGreaterThanOrEqual(3);

    // 7. Bob disconnects (terminal close or network drop)
    clientB.disconnect();
    expect(clientB.status).toBe("disconnected");

    // Alice observes player_left event
    const leftEventA = await clientA.waitForEvent(
      (e) => e.type === "player_left" && e.playerId === bobId
    );
    expect(leftEventA).toBeDefined();

    // 8. Bob reconnects using a new client instance with cached session file
    expect(fs.existsSync(sessionFileBob)).toBe(true);

    const clientB_reconnected = new GameClient({
      host: `localhost:${port}`,
      sessionFilePath: sessionFileBob,
      forceNewSession: false, // Reads cached token & playerName
      autoReconnect: false,
    });

    expect(clientB_reconnected.sessionToken).toBe(bobToken);
    expect(clientB_reconnected.playerName).toBe("Bob");

    await clientB_reconnected.connect();
    // Join with cached session
    clientB_reconnected.join("Bob", roomCode);

    // Wait for snapshot on reconnected client
    const reconSnapshotB = await clientB_reconnected.waitForSnapshot(
      (s) => s.players.find((p) => p.id === bobId)?.connected === true
    );

    expect(reconSnapshotB.gameId).toBe(gameSnapshotA.gameId);
    expect(reconSnapshotB.roomCode).toBe(roomCode);
    expect(reconSnapshotB.activePlayerIndex).toBe(1);
    expect(reconSnapshotB.phase).toBe("deployment");
    expect(clientB_reconnected.myPlayerId).toBe(bobId);

    // Alice receives player_reconnected event
    const reconEventA = await clientA.waitForEvent(
      (e) => e.type === "player_reconnected" && e.playerId === bobId
    );
    expect(reconEventA).toBeDefined();

    // Verify state synchronization between Alice and reconnected Bob
    expect(clientA.state?.gameId).toBe(clientB_reconnected.state?.gameId);
    expect(clientA.state?.turnNumber).toBe(clientB_reconnected.state?.turnNumber);
    expect(clientA.state?.activePlayerIndex).toBe(clientB_reconnected.state?.activePlayerIndex);

    // Clean up
    clientA.disconnect();
    clientB_reconnected.disconnect();
  });

  it("handles server errors and reports them via onError callback", async () => {
    const client = new GameClient({
      host: `localhost:${port}`,
      forceNewSession: true,
      autoReconnect: false,
    });
    await client.connect();

    let receivedError: string | null = null;
    client.onError((msg) => {
      receivedError = msg;
    });

    // Send action before joining a room -> server responds with UNAUTHORIZED error
    client.deploy("frostfell", 3);

    // Wait for error callback
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(receivedError as string | null).toBe("Must join a room first");

    client.disconnect();
  });

  it("handles auto-reconnection when connection drops unexpectedly", async () => {
    const client = new GameClient({
      host: `localhost:${port}`,
      sessionFilePath: sessionFileRecon,
      forceNewSession: true,
      autoReconnect: true,
      reconnectIntervalMs: 100,
    });

    await client.connect();
    client.join("ReconTest");

    const snapshot = await client.waitForSnapshot();
    expect(snapshot).toBeDefined();

    const statusHistory: string[] = [];
    client.onStatusChange((s) => statusHistory.push(s));

    // Force close underlying WebSocket without calling client.disconnect()
    client.ws?.close();

    // Wait for auto-reconnection
    await client.waitForStatus("reconnecting", 3000);
    expect(client.status).toBe("reconnecting");

    await client.waitForStatus("connected", 3000);
    expect(client.status).toBe("connected");

    if (client.roomCode) {
      server.roomManager.removeRoom(client.roomCode);
    }
    client.disconnect();
  });

  it("allows two clients in the same working directory with different names to join, start a 2-player match, and reconnect independently without session collisions", async () => {
    const sessionFileAliceDefault = path.resolve(process.cwd(), `.conquest-session-alice-${port}.json`);
    const sessionFileBobDefault = path.resolve(process.cwd(), `.conquest-session-bob-${port}.json`);

    // Clean up any existing session files
    try {
      if (fs.existsSync(sessionFileAliceDefault)) fs.unlinkSync(sessionFileAliceDefault);
      if (fs.existsSync(sessionFileBobDefault)) fs.unlinkSync(sessionFileBobDefault);
    } catch {
      // Ignore
    }

    try {
      // 1. Terminal 1 starts Client A with playerName: "Alice" without --new (forceNewSession false/default)
      const clientA = new GameClient({
        host: `localhost:${port}`,
        playerName: "Alice",
        autoReconnect: false,
      });

      // Default session file path should include sanitized player name and port
      expect(clientA.sessionFilePath).toBe(sessionFileAliceDefault);

      await clientA.connect();
      clientA.join("Alice");

      const snapshotA = await clientA.waitForSnapshot((s) => s.phase === "lobby");
      expect(snapshotA.players.length).toBe(1);
      expect(snapshotA.players[0].name).toBe("Alice");
      const aliceId = clientA.myPlayerId!;
      const aliceToken = clientA.sessionToken!;
      const roomCode = clientA.roomCode!;

      // Alice wrote her own session file
      expect(fs.existsSync(sessionFileAliceDefault)).toBe(true);

      // 2. Terminal 2 starts Client B in the SAME working directory with playerName: "Bob" without --new
      const clientB = new GameClient({
        host: `localhost:${port}`,
        playerName: "Bob",
        autoReconnect: false,
      });

      // Bob uses a separate session file and does not load Alice's session
      expect(clientB.sessionFilePath).toBe(sessionFileBobDefault);
      expect(clientB.sessionToken).toBeNull();

      await clientB.connect();
      // Bob joins the room
      clientB.join("Bob", roomCode);

      // Verify Client B joins as Bob (NOT Alice reconnecting)
      const gameSnapshotA = await clientA.waitForSnapshot((s) => s.phase === "deployment");
      const gameSnapshotB = await clientB.waitForSnapshot((s) => s.phase === "deployment");

      expect(clientB.myPlayerId).not.toBe(aliceId);
      const bobId = clientB.myPlayerId!;
      const bobToken = clientB.sessionToken!;
      expect(bobToken).not.toBe(aliceToken);

      // Verify room has 2 distinct players and starts!
      expect(gameSnapshotA.phase).toBe("deployment");
      expect(gameSnapshotB.phase).toBe("deployment");
      expect(gameSnapshotA.players.length).toBe(2);
      expect(gameSnapshotB.players.length).toBe(2);
      const playerNames = gameSnapshotA.players.map((p) => p.name).sort();
      expect(playerNames).toEqual(["Alice", "Bob"]);

      // Bob's session file is written independently
      expect(fs.existsSync(sessionFileBobDefault)).toBe(true);

      // 3. Verify disconnecting and reconnecting Alice reconnects Alice
      clientA.disconnect();
      await clientB.waitForEvent((e) => e.type === "player_left" && e.playerId === aliceId);

      const clientA_recon = new GameClient({
        host: `localhost:${port}`,
        playerName: "Alice",
        autoReconnect: false,
      });
      // Should automatically load Alice's cached token
      expect(clientA_recon.sessionToken).toBe(aliceToken);

      await clientA_recon.connect();
      clientA_recon.join("Alice", roomCode);

      const reconSnapshotAlice = await clientA_recon.waitForSnapshot(
        (s) => s.players.find((p) => p.id === aliceId)?.connected === true
      );
      expect(clientA_recon.myPlayerId).toBe(aliceId);
      expect(reconSnapshotAlice.roomCode).toBe(roomCode);

      // 4. Verify disconnecting and reconnecting Bob reconnects Bob
      clientB.disconnect();
      await clientA_recon.waitForEvent((e) => e.type === "player_left" && e.playerId === bobId);

      const clientB_recon = new GameClient({
        host: `localhost:${port}`,
        playerName: "Bob",
        autoReconnect: false,
      });
      // Should automatically load Bob's cached token
      expect(clientB_recon.sessionToken).toBe(bobToken);

      await clientB_recon.connect();
      clientB_recon.join("Bob", roomCode);

      const reconSnapshotBob = await clientB_recon.waitForSnapshot(
        (s) => s.players.find((p) => p.id === bobId)?.connected === true
      );
      expect(clientB_recon.myPlayerId).toBe(bobId);
      expect(reconSnapshotBob.roomCode).toBe(roomCode);

      clientA_recon.disconnect();
      clientB_recon.disconnect();
    } finally {
      try {
        if (fs.existsSync(sessionFileAliceDefault)) fs.unlinkSync(sessionFileAliceDefault);
        if (fs.existsSync(sessionFileBobDefault)) fs.unlinkSync(sessionFileBobDefault);
      } catch {
        // Ignore cleanup
      }
    }
  });

  it("disregards cached session token if playerName does not match requested player", async () => {
    const sharedSessionFile = path.resolve(process.cwd(), `.conquest-test-shared-mismatch-${port}.json`);

    try {
      // Write a session file for Alice
      fs.writeFileSync(
        sharedSessionFile,
        JSON.stringify({
          token: "fake-token-alice",
          playerName: "Alice",
          roomCode: "TEST",
          playerId: "usr_alice",
        }),
        "utf-8"
      );

      // Create client pointing to that file with playerName "Bob"
      const client = new GameClient({
        host: `localhost:${port}`,
        sessionFilePath: sharedSessionFile,
        playerName: "Bob",
        autoReconnect: false,
      });

      // Token should NOT be loaded since playerName does not match
      expect(client.sessionToken).toBeNull();
      expect(client.loadSession()).toBeNull();

      // Even if constructed without playerName, joining as Bob disregards Alice's cached token
      const client2 = new GameClient({
        host: `localhost:${port}`,
        sessionFilePath: sharedSessionFile,
        autoReconnect: false,
      });
      expect(client2.sessionToken).toBe("fake-token-alice");

      await client2.connect();
      client2.join("Bob");
      // Calling join with Bob should clear the mismatched session token
      expect(client2.sessionToken).not.toBe("fake-token-alice");
      client2.disconnect();
    } finally {
      try {
        if (fs.existsSync(sharedSessionFile)) fs.unlinkSync(sharedSessionFile);
      } catch {
        // Ignore
      }
    }
  });

  it("matches two clients without roomCode into the same quick-match room, and preserves matchmaking across server restarts with stale session files", async () => {
    const sessionFileAliceQM = path.resolve(process.cwd(), ".conquest-test-qm-alice.json");
    const sessionFileBobQM = path.resolve(process.cwd(), ".conquest-test-qm-bob.json");
    const dbPathQM = path.resolve(process.cwd(), ".conquest-test-qm.sqlite");

    const cleanupQM = () => {
      try {
        if (fs.existsSync(sessionFileAliceQM)) fs.unlinkSync(sessionFileAliceQM);
        if (fs.existsSync(sessionFileBobQM)) fs.unlinkSync(sessionFileBobQM);
        if (fs.existsSync(dbPathQM)) fs.unlinkSync(dbPathQM);
        if (fs.existsSync(`${dbPathQM}-wal`)) fs.unlinkSync(`${dbPathQM}-wal`);
        if (fs.existsSync(`${dbPathQM}-shm`)) fs.unlinkSync(`${dbPathQM}-shm`);
      } catch {
        // Ignore
      }
    };

    cleanupQM();

    let qmServer = new ConquestServer({
      port: 0,
      serverName: "test-qm-server",
      maxPlayersPerRoom: 2,
      dbPath: dbPathQM,
    });
    qmServer.start();
    const qmPort = qmServer.port;

    try {
      // 1. Client A connects without roomCode -> joins quick-match room
      const clientA = new GameClient({
        host: `localhost:${qmPort}`,
        sessionFilePath: sessionFileAliceQM,
        playerName: "Alice",
        autoReconnect: false,
      });

      await clientA.connect();
      expect(clientA.status).toBe("connected");
      clientA.join("Alice"); // No roomCode!

      const snapshotA = await clientA.waitForSnapshot((s) => s.phase === "lobby");
      expect(snapshotA.players.length).toBe(1);
      expect(snapshotA.players[0].name).toBe("Alice");
      const initialRoomCode = clientA.roomCode!;
      expect(initialRoomCode).toBeDefined();
      expect(clientA.explicitRoomCode).toBeUndefined();

      // 2. Client B connects without roomCode -> matches into the SAME quick-match room
      const clientB = new GameClient({
        host: `localhost:${qmPort}`,
        sessionFilePath: sessionFileBobQM,
        playerName: "Bob",
        autoReconnect: false,
      });

      await clientB.connect();
      expect(clientB.status).toBe("connected");
      clientB.join("Bob"); // No roomCode!
      expect(clientB.explicitRoomCode).toBeUndefined();

      // 3. Game auto-starts with Alice and Bob!
      const gameSnapshotA = await clientA.waitForSnapshot((s) => s.phase === "deployment");
      const gameSnapshotB = await clientB.waitForSnapshot((s) => s.phase === "deployment");

      expect(clientA.roomCode).toBe(initialRoomCode);
      expect(clientB.roomCode).toBe(initialRoomCode);
      expect(gameSnapshotA.roomCode).toBe(initialRoomCode);
      expect(gameSnapshotB.roomCode).toBe(initialRoomCode);
      expect(gameSnapshotA.players.length).toBe(2);
      expect(gameSnapshotB.players.length).toBe(2);
      expect(gameSnapshotA.players.map((p) => p.name).sort()).toEqual(["Alice", "Bob"]);
      expect(gameSnapshotB.players.map((p) => p.name).sort()).toEqual(["Alice", "Bob"]);

      // Verify session files were written with initial roomCode
      expect(fs.existsSync(sessionFileAliceQM)).toBe(true);
      expect(fs.existsSync(sessionFileBobQM)).toBe(true);
      const savedAlice = JSON.parse(fs.readFileSync(sessionFileAliceQM, "utf-8"));
      const savedBob = JSON.parse(fs.readFileSync(sessionFileBobQM, "utf-8"));
      expect(savedAlice.roomCode).toBe(initialRoomCode);
      expect(savedBob.roomCode).toBe(initialRoomCode);

      // Disconnect clients
      clientA.disconnect();
      clientB.disconnect();

      // 4. Simulate server restart (old rooms wiped):
      qmServer.stop();

      // Restart server on same port, fresh in-memory rooms, same persistent DB
      qmServer = new ConquestServer({
        port: qmPort,
        serverName: "test-qm-server-restarted",
        maxPlayersPerRoom: 2,
        dbPath: dbPathQM,
      });
      qmServer.start();

      // 5. Client A connects with previous session files on disk without roomCode
      const clientA2 = new GameClient({
        host: `localhost:${qmPort}`,
        sessionFilePath: sessionFileAliceQM,
        playerName: "Alice",
        forceNewSession: false,
        autoReconnect: false,
      });

      // Verify cached room code is loaded in clientA2.roomCode, but explicitRoomCode is undefined
      expect(clientA2.sessionToken).toBe(savedAlice.token);
      expect(clientA2.roomCode).toBe(initialRoomCode);
      expect(clientA2.explicitRoomCode).toBeUndefined();

      await clientA2.connect();
      clientA2.join("Alice"); // No roomCode!
      expect(clientA2.explicitRoomCode).toBeUndefined();

      const snapshotA2 = await clientA2.waitForSnapshot((s) => s.phase === "lobby");
      expect(snapshotA2.players.length).toBe(1);
      expect(snapshotA2.players[0].name).toBe("Alice");
      const newRoomCode = clientA2.roomCode!;
      expect(newRoomCode).toBeDefined();

      // 6. Client B connects with previous session files on disk without roomCode
      const clientB2 = new GameClient({
        host: `localhost:${qmPort}`,
        sessionFilePath: sessionFileBobQM,
        playerName: "Bob",
        forceNewSession: false,
        autoReconnect: false,
      });

      expect(clientB2.sessionToken).toBe(savedBob.token);
      expect(clientB2.roomCode).toBe(initialRoomCode);
      expect(clientB2.explicitRoomCode).toBeUndefined();

      await clientB2.connect();
      clientB2.join("Bob"); // No roomCode!
      expect(clientB2.explicitRoomCode).toBeUndefined();

      // 7. Both match into the SAME new quick-match room (neither is isolated in an old dead room code)!
      const restartedSnapshotA = await clientA2.waitForSnapshot((s) => s.phase === "deployment");
      const restartedSnapshotB = await clientB2.waitForSnapshot((s) => s.phase === "deployment");

      expect(clientA2.roomCode).toBe(newRoomCode);
      expect(clientB2.roomCode).toBe(newRoomCode);
      expect(restartedSnapshotA.roomCode).toBe(newRoomCode);
      expect(restartedSnapshotB.roomCode).toBe(newRoomCode);
      expect(restartedSnapshotA.players.length).toBe(2);
      expect(restartedSnapshotB.players.length).toBe(2);
      expect(restartedSnapshotA.players.map((p) => p.name).sort()).toEqual(["Alice", "Bob"]);
      expect(restartedSnapshotB.players.map((p) => p.name).sort()).toEqual(["Alice", "Bob"]);

      clientA2.disconnect();
      clientB2.disconnect();
    } finally {
      qmServer.stop();
      cleanupQM();
    }
  });

  it("matches two clients without roomCode into the same quick-match room across server restart with in-memory session store", async () => {
    const sessionFileAliceMem = path.resolve(process.cwd(), ".conquest-test-mem-alice.json");
    const sessionFileBobMem = path.resolve(process.cwd(), ".conquest-test-mem-bob.json");

    const cleanupMem = () => {
      try {
        if (fs.existsSync(sessionFileAliceMem)) fs.unlinkSync(sessionFileAliceMem);
        if (fs.existsSync(sessionFileBobMem)) fs.unlinkSync(sessionFileBobMem);
      } catch {
        // Ignore
      }
    };

    cleanupMem();

    let memServer = new ConquestServer({
      port: 0,
      serverName: "test-mem-server",
      maxPlayersPerRoom: 2,
    });
    memServer.start();
    const memPort = memServer.port;

    try {
      // 1. Initial quick-match join
      const clientA = new GameClient({
        host: `localhost:${memPort}`,
        sessionFilePath: sessionFileAliceMem,
        playerName: "Alice",
        autoReconnect: false,
      });
      await clientA.connect();
      clientA.join("Alice");
      await clientA.waitForSnapshot((s) => s.phase === "lobby");
      const firstRoomCode = clientA.roomCode!;

      const clientB = new GameClient({
        host: `localhost:${memPort}`,
        sessionFilePath: sessionFileBobMem,
        playerName: "Bob",
        autoReconnect: false,
      });
      await clientB.connect();
      clientB.join("Bob");

      await clientA.waitForSnapshot((s) => s.phase === "deployment");
      await clientB.waitForSnapshot((s) => s.phase === "deployment");

      expect(clientA.roomCode).toBe(firstRoomCode);
      expect(clientB.roomCode).toBe(firstRoomCode);

      clientA.disconnect();
      clientB.disconnect();

      // 2. Restart server (in-memory sessions and rooms completely wiped)
      memServer.stop();
      memServer = new ConquestServer({
        port: memPort,
        serverName: "test-mem-server-restarted",
        maxPlayersPerRoom: 2,
      });
      memServer.start();

      // 3. Connect with previous session files on disk without roomCode
      const clientA2 = new GameClient({
        host: `localhost:${memPort}`,
        sessionFilePath: sessionFileAliceMem,
        playerName: "Alice",
        forceNewSession: false,
        autoReconnect: false,
      });
      expect(clientA2.roomCode).toBe(firstRoomCode);
      expect(clientA2.explicitRoomCode).toBeUndefined();

      await clientA2.connect();
      clientA2.join("Alice");

      const lobbyA2 = await clientA2.waitForSnapshot((s) => s.phase === "lobby");
      expect(lobbyA2.players.length).toBe(1);
      const secondRoomCode = clientA2.roomCode!;

      const clientB2 = new GameClient({
        host: `localhost:${memPort}`,
        sessionFilePath: sessionFileBobMem,
        playerName: "Bob",
        forceNewSession: false,
        autoReconnect: false,
      });
      expect(clientB2.roomCode).toBe(firstRoomCode);
      expect(clientB2.explicitRoomCode).toBeUndefined();

      await clientB2.connect();
      clientB2.join("Bob");

      const matchA2 = await clientA2.waitForSnapshot((s) => s.phase === "deployment");
      const matchB2 = await clientB2.waitForSnapshot((s) => s.phase === "deployment");

      expect(clientA2.roomCode).toBe(secondRoomCode);
      expect(clientB2.roomCode).toBe(secondRoomCode);
      expect(matchA2.roomCode).toBe(secondRoomCode);
      expect(matchB2.roomCode).toBe(secondRoomCode);
      expect(matchA2.players.length).toBe(2);
      expect(matchB2.players.length).toBe(2);

      clientA2.disconnect();
      clientB2.disconnect();
    } finally {
      memServer.stop();
      cleanupMem();
    }
  });

  it("runs full game flow against default MAP_GRID_IRONREACH server: distributes 20 territories, deploys, attacks, ends turn", async () => {
    const sessionFileAliceGrid = path.resolve(process.cwd(), ".conquest-test-grid-alice.json");
    const sessionFileBobGrid = path.resolve(process.cwd(), ".conquest-test-grid-bob.json");

    const cleanupGrid = () => {
      try {
        if (fs.existsSync(sessionFileAliceGrid)) fs.unlinkSync(sessionFileAliceGrid);
        if (fs.existsSync(sessionFileBobGrid)) fs.unlinkSync(sessionFileBobGrid);
      } catch {
        // Ignore cleanup error
      }
    };

    cleanupGrid();

    // Default ConquestServer constructor uses MAP_GRID_IRONREACH without specifying defaultMap
    const gridServer = new ConquestServer({
      port: 0,
      serverName: "test-grid-server",
      maxPlayersPerRoom: 2,
    });
    gridServer.start();
    const gridPort = gridServer.port;

    try {
      // 1. Connect Client A (Alice)
      const clientA = new GameClient({
        host: `localhost:${gridPort}`,
        sessionFilePath: sessionFileAliceGrid,
        forceNewSession: true,
        autoReconnect: false,
      });

      await clientA.connect();
      expect(clientA.status).toBe("connected");
      clientA.join("Alice");

      const snapshotA = await clientA.waitForSnapshot((s) => s.phase === "lobby" || s.phase === "deployment");
      expect(snapshotA).toBeDefined();
      const roomCode = clientA.roomCode!;
      const aliceId = clientA.myPlayerId!;
      expect(roomCode).toBeDefined();
      expect(aliceId).toBeDefined();

      // 2. Connect Client B (Bob) to the same room
      const clientB = new GameClient({
        host: `localhost:${gridPort}`,
        sessionFilePath: sessionFileBobGrid,
        forceNewSession: true,
        autoReconnect: false,
      });

      await clientB.connect();
      expect(clientB.status).toBe("connected");
      clientB.join("Bob", roomCode);

      // Wait for deployment phase snapshot on both clients (auto-start when 2 players join)
      const gameSnapshotA = await clientA.waitForSnapshot((s) => s.phase === "deployment");
      const gameSnapshotB = await clientB.waitForSnapshot((s) => s.phase === "deployment");

      expect(gameSnapshotA.phase).toBe("deployment");
      expect(gameSnapshotB.phase).toBe("deployment");
      expect(gameSnapshotA.players.length).toBe(2);
      expect(gameSnapshotB.players.length).toBe(2);

      const bobId = clientB.myPlayerId!;
      expect(bobId).not.toBe(aliceId);

      // Verify all 20 territories (A1-A3, B1-B3, C1-C4, D1-D4, E1-E3, F1-F3) are distributed
      const territoryIds = Object.keys(gameSnapshotA.territories);
      expect(territoryIds.length).toBe(20);

      const expectedGridTerritories = [
        "A1", "A2", "A3",
        "B1", "B2", "B3",
        "C1", "C2", "C3", "C4",
        "D1", "D2", "D3", "D4",
        "E1", "E2", "E3",
        "F1", "F2", "F3",
      ];
      for (const expectedId of expectedGridTerritories) {
        expect(territoryIds).toContain(expectedId);
        const t = gameSnapshotA.territories[expectedId];
        expect(t).toBeDefined();
        expect([aliceId, bobId]).toContain(t.ownerId);
        expect(t.units).toBeGreaterThanOrEqual(1);
      }

      // Verify even distribution (10 territories each)
      const aliceTerritories = territoryIds.filter((id) => gameSnapshotA.territories[id].ownerId === aliceId);
      const bobTerritories = territoryIds.filter((id) => gameSnapshotA.territories[id].ownerId === bobId);
      expect(aliceTerritories.length).toBe(10);
      expect(bobTerritories.length).toBe(10);

      // Alice is active player (turn 1)
      expect(gameSnapshotA.activePlayerIndex).toBe(0);
      expect(gameSnapshotA.players[0].id).toBe(aliceId);

      // 3. Alice deploys to C2 (or whichever territory she owns)
      const deployTerritoryId = gameSnapshotA.territories["C2"]?.ownerId === aliceId
        ? "C2"
        : (aliceTerritories.find((id) =>
            gameSnapshotA.territories[id].neighbors.some((nId) => gameSnapshotA.territories[nId].ownerId === bobId)
          ) ?? aliceTerritories[0]);

      const pendingReinforcements = clientA.state!.pendingReinforcements;
      expect(pendingReinforcements).toBeGreaterThanOrEqual(3);

      clientA.deploy(deployTerritoryId, pendingReinforcements);

      // Both clients receive units_deployed event
      const deployEventA = await clientA.waitForEvent((e) => e.type === "units_deployed");
      const deployEventB = await clientB.waitForEvent((e) => e.type === "units_deployed");

      expect(deployEventA.type).toBe("units_deployed");
      if (deployEventA.type === "units_deployed") {
        expect(deployEventA.playerId).toBe(aliceId);
        expect(deployEventA.territoryId).toBe(deployTerritoryId);
        expect(deployEventA.count).toBe(pendingReinforcements);
      }
      expect(deployEventB.type).toBe("units_deployed");

      // Game transitions to attack phase
      const attackPhaseA = await clientA.waitForSnapshot((s) => s.phase === "attack");
      expect(attackPhaseA.phase).toBe("attack");
      expect(clientA.state?.territories[deployTerritoryId].units).toBeGreaterThanOrEqual(pendingReinforcements);

      // 4. Alice attacks an adjacent territory
      const targetTerritoryId = gameSnapshotA.territories[deployTerritoryId].neighbors.find(
        (nId) => gameSnapshotA.territories[nId].ownerId === bobId
      )!;
      expect(targetTerritoryId).toBeDefined();

      clientA.attack(deployTerritoryId, targetTerritoryId, 3);

      const attackEventA = await clientA.waitForEvent((e) => e.type === "attack_resolved");
      const attackEventB = await clientB.waitForEvent((e) => e.type === "attack_resolved");

      expect(attackEventA.type).toBe("attack_resolved");
      if (attackEventA.type === "attack_resolved") {
        expect(attackEventA.attackerId).toBe(aliceId);
        expect(attackEventA.defenderId).toBe(bobId);
        expect(attackEventA.sourceTerritoryId).toBe(deployTerritoryId);
        expect(attackEventA.targetTerritoryId).toBe(targetTerritoryId);
        expect(attackEventA.attackerRolls.length).toBeGreaterThan(0);
        expect(attackEventA.defenderRolls.length).toBeGreaterThan(0);
      }
      expect(attackEventB.type).toBe("attack_resolved");

      // 5. Alice skips attack to fortify, then ends turn; Bob becomes active
      clientA.skipPhase();
      await clientA.waitForEvent((e) => e.type === "phase_changed" && e.phase === "fortify");
      clientA.endTurn();

      const turnEndedEventA = await clientA.waitForEvent((e) => e.type === "turn_ended");
      const turnEndedEventB = await clientB.waitForEvent((e) => e.type === "turn_ended");

      expect(turnEndedEventA.type).toBe("turn_ended");
      if (turnEndedEventA.type === "turn_ended") {
        expect(turnEndedEventA.previousPlayerId).toBe(aliceId);
        expect(turnEndedEventA.nextPlayerId).toBe(bobId);
      }
      expect(turnEndedEventB.type).toBe("turn_ended");

      const bobTurnSnapshot = await clientB.waitForSnapshot(
        (s) => s.phase === "deployment" && s.activePlayerIndex === 1
      );
      expect(bobTurnSnapshot.activePlayerIndex).toBe(1);
      expect(bobTurnSnapshot.players[1].id).toBe(bobId);
      expect(bobTurnSnapshot.pendingReinforcements).toBeGreaterThanOrEqual(3);

      // Cleanup
      clientA.disconnect();
      clientB.disconnect();
    } finally {
      gridServer.stop();
      cleanupGrid();
    }
  });
});
