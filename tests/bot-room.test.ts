import { describe, expect, it } from "bun:test";
import { GameRoom } from "../apps/server/src/room.js";
import type { RoomSocket } from "../apps/server/src/room.js";

function fakeScheduler() {
  const callbacks: (() => void)[] = [];
  return {
    callbacks,
    schedule(callback: () => void) {
      callbacks.push(callback);
      return callback;
    },
    cancel(handle: unknown) {
      const index = callbacks.indexOf(handle as () => void);
      if (index >= 0) callbacks.splice(index, 1);
    },
    runNext() {
      const callback = callbacks.shift();
      if (!callback) throw new Error("No scheduled bot callback");
      callback();
    },
  };
}

const socket: RoomSocket = { send() {} };

describe("bot room lifecycle", () => {
  it("adds disconnected bot seats and applies a scheduled deployment through room actions", () => {
    const scheduler = fakeScheduler();
    const room = new GameRoom({ roomCode: "BOTS", maxPlayers: 3, botCount: 2, botScheduler: scheduler });
    expect(room.addPlayer("human-1", "Human", socket, "human-token").ok).toBe(true);
    expect(room.addBots(2)).toBe(true);
    expect(room.playerCount).toBe(3);
    expect(room.connectedPlayersCount).toBe(1);
    expect(room.botPlayersCount).toBe(2);
    expect(room.state.players.slice(1).every((player) => player.controller === "bot" && !player.connected)).toBe(true);
    expect(room.getPlayerSocket(room.state.players[1]!.id)).toBeUndefined();
    expect(room.state.players.slice(1).every((player) => player.ready && player.rematchReady)).toBe(true);

    expect(room.setReady("human-1", true)).toBe(true);
    expect(room.state.phase).toBe("deployment");
    room.state.activePlayerIndex = 1;
    (room as unknown as { scheduleBotTurn: () => void }).scheduleBotTurn();
    scheduler.runNext();

    expect(room.state.phase).toBe("attack");
    expect(room.state.pendingReinforcements).toBe(0);
    expect(room.state.history.some((event) => event.type === "units_deployed" && event.playerId === room.state.players[1]!.id)).toBe(true);
    room.dispose();
    expect(scheduler.callbacks).toHaveLength(0);
  });

  it("rejects excess or fractional bot seats and can dispose a pending turn", () => {
    const scheduler = fakeScheduler();
    const room = new GameRoom({ roomCode: "CAPS", maxPlayers: 3, botCount: 1, botScheduler: scheduler });
    room.addPlayer("human-1", "Human", socket);
    expect(room.addBots(1.5)).toBe(false);
    expect(room.addBots(2)).toBe(false);
    expect(room.addBots(1)).toBe(true);
    room.setReady("human-1", true);
    room.state.activePlayerIndex = 1;
    (room as unknown as { scheduleBotTurn: () => void }).scheduleBotTurn();
    expect(scheduler.callbacks).toHaveLength(1);
    const staleCallback = scheduler.callbacks[0]!;
    room.dispose();
    expect(scheduler.callbacks).toHaveLength(0);
    staleCallback();
    expect(room.state.history.some((event) => event.type === "units_deployed" && event.playerId === room.state.players[1]!.id)).toBe(false);
    (room as unknown as { scheduleBotTurn: () => void }).scheduleBotTurn();
    expect(scheduler.callbacks).toHaveLength(0);
  });

  it("keeps an exhausted turn budget while completing conquest, skipping attack, and ending fortify", () => {
    const scheduler = fakeScheduler();
    const room = new GameRoom({ roomCode: "LIMIT", maxPlayers: 2, botCount: 1, botScheduler: scheduler });
    room.addPlayer("human-1", "Human", socket);
    room.addBots(1);
    room.setReady("human-1", true);
    const bot = room.state.players[1]!;
    const owned = Object.values(room.state.territories).filter((territory) => territory.ownerId === bot.id);
    const source = owned[0]!;
    const target = owned[1]!;
    room.state.activePlayerIndex = 1;
    room.state.phase = "attack";
    room.state.territories[source.id] = { ...source, units: 10 };
    room.state.territories[target.id] = { ...target, units: 1 };
    room.state.pendingConquestMove = {
      sourceTerritoryId: source.id,
      targetTerritoryId: target.id,
      defenderId: "human-1",
      minimumUnits: 1,
      maximumUnits: 9,
    };
    (room as unknown as { botBudgetKey: string }).botBudgetKey = `${room.state.gameId}:${room.state.turnNumber}:${bot.id}`;
    (room as unknown as { botActionsThisTurn: number }).botActionsThisTurn = 80;
    (room as unknown as { scheduleBotTurn: () => void }).scheduleBotTurn();

    const phaseAfterConquest = () => room.state.phase;
    scheduler.runNext();
    expect(room.state.pendingConquestMove).toBeNull();
    expect(phaseAfterConquest()).toBe("attack");
    expect((room as unknown as { botActionsThisTurn: number }).botActionsThisTurn).toBe(80);

    scheduler.runNext();
    expect(phaseAfterConquest()).toBe("fortify");
    scheduler.runNext();
    expect(room.state.players[room.state.activePlayerIndex]!.id).toBe("human-1");
    expect(phaseAfterConquest()).toBe("deployment");
    room.dispose();
  });

  it("pauses bot work when the last human disconnects and resumes after reconnect", () => {
    const scheduler = fakeScheduler();
    const room = new GameRoom({ roomCode: "PAUSE", maxPlayers: 2, botCount: 1, botScheduler: scheduler });
    room.addPlayer("human-1", "Human", socket);
    room.addBots(1);
    room.setReady("human-1", true);
    room.state.activePlayerIndex = 1;
    (room as unknown as { scheduleBotTurn: () => void }).scheduleBotTurn();
    expect(scheduler.callbacks).toHaveLength(1);

    room.disconnectPlayer("human-1");
    expect(room.connectedPlayersCount).toBe(0);
    expect(scheduler.callbacks).toHaveLength(0);
    expect(room.reconnectPlayer("human-1", socket)).toBe(true);
    expect(scheduler.callbacks).toHaveLength(1);
    room.dispose();
  });

  it("does not arm human turn timeouts for bot seats", () => {
    const timeoutCallbacks = new Map<unknown, () => void>();
    const roomTimer = {
      setTimeout(callback: () => void) {
        const handle = {};
        timeoutCallbacks.set(handle, callback);
        return handle as ReturnType<typeof setTimeout>;
      },
      clearTimeout(handle: ReturnType<typeof setTimeout>) {
        timeoutCallbacks.delete(handle);
      },
    };
    const room = new GameRoom({
      roomCode: "BOTIME",
      maxPlayers: 2,
      botCount: 1,
      scheduler: roomTimer,
      botScheduler: fakeScheduler(),
      turnTimeoutMs: 1,
    });
    room.addPlayer("human-1", "Human", socket);
    room.addBots(1);
    room.setReady("human-1", true);

    room.state.activePlayerIndex = 1;
    room.state.phase = "fortify";
    room.scheduleTurnTimeout();
    expect(room.state.turnDeadlineAt).toBeNull();
    expect(timeoutCallbacks.size).toBe(0);

    expect(room.endTurn(room.state.players[1]!.id).ok).toBe(true);
    expect(room.state.players[room.state.activePlayerIndex]!.id).toBe("human-1");
    expect(room.state.turnDeadlineAt).toBeGreaterThan(Date.now());
    expect(timeoutCallbacks.size).toBe(1);
    room.dispose();
    expect(timeoutCallbacks.size).toBe(0);
  });

  it("resets action budgets per bot and lets the human start a bot rematch", () => {
    const scheduler = fakeScheduler();
    const room = new GameRoom({ roomCode: "REM2", maxPlayers: 3, botCount: 2, botScheduler: scheduler });
    room.addPlayer("human-1", "Human", socket);
    room.addBots(2);
    room.setReady("human-1", true);
    const secondBot = room.state.players[2]!;
    room.state.activePlayerIndex = 1;
    (room as unknown as { scheduleBotTurn: () => void }).scheduleBotTurn();
    scheduler.runNext();
    expect((room as unknown as { botActionsThisTurn: number }).botActionsThisTurn).toBe(1);

    room.state.activePlayerIndex = 2;
    room.state.phase = "deployment";
    room.state.pendingReinforcements = 3;
    (room as unknown as { scheduleBotTurn: () => void }).scheduleBotTurn();
    scheduler.runNext();
    expect((room as unknown as { botBudgetKey: string }).botBudgetKey).toBe(`${room.state.gameId}:${room.state.turnNumber}:${secondBot.id}`);
    expect((room as unknown as { botActionsThisTurn: number }).botActionsThisTurn).toBe(1);

    room.state.phase = "game_over";
    expect(room.setRematchReady("human-1", true)).toBe(true);
    expect(room.matchNumber).toBe(2);
    const rematchBots = room.state.players.filter((player) => player.controller === "bot");
    expect(rematchBots).toHaveLength(2);
    expect(rematchBots.every((player) => player.rematchReady)).toBe(true);
    expect(room.state.players[room.state.activePlayerIndex]!.controller).toBe("bot");
    room.dispose();

    const noHumansScheduler = fakeScheduler();
    const noHumans = new GameRoom({ roomCode: "NOHM", maxPlayers: 2, botCount: 1, botScheduler: noHumansScheduler });
    noHumans.addPlayer("human-2", "Human", socket);
    noHumans.addBots(1);
    noHumans.setReady("human-2", true);
    noHumans.state.phase = "game_over";
    noHumans.disconnectPlayer("human-2");
    expect(noHumans.startRematch()).toBe(false);
    expect(noHumans.matchNumber).toBe(1);
    noHumans.dispose();
  });

  it("uses one legal fallback for invalid bot actions and still hands control to the human", () => {
    const scheduler = fakeScheduler();
    const room = new GameRoom({
      roomCode: "SAFE",
      maxPlayers: 2,
      botCount: 1,
      botScheduler: scheduler,
      botPolicy: () => ({
        action: { type: "deploy", territoryId: "missing-territory", count: 999 },
        reason: "test invalid action",
      }),
    });
    room.addPlayer("human-1", "Human", socket);
    room.addBots(1);
    room.setReady("human-1", true);
    room.state.activePlayerIndex = 1;
    const botId = room.state.players[1]!.id;
    (room as unknown as { scheduleBotTurn: () => void }).scheduleBotTurn();

    scheduler.runNext();
    const deployment = room.state.history.find((event) => event.type === "units_deployed" && event.playerId === botId);
    expect(deployment?.type).toBe("units_deployed");
    expect(room.state.phase).toBe("attack");
    scheduler.runNext();
    expect(room.state.phase).toBe("fortify");
    scheduler.runNext();
    expect(room.state.players[room.state.activePlayerIndex]!.id).toBe("human-1");
    expect(room.state.phase).toBe("deployment");
    expect(scheduler.callbacks).toHaveLength(0);
    room.dispose();
  });
});
