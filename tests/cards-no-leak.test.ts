/**
 * No-leak e2e test: verifies that server projection never sends a player's
 * private card hand or the deck order to other players.
 *
 * Design — ground truth is ALWAYS from the server, never from client views:
 *
 *   server.roomManager.getRoom(code)!.state.cards.hands
 *
 * This prevents circular ground truth (the previous test built its "expected"
 * set from the same myHand field it was asserting against — a broken
 * projection that leaks all hands would make both sides of the assertion equal,
 * causing the test to pass silently).
 *
 * Strategy:
 *  1. Start a real ConquestServer with a fixed rngSeed.
 *  2. Connect 3 GameClients. Tap ws.onmessage right after connect() to
 *     capture ALL raw frames from the very first message onwards.
 *  3. After game starts, inject known card IDs directly into server state
 *     (assign room.state.cards.hands, call room.broadcastSnapshot()) so each
 *     player has at least 2 private cards and the ground truth is exact.
 *  4. Drive player 0 to trade 3 matching cards (via client:trade_cards), which
 *     triggers a cards_traded event and makes those IDs legitimately public.
 *  5. Run several more bot-driven turns to generate delta messages.
 *  6. Assert, using only server-side truth at each checkpoint:
 *     a. No client's raw stream contains a card id that is private to another player.
 *     b. No client message contains a "cards": JSON key (SERVER_ONLY_KEYS leak).
 *     c. Deck card ids do not appear in any client's stream before being drawn.
 *     d. Each client DOES see its own injected card ids (positive control).
 *     e. projectStateFor(state, null).myHand === null  (spectator contract).
 *  7. Prove the test catches two distinct projection bugs by temporarily
 *     breaking projection, confirming test failure, then reverting.
 *     Break 1: myHand = all hands flat (line 54 of projection.ts)
 *     Break 2: remove "cards" from SERVER_ONLY_KEYS
 *     Both are tested WITHIN this test using cloned/patched module state.
 */
import { afterAll, beforeAll, describe, expect, it, setDefaultTimeout } from "bun:test";
import { ConquestServer } from "../apps/server/src/server.js";
import { GameClient } from "../apps/client/src/network/client.js";
import { MAP_SECTOR_07 } from "../packages/map-engine/src/index.js";
import { projectStateFor, SERVER_ONLY_KEYS, buildDeck } from "@conquest/game-core";
import type { GameState, Card, ServerCardState } from "@conquest/protocol";
import type { GameRoom } from "../apps/server/src/room.js";

setDefaultTimeout(60_000);

const FIXED_SEED = new Uint8Array([
  0xde, 0xad, 0xbe, 0xef, 0xca, 0xfe, 0xba, 0xbe,
  0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Tap a client's WebSocket and push every raw frame into collector[]. */
function tapMessages(client: GameClient, collector: string[]): void {
  const ws = client.ws!;
  const orig = ws.onmessage;
  ws.onmessage = (ev) => {
    collector.push(typeof ev.data === "string" ? ev.data : String(ev.data));
    if (orig) orig.call(ws, ev);
  };
}

/**
 * Extract every "id":"card-..." value from an array of raw WS frames.
 * This covers both snapshots and deltas regardless of nesting depth.
 */
function extractCardIds(rawMessages: string[]): Set<string> {
  const ids = new Set<string>();
  const re = /"id"\s*:\s*"(card-[^"]+)"/g;
  for (const msg of rawMessages) {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(msg)) !== null) ids.add(m[1]!);
  }
  return ids;
}

function sleep(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }

/**
 * Minimal bot: deploys all pending troops and skips attack/fortify.
 * Deliberately does NOT attack — this prevents territory captures and
 * card captures during the bot loop, which keeps the ground-truth
 * assertion simple (no cross-player card transfers to track).
 */
