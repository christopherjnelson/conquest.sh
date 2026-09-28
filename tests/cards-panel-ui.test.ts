/**
 * CardsPanel render tests:
 *  - Hand with suggestions renders card symbols and auto-select
 *  - Forced-trade banner appears when pendingForcedTrade is set
 *  - Selection state: selected cards are highlighted
 *  - Key [2] toggles the Cards panel (via App keyboard)
 *  - Key [Esc] closes the Cards panel
 *  - Deploy/attack keys show a helpful toast while forced trade is pending
 */
import { describe, expect, it } from "bun:test";
import { waitForFrame } from "./helpers/render-wait.js";
// @ts-ignore Test renderer from client workspace
import React from "../apps/client/node_modules/react/index.js";
// @ts-ignore
import { act } from "../apps/client/node_modules/react/index.js";
// @ts-ignore
import { testRender } from "../apps/client/node_modules/@opentui/react/test-utils.js";

import { createInitialGameState } from "../packages/game-core/src/index.js";
import { MAP_GRID_IRONREACH } from "../packages/map-engine/src/index.js";
import type { GameState, Player } from "../packages/protocol/src/index.js";
import { CardsPanel } from "../apps/client/src/ui/CardsPanel.js";
import { App } from "../apps/client/src/ui/App.js";

const p1: Player = { id: "p1", name: "Alpha", colorIndex: 0, colorHex: "#00d2ff", connected: true, isAlive: true, ready: true };
const p2: Player = { id: "p2", name: "Bravo", colorIndex: 1, colorHex: "#ffaa00", connected: true, isAlive: true, ready: true };

/** Build a minimal GameState with cards enabled and a known hand. */
function stateWithCards(opts: {
  phase?: GameState["phase"];
  hand?: Array<{ id: string; symbol: "infantry" | "cavalry" | "artillery" | "wild"; territoryId?: string }>;
  forcedTrade?: boolean;
  pendingReinforcements?: number;
}): GameState {
  const { phase = "deployment", hand = [], forcedTrade = false, pendingReinforcements = 3 } = opts;
  const base = createInitialGameState(
    "cards-panel-test", "TEST", [p1, p2], MAP_GRID_IRONREACH,
    3, undefined, 1, "escalating"
  );
  return {
    ...base,
    phase,
    activePlayerIndex: 0,
    pendingReinforcements,
    cards: {
      deck: [],
      discard: [],
      hands: { p1: hand as any, p2: [] },
    },
    publicCards: {
      mode: "escalating",
      deckCount: 18,
      discardCount: 0,
      setsTradedCount: 0,
      nextTradeValue: 4,
      playerHandCounts: { p1: hand.length, p2: 0 },
      pendingForcedTrade: forcedTrade
        ? { playerId: "p1", phase: phase as any }
        : null,
    },
    myHand: hand as any,
  };
}

// ── CardsPanel direct render ─────────────────────────────────────────────────

