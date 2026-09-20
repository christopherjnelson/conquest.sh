import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { ConquestServer } from "../apps/server/src/server.js";
import { GameClient } from "../apps/client/src/network/client.js";
import {
  ServerInfoSchema,
  type ServerError,
  type ServerSnapshot,
} from "@conquest/protocol";
import { MAP_GRID_IRONREACH } from "@conquest/map-engine";

describe("Lobby, Discovery API & Custom Rooms", () => {
  let server: ConquestServer;
  let port: number;

  const sessionFile1 = path.resolve(process.cwd(), ".conquest-test-lobby-1.json");
  const sessionFile2 = path.resolve(process.cwd(), ".conquest-test-lobby-2.json");
  const sessionFile3 = path.resolve(process.cwd(), ".conquest-test-lobby-3.json");

  const cleanupSessionFiles = () => {
    try {
      if (fs.existsSync(sessionFile1)) fs.unlinkSync(sessionFile1);
      if (fs.existsSync(sessionFile2)) fs.unlinkSync(sessionFile2);
      if (fs.existsSync(sessionFile3)) fs.unlinkSync(sessionFile3);
    } catch {
      // ignore
    }
  };

  beforeAll(() => {
    cleanupSessionFiles();
    server = new ConquestServer({
      port: 0,
      serverName: "Apex-Ironreach-Prime",
      defaultMap: MAP_GRID_IRONREACH,
      maxPlayersPerRoom: 4,
    });
    server.start();
    port = server.port;
  });

  afterAll(() => {
    server.stop();
    cleanupSessionFiles();
  });

  describe("HTTP API endpoints", () => {
    it("GET /health returns server health and counts", async () => {
      const res = await fetch(`http://localhost:${port}/health`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.status).toBe("ok");
      expect(data.serverName).toBe("Apex-Ironreach-Prime");
      expect(typeof data.roomsCount).toBe("number");
      expect(typeof data.playersCount).toBe("number");
    });

    it("GET /api/server returns valid ServerInfo schema", async () => {
      const res = await fetch(`http://localhost:${port}/api/server`);
      expect(res.status).toBe(200);
      const data = await res.json();
      const parsed = ServerInfoSchema.safeParse(data);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.serverName).toBe("Apex-Ironreach-Prime");
        expect(parsed.data.defaultMap).toBe("The Ironreach");
        expect(parsed.data.availableMaps.map(map => map.id)).toContain("earth-42");
        expect(parsed.data.availableMaps.map(map => map.id)).toContain("ironreach");
        expect(parsed.data.roomsCount).toBeGreaterThanOrEqual(0);
      }
    });

    it("GET /api/rooms and /rooms return empty array initially", async () => {
      const res1 = await fetch(`http://localhost:${port}/api/rooms`);
      expect(res1.status).toBe(200);
      const rooms1 = await res1.json();
      expect(Array.isArray(rooms1)).toBe(true);

      const res2 = await fetch(`http://localhost:${port}/rooms`);
      expect(res2.status).toBe(200);
      const rooms2 = await res2.json();
      expect(Array.isArray(rooms2)).toBe(true);
    });
  });

  describe("Room Creation, Visibility & Joining", () => {
    it("accepts a valid requested map and keeps its ID in lobby state", async () => {
      const client = new GameClient({ host: `localhost:${port}`, sessionFilePath: sessionFile1,
        forceNewSession: true, autoReconnect: false });
      await client.connect();
      client.createRoom({ playerName: "EarthHost", displayName: "Earth Test", mapId: "earth-42" });
      const state = await client.waitForSnapshot(s => s.phase === "lobby" && s.mapId === "earth-42");
      expect(state.mapId).toBe("earth-42");
      expect(server.roomManager.getRoom(state.roomCode)?.map.id).toBe("earth-42");
      client.disconnect();
    });
    it("joining a non-existent room code returns ROOM_NOT_FOUND without creating a room", async () => {
      const client = new GameClient({
        host: `localhost:${port}`,
        sessionFilePath: sessionFile1,
        forceNewSession: true,
        autoReconnect: false,
      });

      await client.connect();

      let receivedMsg: string | null = null;
      let receivedCode: string | null = null;
      client.onError((msg, code) => {
        receivedMsg = msg;
        receivedCode = code ?? null;
      });

      // Join a random 4-letter non-existent room
      client.join("GhostRider", "ZZZZ");

      // Wait a moment for the server to reply with error
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(String(receivedCode)).toBe("ROOM_NOT_FOUND");
      expect(String(receivedMsg)).toContain("ZZZZ");

      // Check that no room was created
      const roomsRes = await fetch(`http://localhost:${port}/api/rooms`);
      const rooms = (await roomsRes.json()) as any[];
      expect(rooms.some((r) => r.roomCode === "ZZZZ")).toBe(false);

      client.disconnect();
    });

    it("creates a public custom room that appears in /api/rooms", async () => {
      const client = new GameClient({
        host: `localhost:${port}`,
        sessionFilePath: sessionFile1,
        forceNewSession: true,
        autoReconnect: false,
      });

      await client.connect();

      client.createRoom({
        playerName: "CommanderAlpha",
        roomName: "Fortress Valhalla",
        visibility: "public",
        maxPlayers: 3,
      });

      const snapshot = await client.waitForSnapshot((s) => s.phase === "lobby");
      expect(snapshot).toBeDefined();
      expect(client.roomCode).toBeDefined();
      const code = client.roomCode!;

      // Verify it appears in /api/rooms
      const roomsRes = await fetch(`http://localhost:${port}/api/rooms`);
      const rooms = (await roomsRes.json()) as any[];
      const found = rooms.find((r) => r.roomCode === code);
      expect(found).toBeDefined();
      expect(found.displayName).toBe("Fortress Valhalla");
      expect(found.maxPlayers).toBe(3);
      expect(found.visibility).toBe("public");
      expect(found.kind).toBe("custom");
      expect(found.playersCount).toBe(1);

      client.disconnect();
    });

    it("creates an unlisted room that does NOT appear in /api/rooms but can be joined by code", async () => {
      const creator = new GameClient({
        host: `localhost:${port}`,
        sessionFilePath: sessionFile2,
        forceNewSession: true,
        autoReconnect: false,
      });

      await creator.connect();

      creator.createRoom({
        playerName: "ShadowLead",
        roomName: "Secret Bunker",
        visibility: "unlisted",
        maxPlayers: 2,
      });

      await creator.waitForSnapshot((s) => s.phase === "lobby");
      const secretCode = creator.roomCode!;
      expect(secretCode).toBeDefined();

      // Verify it does NOT appear in /api/rooms
      const roomsRes = await fetch(`http://localhost:${port}/api/rooms`);
      const rooms = (await roomsRes.json()) as any[];
      const secretRoomInPublic = rooms.find((r) => r.roomCode === secretCode);
      expect(secretRoomInPublic).toBeUndefined();

      // Joiner should be able to join using the code
      const joiner = new GameClient({
        host: `localhost:${port}`,
        sessionFilePath: sessionFile3,
        forceNewSession: true,
        autoReconnect: false,
      });

      await joiner.connect();
      joiner.join("OperativeTwo", secretCode);

      const joinerSnapshot = await joiner.waitForSnapshot((s) => s.phase === "lobby");
      expect(joinerSnapshot).toBeDefined();
      expect(joinerSnapshot.players.length).toBe(2);
      expect(joinerSnapshot.players.some((p) => p.name === "ShadowLead")).toBe(true);
      expect(joinerSnapshot.players.some((p) => p.name === "OperativeTwo")).toBe(true);

      creator.disconnect();
      joiner.disconnect();
    });

    it("custom room does not auto-start when players reach max until players ready up", async () => {
      cleanupSessionFiles();

      const p1 = new GameClient({
        host: `localhost:${port}`,
        sessionFilePath: sessionFile1,
        forceNewSession: true,
        autoReconnect: false,
      });
      await p1.connect();
      p1.createRoom({
        playerName: "PlayerOne",
        roomName: "Dueling Grounds",
        visibility: "public",
        maxPlayers: 2,
      });
      await p1.waitForSnapshot((s) => s.phase === "lobby");
      const roomCode = p1.roomCode!;

      const p2 = new GameClient({
        host: `localhost:${port}`,
        sessionFilePath: sessionFile2,
        forceNewSession: true,
        autoReconnect: false,
      });
      await p2.connect();
      p2.join("PlayerTwo", roomCode);
      await p2.waitForSnapshot((s) => s.phase === "lobby" && s.players.length === 2);

      // Even though 2/2 players joined, phase must STILL be "lobby"
      await new Promise((r) => setTimeout(r, 200));
      expect(p1.state?.phase).toBe("lobby");
      expect(p2.state?.phase).toBe("lobby");

      // Player 1 readies up
      p1.ready(true);
      await new Promise((r) => setTimeout(r, 100));
      expect(p1.state?.phase).toBe("lobby");

      // Player 2 readies up -> NOW it transitions to deployment/game start
      p2.ready(true);
      const gameStarted = await p1.waitForSnapshot((s) => s.phase === "deployment");
      expect(gameStarted.phase).toBe("deployment");

      p1.disconnect();
      p2.disconnect();
    });

    it("quick match does NOT place players into open custom rooms", async () => {
      cleanupSessionFiles();

      // Create an open custom room with 4 slots
      const customClient = new GameClient({
        host: `localhost:${port}`,
        sessionFilePath: sessionFile1,
        forceNewSession: true,
        autoReconnect: false,
      });
      await customClient.connect();
      customClient.createRoom({
        playerName: "CustomHost",
        roomName: "Custom Hangout",
        visibility: "public",
        maxPlayers: 4,
      });
      await customClient.waitForSnapshot((s) => s.phase === "lobby");
      const customCode = customClient.roomCode!;

      // Now client 2 performs quick match (no roomCode specified)
      const quickClient = new GameClient({
        host: `localhost:${port}`,
        sessionFilePath: sessionFile2,
        forceNewSession: true,
        autoReconnect: false,
      });
      await quickClient.connect();
      quickClient.quickMatch("QuickPlayer");

      await quickClient.waitForSnapshot((s) => s.phase === "lobby" || s.phase === "deployment");

      // Quick match room must be different from custom room!
      expect(quickClient.roomCode).not.toBe(customCode);

      customClient.disconnect();
      quickClient.disconnect();
    });

    it("GameRoom.setReady() broadcasts updated lobby state when readiness changes and the game does not start", async () => {
      cleanupSessionFiles();

      const p1 = new GameClient({
        host: `localhost:${port}`,
        sessionFilePath: sessionFile1,
        forceNewSession: true,
        autoReconnect: false,
      });
      await p1.connect();
      p1.createRoom({
        playerName: "PlayerA",
        roomName: "Ready Check Bastion",
        visibility: "public",
        maxPlayers: 2,
      });
      await p1.waitForSnapshot((s) => s.phase === "lobby");
      const roomCode = p1.roomCode!;

      const p2 = new GameClient({
        host: `localhost:${port}`,
        sessionFilePath: sessionFile2,
        forceNewSession: true,
        autoReconnect: false,
      });
      await p2.connect();
      p2.join("PlayerB", roomCode);
      await p2.waitForSnapshot((s) => s.phase === "lobby" && s.players.length === 2);

      // Player A marks ready=true (game does NOT start because Player B is not ready)
      p1.ready(true);

      // Player A sees their own ready state updated in lobby snapshot
      const p1Snap = await p1.waitForSnapshot(
        (s) => s.phase === "lobby" && s.players.some((p) => p.name === "PlayerA" && p.ready === true)
      );
      expect(p1Snap.phase).toBe("lobby");
      expect(p1Snap.players.find((p) => p.name === "PlayerA")?.ready).toBe(true);

      // Player B also sees Player A become ready before game starts
      const p2Snap = await p2.waitForSnapshot(
        (s) => s.phase === "lobby" && s.players.some((p) => p.name === "PlayerA" && p.ready === true)
      );
      expect(p2Snap.phase).toBe("lobby");
      expect(p2Snap.players.find((p) => p.name === "PlayerA")?.ready).toBe(true);
      expect(p2Snap.players.find((p) => p.name === "PlayerB")?.ready).toBe(false);

      p1.disconnect();
      p2.disconnect();
    });

    it("disconnecting from a 2/2 lobby frees seat, updates /api/rooms summary, and allows replacement player to join", async () => {
      cleanupSessionFiles();

      const p1 = new GameClient({
        host: `localhost:${port}`,
        sessionFilePath: sessionFile1,
        forceNewSession: true,
        autoReconnect: false,
      });
      await p1.connect();
      p1.createRoom({
        playerName: "HostOne",
        roomName: "Duel Ring",
        visibility: "public",
        maxPlayers: 2,
      });
      await p1.waitForSnapshot((s) => s.phase === "lobby");
      const roomCode = p1.roomCode!;

      const p2 = new GameClient({
        host: `localhost:${port}`,
        sessionFilePath: sessionFile2,
        forceNewSession: true,
        autoReconnect: false,
      });
      await p2.connect();
      p2.join("Leaver", roomCode);
      await p2.waitForSnapshot((s) => s.phase === "lobby" && s.players.length === 2);

      // Verify room summary shows 2/2 players
      let rooms = await p1.fetchRooms();
      let roomSummary = rooms.find((r) => r.roomCode === roomCode);
      expect(roomSummary).toBeDefined();
      expect(roomSummary?.playersCount).toBe(2);
      expect(roomSummary?.maxPlayers).toBe(2);

      // Player 2 disconnects from lobby
      p2.disconnect();
      await new Promise((r) => setTimeout(r, 100));

      // Public room summary now reports freed slot (1/2)
      rooms = await p1.fetchRooms();
      roomSummary = rooms.find((r) => r.roomCode === roomCode);
      expect(roomSummary?.playersCount).toBe(1);

      // Replacement player (p3) joins successfully without "Room is full" error
      const p3 = new GameClient({
        host: `localhost:${port}`,
        sessionFilePath: sessionFile3,
        forceNewSession: true,
        autoReconnect: false,
      });
      await p3.connect();
      p3.join("Replacement", roomCode);
      const p3Snap = await p3.waitForSnapshot((s) => s.phase === "lobby" && s.players.length === 2);
      expect(p3Snap.phase).toBe("lobby");
      expect(p3Snap.players.some((p) => p.name === "Replacement")).toBe(true);

      p1.disconnect();
      p3.disconnect();
    });

    it("custom game starts only with >=2 connected players all ready; disconnected lobby players receive no territory", async () => {
      cleanupSessionFiles();

      const p1 = new GameClient({
        host: `localhost:${port}`,
        sessionFilePath: sessionFile1,
        forceNewSession: true,
        autoReconnect: false,
      });
      await p1.connect();
      p1.createRoom({
        playerName: "CommanderA",
        roomName: "Three Player Ring",
        visibility: "public",
        maxPlayers: 3,
      });
      await p1.waitForSnapshot((s) => s.phase === "lobby");
      const roomCode = p1.roomCode!;

      const p2 = new GameClient({
        host: `localhost:${port}`,
        sessionFilePath: sessionFile2,
        forceNewSession: true,
        autoReconnect: false,
      });
      await p2.connect();
      p2.join("CommanderB", roomCode);
      await p2.waitForSnapshot((s) => s.phase === "lobby" && s.players.length === 2);

      const p3 = new GameClient({
        host: `localhost:${port}`,
        sessionFilePath: sessionFile3,
        forceNewSession: true,
        autoReconnect: false,
      });
      await p3.connect();
      p3.join("CommanderC", roomCode);
      await p3.waitForSnapshot((s) => s.phase === "lobby" && s.players.length === 3);

      // Player 3 disconnects before start
      p3.disconnect();
      await new Promise((r) => setTimeout(r, 100));

      // Player 1 and Player 2 ready up
      p1.ready(true);
      p2.ready(true);

      // Game starts with exactly 2 active connected players
      const gameStarted = await p1.waitForSnapshot((s) => s.phase === "deployment");
      expect(gameStarted.phase).toBe("deployment");
      expect(gameStarted.players.length).toBe(2);
      expect(gameStarted.players.map((p) => p.name).sort()).toEqual(["CommanderA", "CommanderB"]);

      // Verify disconnected CommanderC received NO territory
      const allTerritories = Object.values(gameStarted.territories);
      expect(allTerritories.length).toBe(20);
      for (const t of allTerritories) {
        expect(t.ownerId).not.toBe(p3.myPlayerId);
        expect([p1.myPlayerId, p2.myPlayerId]).toContain(t.ownerId);
      }

      p1.disconnect();
      p2.disconnect();
    });

    it("leaving/switching rooms lifecycle: lobby -> leaveRoom() -> Quick Match and Create Game", async () => {
      cleanupSessionFiles();

      const client = new GameClient({
        host: `localhost:${port}`,
        sessionFilePath: sessionFile1,
        forceNewSession: true,
        autoReconnect: false,
      });
      await client.connect();

      // 1. Join custom lobby
      client.createRoom({
        playerName: "SwitchUser",
        roomName: "Temporary Lobby",
        visibility: "public",
        maxPlayers: 4,
      });
      await client.waitForSnapshot((s) => s.phase === "lobby");
      const firstRoomCode = client.roomCode!;

      // 2. Leave lobby back to Home
      client.leaveRoom();
      expect(client.roomCode).toBeNull();
      expect(client.state).toBeNull();
      expect(client.getCachedSession()).toBeNull();

      // 3. Immediately Quick Match on the same socket
      client.quickMatch();
      await client.waitForSnapshot((s) => s.phase === "lobby" || s.phase === "deployment");
      expect(client.roomCode).not.toBeNull();
      expect(client.roomCode).not.toBe(firstRoomCode);

      // Verify the old custom room had its seat freed
      const rooms = await client.fetchRooms();
      const oldRoom = rooms.find((r) => r.roomCode === firstRoomCode);
      expect(oldRoom?.playersCount ?? 0).toBe(0);

      // 4. Leave Quick Match and Create New Game
      client.leaveRoom();
      client.createRoom({
        playerName: "SwitchUser",
        roomName: "Fresh Realm",
        visibility: "public",
        maxPlayers: 2,
      });
      const createSnap = await client.waitForSnapshot(
        (s) => s.phase === "lobby" && s.roomCode !== firstRoomCode
      );
      expect(createSnap.roomCode).toBe(client.roomCode!);

      client.disconnect();
    });

    it("join transaction correctness: full rooms and in-progress games fail cleanly without caching credentials", async () => {
      cleanupSessionFiles();

      // Setup 2-player room
      const p1 = new GameClient({
        host: `localhost:${port}`,
        sessionFilePath: sessionFile1,
        forceNewSession: true,
        autoReconnect: false,
      });
      await p1.connect();
      p1.createRoom({
        playerName: "HostA",
        roomName: "Full Duel",
        visibility: "public",
        maxPlayers: 2,
      });
      await p1.waitForSnapshot((s) => s.phase === "lobby");
      const roomCode = p1.roomCode!;

      const p2 = new GameClient({
        host: `localhost:${port}`,
        sessionFilePath: sessionFile2,
        forceNewSession: true,
        autoReconnect: false,
      });
      await p2.connect();
      p2.join("HostB", roomCode);
      await p2.waitForSnapshot((s) => s.phase === "lobby" && s.players.length === 2);

      // 1. Third player attempts to join full lobby
      const p3 = new GameClient({
        host: `localhost:${port}`,
        sessionFilePath: sessionFile3,
        forceNewSession: true,
        autoReconnect: false,
      });
      await p3.connect();

      let p3Error: { msg: string; code?: string } | null = null;
      p3.onError((msg, code) => {
        p3Error = { msg, code };
      });

      p3.join("Intruder", roomCode);
      await new Promise((r) => setTimeout(r, 200));

      expect(p3Error).not.toBeNull();
      if (!p3Error) throw new Error("p3Error should not be null");
      const err1: { msg: string; code?: string } = p3Error;
      expect(err1.code).toBe("JOIN_FAILED");
      expect(err1.msg).toContain("Room is full");
      // Credentials must NOT be cached for that room
      expect(p3.getCachedSession()).toBeNull();
      expect(p3.roomCode).toBeNull();
      expect(p3.state).toBeNull();

      // 2. Start the game (now phase === "deployment")
      p1.ready(true);
      p2.ready(true);
      await p1.waitForSnapshot((s) => s.phase === "deployment");

      // 3. Third player attempts to join an in-progress game
      let p3Error2: { msg: string; code?: string } | null = null;
      p3.onError((msg, code) => {
        p3Error2 = { msg, code };
      });

      p3.join("LateComer", roomCode);
      await new Promise((r) => setTimeout(r, 200));

      expect(p3Error2).not.toBeNull();
      if (!p3Error2) throw new Error("p3Error2 should not be null");
      const err2: { msg: string; code?: string } = p3Error2;
      expect(err2.code).toBe("JOIN_FAILED");
      expect(err2.msg).toContain("Game already in progress");
      expect(p3.getCachedSession()).toBeNull();
      expect(p3.roomCode).toBeNull();

      p1.disconnect();
      p2.disconnect();
      p3.disconnect();
    });

    it("RoomCodeSchema strictly enforces exactly 4 uppercase alphanumeric characters", async () => {
      const { RoomCodeSchema } = await import("@conquest/protocol");

      // Valid codes
      expect(RoomCodeSchema.safeParse("ABCD").success).toBe(true);
      expect(RoomCodeSchema.safeParse("H7KL").success).toBe(true);
      expect(RoomCodeSchema.safeParse("QM82").success).toBe(true);
      expect(RoomCodeSchema.safeParse("1234").success).toBe(true);

      // Invalid codes
      expect(RoomCodeSchema.safeParse("abcd").success).toBe(false); // lowercase
      expect(RoomCodeSchema.safeParse("ABC").success).toBe(false); // 3 chars
      expect(RoomCodeSchema.safeParse("ABCDE").success).toBe(false); // 5 chars
      expect(RoomCodeSchema.safeParse("AB-C").success).toBe(false); // symbol
      expect(RoomCodeSchema.safeParse("").success).toBe(false); // empty
    });

    it("GameClient.join() normalizes explicit lowercase room codes to uppercase (and parseArgs normalizes --room)", async () => {
      const { parseArgs } = await import("../apps/client/src/index.js");
      const parsedCli = parseArgs(["--room", "abcd", "--name", "Tester"], false);
      expect(parsedCli.room).toBe("ABCD");

      const p1 = new GameClient({
        host: `localhost:${port}`,
        sessionFilePath: sessionFile1,
        forceNewSession: true,
        autoReconnect: false,
      });
      await p1.connect();
      p1.createRoom({ playerName: "PlayerOne", roomName: "CaseNorm", maxPlayers: 2 });
      await p1.waitForSnapshot((s) => s.phase === "lobby");
      const roomCode = p1.roomCode!;
      expect(roomCode).toMatch(/^[A-Z0-9]{4}$/);

      const p2 = new GameClient({
        host: `localhost:${port}`,
        sessionFilePath: sessionFile2,
        forceNewSession: true,
        autoReconnect: false,
      });
      await p2.connect();
      // Join using explicit lowercase room code
      p2.join("PlayerTwo", roomCode.toLowerCase());
      await p2.waitForSnapshot((s) => s.phase === "lobby");

      expect(p2.roomCode).toBe(roomCode);
      expect(p2.state?.roomCode).toBe(roomCode);

      p1.disconnect();
      p2.disconnect();
    });

    it("hostile client: prevents connected socket from leaving, joining, or creating another room during active match, and cannot register in two rooms", async () => {
      const p1 = new GameClient({
        host: `localhost:${port}`,
        sessionFilePath: sessionFile1,
        forceNewSession: true,
        autoReconnect: false,
      });
      const p2 = new GameClient({
        host: `localhost:${port}`,
        sessionFilePath: sessionFile2,
        forceNewSession: true,
        autoReconnect: false,
      });

      await p1.connect();
      await p2.connect();

      p1.createRoom({ playerName: "HostileSecurity", roomName: "MatchSecurity", maxPlayers: 2 });
      await p1.waitForSnapshot((s) => s.phase === "lobby");
      const room1Code = p1.roomCode!;

      p2.join("PlayerTwo", room1Code);
      await p2.waitForSnapshot((s) => s.phase === "lobby");

      // Start the match
      p1.ready(true);
      p2.ready(true);
      await p1.waitForSnapshot((s) => s.phase === "deployment");
      await p2.waitForSnapshot((s) => s.phase === "deployment");

      const room1 = server.roomManager.getRoom(room1Code)!;
      expect(room1.state.phase).toBe("deployment");

      // Set up error listener on p1
      const p1Errors: Array<{ msg: string; code?: string }> = [];
      p1.onError((msg, code) => {
        p1Errors.push({ msg, code });
      });

      const p1Ws = (p1 as any).ws as WebSocket;
      expect(p1Ws).toBeDefined();

      const p1ServerWs = room1.getPlayerSocket(p1.myPlayerId!)!;
      expect(p1ServerWs).toBeDefined();

      // 1. Hostile client attempts to leave active match
      p1Ws.send(JSON.stringify({ type: "client:leave_room" }));
      await new Promise((r) => setTimeout(r, 150));

      expect(p1Errors.length).toBeGreaterThanOrEqual(1);
      expect(p1Errors[p1Errors.length - 1].code).toBe("ACTION_FAILED");
      expect(p1Errors[p1Errors.length - 1].msg).toContain("Cannot leave room while match is in progress");

      // Confirm p1 is still registered in room1 with the exact same server socket
      expect(room1.getPlayerSocket(p1.myPlayerId!)).toBe(p1ServerWs);
      expect(room1.getPlayer(p1.myPlayerId!)?.connected).toBe(true);

      // 2. Hostile client attempts to create another room on the same WebSocket
      p1Ws.send(
        JSON.stringify({
          type: "client:create_room",
          playerName: "HostilePlayer",
          displayName: "SecondRoom",
          visibility: "public",
          maxPlayers: 2,
        })
      );
      await new Promise((r) => setTimeout(r, 150));

      expect(p1Errors.length).toBeGreaterThanOrEqual(2);
      expect(p1Errors[p1Errors.length - 1].code).toBe("ACTION_FAILED");
      expect(p1Errors[p1Errors.length - 1].msg).toContain("Cannot create another room while current match is in progress");

      // Confirm p1 is still in room1
      expect(room1.getPlayerSocket(p1.myPlayerId!)).toBe(p1ServerWs);

      // 3. Create a distinct Room 2 with Player 3
      const p3 = new GameClient({
        host: `localhost:${port}`,
        sessionFilePath: sessionFile3,
        forceNewSession: true,
        autoReconnect: false,
      });
      await p3.connect();
      p3.createRoom({ playerName: "SepHost", roomName: "SeparateMatch", maxPlayers: 2 });
      await p3.waitForSnapshot((s) => s.phase === "lobby");
      const room2Code = p3.roomCode!;
      const room2 = server.roomManager.getRoom(room2Code)!;

      // 4. Hostile client attempts to join Room 2 on the existing active WebSocket
      p1Ws.send(
        JSON.stringify({
          type: "client:join",
          name: "HostilePlayer",
          roomCode: room2Code,
        })
      );
      await new Promise((r) => setTimeout(r, 150));

      expect(p1Errors.length).toBeGreaterThanOrEqual(3);
      expect(p1Errors[p1Errors.length - 1].code).toBe("ACTION_FAILED");
      expect(p1Errors[p1Errors.length - 1].msg).toContain("Cannot join another room while current match is in progress");

      // 5. Prove one WebSocket CANNOT become registered in two rooms:
      // p1ServerWs must exist in room1's playerSockets
      expect(room1.getPlayerSocket(p1.myPlayerId!)).toBe(p1ServerWs);
      expect(room1.hasSocket(p1ServerWs)).toBe(true);
      // p1ServerWs must NOT exist anywhere in room2's playerSockets
      expect(room2.hasSocket(p1ServerWs)).toBe(false);

      // Verify room2 events are NOT received by p1Ws
      let p1EventsReceived = 0;
      p1.onEvent(() => {
        p1EventsReceived++;
      });
      p3.sendChat("Hello room 2 only!");
      await new Promise((r) => setTimeout(r, 150));
      expect(p1EventsReceived).toBe(0);

      // Verify p1Ws is still functional in room1
      p1.sendChat("Still commanding room 1!");
      await new Promise((r) => setTimeout(r, 150));
      const room1Chat = room1.state.history.find(
        (e) => e.type === "chat_message" && (e as any).text === "Still commanding room 1!"
      );
      expect(room1Chat).toBeDefined();

      p1.disconnect();
      p2.disconnect();
      p3.disconnect();
    });
  });

  describe("Client HTTP & Utility Methods", () => {
    it("GameClient.fetchServerInfo() and fetchRooms() work over HTTP", async () => {
      const client = new GameClient({
        host: `localhost:${port}`,
        sessionFilePath: sessionFile1,
        forceNewSession: true,
        autoReconnect: false,
      });

      const serverInfo = await client.fetchServerInfo();
      expect(serverInfo.serverName).toBe("Apex-Ironreach-Prime");
      expect(serverInfo.defaultMap).toBe("The Ironreach");

      const rooms = await client.fetchRooms();
      expect(Array.isArray(rooms)).toBe(true);
    });

    it("GameClient.getCachedSession() reads stored session tokens", async () => {
      const testSessionPath = path.resolve(process.cwd(), ".conquest-test-cache-probe.json");
      fs.writeFileSync(
        testSessionPath,
        JSON.stringify({
          token: "token-abc-123",
          roomCode: "TEST",
          playerId: "p1",
          playerName: "Prober",
        }),
        "utf-8"
      );

      const client = new GameClient({
        host: `localhost:${port}`,
        sessionFilePath: testSessionPath,
        forceNewSession: false,
        autoReconnect: false,
      });

      const cached = client.getCachedSession();
      expect(cached).not.toBeNull();
      expect(cached?.token).toBe("token-abc-123");
      expect(cached?.roomCode).toBe("TEST");
      expect(cached?.playerName).toBe("Prober");

      try {
        fs.unlinkSync(testSessionPath);
      } catch {
        // ignore
      }
    });
  });

  describe("TUI Front Door Components", () => {
    let React: any;
    let act: any;
    let testRender: any;

    beforeAll(async () => {
      // @ts-ignore
      React = (await import("../apps/client/node_modules/react/index.js")).default;
      // @ts-ignore
      act = (await import("../apps/client/node_modules/react/index.js")).act;
      // @ts-ignore
      testRender = (await import("../apps/client/node_modules/@opentui/react/test-utils.js")).testRender;
    });

    it("renders HomeScreen menu options and header", async () => {
      const { HomeScreen } = await import("../apps/client/src/ui/HomeScreen.js");

      let actionTriggered = false;

      const setup = await testRender(
        React.createElement(HomeScreen, {
          serverName: "Apex-Ironreach-Prime",
          serverHost: `localhost:${port}`,
          connectionStatus: "connected",
          playerName: "CommanderVanguard",
          cachedSession: {
            sessionToken: "sess_123",
            playerId: "usr_123",
            playerName: "CommanderVanguard",
            roomCode: "R9XK",
          },
          onQuickMatch: () => { actionTriggered = true; },
          onBrowseGames: () => {},
          onCreateGame: () => {},
          onJoinByCode: () => {},
          onResumeGame: () => {},
          onServerInfo: () => {},
          onQuit: () => {},
          terminalDimensions: { columns: 120, rows: 40 },
        }),
        { width: 120, height: 40 }
      );

      await act(async () => {
        await setup.renderOnce();
      });

      const frame = setup.captureCharFrame();
      expect(frame).toContain("CONQUEST.SH");
      expect(frame).toContain("RESUME [R9XK]");
      expect(frame).toContain("QUICK MATCH");
      expect(frame).toContain("BROWSE GAMES");
      expect(frame).toContain("CREATE GAME");
      expect(frame).toContain("JOIN BY CODE");
      expect(frame).toContain("Apex-Ironreach-Prime");
      await act(async () => {
        setup.renderer.destroy();
      });
    });

    it("renders RoomBrowser in empty and populated states", async () => {
      const { RoomBrowser } = await import("../apps/client/src/ui/RoomBrowser.js");

      // 1. Empty state
      const mockClientEmpty: any = {
        wsUrl: "ws://localhost:4000",
        fetchRooms: async () => [],
      };

      const setupEmpty = await testRender(
        React.createElement(RoomBrowser, {
          client: mockClientEmpty,
          onJoinRoom: () => {},
          onBack: () => {},
          terminalDimensions: { columns: 120, rows: 40 },
        }),
        { width: 120, height: 40 }
      );

      await act(async () => {
        await setupEmpty.renderOnce();
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });
      await act(async () => {
        await setupEmpty.renderOnce();
      });

      const frameEmpty = setupEmpty.captureCharFrame();
      expect(frameEmpty).toContain("PUBLIC GAMES");
      expect(frameEmpty).toContain("No public rooms found.");
      await act(async () => {
        setupEmpty.renderer.destroy();
      });

      // 2. Populated state
      const mockClientPopulated: any = {
        wsUrl: "ws://localhost:4000",
        fetchRooms: async () => [
          {
            roomCode: "M9LK",
            displayName: "Northern Front",
            playersCount: 3,
            maxPlayers: 4,
            phase: "lobby",
            visibility: "public",
            kind: "custom",
            mapId: "ironreach",
            mapName: "Ironreach Grid",
            turnNumber: 0,
            createdAt: Date.now() - 30000,
          },
        ],
      };

      const setupPopulated = await testRender(
        React.createElement(RoomBrowser, {
          client: mockClientPopulated,
          onJoinRoom: () => {},
          onBack: () => {},
          terminalDimensions: { columns: 120, rows: 40 },
        }),
        { width: 120, height: 40 }
      );

      await act(async () => {
        await setupPopulated.renderOnce();
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });
      await act(async () => {
        await setupPopulated.renderOnce();
      });

      const framePopulated = setupPopulated.captureCharFrame();
      expect(framePopulated).toContain("Northern Front");
      expect(framePopulated).toContain("M9LK");
      expect(framePopulated).toContain("3 / 4");
      await act(async () => {
        setupPopulated.renderer.destroy();
      });
    });

    it("renders full finished rooms as nonjoinable", async () => {
      const { RoomBrowser } = await import("../apps/client/src/ui/RoomBrowser.js");
      let joinedRoom: string | null = null;
      const client: any = {
        wsUrl: "ws://localhost:4000",
        fetchRooms: async () => [{
          roomCode: "M9LK",
          displayName: "Northern Front",
          playersCount: 4,
          maxPlayers: 4,
          phase: "game_over",
          visibility: "public",
          kind: "custom",
          mapId: "ironreach",
          mapName: "Ironreach Grid",
          turnNumber: 12,
          createdAt: Date.now() - 30000,
        }],
      };
      const setup = await testRender(
        React.createElement(RoomBrowser, {
          client,
          onJoinRoom: (roomCode: string) => { joinedRoom = roomCode; },
          onBack: () => {},
          terminalDimensions: { columns: 120, rows: 40 },
        }),
        { width: 120, height: 40 }
      );
      await act(async () => { await setup.renderOnce(); });
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
      await act(async () => { await setup.renderOnce(); });

      const frame = setup.captureCharFrame();
      expect(frame).toContain("Northern Front");
      expect(frame).toContain("4 / 4");
      expect(frame).toContain("Finished");
      await act(async () => { setup.mockInput.pressKey("enter"); });
      expect(joinedRoom).toBeNull();
      await act(async () => { setup.renderer.destroy(); });
    });

    it("renders CreateGameScreen form controls", async () => {
      const { CreateGameScreen } = await import("../apps/client/src/ui/CreateGameScreen.js");

      const setup = await testRender(
        React.createElement(CreateGameScreen, {
          defaultName: "Conquest Campaign",
          onCreate: () => {},
          onBack: () => {},
          terminalDimensions: { columns: 120, rows: 40 },
        }),
        { width: 120, height: 40 }
      );

      await act(async () => {
        await setup.renderOnce();
      });

      const frame = setup.captureCharFrame();
      expect(frame).toContain("HOST CUSTOM BATTLE");
      expect(frame).toContain("GAME NAME");
      expect(frame).toContain("MAXIMUM PLAYERS");
      expect(frame).toContain("LOBBY VISIBILITY");
      expect(frame).toContain("Create Game");
      await act(async () => {
        setup.renderer.destroy();
      });
    });

    it("renders JoinRoomScreen with input and error notification", async () => {
      const { JoinRoomScreen } = await import("../apps/client/src/ui/JoinRoomScreen.js");

      const setup = await testRender(
        React.createElement(JoinRoomScreen, {
          errorMessage: "Room 'ZZZZ' does not exist or has closed.",
          onJoin: () => {},
          onBack: () => {},
          terminalDimensions: { columns: 120, rows: 40 },
        }),
        { width: 120, height: 40 }
      );

      await act(async () => {
        await setup.renderOnce();
      });

      const frame = setup.captureCharFrame();
      expect(frame).toContain("JOIN BY ROOM CODE");
      expect(frame).toContain("Enter 4-character room code");
      expect(frame).toContain("Room 'ZZZZ' does not exist or has closed.");
      expect(frame).toContain("Join Room");
      await act(async () => {
        setup.renderer.destroy();
      });
    });

    it("renders ServerInfoScreen topology stats", async () => {
      const { ServerInfoScreen } = await import("../apps/client/src/ui/ServerInfoScreen.js");

      const mockClient: any = {
        wsUrl: "ws://localhost:4000",
        httpUrl: "http://localhost:4000",
        fetchServerInfo: async () => ({
          serverName: "Apex-Ironreach-Prime",
          protocolVersion: "0.2.0",
          roomsCount: 3,
          playersCount: 7,
          defaultMap: "The Ironreach",
          maxPlayersPerRoom: 4,
        }),
      };

      const setup = await testRender(
        React.createElement(ServerInfoScreen, {
          client: mockClient,
          onBack: () => {},
          terminalDimensions: { columns: 120, rows: 40 },
        }),
        { width: 120, height: 40 }
      );

      await act(async () => {
        await setup.renderOnce();
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });
      await act(async () => {
        await setup.renderOnce();
      });

      const frame = setup.captureCharFrame();
      expect(frame).toContain("Apex-Ironreach-Prime");
      expect(frame).toContain("The Ironreach");
      expect(frame).toContain("Active Rooms");
      expect(frame).toContain("0.2.0");
      await act(async () => {
        setup.renderer.destroy();
      });
    });
  });
});
