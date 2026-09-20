import { describe, expect, it } from "bun:test";
import { ConquestServer } from "../apps/server/src/server.js";
import { GameClient } from "../apps/client/src/network/client.js";
import { getMap, getGeographyBoundingBox, selectRenderVariant } from "../packages/map-engine/src/index.js";
import { createInitialGameState } from "../packages/game-core/src/index.js";
import { Sidebar } from "../apps/client/src/ui/Sidebar.js";
import { CompactInspector } from "../apps/client/src/ui/CompactInspector.js";

function findRaster(node: any, width: number, height: number): any {
  if (node?.width === width && node?.height === height) return node;
  for (const child of node?.getChildren?.() ?? []) {
    const raster = findRaster(child, width, height);
    if (raster) return raster;
  }
  return undefined;
}

function containsText(node: any, text: string): boolean {
  if (node == null) return false;
  if (typeof node === "string") return node.includes(text);
  if (Array.isArray(node)) return node.some(child => containsText(child, text));
  return containsText(node?.props?.children, text);
}

function findClickableDeploy(node: any): (() => void) | undefined {
  if (node == null) return undefined;
  if (node?.type === "box" && node.props?.onMouseDown && containsText(node, "Deploy")) {
    return node.props.onMouseDown;
  }
  for (const child of node?.props?.children instanceof Array ? node.props.children : [node?.props?.children]) {
    const handler = findClickableDeploy(child);
    if (handler) return handler;
  }
  return undefined;
}