describe("CardsPanel: direct render", () => {
  it("renders hand cards with symbol labels", async () => {
    const hand = [
      { id: "card-A1", symbol: "infantry" as const, territoryId: "A1" },
      { id: "card-B1", symbol: "cavalry" as const, territoryId: "B1" },
      { id: "card-wild-1", symbol: "wild" as const },
    ];
    const state = stateWithCards({ hand });

    let tradeCallArgs: [string, string, string] | null = null;
    const setup = await testRender(
      React.createElement(CardsPanel, {
        state,
        myPlayerId: "p1",
        onTradeCards: (ids: [string, string, string]) => { tradeCallArgs = ids; },
      }),
      { width: 80, height: 30 },
    );
    await act(async () => { await setup.renderOnce(); });

    const frame = setup.captureCharFrame();
    expect(frame).toContain("INF"); // infantry symbol
    expect(frame).toContain("CAV"); // cavalry symbol
    expect(frame).toContain("WLD"); // wild symbol
    expect(frame).toContain("A1"); // territory id for infantry card
    expect(frame).toContain("B1"); // territory id for cavalry card
    expect(frame).toContain("Wild"); // wild card label
    expect(frame).toContain("Next trade:"); // escalation indicator
    expect(frame).toContain("4 armies"); // first escalation value

    await act(async () => { setup.renderer.destroy(); });
  });

  it("shows forced-trade banner when pendingForcedTrade is set", async () => {
    const hand = [
      { id: "card-A1", symbol: "infantry" as const, territoryId: "A1" },
      { id: "card-B1", symbol: "cavalry" as const, territoryId: "B1" },
      { id: "card-C1", symbol: "artillery" as const, territoryId: "C1" },
      { id: "card-A2", symbol: "infantry" as const, territoryId: "A2" },
      { id: "card-B2", symbol: "cavalry" as const, territoryId: "B2" },
    ];
    const state = stateWithCards({ hand, forcedTrade: true });

    const setup = await testRender(
      React.createElement(CardsPanel, {
        state,
        myPlayerId: "p1",
        onTradeCards: () => {},
      }),
      { width: 80, height: 30 },
    );
    await act(async () => { await setup.renderOnce(); });

    const frame = setup.captureCharFrame();
    expect(frame).toContain("FORCED TRADE");
    expect(frame).toContain("select 3 cards");

    await act(async () => { setup.renderer.destroy(); });
  });

  it("shows disabled state when cardMode is off", async () => {
    const base = createInitialGameState("no-cards", "NONE", [p1, p2], MAP_GRID_IRONREACH, 3, undefined, 1, "off");
    const state: GameState = { ...base, myHand: null };

    const setup = await testRender(
      React.createElement(CardsPanel, {
        state,
        myPlayerId: "p1",
        onTradeCards: () => {},
      }),
      { width: 80, height: 20 },
    );
    await act(async () => { await setup.renderOnce(); });

    const frame = setup.captureCharFrame();
    expect(frame).toContain("Cards are disabled");

    await act(async () => { setup.renderer.destroy(); });
  });
});

// ── App integration: key 2 toggles Cards panel, Esc closes ───────────────────

function makeClient(state: GameState, snapshotRef: { cb?: (s: GameState, pid: string) => void }) {
  return {
    state,
    myPlayerId: "p1",
    status: "connected" as const,
    roomCode: "TEST",
    onSnapshot: (cb: (s: GameState, pid: string) => void) => {
      snapshotRef.cb = cb;
      return () => { snapshotRef.cb = undefined; };
    },
    onEvent: () => () => {},
    onStatusChange: () => () => {},
    onError: () => () => {},
    send: () => {},
    deploy: () => {},
    attack: () => {},
    fortify: () => {},
    ready: () => {},
    skipPhase: () => {},
    endTurn: () => {},
    completeConquestMove: () => {},
    sendChat: () => {},
    rematch: () => {},
    requestRematch: () => {},
  };
}

