import { describe, expect, it } from "bun:test";
import { createInitialGameState } from "@conquest/game-core";
import { MAP_GRID_IRONREACH } from "@conquest/map-engine";
import type { Player } from "@conquest/protocol";

const players: Player[] = [
  { id: "p1", name: "Alpha", colorIndex: 0, colorHex: "#00d2ff", connected: true, isAlive: true, ready: true },
  { id: "p2", name: "Bravo", colorIndex: 1, colorHex: "#ffaa00", connected: true, isAlive: true, ready: true },
];

async function appFor(phase: "deployment" | "fortify" | "attack", selected = "A1", target: string | null = null, conquest = false) {
  // @ts-ignore runtime OpenTUI test modules
  const React = (await import("../apps/client/node_modules/react/index.js")).default;
  // @ts-ignore runtime OpenTUI test modules
  const { act } = await import("../apps/client/node_modules/react/index.js");
  // @ts-ignore runtime OpenTUI test modules
  const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");
  const { App } = await import("../apps/client/src/ui/App.js");
  const state: any = createInitialGameState("quantity", "QTY1", players, MAP_GRID_IRONREACH, 2);
  state.phase = phase; state.activePlayerIndex = 0; state.pendingReinforcements = 5;
  state.territories.A1.ownerId = "p1"; state.territories.A1.units = 6;
  state.territories.A2.ownerId = "p1"; state.territories.A2.units = 2;
  state.territories.A1.neighbors = ["A2"]; state.territories.A2.neighbors = ["A1"];
  if (conquest) state.pendingConquestMove = { sourceTerritoryId: "A1", targetTerritoryId: "A2", minimumUnits: 1, maximumUnits: 5 };
  const sent: any[] = [];
  const client: any = { state, myPlayerId: "p1", status: "connected", roomCode: "QTY1",
    onSnapshot: () => () => {}, onEvent: () => () => {}, onStatusChange: () => () => {}, onError: () => () => {},
    deploy: (...args: any[]) => sent.push(["deploy", ...args]), fortify: (...args: any[]) => sent.push(["fortify", ...args]), completeConquestMove: (...args: any[]) => sent.push(["move", ...args]),
    attack: () => {}, sendChat: () => {}, ready: () => {}, skipPhase: () => {}, endTurn: () => {},
  };
  const setup = await testRender(React.createElement(App, { client, initialSelectedTerritoryId: selected, initialTargetTerritoryId: target, terminalDimensions: { columns: 140, rows: 45 } }), { width: 140, height: 45 });
  await act(async () => { await setup.renderOnce(); });
  await setup.waitFor(() => (setup.renderer.keyInput as any).listenerCount("keypress") >= 2);
  const press = async (name: string) => act(async () => { (setup.renderer.keyInput as any).emit("keypress", { name: name === "enter" ? "return" : name }); await setup.renderOnce(); });
  return { setup, act, press, sent };
}

describe("map quantity dialogs", () => {
  it("deploy opens, adjusts, cancels, and confirms without early dispatch", async () => {
    const { setup, act, press, sent } = await appFor("deployment");
    try {
      await press("d");
      // OpenTUI's shared key input can finish detaching a prior renderer in a
      // parallel file; retry once after its first render boundary.
      if (!setup.captureCharFrame().includes("DEPLOY REINFORCEMENTS")) await press("d");
      expect(setup.captureCharFrame()).toContain("DEPLOY REINFORCEMENTS"); expect(sent).toEqual([]);
      await press("]"); await press("escape"); expect(sent).toEqual([]);
      await press("d"); await press("end"); await press("enter"); expect(sent).toEqual([["deploy", "A1", 5]]);
    } finally { await act(async () => { setup.renderer.destroy(); }); }
  });

  it("mandatory conquest dialog dispatches only after Enter", async () => {
    const conquest = await appFor("attack", "A1", null, true);
    try { expect(conquest.setup.captureCharFrame()).toContain("MOVE TROOPS INTO CONQUERED"); await conquest.press("]"); await conquest.press("enter"); expect(conquest.sent).toEqual([["move", 2]]); } finally { await conquest.act(async () => { conquest.setup.renderer.destroy(); }); }
  });
});
