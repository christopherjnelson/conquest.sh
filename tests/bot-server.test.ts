import { describe, expect, it } from "bun:test";
import { ConquestServer, type WSData } from "../apps/server/src/server.js";
import type { ClientCreateRoom, ServerMessage } from "../packages/protocol/src/index.js";

function waitForSocketMessage(
  ws: WebSocket,
  messages: ServerMessage[],
  predicate: (message: ServerMessage) => boolean,
  timeoutMs = 5_000,
): Promise<ServerMessage> {
  const existing = messages.find(predicate);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.removeEventListener("message", check);
      reject(new Error("Timed out waiting for socket message"));
    }, timeoutMs);
    const check = (event: MessageEvent) => {
      const message = JSON.parse(String(event.data)) as ServerMessage;
      if (predicate(message)) {
        clearTimeout(timeout);
        ws.removeEventListener("message", check);
        resolve(message);
      }
    };
    ws.addEventListener("message", check);
  });
}

describe("bot room server integration", () => {
  it("creates explicit bot seats and validates capacity before detaching the current room", () => {
    const server = new ConquestServer({ serverName: "bot-server-test" });
    const messages: ServerMessage[] = [];
    const ws = {
      data: {} as WSData,
      send(data: string) { messages.push(JSON.parse(data) as ServerMessage); },
    };
    const createRoom = (message: ClientCreateRoom) => {
      (server as unknown as { handleCreateRoom(socket: typeof ws, request: ClientCreateRoom): void })
        .handleCreateRoom(ws, message);
    };

    try {
      createRoom({ type: "client:create_room", playerName: "Human", maxPlayers: 3, botCount: 1, visibility: "public" });
      const welcome = messages.find((message) => message.type === "server:welcome");
      expect(welcome?.type).toBe("server:welcome");
      if (welcome?.type !== "server:welcome") throw new Error("Expected room welcome");
      const room = server.roomManager.getRoom(welcome.roomCode)!;
      expect(room.playerCount).toBe(2);
      expect(room.getSummary()).toMatchObject({ playersCount: 2, humanPlayersCount: 1, botPlayersCount: 1 });
      expect(server.roomManager.getTotalPlayersCount()).toBe(1);
      expect(room.state.players.filter((player) => player.controller === "bot" && !player.connected)).toHaveLength(1);

      for (const removedMapId of ["ironreach", "sector-07"]) {
        createRoom({ type: "client:create_room", playerName: "Human", maxPlayers: 2, botCount: 0, mapId: removedMapId, visibility: "public" });
        expect(messages.findLast((message) => message.type === "server:error")).toMatchObject({ type: "server:error", code: "UNKNOWN_MAP" });
        expect(server.roomManager.getRoomsCount()).toBe(1);
        expect(ws.data.roomCode).toBe(room.roomCode);
        expect(server.sessionStore.get(ws.data.sessionToken!)?.roomCode).toBe(room.roomCode);
      }

      createRoom({ type: "client:create_room", playerName: "Human", maxPlayers: 2, botCount: 2, visibility: "public" });
      const error = messages.findLast((message) => message.type === "server:error");
      expect(error).toMatchObject({ type: "server:error", code: "INVALID_BOT_COUNT" });
      expect(server.roomManager.getRoomsCount()).toBe(1);
      expect(server.roomManager.getRoom(welcome.roomCode)).toBe(room);
      expect(room.connectedPlayersCount).toBe(1);
      expect(ws.data.roomCode).toBe(room.roomCode);
    } finally {
      server.stop();
    }
  });

  it("plays a solo human turn, lets the bot take its turn, and returns the match to the human", async () => {
    const server = new ConquestServer({ port: 0, serverName: "bot-live-flow-test" });
    server.start();
    const ws = new WebSocket(server.url!.toString().replace(/^http/, "ws"));
    const messages: ServerMessage[] = [];
    const collect = (event: MessageEvent) => messages.push(JSON.parse(String(event.data)) as ServerMessage);
    ws.addEventListener("message", collect);
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("WebSocket open timeout")), 3_000);
        ws.addEventListener("open", () => { clearTimeout(timeout); resolve(); }, { once: true });
      });
      ws.send(JSON.stringify({ type: "client:create_room", playerName: "Solo", maxPlayers: 2, botCount: 1 }));
      const welcome = await waitForSocketMessage(ws, messages, (message) => message.type === "server:welcome") as Extract<ServerMessage, { type: "server:welcome" }>;
      const lobby = await waitForSocketMessage(ws, messages, (message) =>
        message.type === "server:snapshot" && message.state.phase === "lobby" && message.state.players.length === 2,
      ) as Extract<ServerMessage, { type: "server:snapshot" }>;
      const humanId = welcome.playerId;
      const botId = lobby.state.players.find((player) => player.controller === "bot")!.id;
      ws.send(JSON.stringify({ type: "client:ready", ready: true }));
      const deployment = await waitForSocketMessage(ws, messages, (message) =>
        message.type === "server:snapshot" && message.state.phase === "deployment",
      ) as Extract<ServerMessage, { type: "server:snapshot" }>;
      const humanTerritory = Object.values(deployment.state.territories).find((territory) =>
        territory.ownerId === humanId && territory.neighbors.some((id) => deployment.state.territories[id]?.ownerId === botId),
      )!;
      ws.send(JSON.stringify({ type: "client:deploy", territoryId: humanTerritory.id, count: deployment.state.pendingReinforcements }));
      await waitForSocketMessage(ws, messages, (message) =>
        message.type === "server:event" && message.event.type === "phase_changed" && message.event.phase === "attack",
      );
      ws.send(JSON.stringify({ type: "client:skip_phase" }));
      await waitForSocketMessage(ws, messages, (message) =>
        message.type === "server:event" && message.event.type === "phase_changed" && message.event.phase === "fortify",
      );
      ws.send(JSON.stringify({ type: "client:end_turn" }));
      const botTurn = await waitForSocketMessage(ws, messages, (message) =>
        message.type === "server:event" && message.event.type === "turn_ended" && message.event.nextPlayerId === botId,
      );
      expect(botTurn.type).toBe("server:event");
      const humanTurn = await waitForSocketMessage(ws, messages, (message) =>
        message.type === "server:event" && message.event.type === "turn_ended" && message.event.nextPlayerId === humanId,
        20_000,
      );
      expect(humanTurn.type).toBe("server:event");
      expect(server.roomManager.getRoom(welcome.roomCode)?.state.phase).toBe("deployment");
    } finally {
      ws.close();
      server.stop();
    }
  }, 30_000);
});