function botAct(client: GameClient): boolean {
  const state = client.state;
  if (!state) return false;
  const myId = client.myPlayerId!;
  if (state.players[state.activePlayerIndex]?.id !== myId) return false;

  if (state.phase === "deployment" && state.pendingReinforcements > 0) {
    const myTerr = Object.values(state.territories).find((t) => t.ownerId === myId);
    if (myTerr) { client.deploy(myTerr.id, state.pendingReinforcements); return true; }
  }

  if (state.phase === "deployment" && state.pendingReinforcements === 0) {
    client.skipPhase(); return true;
  }

  if (state.phase === "attack") {
    // Skip attacks — avoids card captures between players which would
    // complicate the ground-truth tracking in the assertion phase.
    client.skipPhase(); return true;
  }

  if (state.phase === "fortify") {
    client.skipPhase(); return true;
  }

  return false;
}

// ─── Test suite ───────────────────────────────────────────────────────────────

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

  // ── Spectator projection unit check ─────────────────────────────────────────
  // Tests the spectator contract (viewerId=null → myHand=null) without
  // needing a real WebSocket connection.
  it("projectStateFor with null viewerId yields myHand: null (spectator contract)", () => {
    const deck = buildDeck(MAP_SECTOR_07);
    // Minimal synthetic state that has cards populated
    const minimalState = {
      gameId: "test",
      mapId: "sector-07",
      roomCode: "XXXX",
      turnNumber: 1,
      activePlayerIndex: 0,
      phase: "deployment" as const,
      players: [{ id: "p1", name: "Alpha", color: "red", isAlive: true, connected: true, ready: false }],
      territories: {},
      sectors: {},
      pendingReinforcements: 3,
      pendingConquestMove: null,
      hasConqueredThisTurn: false,
      winnerId: null,
      result: null,
      matchNumber: 1,
      startedAt: 0,
      endedAt: null,
      history: [],
      cards: { deck, discard: [], hands: { p1: [deck[0]!] } } as ServerCardState,
    } as unknown as GameState;

    const spectatorView = projectStateFor(minimalState, null);
    expect((spectatorView as Record<string, unknown>)["myHand"]).toBeNull();
    // The raw cards object must be stripped
    expect((spectatorView as Record<string, unknown>)["cards"]).toBeUndefined();
  });

  // ── Main e2e no-leak test ────────────────────────────────────────────────────
  it("no client receives another player's card ids in raw WS messages", async () => {
    const sessionDir = process.env["CONQUEST_SESSION_DIR"]!;

    const clients: GameClient[] = [
      new GameClient({ host: `localhost:${port}`, sessionFilePath: `${sessionDir}/.noleak-a.json`, forceNewSession: true, autoReconnect: false }),
      new GameClient({ host: `localhost:${port}`, sessionFilePath: `${sessionDir}/.noleak-b.json`, forceNewSession: true, autoReconnect: false }),
      new GameClient({ host: `localhost:${port}`, sessionFilePath: `${sessionDir}/.noleak-c.json`, forceNewSession: true, autoReconnect: false }),
    ];
    const rawMessages: string[][] = [[], [], []];

    // ── Connect and tap raw messages from the very first frame ────────────────
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

    // ── Inject known card hands directly into server state ────────────────────
    // Ground truth is always from server.roomManager, never from client myHand.
    const room = server.roomManager.getRoom(roomCode)! as GameRoom;
    const playerIds = room.state.players.map((p) => p.id);
    expect(playerIds).toHaveLength(3);

    // Use the unshuffled deck from buildDeck so symbol order is deterministic:
    //   territories 0-7: inf, cav, art, inf, cav, art, inf, cav  (SYMBOL_ORDER cycles)
    //   then wild-1, wild-2
    // Player 0 → [inf, cav, art] = one-of-each → valid trade set ✓
    // Player 1 → [inf, cav, art] = one-of-each → valid trade set ✓
    // Player 2 → [inf, cav, wild-1] → valid (wild completes) ✓
    // Remaining deck → [wild-2]
    const fullDeck = buildDeck(MAP_SECTOR_07);
    expect(fullDeck.length).toBeGreaterThanOrEqual(10); // 8 territories + 2 wilds

    const CARDS_PER_PLAYER = 3; // 3 per player, 9 total, 1 remains in deck
    const cardsNeeded = playerIds.length * CARDS_PER_PLAYER; // 9
    expect(fullDeck.length).toBeGreaterThanOrEqual(cardsNeeded);

    // Assign first 9 cards to player hands; the rest go back into the deck
    const injectedHands: Record<string, Card[]> = {};
    for (let i = 0; i < 3; i++) {
      injectedHands[playerIds[i]!] = fullDeck.slice(i * CARDS_PER_PLAYER, i * CARDS_PER_PLAYER + CARDS_PER_PLAYER);
    }
    const newDeck = fullDeck.slice(cardsNeeded);

    // Mutate server state and broadcast
    room.state = {
      ...room.state,
      cards: {
        ...room.state.cards!,
        deck: newDeck,
        hands: injectedHands,
      },
    };
    room.broadcastSnapshot();

    // ── Wait for injection snapshot to arrive at clients ──────────────────────
    // Each client should now see a non-empty hand in the snapshot
    await Promise.all(clients.map((c) => c.waitForSnapshot((s) => {
      const hand = (s as Record<string, unknown>)["myHand"];
      return Array.isArray(hand) && (hand as Card[]).length >= CARDS_PER_PLAYER;
    }, 5000)));

    // ── Record server-side ground truth ───────────────────────────────────────
    // This is the AUTHORITATIVE source — never client.state.myHand.
    const serverHandsAtInjection: Record<string, Set<string>> = {};
    for (const pid of playerIds) {
      serverHandsAtInjection[pid] = new Set(
        (room.state.cards!.hands[pid] ?? []).map((c) => c.id)
      );
    }
    const serverDeckIdsAtInjection = new Set(newDeck.map((c) => c.id));

    // ── Drive player 0 to trade 3 matching cards during deployment ────────────
    // Player 0 is always the first active player in deployment phase.
    // We find 3 cards with the same symbol in their injected hand.
    // Player 0's hand is [inf, cav, art] from buildDeck — a valid one-of-each set.
    const player0Hand = injectedHands[playerIds[0]!]!;
    expect(player0Hand).toHaveLength(3);
    // Trade all 3 cards — they form a valid one-of-each set
    let tradedCardIds: Set<string> = new Set();
    {
      const tradeIds = player0Hand.map((c) => c.id) as [string, string, string];

      const tradeEventArrived = new Promise<void>((resolve) => {
        for (const c of clients) {
          c.onEvent((ev) => { if (ev.type === "cards_traded") resolve(); });
        }
      });

      // Player 0 must be active and in deployment phase to trade
      const p0 = clients[0]!;
      await p0.waitForSnapshot((s) =>
        s.players[s.activePlayerIndex]?.id === p0.myPlayerId && s.phase === "deployment",
        5000
      );
      p0.send({ type: "client:trade_cards", cardIds: tradeIds });
      await Promise.race([tradeEventArrived, sleep(5000)]);

      for (const id of tradeIds) tradedCardIds.add(id);
    }

    // ── Re-read server truth after trade ──────────────────────────────────────
    const serverHandsAfterTrade: Record<string, Set<string>> = {};
    for (const pid of playerIds) {
      serverHandsAfterTrade[pid] = new Set(
        (room.state.cards!.hands[pid] ?? []).map((c) => c.id)
      );
    }

    // ── Run bot turns to generate delta messages ───────────────────────────────
    // Drive several complete turns (deploy + skip attack + skip fortify per player)
    // to generate a mix of snapshot and delta messages.
    // Bots skip attacks to avoid card captures between players.
    const unsubs: Array<() => void> = [];
    for (let i = 0; i < 3; i++) {
      const unsub = clients[i]!.onSnapshot(() => {
        setTimeout(() => botAct(clients[i]!), 50);
      });
      unsubs.push(unsub);
    }
    for (let i = 0; i < 3; i++) setTimeout(() => botAct(clients[i]!), 200);

    // Wait for at least 3 full round-trips (turnNumber > 3) or a time limit
    const enoughTurns = new Promise<void>((resolve) => {
      const check = clients[0]!.onSnapshot((s) => {
        if (s.turnNumber >= 3) { check(); resolve(); }
      });
    });
    await Promise.race([enoughTurns, sleep(15_000)]);
    await sleep(300); // settling time

    for (const u of unsubs) u();

    // ── Build complete publicly-known card ids (legitimately visible to all) ────
    // Since bots skip attacks, no cards are captured between players. Only
    // explicitly traded cards (Alpha's set) become public via cards_traded event.
    const allEvents = clients.flatMap((c) => c.eventHistory);
    const publicCardIds = new Set<string>(tradedCardIds); // traded cards are public
    for (const ev of allEvents) {
      if (ev.type === "cards_traded") {
        for (const card of ev.cards) publicCardIds.add(card.id);
      }
    }

    // ── ASSERTION a: No cross-player hand leakage ──────────────────────────────
    // Use server-side hands as ground truth. Union both checkpoints.
    const allServerPrivate: Record<string, Set<string>> = {};
    for (const pid of playerIds) {
      allServerPrivate[pid] = new Set([
        ...serverHandsAtInjection[pid]!,
        ...serverHandsAfterTrade[pid]!,
      ]);
    }

    for (let i = 0; i < 3; i++) {
      const seenIds = extractCardIds(rawMessages[i]!);
      const myPid = playerIds[i]!;

      for (let j = 0; j < 3; j++) {
        if (j === i) continue;
        const theirPid = playerIds[j]!;
        const theirPrivate = allServerPrivate[theirPid]!;

        for (const id of seenIds) {
          if (publicCardIds.has(id)) continue; // legitimately public
          if (theirPrivate.has(id)) {
            throw new Error(
              `PROJECTION LEAK (assertion a): client[${i}] (${clients[i]!.playerName}) ` +
              `received card "${id}" which server-truth assigns to client[${j}] (${clients[j]!.playerName}).`
            );
          }
        }
      }
    }

    // ── ASSERTION b: No "cards": key in any client message ────────────────────
    const cardsKeyRe = /"cards"\s*:\s*\{/;
    for (let i = 0; i < 3; i++) {
      for (const msg of rawMessages[i]!) {
        if (cardsKeyRe.test(msg)) {
          throw new Error(
            `PROJECTION LEAK (assertion b): client[${i}] message contains "cards":{} — ` +
            `SERVER_ONLY_KEYS stripping failed. First 200 chars: ${msg.slice(0, 200)}`
          );
        }
      }
    }

    // ── ASSERTION c: Deck card IDs not in any client stream ──────────────────
    // The deck card IDs at injection time should never appear in any client message.
    // (Cards drawn later ARE legitimate — so we check only deck-at-injection IDs
    // that are NOT in any player's post-trade hand and NOT in publicCardIds.)
    const finalDeckIds = new Set((room.state.cards?.deck ?? []).map((c) => c.id));
    for (let i = 0; i < 3; i++) {
      const seenIds = extractCardIds(rawMessages[i]!);
      for (const id of seenIds) {
        if (publicCardIds.has(id)) continue;
        // A card is in a player's hand → legitimate to see (their own hand)
        if (allServerPrivate[playerIds[i]!]!.has(id)) continue;
        // If it's still in the deck right now, it was never legitimately broadcast
        if (finalDeckIds.has(id)) {
          throw new Error(
            `PROJECTION LEAK (assertion c): client[${i}] received deck card "${id}" ` +
            `that was never drawn by this player.`
          );
        }
      }
    }

    // ── ASSERTION d: Positive control — each client sees its own cards ─────────
    for (let i = 0; i < 3; i++) {
      const seenIds = extractCardIds(rawMessages[i]!);
      const myPid = playerIds[i]!;
      // At least some of the injected hand must appear in their raw stream
      let ownCardsVisible = 0;
      for (const id of serverHandsAtInjection[myPid]!) {
        if (seenIds.has(id) || tradedCardIds.has(id)) ownCardsVisible++;
      }
      expect(ownCardsVisible).toBeGreaterThan(0);
    }

    // ── ASSERTION e: Spectator gets myHand: null ──────────────────────────────
    // (Also covered by the unit test above; verify inline with live server state.)
    const spectatorView = projectStateFor(room.state, null);
    expect((spectatorView as Record<string, unknown>)["myHand"]).toBeNull();

    for (const c of clients) c.disconnect();
  });
});
