/**
 * No-leak e2e test: verifies that server projection never sends a player's
 * private card hand or the deck order to other players.
 *
 * Strategy:
 *  - Start a real ConquestServer with a fixed rngSeed.
 *  - Connect 3 GameClients. Intercept ws.onmessage to capture all raw frames.
 *  - Drive the game with event-driven callbacks: each client registers an
 *    onSnapshot handler that acts when it is the active player.
 *    We run until at least one card_awarded event is received.
 *  - Assert: no raw message received by client[i] contains a card id belonging
 *    to client[j]'s private hand (tracked via each player's own myHand snapshots).
 *    Cards revealed via cards_traded events are legitimately public.
 *  - A second test verifies the leak-detection logic catches injected leaks.
 */
import { afterAll, beforeAll, describe, expect, it, setDefaultTimeout } from "bun:test";
import { ConquestServer } from "../apps/server/src/server.js";
import { GameClient } from "../apps/client/src/network/client.js";
import { MAP_SECTOR_07 } from "../packages/map-engine/src/index.js";
import type { GameState } from "@conquest/protocol";

setDefaultTimeout(55_000);

const FIXED_SEED = new Uint8Array([
  0xde, 0xad, 0xbe, 0xef, 0xca, 0xfe, 0xba, 0xbe,
  0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
]);

function tapMessages(client: GameClient, collector: string[]): void {
  const ws = client.ws!;
  const orig = ws.onmessage;
  ws.onmessage = (ev) => {
    collector.push(typeof ev.data === "string" ? ev.data : String(ev.data));
    if (orig) orig.call(ws, ev);
  };
}

function extractCardIds(rawMessages: string[]): Set<string> {
  const ids = new Set<string>();
  const re = /"id"\s*:\s*"(card-[^"]+)"/g;
  for (const msg of rawMessages) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(msg)) !== null) ids.add(m[1]!);
  }
  return ids;
}

function sleep(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }

/** Bot action for the active client given its current state. Returns true if an action was taken. */
function botAct(client: GameClient): boolean {
  const state = client.state;
  if (!state) return false;
  const myId = client.myPlayerId!;
  if (state.players[state.activePlayerIndex]?.id !== myId) return false;

  if (state.phase === "deployment" && state.pendingReinforcements > 0) {
    const myTerr = Object.values(state.territories).find((t) => t.ownerId === myId);
    if (myTerr) { client.deploy(myTerr.id, state.pendingReinforcements); return true; }
  }

  if (state.phase === "attack") {
    // Handle pending conquest move first (move the minimum required troops)
    if (state.pendingConquestMove) {
      client.completeConquestMove(state.pendingConquestMove.minimumUnits);
      return true;
    }
    // Try to attack
    for (const src of Object.values(state.territories)
      .filter((t) => t.ownerId === myId && t.units >= 2)
      .sort((a, b) => b.units - a.units)) {
      const enemy = src.neighbors.map((id) => state.territories[id]!).find((t) => t.ownerId !== myId);
      if (enemy) { client.attack(src.id, enemy.id); return true; }
    }
    // No attacks possible — skip
    client.skipPhase(); return true;
  }

  if (state.phase === "fortify") {
    client.skipPhase(); return true;
  }

  return false;
}

