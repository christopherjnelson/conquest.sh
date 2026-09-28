import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { ConquestServer } from "../apps/server/src/server.js";
import { MAP_IRONREACH } from "../packages/map-engine/src/index.js";
import type {
  ClientAttack,
  ClientCreateRoom,
  ClientDeploy,
  ClientEndTurn,
  ClientJoin,
  ClientPing,
  ClientSkipPhase,
  ServerEvent,
  ServerMessage,
  ServerPong,
  ServerSnapshot,
  ServerWelcome,
} from "../packages/protocol/src/index.js";

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
      } catch (err) {
        console.error("Failed to parse message from server:", err);
      }
    };
  }

  async waitForOpen(timeoutMs: number = 3000): Promise<void> {
    if (this.ws.readyState === WebSocket.OPEN) return;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("WebSocket open timeout")), timeoutMs);
      this.ws.onopen = () => {
        clearTimeout(timer);
        resolve();
      };
      this.ws.onerror = (err) => {
        clearTimeout(timer);
        reject(err);
      };
    });
  }

  send(msg: unknown) {
    this.ws.send(JSON.stringify(msg));
  }

  async waitForMessage<T extends ServerMessage>(
    predicate: (msg: ServerMessage) => boolean,
    timeoutMs: number = 4000
  ): Promise<T> {
    // Check if message has already arrived
    const existing = this.messages.find(predicate);
    if (existing) {
      return existing as T;
    }

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            `Timeout waiting for message. Received ${this.messages.length} messages: ${JSON.stringify(
              this.messages
            )}`
          )
        );
      }, timeoutMs);

      const listener = (msg: ServerMessage) => {
        if (predicate(msg)) {
          clearTimeout(timer);
          const idx = this.messageListeners.indexOf(listener);
          if (idx !== -1) {
            this.messageListeners.splice(idx, 1);
          }
          resolve(msg as T);
        }
      };

      this.messageListeners.push(listener);
    });
  }

  async closeAndWait(): Promise<void> {
    if (this.ws.readyState === WebSocket.CLOSED) return;
    return new Promise((resolve) => {
      this.ws.onclose = () => resolve();
      this.ws.close();
    });
  }

  close() {
    this.ws.close();
  }
}

