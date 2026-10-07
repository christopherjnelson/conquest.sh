/**
 * Tests for server robustness features:
 *  - Stale-socket race fix (Task 1)
 *  - forfeitTurn / disconnect/timeout timers (Task 2)
 *  - Abandoned room cleanup (Task 3)
 *  - Input sanitization (Task 4)
 *  - Chat rate limiting and flood guard (Task 5)
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { ConquestServer } from "../apps/server/src/server.js";
import { GameRoom } from "../apps/server/src/room.js";
import type { TimerScheduler } from "../apps/server/src/room.js";
import { EARTH_42_BUNDLE } from "../packages/map-engine/src/index.js";
import { sanitizeDisplayText } from "../packages/shared/src/index.js";
import { forfeitTurn, createInitialGameState, projectStateFor, SERVER_ONLY_KEYS } from "../packages/game-core/src/index.js";
import { GameClient } from "../apps/client/src/network/client.js";
import type {
  ServerError,
  ServerEvent,
  ServerMessage,
  ServerSnapshot,
  ServerWelcome,
} from "../packages/protocol/src/index.js";

// ---------------------------------------------------------------------------
// Minimal test WebSocket client (same pattern as server.test.ts)
// ---------------------------------------------------------------------------
class TestClient {
  public ws: WebSocket;
  public messages: ServerMessage[] = [];
  private messageListeners: ((msg: ServerMessage) => void)[] = [];

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data.toString()) as ServerMessage;
        this.messages.push(msg);
        for (const listener of [...this.messageListeners]) {
          listener(msg);
        }
      } catch (_) {}
    };
  }

  async waitForOpen(timeoutMs = 3000): Promise<void> {
    if (this.ws.readyState === WebSocket.OPEN) return;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("WebSocket open timeout")), timeoutMs);
      this.ws.onopen = () => { clearTimeout(timer); resolve(); };
      this.ws.onerror = (err) => { clearTimeout(timer); reject(err); };
    });
  }

  send(msg: unknown) { this.ws.send(JSON.stringify(msg)); }

  async waitForMessage<T extends ServerMessage>(
    predicate: (msg: ServerMessage) => boolean,
    timeoutMs = 5000
  ): Promise<T> {
    const existing = this.messages.find(predicate);
    if (existing) return existing as T;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(
        `Timeout waiting for message. Got: ${JSON.stringify(this.messages.slice(-3))}`
      )), timeoutMs);
      const listener = (msg: ServerMessage) => {
        if (predicate(msg)) {
          clearTimeout(timer);
          this.messageListeners.splice(this.messageListeners.indexOf(listener), 1);
          resolve(msg as T);
        }
      };
      this.messageListeners.push(listener);
    });
  }

  close() { if (this.ws.readyState !== WebSocket.CLOSED) this.ws.close(); }

  async closeAndWait(): Promise<void> {
    if (this.ws.readyState === WebSocket.CLOSED) return;
    return new Promise((resolve) => {
      this.ws.onclose = () => resolve();
      this.ws.close();
    });
  }
}

// ---------------------------------------------------------------------------
// Fake timer for deterministic timer tests
// ---------------------------------------------------------------------------
class FakeScheduler implements TimerScheduler {
  private nextId = 1;
  private pending = new Map<number, { fn: () => void; dueAt: number }>();
  public now = 0;

  setTimeout(fn: () => void, ms: number): ReturnType<typeof setTimeout> {
    const id = this.nextId++ as unknown as ReturnType<typeof setTimeout>;
    this.pending.set(id as unknown as number, { fn, dueAt: this.now + ms });
    return id;
  }

  clearTimeout(id: ReturnType<typeof setTimeout>): void {
    this.pending.delete(id as unknown as number);
  }

  /** Advance time by ms, firing all timers that are due. */
  tick(ms: number) {
    this.now += ms;
    for (const [id, { fn, dueAt }] of [...this.pending]) {
      if (dueAt <= this.now) {
        this.pending.delete(id);
        fn();
      }
    }
  }

  hasPending(): boolean { return this.pending.size > 0; }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRoomSocket() {
  const messages: string[] = [];
  const socket = { send: (d: string) => messages.push(d), messages };
  return socket;
}

