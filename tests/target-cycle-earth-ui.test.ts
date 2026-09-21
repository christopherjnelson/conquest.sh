import { describe, expect, it } from "bun:test";
import { createInitialGameState } from "@conquest/game-core";
import type { GameState, Player } from "@conquest/protocol";
import { getGeographyBoundingBox, selectRenderVariant } from "@conquest/map-engine";
import { EARTH_42, EARTH_42_BUNDLE } from "../packages/map-engine/src/maps/earth-42.js";

const players: Player[] = [
  { id: "p1", name: "Alpha", colorIndex: 0, colorHex: "#00d2ff", connected: true, isAlive: true, ready: true },
  { id: "p2", name: "Bravo", colorIndex: 1, colorHex: "#ffaa00", connected: true, isAlive: true, ready: true },
];

function earthState(phase: "attack" | "fortify", ownedTerritories: string[]): GameState {
  const initial = createInitialGameState("target-cycle", "CYCLE", players, EARTH_42, 3);
  return {
    ...initial,
    phase,
    pendingReinforcements: 0,
    territories: Object.fromEntries(Object.entries(initial.territories).map(([id, territory]) => [
      id,
      { ...territory, ownerId: ownedTerritories.includes(id) ? "p1" : "p2", units: id === "sa_andes" || id === "oc_eastern_australia" ? 5 : 3 },
    ])),
  };
}

function findRaster(node: any, width: number, height: number): any {
  if (node?.width === width && node?.height === height) return node;
  for (const child of node?.getChildren?.() ?? []) {
    const found = findRaster(child, width, height);
    if (found) return found;
  }
  return undefined;
}