describe("ConquestServer: HTTP Endpoints", () => {
  let server: ConquestServer;
  let port: number;

  beforeAll(() => {
    server = new ConquestServer({
      port: 0,
      serverName: "test-conquest-http",
    });
    server.start();
    port = server.port;
  });

  afterAll(() => {
    server.stop();
  });

  it("GET /health returns server status, roomsCount, and playersCount", async () => {
    const res = await fetch(`http://localhost:${port}/health`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.serverName).toBe("test-conquest-http");
    expect(typeof data.roomsCount).toBe("number");
    expect(typeof data.playersCount).toBe("number");
  });

  it("GET /rooms returns active public rooms summary", async () => {
    const res = await fetch(`http://localhost:${port}/rooms`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });
});

describe("ConquestServer: Full Integration Flow", () => {
  let server: ConquestServer;
  let port: number;

  beforeAll(() => {
    server = new ConquestServer({
      port: 0,
      serverName: "test-conquest-ws",
      maxPlayersPerRoom: 2,
      defaultMap: MAP_IRONREACH,
    });
    server.start();
    port = server.port;
  });

  afterAll(() => {
    server.stop();
  });

  it("handles ping pong", async () => {
    const client = new TestClient(`ws://localhost:${port}`);
    await client.waitForOpen();

    const ping: ClientPing = {
      type: "client:ping",
      timestamp: Date.now(),
    };
    client.send(ping);

    const pong = await client.waitForMessage<ServerPong>((m) => m.type === "server:pong");
    expect(pong.timestamp).toBe(ping.timestamp);

    client.close();
  });

  it("executes the complete multiplayer game lifecycle with reconnection", async () => {
    // 1. Connect Client A
    const clientA = new TestClient(`ws://localhost:${port}`);
    await clientA.waitForOpen();

    // Client A creates the room, then receives the same welcome/session flow
    // used for every explicit room join.
    const createA: ClientCreateRoom = {
      type: "client:create_room",
      playerName: "Alice",
      visibility: "public",
      maxPlayers: 2,
    };
    clientA.send(createA);

    // Verify Client A receives server:welcome
    const welcomeA = await clientA.waitForMessage<ServerWelcome>((m) => m.type === "server:welcome");
    expect(welcomeA.sessionToken).toBeDefined();
    expect(welcomeA.playerId).toBeDefined();
    expect(welcomeA.roomCode).toBeDefined();
    expect(welcomeA.serverName).toBe("test-conquest-ws");

    const roomCode = welcomeA.roomCode;
    const aliceId = welcomeA.playerId;
    const aliceToken = welcomeA.sessionToken;

    // 2. Connect Client B
    const clientB = new TestClient(`ws://localhost:${port}`);
    await clientB.waitForOpen();

    // Client B sends client:join
    const joinB: ClientJoin = {
      type: "client:join",
      name: "Bob",
      roomCode,
    };
    clientB.send(joinB);

    // Verify Client B receives server:welcome
    const welcomeB = await clientB.waitForMessage<ServerWelcome>((m) => m.type === "server:welcome");
    expect(welcomeB.sessionToken).toBeDefined();
    expect(welcomeB.playerId).toBeDefined();
    expect(welcomeB.roomCode).toBe(roomCode);

    const bobId = welcomeB.playerId;
    const bobToken = welcomeB.sessionToken;

    // Custom rooms start when every player explicitly marks ready.
    clientA.send({ type: "client:ready", ready: true });
    clientB.send({ type: "client:ready", ready: true });

    // Verify both receive server:snapshot and game starts with Alice as active player
    const snapshotA = await clientA.waitForMessage<ServerSnapshot>(
      (m) => m.type === "server:snapshot" && m.state.phase === "deployment"
    );
    expect(snapshotA.myPlayerId).toBe(aliceId);
    expect(snapshotA.state.activePlayerIndex).toBe(0);
    expect(snapshotA.state.players[0].id).toBe(aliceId);
    expect(snapshotA.state.players[0].name).toBe("Alice");
    expect(snapshotA.state.players[1].id).toBe(bobId);
    expect(snapshotA.state.players[1].name).toBe("Bob");

    const snapshotB = await clientB.waitForMessage<ServerSnapshot>(
      (m) => m.type === "server:snapshot" && m.state.phase === "deployment"
    );
    expect(snapshotB.myPlayerId).toBe(bobId);
    expect(snapshotB.state.activePlayerIndex).toBe(0);
    expect(snapshotB.state.players[0].name).toBe("Alice");

    // Verify pending reinforcements for Player 1
    expect(snapshotA.state.pendingReinforcements).toBeGreaterThanOrEqual(3);

    // Territory ownership is shuffled per game. Find a territory Alice owns and
    // one that Bob owns that is adjacent to it for the deploy + attack steps.
    const territories = Object.values(snapshotA.state.territories);
    const aliceTerrs = territories.filter((t) => t.ownerId === aliceId);
    const aliceDeployTarget = aliceTerrs[0]!;
    // Find a territory Bob owns adjacent to an Alice territory with ≥ 2 units
    const aliceAttackSource = aliceTerrs.find((src) =>
      src.units >= 2 &&
      src.neighbors.some((n) => snapshotA.state.territories[n]?.ownerId === bobId)
    ) ?? aliceTerrs.find((src) =>
      (src.units + snapshotA.state.pendingReinforcements) >= 2 &&
      src.neighbors.some((n) => snapshotA.state.territories[n]?.ownerId === bobId)
    ) ?? aliceTerrs[0]!;
    const bobAdjacentId = aliceAttackSource.neighbors.find(
      (n) => snapshotA.state.territories[n]?.ownerId === bobId
    )!;

    // 3. Player 1 deploys units -> verify both clients receive units_deployed event
    const deployMsg: ClientDeploy = {
      type: "client:deploy",
      territoryId: aliceDeployTarget.id,
      count: snapshotA.state.pendingReinforcements,
    };
    clientA.send(deployMsg);

    const deployEventA = await clientA.waitForMessage<ServerEvent>(
      (m) => m.type === "server:event" && m.event.type === "units_deployed"
    );
    const deployEventB = await clientB.waitForMessage<ServerEvent>(
      (m) => m.type === "server:event" && m.event.type === "units_deployed"
    );

    expect(deployEventA.event.type).toBe("units_deployed");
    if (deployEventA.event.type === "units_deployed") {
      expect(deployEventA.event.playerId).toBe(aliceId);
      expect(deployEventA.event.territoryId).toBe(aliceDeployTarget.id);
      expect(deployEventA.event.count).toBe(snapshotA.state.pendingReinforcements);
    }

    expect(deployEventB.event.type).toBe("units_deployed");
    if (deployEventB.event.type === "units_deployed") {
      expect(deployEventB.event.playerId).toBe(aliceId);
      expect(deployEventB.event.territoryId).toBe(aliceDeployTarget.id);
    }

    // Both should also receive phase_changed to "attack"
    const attackPhaseEventA = await clientA.waitForMessage<ServerEvent>(
      (m) => m.type === "server:event" && m.event.type === "phase_changed" && m.event.phase === "attack"
    );
    expect(attackPhaseEventA).toBeDefined();

    // 4. Player 1 attacks Player 2 -> verify both receive attack_resolved event.
    // Use territories derived from the actual (shuffled) game state.
    const attackSourceId = aliceAttackSource.id;
    const attackMsg: ClientAttack = {
      type: "client:attack",
      sourceTerritoryId: attackSourceId,
      targetTerritoryId: bobAdjacentId,
      units: 3,
    };
    clientA.send(attackMsg);

    const attackEventA = await clientA.waitForMessage<ServerEvent>(
      (m) => m.type === "server:event" && m.event.type === "attack_resolved"
    );
    const attackEventB = await clientB.waitForMessage<ServerEvent>(
      (m) => m.type === "server:event" && m.event.type === "attack_resolved"
    );

    expect(attackEventA.event.type).toBe("attack_resolved");
    if (attackEventA.event.type === "attack_resolved") {
      expect(attackEventA.event.attackerId).toBe(aliceId);
      expect(attackEventA.event.defenderId).toBe(bobId);
      expect(attackEventA.event.sourceTerritoryId).toBe(attackSourceId);
      expect(attackEventA.event.targetTerritoryId).toBe(bobAdjacentId);
      expect(attackEventA.event.attackerRolls.length).toBeGreaterThan(0);
      expect(attackEventA.event.defenderRolls.length).toBeGreaterThan(0);
    }

    expect(attackEventB.event.type).toBe("attack_resolved");
    if (attackEventB.event.type === "attack_resolved") {
      expect(attackEventB.event.attackerId).toBe(aliceId);
      expect(attackEventB.event.defenderId).toBe(bobId);
    }

    // 5. Player 1 skips attack to enter fortify, then ends turn -> verify Player 2 becomes active
    const skipPhaseMsg: ClientSkipPhase = {
      type: "client:skip_phase",
    };
    clientA.send(skipPhaseMsg);

    await clientA.waitForMessage<ServerEvent>(
      (m) => m.type === "server:event" && m.event.type === "phase_changed" && m.event.phase === "fortify"
    );

    const endTurnMsg: ClientEndTurn = {
      type: "client:end_turn",
    };
    clientA.send(endTurnMsg);

    const turnEndedEventA = await clientA.waitForMessage<ServerEvent>(
      (m) => m.type === "server:event" && m.event.type === "turn_ended"
    );
    const turnEndedEventB = await clientB.waitForMessage<ServerEvent>(
      (m) => m.type === "server:event" && m.event.type === "turn_ended"
    );

    if (turnEndedEventA.event.type === "turn_ended") {
      expect(turnEndedEventA.event.previousPlayerId).toBe(aliceId);
      expect(turnEndedEventA.event.nextPlayerId).toBe(bobId);
    }
    if (turnEndedEventB.event.type === "turn_ended") {
      expect(turnEndedEventB.event.previousPlayerId).toBe(aliceId);
      expect(turnEndedEventB.event.nextPlayerId).toBe(bobId);
    }

    // Bob receives phase_changed to deployment for his turn
    const bobDeployPhase = await clientB.waitForMessage<ServerEvent>(
      (m) =>
        m.type === "server:event" &&
        m.event.type === "phase_changed" &&
        m.event.phase === "deployment" &&
        m.event.activePlayerId === bobId
    );
    expect(bobDeployPhase).toBeDefined();

    // 6. Player 2 disconnects (closes WebSocket)
    await clientB.closeAndWait();

    // Verify Player 1 receives player_left event
    const playerLeftEvent = await clientA.waitForMessage<ServerEvent>(
      (m) => m.type === "server:event" && m.event.type === "player_left" && m.event.playerId === bobId
    );
    expect(playerLeftEvent.event.type).toBe("player_left");
    if (playerLeftEvent.event.type === "player_left") {
      expect(playerLeftEvent.event.playerId).toBe(bobId);
    }

    // 7. Player 2 reconnects with their sessionToken
    const clientB_reconnected = new TestClient(`ws://localhost:${port}`);
    await clientB_reconnected.waitForOpen();

    const reconnectMsg: ClientJoin = {
      type: "client:join",
      name: "Bob",
      roomCode,
      sessionToken: bobToken,
    };
    clientB_reconnected.send(reconnectMsg);

    // Verify Player 2 receives server:welcome
    const welcomeB_recon = await clientB_reconnected.waitForMessage<ServerWelcome>(
      (m) => m.type === "server:welcome"
    );
    expect(welcomeB_recon.sessionToken).toBe(bobToken);
    expect(welcomeB_recon.playerId).toBe(bobId);
    expect(welcomeB_recon.roomCode).toBe(roomCode);

    // Verify Player 2 receives full server:snapshot with the exact current game state and is active!
    const snapshotB_recon = await clientB_reconnected.waitForMessage<ServerSnapshot>(
      (m) => m.type === "server:snapshot"
    );
    expect(snapshotB_recon.myPlayerId).toBe(bobId);
    expect(snapshotB_recon.state.activePlayerIndex).toBe(1);
    expect(snapshotB_recon.state.players[snapshotB_recon.state.activePlayerIndex].id).toBe(bobId);
    expect(snapshotB_recon.state.phase).toBe("deployment");

    const reconnectedPlayer = snapshotB_recon.state.players.find((p) => p.id === bobId);
    expect(reconnectedPlayer?.connected).toBe(true);

    // Verify Player 1 receives player_reconnected event
    const playerReconnectedEvent = await clientA.waitForMessage<ServerEvent>(
      (m) =>
        m.type === "server:event" &&
        m.event.type === "player_reconnected" &&
        m.event.playerId === bobId
    );
    expect(playerReconnectedEvent).toBeDefined();

    // Clean up connections
    clientA.close();
    clientB_reconnected.close();
  });

  it("ignores sessionToken if session.playerName does not match join name and treats as fresh join", async () => {
    // 1. Client A creates an explicit room as Alice
    const clientA = new TestClient(`ws://localhost:${port}`);
    await clientA.waitForOpen();
    clientA.send({
      type: "client:create_room",
      playerName: "Alice",
      visibility: "public",
      maxPlayers: 2,
    });
    const welcomeA = await clientA.waitForMessage<ServerWelcome>((m) => m.type === "server:welcome");
    const aliceToken = welcomeA.sessionToken;
    const aliceId = welcomeA.playerId;
    const roomCode = welcomeA.roomCode;

    // 2. Client B tries to join with Alice's session token but with name "Bob"
    const clientB = new TestClient(`ws://localhost:${port}`);
    await clientB.waitForOpen();
    clientB.send({
      type: "client:join",
      name: "Bob",
      roomCode,
      sessionToken: aliceToken,
    });

    const welcomeB = await clientB.waitForMessage<ServerWelcome>((m) => m.type === "server:welcome");
    // Should NOT have reconnected as Alice!
    expect(welcomeB.playerId).not.toBe(aliceId);
    expect(welcomeB.sessionToken).not.toBe(aliceToken);
    expect(welcomeB.roomCode).toBe(roomCode);

    // Verify snapshot shows 2 players (Alice and Bob)
    const snapshotB = await clientB.waitForMessage<ServerSnapshot>((m) => m.type === "server:snapshot");
    expect(snapshotB.state.players.length).toBe(2);
    const names = snapshotB.state.players.map((p) => p.name).sort();
    expect(names).toEqual(["Alice", "Bob"]);

    clientA.close();
    clientB.close();
  });
});

// ── cardMode end-to-end ────────────────────────────────────────────────────
describe("ConquestServer: cardMode create_room end-to-end", () => {
  let server: ConquestServer;
  let port: number;

  beforeAll(() => {
    server = new ConquestServer({
      port: 0,
      serverName: "test-cardmode",
      defaultMap: MAP_IRONREACH,
    });
    server.start();
    port = server.port;
  });

  afterAll(() => {
    server.stop();
  });

  it("cardMode=escalating is carried from client:create_room to room summary and game state", async () => {
    const client = new TestClient(`ws://localhost:${port}`);
    await client.waitForOpen();

    client.send({
      type: "client:create_room",
      playerName: "TestPlayer",
      visibility: "public",
      maxPlayers: 2,
      cardMode: "escalating",
    } as ClientCreateRoom);

    const welcome = await client.waitForMessage<ServerWelcome>((m) => m.type === "server:welcome");
    expect(welcome.roomCode).toBeDefined();

    // Room summary from HTTP should include cardMode
    const resp = await fetch(`http://localhost:${port}/rooms`);
    const rooms = await resp.json() as Array<{ cardMode?: string; roomCode: string }>;
    const room = rooms.find((r) => r.roomCode === welcome.roomCode);
    expect(room).toBeDefined();
    expect(room?.cardMode).toBe("escalating");

    client.close();
  });

  it("cardMode=off disables cards: publicCards.mode is 'off' in game state", async () => {
    // Create a room with cardMode=off and 2 players, start the game
    const clientA = new TestClient(`ws://localhost:${port}`);
    await clientA.waitForOpen();
    clientA.send({
      type: "client:create_room",
      playerName: "PlayerA",
      visibility: "unlisted",
      maxPlayers: 2,
      cardMode: "off",
    } as ClientCreateRoom);

    const welcomeA = await clientA.waitForMessage<ServerWelcome>((m) => m.type === "server:welcome");
    const roomCode = welcomeA.roomCode;

    const clientB = new TestClient(`ws://localhost:${port}`);
    await clientB.waitForOpen();
    clientB.send({ type: "client:join", name: "PlayerB", roomCode });

    // Both ready → game starts
    await clientA.waitForMessage<ServerSnapshot>((m) => m.type === "server:snapshot");
    await clientB.waitForMessage<ServerSnapshot>((m) => m.type === "server:snapshot");

    clientA.send({ type: "client:ready", ready: true });
    clientB.send({ type: "client:ready", ready: true });

    const gameSnap = await clientA.waitForMessage<ServerSnapshot>(
      (m) => m.type === "server:snapshot" && m.state.phase !== "lobby"
    );
    expect(gameSnap.state.publicCards?.mode).toBe("off");

    clientA.close();
    clientB.close();
  });
});