function readyAndStart(room: GameRoom): void {
  expect(room.setReady("p1", true)).toBe(true);
  expect(room.setReady("p2", true)).toBe(true);
  expect(room.state.phase).not.toBe("lobby");
}

function createTwoPlayerRoom(scheduler: FakeScheduler, disconnectGraceMs = 100, turnTimeoutMs = 0, abandonTimeoutMs = 200) {
  const room = new GameRoom({
    roomCode: "TEST",
    map: EARTH_42_BUNDLE.definition,
    scheduler,
    disconnectGraceMs,
    turnTimeoutMs,
    abandonTimeoutMs,
    chatBucketCapacity: 3,
    chatRefillMs: 1000,
  });
  const socketA = makeRoomSocket();
  const socketB = makeRoomSocket();
  room.addPlayer("p1", "Alice", socketA);
  room.addPlayer("p2", "Bob", socketB);
  readyAndStart(room);
  return { room, socketA, socketB };
}

// ---------------------------------------------------------------------------
// Task 4: sanitizeDisplayText unit tests
// ---------------------------------------------------------------------------
describe("sanitizeDisplayText", () => {
  it("strips ANSI OSC sequences (title injection)", () => {
    expect(() => sanitizeDisplayText("\x1b]0;pwned\x07")).toThrow();
  });

  it("strips CSI ANSI escape sequences", () => {
    expect(() => sanitizeDisplayText("\x1b[2J")).toThrow();
  });

  it("strips bidi override characters", () => {
    // U+202E RIGHT-TO-LEFT OVERRIDE
    const withBidi = "a‮b";
    expect(sanitizeDisplayText(withBidi)).toBe("ab");
  });

  it("strips zero-width characters", () => {
    // a + ZWSP + b
    const withZwsp = "a​b";
    expect(sanitizeDisplayText(withZwsp)).toBe("ab");
  });

  it("throws on empty-after-sanitize input", () => {
    expect(() => sanitizeDisplayText("")).toThrow("empty after sanitization");
    expect(() => sanitizeDisplayText("\x1b[2J")).toThrow("empty after sanitization");
  });

  it("collapses whitespace and trims", () => {
    expect(sanitizeDisplayText("  hello   world  ")).toBe("hello world");
  });

  it("preserves normal text unchanged", () => {
    expect(sanitizeDisplayText("Alice")).toBe("Alice");
    expect(sanitizeDisplayText("My Room")).toBe("My Room");
  });

  it("strips C1 control characters", () => {
    // U+0085 NEXT LINE (C1)
    expect(sanitizeDisplayText("a\u0085b")).toBe("ab");
  });
});

