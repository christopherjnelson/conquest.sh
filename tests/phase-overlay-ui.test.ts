import { describe, expect, it } from "bun:test";
import { createInitialGameState } from "@conquest/game-core";
import type { GameState, Player } from "@conquest/protocol";
import { getGeographyBoundingBox, getTerritoryAt, selectRenderVariant } from "@conquest/map-engine";
import { EARTH_42, EARTH_42_BUNDLE } from "../packages/map-engine/src/maps/earth-42.js";

const players: Player[] = [
  { id: "p1", name: "Alpha", colorIndex: 0, colorHex: "#00d2ff", connected: true, isAlive: true, ready: true },
  { id: "p2", name: "Bravo", colorIndex: 1, colorHex: "#ffaa00", connected: true, isAlive: true, ready: true },
];

function stateFor(phase: "attack" | "fortify"): GameState {
  const state = createInitialGameState("phase-overlay", "PHASE", players, EARTH_42, 3);
  return { ...state, phase, pendingReinforcements: 0 };
}

function findRaster(node: any, width: number, height: number): any {
  if (node?.width === width && node?.height === height) return node;
  for (const child of node?.getChildren?.() ?? []) {
    const found = findRaster(child, width, height);
    if (found) return found;
  }
  return undefined;
}

function textPoint(frame: string, text: string): { x: number; y: number } {
  const y = frame.split("\n").findIndex(line => line.includes(text));
  if (y < 0) throw new Error(`Could not find ${text} in rendered frame`);
  return { x: frame.split("\n")[y]!.indexOf(text) + 1, y };
}

async function renderApp(
  phase: "attack" | "fortify",
  initialSelectedTerritoryId?: string,
  initialTargetTerritoryId?: string,
) {
  // @ts-ignore OpenTUI test renderer is runtime-only in Bun.
  const React = (await import("../apps/client/node_modules/react/index.js")).default;
  // @ts-ignore OpenTUI test renderer is runtime-only in Bun.
  const { act } = await import("../apps/client/node_modules/react/index.js");
  // @ts-ignore OpenTUI test renderer is runtime-only in Bun.
  const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");
  const { App } = await import("../apps/client/src/ui/App.js");
  let skipped = 0;
  let ended = 0;
  let snapshotListener: ((state: GameState, playerId: string) => void) | undefined;
  const client: any = {
    state: stateFor(phase), myPlayerId: "p1", status: "connected", roomCode: "PHASE",
    onSnapshot: (listener: (state: GameState, playerId: string) => void) => {
      snapshotListener = listener;
      return () => { snapshotListener = undefined; };
    },
    onEvent: () => () => {}, onStatusChange: () => () => {}, onError: () => () => {},
    sendChat: () => {}, deploy: () => {}, attack: () => {}, fortify: () => {}, ready: () => {},
    skipPhase: () => { skipped++; }, endTurn: () => { ended++; },
  };
  const setup = await testRender(
    React.createElement(App, {
      client,
      terminalDimensions: { columns: 180, rows: 51 },
      initialSelectedTerritoryId,
      initialTargetTerritoryId,
    }),
    { width: 180, height: 51 },
  );
  await act(async () => { await setup.renderOnce(); });
  await setup.waitFor(() => (setup.renderer.keyInput as any).listenerCount("keypress") >= 2);
  const press = async (key: string) => {
    await act(async () => {
      (setup.renderer.keyInput as any).emit("keypress", { name: key === "enter" ? "return" : key });
      await setup.renderOnce();
    });
  };
  return {
    setup,
    act,
    press,
    calls: () => ({ skipped, ended }),
    emitSnapshot: (nextState: GameState) => snapshotListener?.(nextState, "p1"),
  };
}

