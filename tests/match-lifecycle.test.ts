import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  createInitialGameState,
  deployUnits,
  attackTerritory,
  fortifyUnits,
  skipPhase,
  endTurn,
  evaluatePlayerEliminations,
  evaluateVictory,
  buildMatchResult,
  finalizeMatch,
  isActiveMatchPhase,
} from "../packages/game-core/src/index.js";
import { MAP_GRID_IRONREACH } from "../packages/map-engine/src/index.js";
import type { GameState, Player, ServerEvent, ServerSnapshot } from "../packages/protocol/src/index.js";
import { GameRoom, RoomManager } from "../apps/server/src/room.js";
import { ConquestServer } from "../apps/server/src/server.js";
import { GameClient } from "../apps/client/src/network/client.js";

describe("Match Lifecycle, Victory, Results & Rematch", () => {
  const createTestPlayers = (count: number = 2): Player[] => {
    const names = ["Alice", "Bob", "Charlie", "Diana"];
    const colors = ["#00d2ff", "#ff4444", "#00ff66", "#ffaa00"];
    return Array.from({ length: count }, (_, i) => ({
      id: `p${i + 1}`,
      name: names[i] ?? `Player ${i + 1}`,
      colorIndex: i,
      colorHex: colors[i] ?? "#ffffff",
      connected: true,
      isAlive: true,
      ready: true,
      rematchReady: false,
    }));
  };

  describe("1. Authoritative Game State Machine & Phase Enforcement", () => {
    it("rejects endTurn() during deployment phase", () => {
      const players = createTestPlayers(2);
      const state = createInitialGameState("game-1", "ROOM", players, MAP_GRID_IRONREACH, 3);
      expect(state.phase).toBe("deployment");

      const res = endTurn(state, "p1");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain("Can only end turn during fortify phase");
      }
    });

    it("rejects endTurn() during attack phase", () => {
      const players = createTestPlayers(2);
      const state = createInitialGameState("game-1", "ROOM", players, MAP_GRID_IRONREACH, 3);
      state.phase = "attack";
      state.pendingReinforcements = 0;

      const res = endTurn(state, "p1");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain("Can only end turn during fortify phase");
      }
    });

    it("advances from attack to fortify via skipPhase()", () => {
      const players = createTestPlayers(2);
      const state = createInitialGameState("game-1", "ROOM", players, MAP_GRID_IRONREACH, 3);
      state.phase = "attack";
      state.pendingReinforcements = 0;

      const res = skipPhase(state, "p1");
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.state.phase).toBe("fortify");
      }
    });

    it("advances from fortify to next player's deployment via endTurn() or skipPhase()", () => {
      const players = createTestPlayers(2);
      const state = createInitialGameState("game-1", "ROOM", players, MAP_GRID_IRONREACH, 3);
      state.phase = "fortify";
      state.pendingReinforcements = 0;

      // endTurn() advances
      const endRes = endTurn(state, "p1");
      expect(endRes.ok).toBe(true);
      if (endRes.ok) {
        expect(endRes.state.phase).toBe("deployment");
        expect(endRes.state.activePlayerIndex).toBe(1);
        expect(endRes.state.players[1].id).toBe("p2");
      }

      // skipPhase() in fortify also advances
      const skipRes = skipPhase(state, "p1");
      expect(skipRes.ok).toBe(true);
      if (skipRes.ok) {
        expect(skipRes.state.phase).toBe("deployment");
        expect(skipRes.state.activePlayerIndex).toBe(1);
      }
    });

    it("records and broadcasts one canonical fortify turn event sequence", () => {
      const room = new GameRoom({ roomCode: "HIST" });
      const messagesA: ServerEvent[] = [];
      const messagesB: ServerEvent[] = [];
      const socketA = { send: (payload: string) => messagesA.push(JSON.parse(payload) as ServerEvent) };
      const socketB = { send: (payload: string) => messagesB.push(JSON.parse(payload) as ServerEvent) };

      room.addPlayer("p1", "Alice", socketA);
      room.addPlayer("p2", "Bob", socketB);
      room.startGame();
      room.state.history = [];
      messagesA.length = 0;
      messagesB.length = 0;
      room.state.phase = "fortify";
      room.state.activePlayerIndex = 0;
      room.state.territories.A1 = { ...room.state.territories.A1, ownerId: "p1", units: 3 };
      room.state.territories.A2 = { ...room.state.territories.A2, ownerId: "p1", units: 1 };

      const result = room.fortify("p1", "A1", "A2", 1);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.events.map((event) => event.type)).toEqual([
          "units_fortified",
          "turn_ended",
          "phase_changed",
        ]);
      }
      expect(room.state.history.map((event) => event.type)).toEqual([
        "units_fortified",
        "turn_ended",
        "phase_changed",
      ]);
      expect(messagesA.map((message) => message.event.type)).toEqual([
        "units_fortified",
        "turn_ended",
        "phase_changed",
      ]);
      expect(messagesB.map((message) => message.event.type)).toEqual([
        "units_fortified",
        "turn_ended",
        "phase_changed",
      ]);
    });

    it("rejects all gameplay mutating actions when phase === 'game_over'", () => {
      const players = createTestPlayers(2);
      const state = createInitialGameState("game-1", "ROOM", players, MAP_GRID_IRONREACH, 3);
      state.phase = "game_over";

      expect(deployUnits(state, "p1", "A1", 1).ok).toBe(false);
      expect(attackTerritory(state, "p1", "A1", "A2").ok).toBe(false);
      expect(fortifyUnits(state, "p1", "A1", "A2", 1).ok).toBe(false);
      expect(skipPhase(state, "p1").ok).toBe(false);
      expect(endTurn(state, "p1").ok).toBe(false);
    });

    it("GameRoom rejects actions when phase is game_over", () => {
      const room = new GameRoom({ roomCode: "TEST" });
      room.state.phase = "game_over";

      expect(room.deploy("p1", "A1", 1).ok).toBe(false);
      expect(room.attack("p1", "A1", "A2").ok).toBe(false);
      expect(room.fortify("p1", "A1", "A2", 1).ok).toBe(false);
      expect(room.skipPhase("p1").ok).toBe(false);
      expect(room.endTurn("p1").ok).toBe(false);
    });

    it("GameRoom rejects setReady outside lobby", () => {
      const room = new GameRoom({ roomCode: "TEST" });
      room.state.phase = "deployment";
      expect(room.setReady("p1", true)).toBe(false);
    });

    it("isActiveMatchPhase helper identifies active vs non-active phases", () => {
      expect(isActiveMatchPhase("deployment")).toBe(true);
      expect(isActiveMatchPhase("attack")).toBe(true);
      expect(isActiveMatchPhase("fortify")).toBe(true);
      expect(isActiveMatchPhase("lobby")).toBe(false);
      expect(isActiveMatchPhase("game_over")).toBe(false);
    });
  });

  describe("2. Player Elimination Evaluation & Turn Order", () => {
    it("emits player_eliminated when player loses their last territory", () => {
      const players = createTestPlayers(2);
      const state = createInitialGameState("game-1", "ROOM", players, MAP_GRID_IRONREACH, 3);

      // p2 has no territories
      for (const t of Object.values(state.territories)) {
        t.ownerId = "p1";
      }

      const res = evaluatePlayerEliminations(state, "p2", "p1");
      expect(res.isNewlyEliminated).toBe(true);
      expect(res.eliminationEvent?.type).toBe("player_eliminated");
      if (res.eliminationEvent?.type === "player_eliminated") {
        expect(res.eliminationEvent.playerId).toBe("p2");
        expect(res.eliminationEvent.eliminatedBy).toBe("p1");
      }
      expect(res.nextPlayers.find((p) => p.id === "p2")?.isAlive).toBe(false);
    });

    it("never emits a second player_eliminated for an already dead player", () => {
      const players = createTestPlayers(2);
      players[1].isAlive = false;
      const state = createInitialGameState("game-1", "ROOM", players, MAP_GRID_IRONREACH, 3);
      state.players[1].isAlive = false;

      const res = evaluatePlayerEliminations(state, "p2", "p1");
      expect(res.isNewlyEliminated).toBe(false);
      expect(res.eliminationEvent).toBeUndefined();
    });

    it("endTurn() skips eliminated players in rotation", () => {
      const players = createTestPlayers(3);
      // p2 is eliminated
      players[1].isAlive = false;

      const state = createInitialGameState("game-1", "ROOM", players, MAP_GRID_IRONREACH, 3);
      state.players = players;
      state.activePlayerIndex = 0; // p1
      state.phase = "fortify";
      state.pendingReinforcements = 0;

      const res = endTurn(state, "p1");
      expect(res.ok).toBe(true);
      if (res.ok) {
        // Next active player should be p3 (index 2), skipping p2 (index 1)
        expect(res.state.activePlayerIndex).toBe(2);
        expect(res.state.players[2].id).toBe("p3");
      }
    });

    it("rejects actions initiated by an eliminated player", () => {
      const players = createTestPlayers(2);
      players[0].isAlive = false;
      const state = createInitialGameState("game-1", "ROOM", players, MAP_GRID_IRONREACH, 3);
      state.players[0].isAlive = false;
      state.activePlayerIndex = 0;

      expect(deployUnits(state, "p1", "A1", 1).ok).toBe(false);
      expect(attackTerritory(state, "p1", "A1", "A2").ok).toBe(false);
      expect(fortifyUnits(state, "p1", "A1", "A2", 1).ok).toBe(false);
      expect(skipPhase(state, "p1").ok).toBe(false);
      expect(endTurn(state, "p1").ok).toBe(false);
    });
  });

  describe("3. Victory Evaluation, Finalize Match & Reverse-Chronological Placements", () => {
    it("evaluates victory upon total conquest and produces canonical MatchResult", () => {
      const players = createTestPlayers(2);
      const state = createInitialGameState("game-1", "ROOM", players, MAP_GRID_IRONREACH, 3);

      for (const t of Object.values(state.territories)) {
        t.ownerId = "p1";
      }

      const victory = evaluateVictory(state, "p1");
      expect(victory.isVictory).toBe(true);
      expect(victory.winnerId).toBe("p1");

      const final = finalizeMatch(state, "p1", "conquest");
      expect(final.state.phase).toBe("game_over");
      expect(final.state.winnerId).toBe("p1");
      expect(final.result).toBeDefined();
      expect(final.result.winnerId).toBe("p1");
      expect(final.result.winnerName).toBe("Alice");
      expect(final.result.players.length).toBe(2);
      expect(final.result.players[0].placement).toBe(1);
      expect(final.result.players[0].playerId).toBe("p1");
      expect(final.result.players[1].placement).toBe(2);
      expect(final.result.players[1].playerId).toBe("p2");
    });

    it("ranks 3+ player games in reverse chronological order of elimination", () => {
      const players = createTestPlayers(3); // p1, p2, p3
      const state = createInitialGameState("game-1", "ROOM", players, MAP_GRID_IRONREACH, 3);

      // Simulate p3 eliminated first at t=1000
      const elimP3 = {
        type: "player_eliminated" as const,
        playerId: "p3",
        eliminatedBy: "p1",
        timestamp: 1000,
      };
      // Simulate p2 eliminated second at t=2000
      const elimP2 = {
        type: "player_eliminated" as const,
        playerId: "p2",
        eliminatedBy: "p1",
        timestamp: 2000,
      };
      state.history.push(elimP3, elimP2);
      state.players.find((p) => p.id === "p3")!.isAlive = false;
      state.players.find((p) => p.id === "p2")!.isAlive = false;

      // Give all territories to p1
      for (const t of Object.values(state.territories)) {
        t.ownerId = "p1";
      }

      const result = buildMatchResult(state, "p1", "conquest", 3000);

      expect(result.winnerId).toBe("p1");
      expect(result.players.length).toBe(3);

      // #1: p1 (Winner)
      expect(result.players[0].playerId).toBe("p1");
      expect(result.players[0].placement).toBe(1);

      // #2: p2 (Eliminated later at t=2000 -> better placement than p3)
      expect(result.players[1].playerId).toBe("p2");
      expect(result.players[1].placement).toBe(2);
      expect(result.players[1].eliminatedBy).toBe("p1");

      // #3: p3 (Eliminated earliest at t=1000)
      expect(result.players[2].playerId).toBe("p3");
      expect(result.players[2].placement).toBe(3);
      expect(result.players[2].eliminatedBy).toBe("p1");
    });
  });

  describe("4. Rematch Protocol & State Rotation", () => {
    it("GameRoom toggles rematchReady and starts rematch when all connected players agree", () => {
      const room = new GameRoom({ roomCode: "RMT1" });
      const socketA = { send: () => {} };
      const socketB = { send: () => {} };

      room.addPlayer("p1", "Alice", socketA);
      room.addPlayer("p2", "Bob", socketB);
      room.startGame();
      expect(room.matchNumber).toBe(1);
      expect(room.state.matchNumber).toBe(1);

      // Put room in game_over
      room.state.phase = "game_over";
      room.state.winnerId = "p1";

      // Player 1 requests rematch
      const resA = room.setRematchReady("p1", true);
      expect(resA).toBe(true);
      expect(room.getPlayer("p1")?.rematchReady).toBe(true);
      expect(room.state.phase).toBe("game_over"); // Bob hasn't agreed yet

      // Player 2 requests rematch -> triggers rematch!
      const resB = room.setRematchReady("p2", true);
      expect(resB).toBe(true);

      // Rematch started!
      expect(room.matchNumber).toBe(2);
      expect(room.state.matchNumber).toBe(2);
      expect(room.state.phase as string).toBe("deployment");
      // Deterministic rotation: (matchNumber - 1) % 2 = (2 - 1) % 2 = 1 -> p2 (Bob) starts!
      expect(room.state.activePlayerIndex).toBe(1);
      expect(room.state.players[1].id).toBe("p2");

      // Rematch readiness reset
      expect(room.getPlayer("p1")?.rematchReady).toBe(false);
      expect(room.getPlayer("p2")?.rematchReady).toBe(false);

      // rematch_started event present in history
      const rematchEvent = room.state.history.find((e) => e.type === "rematch_started");
      expect(rematchEvent).toBeDefined();
      if (rematchEvent && rematchEvent.type === "rematch_started") {
        expect(rematchEvent.matchNumber).toBe(2);
        expect(rematchEvent.startingPlayerId).toBe("p2");
      }
    });

    it("drops disconnected players from rematch", () => {
      const room = new GameRoom({ roomCode: "RMT2", maxPlayers: 3 });
      const socketA = { send: () => {} };
      const socketB = { send: () => {} };
      const socketC = { send: () => {} };

      room.addPlayer("p1", "Alice", socketA);
      room.addPlayer("p2", "Bob", socketB);
      room.addPlayer("p3", "Charlie", socketC);
      room.startGame();

      // Charlie disconnects during active game
      room.disconnectPlayer("p3", "network loss");
      expect(room.getPlayer("p3")?.connected).toBe(false);

      // Finish game
      room.state.phase = "game_over";
      room.state.winnerId = "p1";

      // Alice and Bob agree to rematch
      room.setRematchReady("p1", true);
      room.setRematchReady("p2", true);

      // Rematch should start with only connected players (Alice and Bob)
      expect(room.matchNumber).toBe(2);
      expect(room.state.players.length).toBe(2);
      expect(room.state.players.map((p) => p.id)).toEqual(["p1", "p2"]);
      expect(room.hasPlayer("p3")).toBe(false);
    });
  });

  describe("5. Return Home & Finished-Room Cleanup Lifecycle", () => {
    it("allows player to leave a game_over room cleanly and frees session association", async () => {
      const server = new ConquestServer({ port: 0, serverName: "cleanup-test" });
      server.start();
      const port = server.port;

      const wsA = new WebSocket(`ws://localhost:${port}`);
      const messagesA: any[] = [];
      wsA.onmessage = (e) => messagesA.push(JSON.parse(e.data.toString()));
      await new Promise((r) => (wsA.onopen = r));

      // Join room
      wsA.send(JSON.stringify({ type: "client:join", name: "Leaver" }));
      await new Promise((r) => setTimeout(r, 50));

      const roomCode = messagesA.find((m) => m.type === "server:welcome")?.roomCode;
      expect(roomCode).toBeDefined();
      const room = server.roomManager.getRoom(roomCode)!;

      // Advance room to game_over
      room.state.phase = "game_over";

      // Leave room while game_over
      wsA.send(JSON.stringify({ type: "client:leave_room" }));
      await new Promise((r) => setTimeout(r, 50));

      // Should not receive ACTION_FAILED
      const errorMsg = messagesA.find((m) => m.type === "server:error");
      expect(errorMsg).toBeUndefined();

      // Since Leaver was only player and room was game_over, room is cleaned up
      expect(server.roomManager.getRoom(roomCode)).toBeUndefined();

      wsA.close();
      server.stop();
    });

    it("RoomManager removes deserted game_over room once all connected players disconnect", () => {
      const manager = new RoomManager();
      const room = manager.createCustomRoom({ displayName: "DesertedRoom" });
      const code = room.roomCode;

      const socketA = { send: () => {} };
      room.addPlayer("p1", "Player1", socketA);
      room.state.phase = "game_over";

      expect(manager.getRoom(code)).toBeDefined();

      // Player disconnects from game_over room
      room.disconnectPlayer("p1", "left");

      // Room is automatically removed from manager
      expect(manager.getRoom(code)).toBeUndefined();
    });
  });

  describe("6. Full E2E Match Lifecycle Integration Flow", () => {
    it("executes complete flow: Join -> Combat -> Victory -> Results -> Rematch -> Match 2 -> Leave", async () => {
      const server = new ConquestServer({ port: 0, serverName: "e2e-match-lifecycle" });
      server.start();
      const port = server.port;

      const clientA = new GameClient({
        host: `localhost:${port}`,
        playerName: "CommanderA",
        forceNewSession: true,
      });
      const clientB = new GameClient({
        host: `localhost:${port}`,
        playerName: "CommanderB",
        forceNewSession: true,
      });

      // 1. Both connect and join quick match
      await clientA.connect();
      clientA.join("CommanderA");
      const snapA = await clientA.waitForSnapshot((s) => s.phase === "lobby" || s.phase === "deployment");

      await clientB.connect();
      clientB.join("CommanderB", snapA.roomCode);

      await clientA.waitForSnapshot((s) => s.phase === "deployment");
      await clientB.waitForSnapshot((s) => s.phase === "deployment");

      const roomCode = clientA.roomCode!;
      const room = server.roomManager.getRoom(roomCode)!;
      expect(room).toBeDefined();

      const aId = clientA.myPlayerId!;
      const bId = clientB.myPlayerId!;

      // 2. Trigger victory by transferring all territories to CommanderA
      for (const t of Object.values(room.state.territories)) {
        t.ownerId = aId;
      }
      // Force match finalization on server
      const finalRes = finalizeMatch(room.state, aId, "conquest");
      room.state = finalRes.state;
      for (const ev of finalRes.events) {
        room.broadcastEvent(ev, room.state);
      }
      room.broadcastSnapshot();

      // 3. Both clients receive game_over snapshot and game_won event
      const overSnapshotA = await clientA.waitForSnapshot((s) => s.phase === "game_over");
      const overSnapshotB = await clientB.waitForSnapshot((s) => s.phase === "game_over");

      expect(overSnapshotA.result?.winnerId).toBe(aId);
      expect(overSnapshotB.result?.winnerId).toBe(aId);
      expect(overSnapshotA.result?.players[0].placement).toBe(1);
      expect(overSnapshotA.result?.players[1].placement).toBe(2);
      expect(room.state.phase).toBe("game_over");

      // 4. Post-game chat remains available until a rematch starts.
      clientA.sendChat("Well fought!");
      const chatEvB = await clientB.waitForEvent((e) => e.type === "chat_message");
      expect(chatEvB.type).toBe("chat_message");
      if (chatEvB.type === "chat_message") {
        expect(chatEvB.text).toBe("Well fought!");
      }
      const historyChat = room.state.history.find(
        (event) => event.type === "chat_message" && event.text === "Well fought!"
      );
      expect(historyChat).toBeDefined();

      // 5. CommanderB votes for rematch
      clientB.requestRematch(true);

      const rematchReadyChangedA = await clientA.waitForEvent(
        (e) => e.type === "rematch_ready_changed" && e.playerId === bId
      );
      expect(rematchReadyChangedA.type).toBe("rematch_ready_changed");

      // CommanderA votes for rematch -> Rematch triggers!
      clientA.requestRematch(true);

      const rematchStartedA = await clientA.waitForEvent(
        (e) => e.type === "rematch_started" && e.matchNumber === 2
      );
      const rematchStartedB = await clientB.waitForEvent(
        (e) => e.type === "rematch_started" && e.matchNumber === 2
      );
      expect(rematchStartedA.type).toBe("rematch_started");
      expect(rematchStartedB.type).toBe("rematch_started");

      // In match 2, starting player rotated to CommanderB (index 1)
      const rematchSnapshotA = await clientA.waitForSnapshot(
        (s) => s.matchNumber === 2 && s.phase === "deployment"
      );
      expect(rematchSnapshotA.activePlayerIndex).toBe(1);

      // Cleanup
      clientA.disconnect();
      clientB.disconnect();
      server.stop();
    });
  });

  describe("7. MatchResultsScreen Component Rendering", () => {
    it("renders winner results with celebratory banner and standings", async () => {
      // @ts-ignore
      const React = (await import("../apps/client/node_modules/react/index.js")).default;
      // @ts-ignore
      const { act } = await import("../apps/client/node_modules/react/index.js");
      // @ts-ignore
      const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");
      const { MatchResultsScreen } = await import("../apps/client/src/ui/MatchResultsScreen.js");

      const players = createTestPlayers(2);
      const state = createInitialGameState("game-1", "W1N1", players, MAP_GRID_IRONREACH, 3);
      for (const t of Object.values(state.territories)) {
        t.ownerId = "p1";
      }
      const finalRes = finalizeMatch(state, "p1", "conquest");

      const setup = await testRender(
        React.createElement(MatchResultsScreen, {
          state: finalRes.state,
          myPlayerId: "p1",
          terminalDimensions: { columns: 120, rows: 36 },
        }),
        { width: 120, height: 36 }
      );

      await act(async () => {
        await setup.renderOnce();
      });

      const frame = setup.captureCharFrame();
      expect(frame).toContain("VICTORY ACHIEVED");
      expect(frame).toContain("TOTAL CONQUEST");
      expect(frame).toContain("Alice");
      expect(frame).toContain("VICTORIOUS");
      expect(frame).toContain("REMATCH PROTOCOL");

      await act(async () => {
        setup.renderer.destroy();
      });
    });

    it("renders loser results with war over banner and winner attribution", async () => {
      // @ts-ignore
      const React = (await import("../apps/client/node_modules/react/index.js")).default;
      // @ts-ignore
      const { act } = await import("../apps/client/node_modules/react/index.js");
      // @ts-ignore
      const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");
      const { MatchResultsScreen } = await import("../apps/client/src/ui/MatchResultsScreen.js");

      const players = createTestPlayers(2);
      const state = createInitialGameState("game-1", "LOSE", players, MAP_GRID_IRONREACH, 3);
      for (const t of Object.values(state.territories)) {
        t.ownerId = "p1";
      }
      const finalRes = finalizeMatch(state, "p1", "conquest");

      const setup = await testRender(
        React.createElement(MatchResultsScreen, {
          state: finalRes.state,
          myPlayerId: "p2", // Bob is viewing defeat
          terminalDimensions: { columns: 120, rows: 36 },
        }),
        { width: 120, height: 36 }
      );

      await act(async () => {
        await setup.renderOnce();
      });

      const frame = setup.captureCharFrame();
      expect(frame).toContain("WAR OVER");
      expect(frame).toContain("Alice has achieved total domination");
      expect(frame).toContain("Bob");
      expect(frame).toContain("(You)");

      await act(async () => {
        setup.renderer.destroy();
      });
    });

    it("renders MatchResultsScreen cleanly in compact mode (<100 columns)", async () => {
      // @ts-ignore
      const React = (await import("../apps/client/node_modules/react/index.js")).default;
      // @ts-ignore
      const { act } = await import("../apps/client/node_modules/react/index.js");
      // @ts-ignore
      const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");
      const { MatchResultsScreen } = await import("../apps/client/src/ui/MatchResultsScreen.js");

      const players = createTestPlayers(2);
      const state = createInitialGameState("game-1", "CMP1", players, MAP_GRID_IRONREACH, 3);
      for (const t of Object.values(state.territories)) {
        t.ownerId = "p1";
      }
      const finalRes = finalizeMatch(state, "p1", "conquest");

      const setup = await testRender(
        React.createElement(MatchResultsScreen, {
          state: finalRes.state,
          myPlayerId: "p1",
          terminalDimensions: { columns: 85, rows: 34 },
        }),
        { width: 85, height: 34 }
      );

      await act(async () => {
        await setup.renderOnce();
      });

      const frame = setup.captureCharFrame();
      expect(frame).toContain("VICTORY ACHIEVED");
      expect(frame).toContain("FINAL STANDINGS");
      expect(frame).toContain("REMATCH PROTOCOL");

      await act(async () => {
        setup.renderer.destroy();
      });
    });

    it("keeps the compact chat input visible when opened", async () => {
      // @ts-ignore
      const React = (await import("../apps/client/node_modules/react/index.js")).default;
      // @ts-ignore
      const { act } = await import("../apps/client/node_modules/react/index.js");
      // @ts-ignore
      const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");
      const { MatchResultsScreen } = await import("../apps/client/src/ui/MatchResultsScreen.js");

      const players = createTestPlayers(2);
      const state = createInitialGameState("game-1", "CHAT", players, MAP_GRID_IRONREACH, 3);
      for (const territory of Object.values(state.territories)) {
        territory.ownerId = "p1";
      }
      const finalRes = finalizeMatch(state, "p1", "conquest");
      const setup = await testRender(
        React.createElement(MatchResultsScreen, {
          state: finalRes.state,
          myPlayerId: "p1",
          terminalDimensions: { columns: 85, rows: 34 },
        }),
        { width: 85, height: 34 }
      );

      await act(async () => {
        setup.mockInput.pressKey("c");
        await setup.renderOnce();
      });

      const frame = setup.captureCharFrame();
      expect(frame).toContain("> █");
      expect(frame).not.toContain("No post-game communications yet");

      await act(async () => {
        setup.renderer.destroy();
      });
    });

    it("keeps all six commanders visible in the 85x34 compact results layout", async () => {
      // @ts-ignore
      const React = (await import("../apps/client/node_modules/react/index.js")).default;
      // @ts-ignore
      const { act } = await import("../apps/client/node_modules/react/index.js");
      // @ts-ignore
      const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");
      const { MatchResultsScreen } = await import("../apps/client/src/ui/MatchResultsScreen.js");

      const players = createTestPlayers(6);
      const readyPlayerIds = new Set(["p1", "p3", "p5"]);
      const state = createInitialGameState("game-1", "CMP6", players, MAP_GRID_IRONREACH, 3);
      for (const player of state.players) {
        player.rematchReady = readyPlayerIds.has(player.id);
      }
      for (const territory of Object.values(state.territories)) {
        territory.ownerId = "p1";
      }
      const finalRes = finalizeMatch(state, "p1", "conquest");

      const setup = await testRender(
        React.createElement(MatchResultsScreen, {
          state: finalRes.state,
          myPlayerId: "p1",
          terminalDimensions: { columns: 85, rows: 34 },
        }),
        { width: 85, height: 34 }
      );

      await act(async () => {
        await setup.renderOnce();
      });

      const frame = setup.captureCharFrame();
      for (const [index, player] of players.entries()) {
        expect(frame).toContain(player.name);
        expect(frame).toContain(`#${index + 1}`);
        expect(frame).toMatch(
          new RegExp(`${player.name}.*${readyPlayerIds.has(player.id) ? "✔ READY" : "· WAITING"}`)
        );
      }
      expect(frame).toContain("REMATCH PROTOCOL 3/6");
      expect(frame).toContain("CHAT [C]");

      await act(async () => {
        setup.renderer.destroy();
      });
    });
  });
});