describe("Earth deployment through the client UI", () => {
  it("keeps Deploy clickable for a selected owned territory while inspecting an enemy", () => {
    const earth = getMap("earth-42")!;
    const players = [
      { id: "p1", name: "Alpha", colorIndex: 0, colorHex: "#00d2ff", connected: true, isAlive: true, ready: true },
      { id: "p2", name: "Bravo", colorIndex: 1, colorHex: "#ff4444", connected: true, isAlive: true, ready: true },
    ];
    const state = createInitialGameState("earth-controls", "EUI1", players, earth.definition);
    const selected = Object.values(state.territories).find(territory => territory.ownerId === "p1" &&
      territory.neighbors.some(id => state.territories[id]?.ownerId === "p2"));
    expect(selected).toBeDefined();
    if (!selected) throw new Error("Expected an owned Earth territory bordering an enemy");
    const hovered = selected.neighbors.find(id => state.territories[id]?.ownerId === "p2")!;
    let deployments = 0;
    const props = {
      mapBundle: earth, state, myPlayerId: "p1", selectedTerritoryId: selected.id,
      hoveredTerritoryId: hovered, targetTerritoryId: null, phase: "deployment" as const,
      onDeploy: () => { deployments++; }, onAttack: () => {}, onFortify: () => {},
      onSkipPhase: () => {}, onEndTurn: () => {},
    };

    const sidebarDeploy = findClickableDeploy(Sidebar({ ...props, layoutMode: "wide" }));
    const compactDeploy = findClickableDeploy(CompactInspector(props));
    expect(sidebarDeploy).toBeDefined();
    expect(compactDeploy).toBeDefined();
    sidebarDeploy?.();
    compactDeploy?.();
    expect(deployments).toBe(2);
  });

  it("sends an active player's selected Earth territory deployment to the authoritative server", async () => {
    const server = new ConquestServer({ port: 0, serverName: "earth-ui-deployment-e2e" });
    server.start();
    const host = `localhost:${server.port}`;
    const alpha = new GameClient({ host, playerName: "Alpha", forceNewSession: true, autoReconnect: false });
    const bravo = new GameClient({ host, playerName: "Bravo", forceNewSession: true, autoReconnect: false });
    let setup: any;
    let reactAct: any;

    try {
      await alpha.connect();
      alpha.createRoom({ playerName: "Alpha", displayName: "Earth UI", maxPlayers: 2, mapId: "earth-42" });
      const lobby = await alpha.waitForSnapshot(state => state.phase === "lobby" && state.mapId === "earth-42");

      await bravo.connect();
      bravo.join("Bravo", lobby.roomCode);
      await alpha.waitForSnapshot(state => state.phase === "lobby" && state.players.length === 2);
      await bravo.waitForSnapshot(state => state.phase === "lobby" && state.players.length === 2);

      alpha.ready();
      await alpha.waitForSnapshot(state => state.phase === "lobby" && state.players.find(player => player.id === alpha.myPlayerId)?.ready === true);
      bravo.ready();
      const deployedState = await alpha.waitForSnapshot(state => state.phase === "deployment" && state.mapId === "earth-42");
      await bravo.waitForSnapshot(state => state.phase === "deployment");
      const alphaId = alpha.myPlayerId;
      if (!alphaId) throw new Error("Active Earth client has no player ID");

      expect(deployedState.players[deployedState.activePlayerIndex]?.id).toBe(alphaId);
      const territory = Object.values(deployedState.territories).find(candidate =>
        candidate.ownerId === alphaId && candidate.neighbors.some(id =>
          deployedState.territories[id]?.ownerId !== alphaId,
        ),
      );
      expect(territory).toBeDefined();
      if (!territory) throw new Error("Earth's active player needs an owned territory adjacent to an enemy");
      const reinforcements = deployedState.pendingReinforcements;
      const unitsBefore = territory.units;
      expect(reinforcements).toBeGreaterThan(0);
      const earth = getMap("earth-42")!;
      const adjacentEnemy = territory.neighbors
        .map(id => deployedState.territories[id])
        .find(candidate => candidate?.ownerId !== alphaId);
      expect(adjacentEnemy).toBeDefined();
      if (!adjacentEnemy) throw new Error("Expected the selected Earth territory to have an enemy neighbor");

      // @ts-ignore OpenTUI test renderer is runtime-only in Bun.
      const React = (await import("../apps/client/node_modules/react/index.js")).default;
      // @ts-ignore OpenTUI test renderer is runtime-only in Bun.
      const { act } = await import("../apps/client/node_modules/react/index.js");
      reactAct = act;
      // @ts-ignore OpenTUI test renderer is runtime-only in Bun.
      const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");
      const { App } = await import("../apps/client/src/ui/App.js");
      setup = await testRender(
        React.createElement(App, {
          client: alpha,
          terminalDimensions: { columns: 180, rows: 51 },
        }),
        { width: 180, height: 51 },
      );
      await act(async () => { await setup.renderOnce(); });
      const pane = { width: 135, height: 36 };
      const variant = selectRenderVariant(earth, pane).grid;
      const bounds = getGeographyBoundingBox(variant);
      const raster = findRaster(setup.renderer.root, bounds.width, bounds.height);
      expect(raster).toBeDefined();
      const ownRender = variant.territories.find(candidate => candidate.id === territory.id)!;
      const enemyRender = variant.territories.find(candidate => candidate.id === adjacentEnemy.id)!;
      const screenPoint = (candidate: typeof ownRender) => ({
        x: raster.screenX + candidate.labelPos.x - bounds.minX,
        y: raster.screenY + candidate.labelPos.y - bounds.minY,
      });

      // An enemy click during deployment must not become an attack target. A
      // subsequent owned-territory click is the deployment selection; hovering
      // the enemy afterwards must leave that selection intact for Deploy.
      await act(async () => { await setup.mockMouse.click(screenPoint(enemyRender).x, screenPoint(enemyRender).y); });
      await act(async () => { await setup.mockMouse.click(screenPoint(ownRender).x, screenPoint(ownRender).y); });
      await act(async () => { await setup.mockMouse.moveTo(screenPoint(enemyRender).x, screenPoint(enemyRender).y); });
      const lines = setup.captureCharFrame().split("\n");
      const deployLine = lines.findIndex((line: string) => line.includes("[D] ➜ Deploy"));
      expect(deployLine).toBeGreaterThanOrEqual(0);
      const deployColumn = lines[deployLine]!.indexOf("[D] ➜ Deploy") + 2;
      let afterDeployment: typeof deployedState | undefined;
      await act(async () => {
        await setup.mockMouse.click(deployColumn, deployLine);
        afterDeployment = await alpha.waitForSnapshot(state =>
          state.phase === "attack" && state.territories[territory.id]?.units === unitsBefore + reinforcements,
        );
        await setup.renderOnce();
      });
      if (!afterDeployment) throw new Error("Expected the authoritative Earth deployment snapshot");
      expect(afterDeployment.pendingReinforcements).toBe(0);
      expect(server.roomManager.getRoom(afterDeployment.roomCode)?.state.territories[territory.id]?.units)
        .toBe(unitsBefore + reinforcements);
    } finally {
      if (setup && reactAct) await reactAct(async () => { setup.renderer.destroy(); });
      alpha.disconnect();
      bravo.disconnect();
      server.stop();
    }
  });

  it("dispatches D from the Earth App to the authoritative server", async () => {
    const server = new ConquestServer({ port: 0, serverName: "earth-ui-keyboard-deployment-e2e" });
    server.start();
    const host = `localhost:${server.port}`;
    const alpha = new GameClient({ host, playerName: "Alpha", forceNewSession: true, autoReconnect: false });
    const bravo = new GameClient({ host, playerName: "Bravo", forceNewSession: true, autoReconnect: false });
    let setup: any;
    let reactAct: any;

    try {
      await alpha.connect();
      alpha.createRoom({ playerName: "Alpha", displayName: "Earth keyboard", maxPlayers: 2, mapId: "earth-42" });
      const lobby = await alpha.waitForSnapshot(state => state.phase === "lobby" && state.mapId === "earth-42");
      await bravo.connect();
      bravo.join("Bravo", lobby.roomCode);
      await alpha.waitForSnapshot(state => state.phase === "lobby" && state.players.length === 2);
      alpha.ready();
      await alpha.waitForSnapshot(state => state.phase === "lobby" && Boolean(
        state.players.find(player => player.id === alpha.myPlayerId)?.ready,
      ));
      bravo.ready();
      const initial = await alpha.waitForSnapshot(state => state.phase === "deployment");
      const alphaId = alpha.myPlayerId;
      if (!alphaId) throw new Error("Keyboard client has no player ID");
      expect(initial.players[initial.activePlayerIndex]?.id).toBe(alphaId);
      const territory = Object.values(initial.territories).find(candidate => candidate.ownerId === alphaId &&
        candidate.neighbors.some(id => initial.territories[id]?.ownerId !== alphaId));
      if (!territory) throw new Error("Keyboard client owns no Earth territory bordering an enemy");
      const adjacentEnemy = territory.neighbors
        .map(id => initial.territories[id])
        .find(candidate => candidate?.ownerId !== alphaId);
      if (!adjacentEnemy) throw new Error("Keyboard territory has no enemy neighbor");
      const reinforcements = initial.pendingReinforcements;
      const unitsBefore = territory.units;

      // @ts-ignore OpenTUI test renderer is runtime-only in Bun.
      const React = (await import("../apps/client/node_modules/react/index.js")).default;
      // @ts-ignore OpenTUI test renderer is runtime-only in Bun.
      const { act } = await import("../apps/client/node_modules/react/index.js");
      reactAct = act;
      // @ts-ignore OpenTUI test renderer is runtime-only in Bun.
      const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");
      const { App } = await import("../apps/client/src/ui/App.js");
      setup = await testRender(
        React.createElement(App, {
          client: alpha, terminalDimensions: { columns: 180, rows: 51 },
        }),
        { width: 180, height: 51 },
      );
      await act(async () => { await setup.renderOnce(); });
      const earth = getMap("earth-42")!;
      const variant = selectRenderVariant(earth, { width: 135, height: 36 }).grid;
      const bounds = getGeographyBoundingBox(variant);
      const raster = findRaster(setup.renderer.root, bounds.width, bounds.height);
      if (!raster) throw new Error("Could not find the rendered Earth raster");
      const ownRender = variant.territories.find(candidate => candidate.id === territory.id)!;
      const enemyRender = variant.territories.find(candidate => candidate.id === adjacentEnemy.id)!;
      const screenPoint = (candidate: typeof ownRender) => ({
        x: raster.screenX + candidate.labelPos.x - bounds.minX,
        y: raster.screenY + candidate.labelPos.y - bounds.minY,
      });
      // This reproduces the reported deployment interaction before pressing D.
      await act(async () => { await setup.mockMouse.click(screenPoint(enemyRender).x, screenPoint(enemyRender).y); });
      await act(async () => { await setup.mockMouse.click(screenPoint(ownRender).x, screenPoint(ownRender).y); });
      let deployed: typeof initial | undefined;
      await act(async () => {
        setup.mockInput.pressKey("d");
        deployed = await alpha.waitForSnapshot(state =>
          state.phase === "attack" && Boolean(state.territories[territory.id]?.units === unitsBefore + reinforcements),
        );
        await setup.renderOnce();
      });
      if (!deployed) throw new Error("D did not produce an authoritative Earth deployment snapshot");
      expect(deployed.pendingReinforcements).toBe(0);
      expect(server.roomManager.getRoom(deployed.roomCode)?.state.territories[territory.id]?.units)
        .toBe(unitsBefore + reinforcements);
    } finally {
      if (setup && reactAct) await reactAct(async () => { setup.renderer.destroy(); });
      alpha.disconnect();
      bravo.disconnect();
      server.stop();
    }
  });
});