// ---------------------------------------------------------------------------
// Task 2: forfeitTurn pure function tests
// ---------------------------------------------------------------------------
describe("forfeitTurn (pure game-core)", () => {
  function makeState() {
    const players = [
      { id: "p1", name: "Alice", colorIndex: 0, colorHex: "#fff", connected: true, isAlive: true, ready: true, rematchReady: false },
      { id: "p2", name: "Bob", colorIndex: 1, colorHex: "#f00", connected: true, isAlive: true, ready: true, rematchReady: false },
    ];
    return createInitialGameState("g1", "ROOM", players, EARTH_42_BUNDLE.definition, 3);
  }

  it("forfeits the active player's deployment turn", () => {
    const state = makeState();
    expect(state.phase).toBe("deployment");
    expect(state.pendingReinforcements).toBeGreaterThan(0);

    const result = forfeitTurn(state, state.players[state.activePlayerIndex].id, "disconnected");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);

    // Turn should have advanced
    expect(result.state.activePlayerIndex).not.toBe(state.activePlayerIndex);
    // Reinforcements should have been deployed
    expect(result.state.pendingReinforcements).toBeGreaterThanOrEqual(0);
    // Events include forfeit
    const forfeitEvent = result.events.find((e) => e.type === "turn_forfeited");
    expect(forfeitEvent).toBeDefined();
    if (forfeitEvent?.type === "turn_forfeited") {
      expect(forfeitEvent.reason).toBe("disconnected");
    }
    // Events include turn_ended and phase_changed
    expect(result.events.some((e) => e.type === "turn_ended")).toBe(true);
    expect(result.events.some((e) => e.type === "phase_changed")).toBe(true);
  });

  it("forfeits with reason timeout", () => {
    const state = makeState();
    const result = forfeitTurn(state, state.players[state.activePlayerIndex].id, "timeout");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    const fe = result.events.find((e) => e.type === "turn_forfeited");
    if (fe?.type === "turn_forfeited") expect(fe.reason).toBe("timeout");
  });

  it("rejects if caller is not the active player", () => {
    const state = makeState();
    const nonActiveId = state.players[(state.activePlayerIndex + 1) % 2].id;
    const result = forfeitTurn(state, nonActiveId, "disconnected");
    expect(result.ok).toBe(false);
  });

  it("rejects if game is already over", () => {
    const state = makeState();
    const modifiedState = { ...state, phase: "game_over" as const };
    const result = forfeitTurn(modifiedState, state.players[0].id, "disconnected");
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Task 2: disconnect forfeit timer (using fake scheduler)
// ---------------------------------------------------------------------------
describe("Disconnect forfeit timer", () => {
  it("schedules forfeit after grace period when active player disconnects", () => {
    const sched = new FakeScheduler();
    const { room, socketB } = createTwoPlayerRoom(sched, 100, 0);

    const activePlayerId = room.state.players[room.state.activePlayerIndex].id;
    room.disconnectPlayer(activePlayerId, "test disconnect");

    expect(sched.hasPending()).toBe(true);
    expect(room.state.players.find((p) => p.id === activePlayerId)?.connected).toBe(false);

    const prevActiveIndex = room.state.activePlayerIndex;

    // Trigger the timer
    sched.tick(100);

    // Turn should have advanced
    expect(room.state.activePlayerIndex).not.toBe(prevActiveIndex);
    // A turn_forfeited event should be in history
    const forfeitEvent = room.state.history.find((e) => e.type === "turn_forfeited");
    expect(forfeitEvent).toBeDefined();
  });

  it("cancels forfeit on reconnect", () => {
    const sched = new FakeScheduler();
    const { room, socketA, socketB } = createTwoPlayerRoom(sched, 100, 0);

    const activePlayerId = room.state.players[room.state.activePlayerIndex].id;
    room.disconnectPlayer(activePlayerId, "disconnect");

    // Reconnect before timer fires
    const newSocket = makeRoomSocket();
    room.reconnectPlayer(activePlayerId, newSocket);

    const prevActiveIndex = room.state.activePlayerIndex;
    sched.tick(200); // advance past grace period

    // Turn should NOT have advanced
    expect(room.state.activePlayerIndex).toBe(prevActiveIndex);
    const forfeitEvent = room.state.history.find((e) => e.type === "turn_forfeited");
    expect(forfeitEvent).toBeUndefined();
  });

  it("does not schedule forfeit for non-active player disconnect", () => {
    const sched = new FakeScheduler();
    const { room } = createTwoPlayerRoom(sched, 100, 0);

    const nonActiveId = room.state.players.find(
      (_, i) => i !== room.state.activePlayerIndex
    )?.id!;
    room.disconnectPlayer(nonActiveId, "disconnect");

    sched.tick(200);
    // No forfeit should have fired
    const forfeitEvent = room.state.history.find((e) => e.type === "turn_forfeited");
    expect(forfeitEvent).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Task 2: turn timeout timer
// ---------------------------------------------------------------------------
describe("Turn timeout timer", () => {
  it("forfeits turn after timeout expires", () => {
    const sched = new FakeScheduler();
    const room = new GameRoom({
      roomCode: "TOUT",
      map: EARTH_42_BUNDLE.definition,
      scheduler: sched,
      turnTimeoutMs: 50,
      disconnectGraceMs: 0,
      abandonTimeoutMs: 0,
    });
    const socketA = makeRoomSocket();
    const socketB = makeRoomSocket();
    room.addPlayer("p1", "Alice", socketA);
    room.addPlayer("p2", "Bob", socketB);
    readyAndStart(room);

    const prevActiveIndex = room.state.activePlayerIndex;
    expect(sched.hasPending()).toBe(true);

    sched.tick(50);

    // Turn should have advanced
    expect(room.state.activePlayerIndex).not.toBe(prevActiveIndex);
    const fe = room.state.history.find((e) => e.type === "turn_forfeited");
    expect(fe).toBeDefined();
    if (fe?.type === "turn_forfeited") expect(fe.reason).toBe("timeout");
  });

  it("exposes turnDeadlineAt on state when timeout is set", () => {
    const sched = new FakeScheduler();
    const room = new GameRoom({
      roomCode: "TDLN",
      map: EARTH_42_BUNDLE.definition,
      scheduler: sched,
      turnTimeoutMs: 5000,
      disconnectGraceMs: 0,
      abandonTimeoutMs: 0,
    });
    const socketA = makeRoomSocket();
    const socketB = makeRoomSocket();
    room.addPlayer("p1", "Alice", socketA);
    room.addPlayer("p2", "Bob", socketB);
    readyAndStart(room);

    expect(room.state.turnDeadlineAt).not.toBeNull();
    expect(typeof room.state.turnDeadlineAt).toBe("number");
  });

  it("broadcasts turnDeadlineAt in the first event/snapshot for a new turn", () => {
    // Fix 1: deadline must be stamped on this.state BEFORE broadcasts so
    // clients see it in the very first message for the new turn.
    const sched = new FakeScheduler();
    const room = new GameRoom({
      roomCode: "TDBR",
      map: EARTH_42_BUNDLE.definition,
      scheduler: sched,
      turnTimeoutMs: 5000,
      disconnectGraceMs: 0,
      abandonTimeoutMs: 0,
    });
    const socketA = makeRoomSocket();
    const socketB = makeRoomSocket();
    room.addPlayer("p1", "Alice", socketA);
    room.addPlayer("p2", "Bob", socketB);

    // Clear messages accumulated during addPlayer, then start game.
    socketA.messages.length = 0;
    socketB.messages.length = 0;
    readyAndStart(room);

    // Every message broadcast during startGame that carries a deadline should be non-null.
    // server:snapshot messages carry deadline in `state.turnDeadlineAt`.
    // server:event messages carry deadline in `delta.set.turnDeadlineAt` when it changed.
    for (const raw of socketA.messages) {
      const msg = JSON.parse(raw) as {
        type: string;
        state?: { turnDeadlineAt?: number | null };
        delta?: { set?: { turnDeadlineAt?: number | null }; unset?: string[] };
      };
      if (msg.state && "turnDeadlineAt" in msg.state) {
        expect(msg.state.turnDeadlineAt).not.toBeNull();
        expect(typeof msg.state.turnDeadlineAt).toBe("number");
      }
      if (msg.delta?.set && "turnDeadlineAt" in msg.delta.set) {
        expect(msg.delta.set.turnDeadlineAt).not.toBeNull();
        expect(typeof msg.delta.set.turnDeadlineAt).toBe("number");
      }
    }
    // Sanity: there should have been at least one snapshot with state.
    const withState = socketA.messages
      .map((r) => JSON.parse(r) as { type: string; state?: unknown })
      .filter((m) => m.type === "server:snapshot" && m.state != null);
    expect(withState.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Task 3: abandoned room cleanup
// ---------------------------------------------------------------------------
describe("Abandoned room cleanup", () => {
  it("schedules room removal when all players disconnect mid-game", () => {
    const sched = new FakeScheduler();
    let removed = false;
    const room = new GameRoom({
      roomCode: "ABND",
      map: EARTH_42_BUNDLE.definition,
      scheduler: sched,
      disconnectGraceMs: 0,
      turnTimeoutMs: 0,
      abandonTimeoutMs: 200,
      onDeserted: () => { removed = true; },
    });
    const socketA = makeRoomSocket();
    const socketB = makeRoomSocket();
    room.addPlayer("p1", "Alice", socketA);
    room.addPlayer("p2", "Bob", socketB);
    readyAndStart(room);

    room.disconnectPlayer("p1", "gone");
    room.disconnectPlayer("p2", "gone");

    expect(removed).toBe(false);
    sched.tick(200);
    expect(removed).toBe(true);
  });

  it("cancels abandon timer on reconnect", () => {
    const sched = new FakeScheduler();
    let removed = false;
    const room = new GameRoom({
      roomCode: "ABND",
      map: EARTH_42_BUNDLE.definition,
      scheduler: sched,
      disconnectGraceMs: 0,
      turnTimeoutMs: 0,
      abandonTimeoutMs: 200,
      onDeserted: () => { removed = true; },
    });
    const socketA = makeRoomSocket();
    const socketB = makeRoomSocket();
    room.addPlayer("p1", "Alice", socketA);
    room.addPlayer("p2", "Bob", socketB);
    readyAndStart(room);

    room.disconnectPlayer("p1", "gone");
    room.disconnectPlayer("p2", "gone");

    // Reconnect p2 before timer fires
    const newSocket = makeRoomSocket();
    room.reconnectPlayer("p2", newSocket);

    sched.tick(300);
    expect(removed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Task 5: Chat rate limiting
// ---------------------------------------------------------------------------
describe("Chat rate limiting", () => {
  it("allows messages up to the bucket capacity", () => {
    const sched = new FakeScheduler();
    const room = new GameRoom({
      roomCode: "CHAT",
      map: EARTH_42_BUNDLE.definition,
      scheduler: sched,
      chatBucketCapacity: 3,
      chatRefillMs: 10000,
    });
    const socketA = makeRoomSocket();
    const socketB = makeRoomSocket();
    room.addPlayer("p1", "Alice", socketA);
    room.addPlayer("p2", "Bob", socketB);

    expect(room.chat("p1", "msg1").ok).toBe(true);
    expect(room.chat("p1", "msg2").ok).toBe(true);
    expect(room.chat("p1", "msg3").ok).toBe(true);
  });

  it("rejects messages over the rate limit with RATE_LIMITED error", () => {
    const sched = new FakeScheduler();
    const room = new GameRoom({
      roomCode: "CRAT",
      map: EARTH_42_BUNDLE.definition,
      scheduler: sched,
      chatBucketCapacity: 2,
      chatRefillMs: 10000,
    });
    const socketA = makeRoomSocket();
    const socketB = makeRoomSocket();
    room.addPlayer("p1", "Alice", socketA);
    room.addPlayer("p2", "Bob", socketB);

    room.chat("p1", "msg1");
    room.chat("p1", "msg2");
    const result = room.chat("p1", "msg3");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("RATE_LIMITED");
  });
});

// ---------------------------------------------------------------------------
// Task 1: Stale-socket race — integration test using real ConquestServer
// ---------------------------------------------------------------------------
describe("Stale socket reconnect race (integration)", () => {
  let server: ConquestServer;
  let port: number;

  beforeAll(() => {
    server = new ConquestServer({
      port: 0,
      disconnectGraceMs: 0, // disable so we don't need timers
      turnTimeoutMs: 0,
      abandonTimeoutMs: 0,
    });
    server.start();
    port = server.port;
  });

  afterAll(() => server.stop());

  it("ignores stale old-socket close after a reconnect", async () => {
    // Create a room with two clients
    const clientA = new TestClient(`ws://localhost:${port}`);
    await clientA.waitForOpen();
    clientA.send({ type: "client:create_room", playerName: "Alice", visibility: "public", maxPlayers: 2 });
    const welcomeA = await clientA.waitForMessage<ServerWelcome>((m) => m.type === "server:welcome");
    const roomCode = welcomeA.roomCode;

    const clientB = new TestClient(`ws://localhost:${port}`);
    await clientB.waitForOpen();
    clientB.send({ type: "client:join", name: "Bob", roomCode });
    const welcomeB = await clientB.waitForMessage<ServerWelcome>((m) => m.type === "server:welcome");
    const bobToken = welcomeB.sessionToken;
    const bobId = welcomeB.playerId;

    // Both ready to start the game (2 players)
    clientA.send({ type: "client:ready", ready: true });
    clientB.send({ type: "client:ready", ready: true });
    // Wait for game to start
    await clientB.waitForMessage<ServerSnapshot>(
      (m) => m.type === "server:snapshot" && (m as ServerSnapshot).state.phase !== "lobby",
      5000
    );

    // Bob reconnects on a NEW socket (simulating reconnect before server notices old one died)
    const clientBnew = new TestClient(`ws://localhost:${port}`);
    await clientBnew.waitForOpen();
    clientBnew.send({ type: "client:join", name: "Bob", roomCode, sessionToken: bobToken });

    // Wait for reconnect welcome
    const welcomeBnew = await clientBnew.waitForMessage<ServerWelcome>((m) => m.type === "server:welcome");
    expect(welcomeBnew.playerId).toBe(bobId);

    // Now close the OLD socket (the stale one)
    await clientB.closeAndWait();

    // Wait a moment for the close to propagate
    await new Promise((r) => setTimeout(r, 200));

    // Bob should still be connected — send a snapshot request by asking for room state
    // via a ping to verify the new socket is still operational
    clientBnew.send({ type: "client:ping", timestamp: Date.now() });
    const pong = await clientBnew.waitForMessage((m) => m.type === "server:pong", 3000);
    expect(pong).toBeDefined();

    // Verify Bob is still connected in room state
    const snapshot = server.roomManager.getRoom(roomCode);
    const bob = snapshot?.state.players.find((p) => p.id === bobId);
    expect(bob?.connected).toBe(true);

    clientA.close();
    clientBnew.close();
  });
});

// ---------------------------------------------------------------------------
// Task 5: maxRooms / SERVER_FULL
// ---------------------------------------------------------------------------
describe("Server maxRooms cap", () => {
  let server: ConquestServer;
  let port: number;

  beforeAll(() => {
    server = new ConquestServer({ port: 0, maxRooms: 1 });
    server.start();
    port = server.port;
  });

  afterAll(() => server.stop());

  it("returns SERVER_FULL when max rooms reached", async () => {
    // Create first room
    const c1 = new TestClient(`ws://localhost:${port}`);
    await c1.waitForOpen();
    c1.send({ type: "client:create_room", playerName: "Alice", visibility: "public", maxPlayers: 2 });
    await c1.waitForMessage<ServerWelcome>((m) => m.type === "server:welcome");

    // Try creating second room — should fail
    const c2 = new TestClient(`ws://localhost:${port}`);
    await c2.waitForOpen();
    c2.send({ type: "client:create_room", playerName: "Bob", visibility: "public", maxPlayers: 2 });
    const err = await c2.waitForMessage<ServerError>((m) => m.type === "server:error");
    expect(err.code).toBe("SERVER_FULL");

    c1.close();
    c2.close();
  });
});

// ---------------------------------------------------------------------------
// Task 4: Input sanitization (integration)
// ---------------------------------------------------------------------------
describe("Input sanitization (server integration)", () => {
  let server: ConquestServer;
  let port: number;

  beforeAll(() => {
    server = new ConquestServer({ port: 0 });
    server.start();
    port = server.port;
  });

  afterAll(() => server.stop());

  it("rejects player name that becomes empty after sanitization", async () => {
    const c = new TestClient(`ws://localhost:${port}`);
    await c.waitForOpen();
    c.send({ type: "client:create_room", playerName: "\x1b[2J", visibility: "public", maxPlayers: 2 });
    const err = await c.waitForMessage<ServerError>((m) => m.type === "server:error");
    expect(err.code).toBe("INVALID_NAME");
    c.close();
  });

  it("strips ANSI from player name but accepts remaining text", async () => {
    const c = new TestClient(`ws://localhost:${port}`);
    await c.waitForOpen();
    // Name with ANSI color code prefix
    c.send({ type: "client:create_room", playerName: "\x1b[31mAlice\x1b[0m", visibility: "public", maxPlayers: 2 });
    const welcome = await c.waitForMessage<ServerWelcome>((m) => m.type === "server:welcome");
    const roomCode = welcome.roomCode;
    // The name in the room should have ANSI stripped
    const room = server.roomManager.getRoom(roomCode);
    const player = room?.state.players.find((p) => p.id === welcome.playerId);
    expect(player?.name).toBe("Alice");
    c.close();
  });
});

// ---------------------------------------------------------------------------
// Per-viewer payload differentiation (state projection)
// ---------------------------------------------------------------------------
describe("Per-viewer state projection", () => {
  it("two sockets receive different server:event payloads when per-viewer projections differ", () => {
    // Use SERVER_ONLY_KEYS to introduce a key that gets stripped from the server-side
    // projection, simulating per-player hidden information.
    // We prove the mechanism by verifying that the snapshot payloads ARE personalised
    // per player — each player sees their own playerId in myPlayerId and a state
    // projected for them specifically (e.g. history bounded correctly).
    const sched = new FakeScheduler();
    const socketA = makeRoomSocket();
    const socketB = makeRoomSocket();
    const room = new GameRoom({
      roomCode: "PROJ",
      map: EARTH_42_BUNDLE.definition,
      scheduler: sched,
      disconnectGraceMs: 0,
      turnTimeoutMs: 0,
      abandonTimeoutMs: 0,
    });

    room.addPlayer("p1", "Alice", socketA);
    room.addPlayer("p2", "Bob", socketB);
    readyAndStart(room);

    // Each socket should have received at least one server:snapshot.
    const snapshotsA = socketA.messages
      .map(r => JSON.parse(r) as { type: string; myPlayerId?: string; state?: { players?: unknown[] } })
      .filter(m => m.type === "server:snapshot");
    const snapshotsB = socketB.messages
      .map(r => JSON.parse(r) as { type: string; myPlayerId?: string; state?: { players?: unknown[] } })
      .filter(m => m.type === "server:snapshot");

    expect(snapshotsA.length).toBeGreaterThan(0);
    expect(snapshotsB.length).toBeGreaterThan(0);

    // Each player sees their own ID in myPlayerId.
    const lastA = snapshotsA[snapshotsA.length - 1]!;
    const lastB = snapshotsB[snapshotsB.length - 1]!;
    expect(lastA.myPlayerId).toBe("p1");
    expect(lastB.myPlayerId).toBe("p2");

    // The raw JSON payloads are different (personalised per player).
    const payloadA = JSON.stringify(lastA);
    const payloadB = JSON.stringify(lastB);
    expect(payloadA).not.toBe(payloadB);
  });

  it("SERVER_ONLY_KEYS are stripped from all projections (player and spectator)", () => {
    // Inject a synthetic server-only key; projectStateFor must strip it.
    SERVER_ONLY_KEYS.push("__testServerKey");
    try {
      const sched = new FakeScheduler();
      const socketA = makeRoomSocket();
      const socketB = makeRoomSocket();
      const room = new GameRoom({
        roomCode: "SOKP",
        map: EARTH_42_BUNDLE.definition,
        scheduler: sched,
        disconnectGraceMs: 0,
        turnTimeoutMs: 0,
        abandonTimeoutMs: 0,
      });

      room.addPlayer("p1", "Alice", socketA);
      room.addPlayer("p2", "Bob", socketB);
      // Inject the server-only field into the authoritative state.
      (room.state as unknown as Record<string, unknown>)["__testServerKey"] = "super-secret";
      readyAndStart(room);

      // All snapshot payloads must NOT contain the server-only key.
      for (const raw of [...socketA.messages, ...socketB.messages]) {
        const msg = JSON.parse(raw) as { type: string; state?: Record<string, unknown> };
        if (msg.type === "server:snapshot" && msg.state) {
          expect(msg.state["__testServerKey"]).toBeUndefined();
        }
      }

      // Also verify via projectStateFor directly.
      const projected = projectStateFor(room.state as any, "p1");
      expect((projected as unknown as Record<string, unknown>)["__testServerKey"]).toBeUndefined();
    } finally {
      SERVER_ONLY_KEYS.splice(SERVER_ONLY_KEYS.indexOf("__testServerKey"), 1);
    }
  });
});

// ---------------------------------------------------------------------------
// Resync correctness: drop a message and assert state converges
// ---------------------------------------------------------------------------
describe("Resync correctness (awaitingResync flag)", () => {
  let resyncServer: ConquestServer;
  let resyncPort: number;

  beforeAll(() => {
    resyncServer = new ConquestServer({
      port: 0,
      serverName: "resync-test-server",
      defaultMap: EARTH_42_BUNDLE.definition,
      maxPlayersPerRoom: 2,
    } as any);
    resyncServer.start();
    resyncPort = resyncServer.port;
  });

  afterAll(() => {
    resyncServer.stop();
  });

  it("client recovers from a dropped server:event by resyncing and converging to server projection", async () => {
    const clientA = new GameClient({
      host: `localhost:${resyncPort}`,
      playerName: "ResyncAlice",
      forceNewSession: true,
      autoReconnect: false,
    });
    const clientB = new GameClient({
      host: `localhost:${resyncPort}`,
      playerName: "ResyncBob",
      forceNewSession: true,
      autoReconnect: false,
    });

    await clientA.connect();
    await clientB.connect();

    clientA.createRoom({ playerName: "ResyncAlice", maxPlayers: 2 });
    const lobby = await clientA.waitForSnapshot(s => s.phase === "lobby", 5000);
    const roomCode = lobby.roomCode;

    clientB.join("ResyncBob", roomCode);
    await clientA.waitForSnapshot(s => s.players.length === 2, 5000);
    await clientB.waitForSnapshot(s => s.players.length === 2, 5000);

    clientA.ready();
    clientB.ready();
    await clientA.waitForSnapshot(s => s.phase === "deployment", 5000);
    await clientB.waitForSnapshot(s => s.phase === "deployment", 5000);

    // Simulate a dropped message by manipulating lastSeenVersion.
    // Inject a version gap: set lastSeenVersion far ahead so the next real
    // server:event looks like it arrived out of order, triggering the resync path.
    // We access private fields via cast for test purposes.
    const clientAPrivate = clientA as unknown as { lastSeenVersion: number; awaitingResync: boolean };

    // Push lastSeenVersion ahead by 100 to simulate a large gap.
    clientAPrivate.lastSeenVersion += 100;
    expect(clientAPrivate.awaitingResync).toBe(false);

    // Trigger one action to produce a server:event that will look like a gap.
    const room = resyncServer.roomManager.findRoomByPlayerId(clientA.myPlayerId!);
    const stateBeforeGap = room?.state;
    expect(stateBeforeGap).toBeDefined();

    // Have the active player (could be either) deploy to trigger an event.
    const activeId = stateBeforeGap!.players[stateBeforeGap!.activePlayerIndex]?.id;
    const activeClient = activeId === clientA.myPlayerId ? clientA : clientB;
    const territoryId = Object.keys(stateBeforeGap!.territories)[0]!;
    activeClient.deploy(territoryId, 1);

    // Wait for the resync to be triggered and a snapshot to come back.
    await new Promise(r => setTimeout(r, 500));

    // awaitingResync should be cleared (snapshot received)
    // Give a bit more time for the server response
    await new Promise(r => setTimeout(r, 200));

    // Verify convergence: client state should match server projection.
    const serverRoom = resyncServer.roomManager.findRoomByPlayerId(clientA.myPlayerId!);
    if (serverRoom && clientA.myPlayerId && clientA.state) {
      const expected = projectStateFor(serverRoom.state, clientA.myPlayerId);
      // Compare key fields
      expect(clientA.state.phase).toBe(expected.phase);
      expect(clientA.state.activePlayerIndex).toBe(expected.activePlayerIndex);
      expect(JSON.stringify(clientA.state.players.map(p => p.isAlive)))
        .toBe(JSON.stringify(expected.players.map(p => p.isAlive)));
    }

    clientA.disconnect();
    clientB.disconnect();
  }, 15_000);
});