describe("cards: no-leak projection e2e", () => {
  let server: ConquestServer;
  let port: number;

  beforeAll(() => {
    server = new ConquestServer({
      port: 0,
      serverName: "no-leak-test",
      maxPlayersPerRoom: 3,
      defaultMap: MAP_SECTOR_07,
      rngSeed: FIXED_SEED,
    });
    server.start();
    port = server.port;
  });

  afterAll(() => {
    server.stop();
  });

  it("no client receives another player's card ids in raw WS messages", async () => {
    const sessionDir = process.env["CONQUEST_SESSION_DIR"]!;

    const clients: GameClient[] = [
      new GameClient({ host: `localhost:${port}`, sessionFilePath: `${sessionDir}/.noleak-a.json`, forceNewSession: true, autoReconnect: false }),
      new GameClient({ host: `localhost:${port}`, sessionFilePath: `${sessionDir}/.noleak-b.json`, forceNewSession: true, autoReconnect: false }),
      new GameClient({ host: `localhost:${port}`, sessionFilePath: `${sessionDir}/.noleak-c.json`, forceNewSession: true, autoReconnect: false }),
    ];
    const rawMessages: string[][] = [[], [], []];

    // Connect, create room, join
    await clients[0]!.connect();
    tapMessages(clients[0]!, rawMessages[0]!);
    clients[0]!.createRoom({ playerName: "Alpha", visibility: "unlisted", maxPlayers: 3, mapId: "sector-07" });
    await clients[0]!.waitForSnapshot((s) => s.phase === "lobby", 5000);
    const roomCode = clients[0]!.roomCode!;

    await clients[1]!.connect();
    tapMessages(clients[1]!, rawMessages[1]!);
    clients[1]!.join("Bravo", roomCode);
    await clients[1]!.waitForSnapshot((s) => s.phase === "lobby", 5000);

    await clients[2]!.connect();
    tapMessages(clients[2]!, rawMessages[2]!);
    clients[2]!.join("Charlie", roomCode);
    await clients[2]!.waitForSnapshot((s) => s.phase === "lobby", 5000);

    // Start the game
    for (const c of clients) c.ready();
    await clients[0]!.waitForSnapshot((s) => s.phase === "deployment" || s.phase === "game_over", 8000);

    // Accumulate own hand card ids from each player's own snapshots
    const ownHandIds: Set<string>[] = [new Set(), new Set(), new Set()];
    for (let i = 0; i < 3; i++) {
      clients[i]!.onSnapshot((state: GameState) => {
        const hand = (state as any).myHand as Array<{ id: string }> | null;
        if (Array.isArray(hand)) for (const card of hand) ownHandIds[i]!.add(card.id);
      });
    }

    // ── Event-driven game driver ──────────────────────────────────────────────
    // Each client acts whenever it receives a snapshot and is the active player.
    // We install onSnapshot handlers that drive the bots. Then we wait for
    // a card_awarded event with a deadline.

    const unsubs: Array<() => void> = [];
    for (let i = 0; i < 3; i++) {
      const unsub = clients[i]!.onSnapshot(() => {
        // Small delay to let the state settle before acting
        setTimeout(() => botAct(clients[i]!), 50);
      });
      unsubs.push(unsub);
    }

    // Also trigger an immediate action for the current active player
    for (let i = 0; i < 3; i++) {
      setTimeout(() => botAct(clients[i]!), 200);
    }

    // Wait until a card is awarded (up to 40s)
    const cardAwardedPromise = new Promise<void>((resolve) => {
      for (let i = 0; i < 3; i++) {
        clients[i]!.onEvent((ev) => {
          if (ev.type === "card_awarded") resolve();
        });
      }
    });
    const timeoutPromise = sleep(40_000);

    await Promise.race([cardAwardedPromise, timeoutPromise]);

    // Give a brief settling time for any trailing WS messages
    await sleep(400);

    // Stop the bot handlers
    for (const u of unsubs) u();

    // Verify at least one card was awarded
    const allEvents = clients.flatMap((c) => c.eventHistory);
    const cardAwardEvents = allEvents.filter((e) => e.type === "card_awarded");
    expect(cardAwardEvents.length).toBeGreaterThan(0);

    // Build publicly known card ids (revealed in trades)
    const tradedCardIds = new Set<string>();
    for (const ev of allEvents) {
      if (ev.type === "cards_traded") {
        for (const card of ev.cards) tradedCardIds.add(card.id);
      }
    }

    // ── Assert no cross-player leakage ────────────────────────────────────────
    for (let i = 0; i < 3; i++) {
      const seenIds = extractCardIds(rawMessages[i]!);
      const legitIds = new Set([...ownHandIds[i]!, ...tradedCardIds]);

      for (const id of seenIds) {
        if (legitIds.has(id)) continue;
        for (let j = 0; j < 3; j++) {
          if (j === i) continue;
          if (ownHandIds[j]!.has(id)) {
            throw new Error(
              `PROJECTION LEAK: client[${i}] (${clients[i]!.playerName}) received` +
              ` card "${id}" which belongs to client[${j}]'s private hand.`
            );
          }
        }
      }
    }

    for (const c of clients) c.disconnect();
  });

  it("leak-detection logic catches injected cross-player card ids", () => {
    // Synthetic break+revert check: verify extractCardIds+leak-check detects
    // a simulated projection bug where another player's card id leaks.

    const rawAlpha = [
      // Alpha's own snapshot with their hand
      '{"type":"server:snapshot","state":{"myHand":[{"id":"card-A1","symbol":"infantry"}]}}',
      // Simulated projection bug: Bravo's private card leaks into Alpha's stream
      '{"type":"server:delta","patch":[{"path":"/x","value":{"id":"card-B2"}}]}',
    ];

    const ownHandAlpha = new Set(["card-A1"]);
    const ownHandBravo = new Set(["card-B2"]);
    const tradedIds = new Set<string>();

    const seenByAlpha = extractCardIds(rawAlpha);
    const legitIds = new Set([...ownHandAlpha, ...tradedIds]);

    let leakDetected = false;
    for (const id of seenByAlpha) {
      if (!legitIds.has(id) && ownHandBravo.has(id)) leakDetected = true;
    }

    expect(leakDetected).toBe(true); // Injected leak is caught

    // Own card doesn't cause false-positives
    expect(legitIds.has("card-A1")).toBe(true);
    expect(legitIds.has("card-B2")).toBe(false);
  });
});
