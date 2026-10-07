import { describe, expect, test } from "bun:test";
import { decideBotAction, estimateCaptureProbability } from "@conquest/bot-core";
import type { GameState } from "@conquest/protocol";
import { ConquestServer } from "../apps/server/src/server.js";
import { GameRoom, type RoomSocket } from "../apps/server/src/room.js";
import type { ServerMessage } from "@conquest/protocol";

function waitForMessage(
  messages: ServerMessage[],
  ws: WebSocket,
  predicate: (message: ServerMessage) => boolean,
  timeoutMs = 15_000,
): Promise<ServerMessage> {
  const existing = messages.find(predicate);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.removeEventListener("message", check);
      reject(new Error("Timed out waiting for WebSocket message"));
    }, timeoutMs);
    const check = (event: MessageEvent) => {
      const message = JSON.parse(String(event.data)) as ServerMessage;
      messages.push(message);
      if (predicate(message)) {
        clearTimeout(timeout);
        ws.removeEventListener("message", check);
        resolve(message);
      }
    };
    ws.addEventListener("message", check);
  });
}

async function openSocket(url: string): Promise<WebSocket> {
  const ws = new WebSocket(url.replace(/^http/, "ws"));
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("WebSocket open timeout")), 3_000);
    ws.addEventListener("open", () => { clearTimeout(timeout); resolve(); }, { once: true });
    ws.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("WebSocket connection failed")); }, { once: true });
  });
  return ws;
}

function fixture(phase: GameState["phase"]): GameState {
  return {
    gameId: "bot-regression", mapId: "earth-42", roomCode: "REG", turnNumber: 3,
    activePlayerIndex: 0, phase,
    players: [
      { id: "human", name: "Human", colorIndex: 0, colorHex: "#ffffff", connected: true, isAlive: true, ready: true },
      { id: "rival", name: "Rival", colorIndex: 1, colorHex: "#000000", connected: true, isAlive: true, ready: true },
    ],
    territories: {
      alpha: { id: "alpha", name: "Alpha", sectorId: "west", ownerId: "human", units: 9, neighbors: ["beta", "gamma"] },
      beta: { id: "beta", name: "Beta", sectorId: "west", ownerId: "rival", units: 3, neighbors: ["alpha", "gamma"] },
      gamma: { id: "gamma", name: "Gamma", sectorId: "west", ownerId: "human", units: 2, neighbors: ["alpha", "beta", "delta"] },
      delta: { id: "delta", name: "Delta", sectorId: "east", ownerId: "rival", units: 5, neighbors: ["gamma"] },
    },
    sectors: {
      west: { id: "west", name: "West", bonusReinforcements: 4, territoryIds: ["alpha", "beta", "gamma"], colorHex: "#aa0000" },
      east: { id: "east", name: "East", bonusReinforcements: 2, territoryIds: ["delta"], colorHex: "#00aa00" },
    },
    pendingReinforcements: phase === "deployment" ? 4 : 0,
    pendingConquestMove: null, hasConqueredThisTurn: false, winnerId: null, result: null,
    matchNumber: 1, history: [],
  };
}

