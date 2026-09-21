import { describe, expect, it } from "bun:test";
import { getGeographyBoundingBox, getTerritoryAt, type GridMapDefinition, type MapBundle } from "@conquest/map-engine";

const grid: GridMapDefinition = {
  id: "label-overhang", name: "Label overhang", description: "Synthetic label hit map.", width: 8, height: 3,
  template: ["BBBBBBBB", "BBBABBBB", "BBBBBBBB"],
  microTemplate: ["BBBBBBBB", "BBBBBBBB", "BBBABBBB", "BBBABBBB", "BBBBBBBB", "BBBBBBBB"],
  charToTerritoryId: { A: "a", B: "b" }, territoryIdToChar: { a: "A", b: "B" },
  territories: [
    { id: "a", name: "Alpha", char: "A", displayCode: "AX", displayLabel: "ALPHA", sectorId: "s", regionId: "s", regionName: "Sector", regionBonus: 0, regionColor: "#00d2ff", neighbors: ["b"], labelPos: { x: 3, y: 1 }, position: { x: 3, y: 1 }, icon: "●", flavor: "Small.", render: { flavor: "Small." } },
    { id: "b", name: "Beta", char: "B", displayCode: "B", displayLabel: "BETA", sectorId: "s", regionId: "s", regionName: "Sector", regionBonus: 0, regionColor: "#00d2ff", neighbors: ["a"], labelPos: { x: 6, y: 1 }, position: { x: 6, y: 1 }, icon: "●", flavor: "Large.", render: { flavor: "Large." } },
  ],
  sectors: [{ id: "s", name: "Sector", bonusReinforcements: 0, colorHex: "#00d2ff", territoryIds: ["a", "b"] }],
  recommendedPlayers: { min: 2, max: 2 }, seaRoutes: [],
  decorations: { waves: [], mountains: [], trees: [], compass: { x: 0, y: 0 }, scaleBar: { x: 0, y: 2 }, oceanLabels: [] },
};

const bundle: MapBundle = {
  definition: { id: grid.id, name: grid.name, description: grid.description, territories: grid.territories.map(({ id, name, sectorId, neighbors }) => ({ id, name, sectorId, neighbors })), sectors: grid.sectors, recommendedPlayers: grid.recommendedPlayers },
  renderVariants: [{ profile: "test", grid }],
  metadata: { regionSingular: "Sector", regionPlural: "Sectors", navigationAnchorTerritoryId: "a", displayCodes: { a: "AX", b: "B" } },
};

function findMapBody(node: any, width: number, height: number): any {
  const children = node?.getChildren?.() ?? [];
  if (
    node?.width === width && node?.height === height &&
    children.length === height &&
    children.every((child: any) => child?.constructor?.name === "TextRenderable2")
  ) return node;
  for (const child of children) {
    const result = findMapBody(child, width, height);
    if (result) return result;
  }
}

describe("cartographic label hit testing", () => {
  it("gives a label priority over a different territory beneath it for hover and click", async () => {
    // @ts-ignore OpenTUI test renderer is runtime-only in Bun.
    const React = (await import("../apps/client/node_modules/react/index.js")).default;
    // @ts-ignore OpenTUI test renderer is runtime-only in Bun.
    const { act } = await import("../apps/client/node_modules/react/index.js");
    // @ts-ignore OpenTUI test renderer is runtime-only in Bun.
    const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");
    const { MapCanvas } = await import("../apps/client/src/ui/MapCanvas.js");
    const bounds = getGeographyBoundingBox(grid);
    let hovered: string | null = null;
    let selected: string | null = null;
    const setup = await testRender(React.createElement(MapCanvas, {
      mapBundle: bundle, renderProfile: "test",
      territories: {},
      players: [{ id: "p1", name: "Alpha", colorIndex: 0, colorHex: "#00d2ff", connected: true, isAlive: true, ready: true }],
      myPlayerId: "p1", phase: "lobby", selectedTerritoryId: null, targetTerritoryId: null,
      onHoverTerritory: (id: string | null) => { hovered = id; }, onSelectTerritory: (id: string) => { selected = id; }, onSelectTarget: () => {}, onDeselect: () => {},
    }), { width: 20, height: 8 });
    try {
      await act(async () => { await setup.renderOnce(); });
      const mapBody = findMapBody(setup.renderer.root, bounds.width, bounds.height);
      expect(mapBody).toBeDefined();
      if (!mapBody) throw new Error("Expected interactive synthetic map body");
      // Fallback code AX starts at x=2; that cell belongs to Beta, while AX names Alpha.
      expect(getTerritoryAt(2, 1, grid)).toBe("b");
      const x = mapBody.screenX + 2 - bounds.minX;
      const y = mapBody.screenY + 1 - bounds.minY;
      const visibleRow = setup.captureCharFrame().split("\n")[y]!;
      expect(visibleRow[x]).toBe("A");
      expect(visibleRow[x + 1]).toBe("X");
      await act(async () => { await setup.mockMouse.moveTo(x, y); });
      expect(hovered as string | null).toBe("a");
      await act(async () => { await setup.mockMouse.click(x, y); });
      expect(selected as string | null).toBe("a");
    } finally {
      await act(async () => { setup.renderer.destroy(); });
    }
  });
});