async function renderApp(state: GameState, selectedTerritoryId: string) {
  // @ts-ignore OpenTUI test renderer is runtime-only in Bun.
  const React = (await import("../apps/client/node_modules/react/index.js")).default;
  // @ts-ignore OpenTUI test renderer is runtime-only in Bun.
  const { act } = await import("../apps/client/node_modules/react/index.js");
  // @ts-ignore OpenTUI test renderer is runtime-only in Bun.
  const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");
  const { App } = await import("../apps/client/src/ui/App.js");

  const sent: Array<{ kind: "attack" | "fortify"; source: string; target: string; units?: number }> = [];
  const client: any = {
    state,
    myPlayerId: "p1",
    status: "connected",
    roomCode: "CYCLE",
    onSnapshot: () => () => {},
    onEvent: () => () => {},
    onStatusChange: () => () => {},
    onError: () => () => {},
    attack: (source: string, target: string) => sent.push({ kind: "attack", source, target }),
    fortify: (source: string, target: string, units: number) => sent.push({ kind: "fortify", source, target, units }),
    deploy: () => {}, sendChat: () => {}, ready: () => {}, skipPhase: () => {}, endTurn: () => {},
  };
  const setup = await testRender(
    React.createElement(App, {
      client,
      terminalDimensions: { columns: 180, rows: 51 },
      initialSelectedTerritoryId: selectedTerritoryId,
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
  return { setup, act, press, sent };
}

describe("Earth target cycling through the rendered client", () => {
  it("cycles Andes to its adjacent Caribbean Coast enemy, then sends that attack", async () => {
    const { setup, act, press, sent } = await renderApp(
      earthState("attack", ["sa_andes"]),
      "sa_andes",
    );
    try {
      await press("n");
      await press("a");
      expect(sent).toEqual([{ kind: "attack", source: "sa_andes", target: "sa_caribbean_coast" }]);
    } finally {
      await act(async () => { setup.renderer.destroy(); });
    }
  });

  it("selects Caribbean Coast by mouse from Andes, then sends that attack", async () => {
    const { setup, act, press, sent } = await renderApp(
      earthState("attack", ["sa_andes"]),
      "sa_andes",
    );
    try {
      const variant = selectRenderVariant(EARTH_42_BUNDLE, { width: 135, height: 36 }).grid;
      const bounds = getGeographyBoundingBox(variant);
      const raster = findRaster(setup.renderer.root, bounds.width, bounds.height);
      expect(raster).toBeDefined();
      const caribbean = variant.territories.find(territory => territory.id === "sa_caribbean_coast");
      expect(caribbean).toBeDefined();
      if (!raster || !caribbean) throw new Error("Expected rendered Caribbean Coast target");
      await act(async () => {
        await setup.mockMouse.click(
          raster.screenX + caribbean.labelPos.x - bounds.minX,
          raster.screenY + caribbean.labelPos.y - bounds.minY,
        );
        await setup.renderOnce();
      });
      await press("a");
      expect(sent).toEqual([{ kind: "attack", source: "sa_andes", target: "sa_caribbean_coast" }]);
    } finally {
      await act(async () => { setup.renderer.destroy(); });
    }
  });

  it("cycles Eastern Australia to connected Indonesia, then sends the full legal fortification", async () => {
    const { setup, act, press, sent } = await renderApp(
      earthState("fortify", ["oc_indonesia", "oc_new_guinea", "oc_western_australia", "oc_eastern_australia"]),
      "oc_eastern_australia",
    );
    try {
      await press("n");
      await press("f");
      expect(setup.captureCharFrame()).toContain("FORTIFY TROOP MOVEMENT");
      await press("[");
      await press("enter");
      expect(sent).toEqual([{
        kind: "fortify",
        source: "oc_eastern_australia",
        target: "oc_indonesia",
        units: 3,
      }]);
    } finally {
      await act(async () => { setup.renderer.destroy(); });
    }
  });

  it("selects connected Indonesia by mouse from Eastern Australia, then fortifies through Oceania", async () => {
    const { setup, act, press, sent } = await renderApp(
      earthState("fortify", ["oc_indonesia", "oc_new_guinea", "oc_western_australia", "oc_eastern_australia"]),
      "oc_eastern_australia",
    );
    try {
      const variant = selectRenderVariant(EARTH_42_BUNDLE, { width: 135, height: 36 }).grid;
      const bounds = getGeographyBoundingBox(variant);
      const raster = findRaster(setup.renderer.root, bounds.width, bounds.height);
      expect(raster).toBeDefined();
      const indonesia = variant.territories.find(territory => territory.id === "oc_indonesia");
      expect(indonesia).toBeDefined();
      if (!raster || !indonesia) throw new Error("Expected rendered Indonesia target");
      await act(async () => {
        await setup.mockMouse.click(
          raster.screenX + indonesia.labelPos.x - bounds.minX,
          raster.screenY + indonesia.labelPos.y - bounds.minY,
        );
        await setup.renderOnce();
      });
      await press("f");
      await press("enter");
      expect(sent).toEqual([{
        kind: "fortify",
        source: "oc_eastern_australia",
        target: "oc_indonesia",
        units: 4,
      }]);
    } finally {
      await act(async () => { setup.renderer.destroy(); });
    }
  });

  it("cycles AS4 Kamchatka to AS3 Yakutia, never directly to Urals", async () => {
    const { setup, act, press, sent } = await renderApp(
      earthState("attack", ["as_kamchatka"]),
      "as_kamchatka",
    );
    try {
      await press("n");
      await press("a");
      expect(sent).toEqual([{ kind: "attack", source: "as_kamchatka", target: "as_yakutia" }]);
    } finally {
      await act(async () => { setup.renderer.destroy(); });
    }
  });

  it("offers AS5 Baikal as a direct enemy target from AS4 Kamchatka", async () => {
    const { setup, act, press, sent } = await renderApp(
      earthState("attack", ["as_kamchatka"]),
      "as_kamchatka",
    );
    try {
      await press("n"); // Yakutia
      await press("n"); // Baikal
      await press("a");
      expect(sent).toEqual([{ kind: "attack", source: "as_kamchatka", target: "as_baikal" }]);
    } finally {
      await act(async () => { setup.renderer.destroy(); });
    }
  });

  it("cycles AS7 Japan to AS4 Kamchatka, never directly to Urals", async () => {
    const { setup, act, press, sent } = await renderApp(
      earthState("attack", ["as_japan"]),
      "as_japan",
    );
    try {
      await press("n");
      await press("a");
      expect(sent).toEqual([{ kind: "attack", source: "as_japan", target: "as_kamchatka" }]);
    } finally {
      await act(async () => { setup.renderer.destroy(); });
    }
  });

  it("cycles AS11 Indochina to AS10 India; Urals is only reachable through AS12 North China", async () => {
    const { setup, act, press, sent } = await renderApp(
      earthState("attack", ["as_indochina"]),
      "as_indochina",
    );
    try {
      await press("n");
      await press("a");
      await press("n");
      await press("a");
      expect(sent).toEqual([
        { kind: "attack", source: "as_indochina", target: "as_indian_subcontinent" },
        { kind: "attack", source: "as_indochina", target: "as_north_china" },
      ]);
    } finally {
      await act(async () => { setup.renderer.destroy(); });
    }
  });
});