describe("App: Cards panel key handling", () => {
  it("key [2] opens Cards panel; pressing [2] again closes it", async () => {
    const state = stateWithCards({ hand: [
      { id: "card-A1", symbol: "infantry" as const, territoryId: "A1" },
    ]});
    const snapshotRef: { cb?: (s: GameState, pid: string) => void } = {};
    const client = makeClient(state, snapshotRef);

    const setup = await testRender(
      React.createElement(App, {
        client,
        terminalDimensions: { columns: 180, rows: 51 },
      }),
      { width: 180, height: 51 },
    );
    await act(async () => { await setup.renderOnce(); });
    await setup.waitFor(() => (setup.renderer.keyInput as any).listenerCount("keypress") >= 2);

    const press = async (keyName: string) => {
      await act(async () => {
        (setup.renderer.keyInput as any).emit("keypress", { name: keyName });
        await setup.renderOnce();
      });
    };

    // Cards panel should not be visible initially
    expect(setup.captureCharFrame()).not.toContain("YOUR HAND");

    // Press 2 → Cards panel opens
    await press("2");
    // Poll until OpenTUI commits the React state change to its frame buffer
    await setup.waitFor(() => setup.captureCharFrame().includes("YOUR HAND"));
    expect(setup.captureCharFrame()).toContain("YOUR HAND");

    // Press 2 again → Cards panel closes (toggles back to tab 1)
    await press("2");
    await setup.waitFor(() => !setup.captureCharFrame().includes("YOUR HAND"));
    expect(setup.captureCharFrame()).not.toContain("YOUR HAND");

    await act(async () => { setup.renderer.destroy(); });
  });

  it("key [Esc] closes the Cards panel when it is open", async () => {
    const state = stateWithCards({ hand: [] });
    const snapshotRef: { cb?: (s: GameState, pid: string) => void } = {};
    const client = makeClient(state, snapshotRef);

    const setup = await testRender(
      React.createElement(App, {
        client,
        terminalDimensions: { columns: 180, rows: 51 },
      }),
      { width: 180, height: 51 },
    );
    await act(async () => { await setup.renderOnce(); });
    await setup.waitFor(() => (setup.renderer.keyInput as any).listenerCount("keypress") >= 2);

    const press = async (keyName: string) => {
      await act(async () => {
        (setup.renderer.keyInput as any).emit("keypress", { name: keyName });
        await setup.renderOnce();
      });
    };

    // Open Cards panel
    await press("2");
    await setup.waitFor(() => setup.captureCharFrame().includes("YOUR HAND"));
    expect(setup.captureCharFrame()).toContain("YOUR HAND");

    // Press Esc → Cards panel closes
    await press("escape");
    await setup.waitFor(() => !setup.captureCharFrame().includes("YOUR HAND"));
    expect(setup.captureCharFrame()).not.toContain("YOUR HAND");

    await act(async () => { setup.renderer.destroy(); });
  });

  it("attack key shows forced-trade toast when forced trade is pending", async () => {
    // Set up a state with forced trade pending and no pending reinforcements
    // (hand > 4, attack phase)
    const hand = [
      { id: "card-A1", symbol: "infantry" as const, territoryId: "A1" },
      { id: "card-B1", symbol: "cavalry" as const, territoryId: "B1" },
      { id: "card-C1", symbol: "artillery" as const, territoryId: "C1" },
      { id: "card-A2", symbol: "infantry" as const, territoryId: "A2" },
      { id: "card-B2", symbol: "cavalry" as const, territoryId: "B2" },
    ];
    const state = stateWithCards({
      phase: "attack",
      hand,
      forcedTrade: true,
      pendingReinforcements: 0,
    });
    const snapshotRef: { cb?: (s: GameState, pid: string) => void } = {};
    const client = makeClient(state, snapshotRef);

    const setup = await testRender(
      React.createElement(App, {
        client,
        terminalDimensions: { columns: 180, rows: 51 },
      }),
      { width: 180, height: 51 },
    );
    await act(async () => { await setup.renderOnce(); });
    await setup.waitFor(() => (setup.renderer.keyInput as any).listenerCount("keypress") >= 2);

    const press = async (keyName: string) => {
      await act(async () => {
        (setup.renderer.keyInput as any).emit("keypress", { name: keyName });
        await setup.renderOnce();
        await setup.renderOnce();
      });
    };

    // Press A (attack) while forced trade is pending
    await press("a");

    // Should show a toast mentioning forced trade / Cards panel
    await waitForFrame(setup, frame => /trade|Trade|Cards/.test(frame), {
      description: "frame to match /trade|Trade|Cards/",
    });
    const frame = setup.captureCharFrame();
    expect(frame).toMatch(/trade|Trade|Cards/);

    await act(async () => { setup.renderer.destroy(); });
  });
});