describe("phase confirmation overlay", () => {
  it("shows the attack panel before dispatching, and its Confirm button skips attack", async () => {
    const { setup, act, press, calls } = await renderApp("attack");
    try {
      await press("e");
      expect(calls()).toEqual({ skipped: 0, ended: 0 });
      const frame = setup.captureCharFrame();
      expect(frame).toContain("SKIP ATTACK PHASE?");
      const confirm = textPoint(frame, "[Enter] Confirm");
      await act(async () => {
        await setup.mockMouse.click(confirm.x, confirm.y);
        await setup.renderOnce();
      });
      expect(calls()).toEqual({ skipped: 1, ended: 0 });
    } finally {
      await act(async () => { setup.renderer.destroy(); });
    }
  });

  it("cancels attack confirmation with Escape and the panel Cancel button", async () => {
    const { setup, act, press, calls } = await renderApp("attack");
    try {
      await press("e");
      await press("escape");
      expect(setup.captureCharFrame()).not.toContain("SKIP ATTACK PHASE?");
      expect(calls()).toEqual({ skipped: 0, ended: 0 });
      await press("e");
      const cancel = textPoint(setup.captureCharFrame(), "[Esc] Cancel");
      await act(async () => {
        await setup.mockMouse.click(cancel.x, cancel.y);
        await setup.renderOnce();
      });
      expect(setup.captureCharFrame()).not.toContain("SKIP ATTACK PHASE?");
      expect(calls()).toEqual({ skipped: 0, ended: 0 });
    } finally {
      await act(async () => { setup.renderer.destroy(); });
    }
  });

  it("shows the fortify end-turn panel and confirms through its button", async () => {
    const { setup, act, press, calls } = await renderApp("fortify");
    try {
      await press("e");
      expect(calls()).toEqual({ skipped: 0, ended: 0 });
      const frame = setup.captureCharFrame();
      expect(frame).toContain("SKIP FORTIFICATION & END TURN?");
      const confirm = textPoint(frame, "[Enter] Confirm");
      await act(async () => {
        await setup.mockMouse.click(confirm.x, confirm.y);
        await setup.renderOnce();
      });
      expect(calls()).toEqual({ skipped: 0, ended: 1 });
    } finally {
      await act(async () => { setup.renderer.destroy(); });
    }
  });

  it("clears a partially chosen action when the player clicks ocean", async () => {
    const { setup, act, press, calls } = await renderApp("attack", "sa_andes", "sa_caribbean_coast");
    try {
      const variant = selectRenderVariant(EARTH_42_BUNDLE, { width: 135, height: 36 }).grid;
      const bounds = getGeographyBoundingBox(variant);
      const raster = findRaster(setup.renderer.root, bounds.width, bounds.height);
      expect(raster).toBeDefined();
      const ocean = (() => {
        for (let y = bounds.minY; y <= bounds.maxY; y++) for (let x = bounds.minX; x <= bounds.maxX; x++) {
          if (!getTerritoryAt(x, y, variant)) return { x, y };
        }
        return undefined;
      })();
      expect(ocean).toBeDefined();
      if (!raster || !ocean) throw new Error("Expected a clickable ocean cell");
      await act(async () => {
        await setup.mockMouse.click(raster.screenX + ocean.x - bounds.minX, raster.screenY + ocean.y - bounds.minY);
        await setup.renderOnce();
      });
      await press("a");
      expect(calls()).toEqual({ skipped: 0, ended: 0 });
      expect(setup.captureCharFrame()).toContain("Select a friendly territory to attack from");
    } finally {
      await act(async () => { setup.renderer.destroy(); });
    }
  });

  it("clears a partially chosen action when the player clicks the centered map's ocean margin", async () => {
    const { setup, act, press } = await renderApp("attack", "sa_andes", "sa_caribbean_coast");
    try {
      const variant = selectRenderVariant(EARTH_42_BUNDLE, { width: 135, height: 36 }).grid;
      const bounds = getGeographyBoundingBox(variant);
      const raster = findRaster(setup.renderer.root, bounds.width, bounds.height);
      expect(raster).toBeDefined();
      if (!raster) throw new Error("Expected rendered Earth raster");
      await act(async () => {
        // The Earth geography is centered in a wider map pane, leaving this
        // cell in the outer canvas rather than the geography raster itself.
        await setup.mockMouse.click(raster.screenX - 1, raster.screenY + 1);
        await setup.renderOnce();
      });
      await press("a");
      expect(setup.captureCharFrame()).toContain("Select a friendly territory to attack from");
    } finally {
      await act(async () => { setup.renderer.destroy(); });
    }
  });

  it("shows the next commander in a map overlay after the authoritative fortify handoff", async () => {
    const { setup, act, emitSnapshot } = await renderApp("fortify");
    try {
      const current = stateFor("fortify");
      const next = {
        ...current,
        activePlayerIndex: 1,
        phase: "deployment" as const,
        turnNumber: current.turnNumber + 1,
      };
      await act(async () => {
        emitSnapshot(next);
        await setup.renderOnce();
      });
      const frame = setup.captureCharFrame();
      expect(frame).toContain("TURN COMPLETE");
      expect(frame).toContain("TURN PASSED — Bravo is now active");
    } finally {
      await act(async () => { setup.renderer.destroy(); });
    }
  });
});