describe("bot policy regression checks", () => {
  test("same state yields the same choice when territory and geometry order changes", () => {
    for (const phase of ["deployment", "attack", "fortify"] as const) {
      const original = fixture(phase);
      const reordered: GameState = {
        ...original,
        territories: Object.fromEntries(Object.entries(original.territories).reverse().map(([id, territory]) => [
          id, { ...territory, neighbors: [...territory.neighbors].reverse() },
        ])),
        sectors: Object.fromEntries(Object.entries(original.sectors).reverse().map(([id, sector]) => [
          id, { ...sector, territoryIds: [...sector.territoryIds].reverse() },
        ])),
      };
      expect(decideBotAction(reordered, "human")).toEqual(decideBotAction(original, "human"));
    }
  });

  test("capture odds remain ordered beyond the exact table boundary", () => {
    const probes = [159, 160, 161, 162, 163, 164, 165, 220, 320, 3000];
    for (const defenders of probes) {
      for (let i = 1; i < probes.length; i++) {
        const current = estimateCaptureProbability(probes[i]!, defenders);
        expect(current).toBeGreaterThanOrEqual(estimateCaptureProbability(probes[i - 1]!, defenders));
        expect(current).toBeGreaterThanOrEqual(0);
        expect(current).toBeLessThanOrEqual(1);
      }
    }
    for (const attackers of probes) {
      for (let i = 1; i < probes.length; i++) {
        const current = estimateCaptureProbability(attackers, probes[i]!);
        expect(current).toBeLessThanOrEqual(estimateCaptureProbability(attackers, probes[i - 1]!));
        expect(current).toBeGreaterThanOrEqual(0);
        expect(current).toBeLessThanOrEqual(1);
      }
    }
  });

  test("public mixed lobby returns control h1 → bot → h2 over real WebSockets", async () => {
    const server = new ConquestServer({ port: 0, serverName: "bot-mixed-flow-regression" });
    server.start();
    const url = server.url!.toString();
    const h1 = await openSocket(url);
    const h2 = await openSocket(url);
    const messages1: ServerMessage[] = [];
    const messages2: ServerMessage[] = [];
    const collect1 = (event: MessageEvent) => messages1.push(JSON.parse(String(event.data)) as ServerMessage);
    const collect2 = (event: MessageEvent) => messages2.push(JSON.parse(String(event.data)) as ServerMessage);
    h1.addEventListener("message", collect1);
    h2.addEventListener("message", collect2);
    try {
      h1.send(JSON.stringify({ type: "client:create_room", playerName: "Human One", maxPlayers: 3, botCount: 1, visibility: "public" }));
      const welcome1 = await waitForMessage(messages1, h1, (m) => m.type === "server:welcome") as Extract<ServerMessage, { type: "server:welcome" }>;
      h2.send(JSON.stringify({ type: "client:join", roomCode: welcome1.roomCode, name: "Human Two" }));
      const welcome2 = await waitForMessage(messages2, h2, (m) => m.type === "server:welcome") as Extract<ServerMessage, { type: "server:welcome" }>;
      h1.send(JSON.stringify({ type: "client:ready", ready: true }));
      h2.send(JSON.stringify({ type: "client:ready", ready: true }));

      const deployment = await waitForMessage(messages1, h1, (m) => m.type === "server:snapshot" && m.state.phase === "deployment") as Extract<ServerMessage, { type: "server:snapshot" }>;
      expect(deployment.state.players.map((p) => p.id)).toEqual([welcome1.playerId, expect.any(String), welcome2.playerId]);
      expect(deployment.state.players[1]?.controller).toBe("bot");
      const deployTerritory = Object.values(deployment.state.territories).find((territory) => territory.ownerId === welcome1.playerId)!;
      h1.send(JSON.stringify({ type: "client:deploy", territoryId: deployTerritory.id, count: deployment.state.pendingReinforcements }));
      await waitForMessage(messages1, h1, (m) => m.type === "server:event" && m.event.type === "phase_changed" && m.event.phase === "attack");
      h1.send(JSON.stringify({ type: "client:skip_phase" }));
      await waitForMessage(messages1, h1, (m) => m.type === "server:event" && m.event.type === "phase_changed" && m.event.phase === "fortify");
      h1.send(JSON.stringify({ type: "client:end_turn" }));

      const botTurn = await waitForMessage(messages1, h1, (m) => m.type === "server:event" && m.event.type === "turn_ended" && m.event.nextPlayerId === deployment.state.players[1]?.id);
      expect(botTurn.type).toBe("server:event");
      const humanTwoTurn = await waitForMessage(messages1, h1, (m) => m.type === "server:event" && m.event.type === "turn_ended" && m.event.nextPlayerId === welcome2.playerId, 30_000);
      expect(humanTwoTurn.type).toBe("server:event");
      expect(server.roomManager.getRoom(welcome1.roomCode)?.state.players[server.roomManager.getRoom(welcome1.roomCode)!.state.activePlayerIndex]?.id).toBe(welcome2.playerId);
    } finally {
      h1.close();
      h2.close();
      server.stop();
    }
  }, 60_000);

  test("disposed room ignores a bot callback that was already dequeued", () => {
    const queued: (() => void)[] = [];
    const room = new GameRoom({
      roomCode: "STALE",
      maxPlayers: 2,
      botCount: 1,
      botScheduler: {
        schedule(callback) { queued.push(callback as () => void); return callback; },
        // Model the race where the scheduler has dequeued a callback before cancellation.
        cancel() {},
      },
    });
    const socket: RoomSocket = { send() {} };
    expect(room.addPlayer("human", "Human", socket).ok).toBe(true);
    expect(room.addBots(1)).toBe(true);
    expect(room.setReady("human", true)).toBe(true);
    const bot = room.state.players.find((player) => player.controller === "bot")!;
    room.state.activePlayerIndex = room.state.players.indexOf(bot);
    room.state.phase = "deployment";
    room.state.pendingReinforcements = 3;
    (room as unknown as { scheduleBotTurn: () => void }).scheduleBotTurn();
    expect(queued).toHaveLength(1);
    const staleCallback = queued[0]!;
    const before = JSON.stringify(room.state);

    room.dispose();
    staleCallback();

    expect(JSON.stringify(room.state)).toBe(before);
    expect(room.state.history.some((event) => event.type === "units_deployed" && event.playerId === bot.id)).toBe(false);
  });
});
