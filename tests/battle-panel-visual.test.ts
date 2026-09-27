/**
 * Visual frame test: render the full map (Earth-42, wide layout) with an active
 * battle panel and capture the bottom-left ~40×14 region to verify placement.
 */
import { describe, expect, it } from "bun:test";
import { EARTH_42_BUNDLE } from "../packages/map-engine/src/maps/earth-42.js";
import { getMapContentDimensionsForLayout, selectRenderVariant } from "../packages/map-engine/src/index.js";
import type { BattleReport } from "../apps/client/src/ui/battle-report.js";

const COLS = 180;
const ROWS = 51;

function makeReport(): BattleReport {
  return {
    key: "visual-test-key",
    attackerName: "Atlas",
    attackerColor: "#00d2ff",
    defenderName: "Bravo",
    defenderColor: "#ffaa00",
    sourceTerritoryName: "Alaska Range",
    targetTerritoryName: "Kamchatka",
    attackerRolls: [6, 4, 2],
    defenderRolls: [5, 4],
    pairs: [
      { attackerDie: 6, defenderDie: 5, attackerWins: true },
      { attackerDie: 4, defenderDie: 4, attackerWins: false },
    ],
    unpairedAttackerDice: [2],
    attackerLosses: 1,
    defenderLosses: 1,
    attackerUnitsBefore: 7,
    defenderUnitsBefore: 3,
    attackerUnitsAfter: 6,
    defenderUnitsAfter: 2,
    conquered: false,
    engagementRound: 3,
    engagementAttackerLosses: 2,
    engagementDefenderLosses: 4,
  };
}

describe("battle panel visual frame on Earth-42 wide", () => {
  it("renders the battle panel in the bottom-left corner of the world map", async () => {
    // @ts-ignore runtime-only OpenTUI test helpers
    const React = (await import("../apps/client/node_modules/react/index.js")).default;
    // @ts-ignore
    const { act } = await import("../apps/client/node_modules/react/index.js");
    // @ts-ignore
    const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");
    const { MapCanvas } = await import("../apps/client/src/ui/MapCanvas.js");

    const paneDims = getMapContentDimensionsForLayout(COLS, ROWS, "wide");
    const report = makeReport();

    const setup = await testRender(
      React.createElement(MapCanvas, {
        mapBundle: EARTH_42_BUNDLE,
        contentDimensions: paneDims,
        territories: {},
        players: [],
        myPlayerId: null,
        phase: "attack" as const,
        selectedTerritoryId: null,
        targetTerritoryId: null,
        onSelectTerritory: () => {},
        onSelectTarget: () => {},
        onDeselect: () => {},
        battle: report,
        battleAnimate: false,
      }),
      paneDims,
    );
    await act(async () => { await setup.renderOnce(); });

    const frame: string = setup.captureCharFrame();
    await act(async () => { setup.renderer.destroy(); });

    // Extract the bottom-left ~40×14 region
    const lines = frame.split("\n");
    const totalLines = lines.length;
    const regionStartLine = Math.max(0, totalLines - 14);
    const bottomLeft = lines.slice(regionStartLine).map((l) => l.slice(0, 42)).join("\n");

    console.log("=== Bottom-left 40×14 region of Earth-42 wide map with battle panel ===");
    console.log(bottomLeft);
    console.log("=== End region ===");

    // The battle panel content should appear somewhere in the frame
    expect(frame).toContain("BATTLE");
    expect(frame).toContain("Round 3");
    expect(frame).toContain("Alaska Range");
    expect(frame).toContain("Kamchatka");
    // Engagement line should appear (round > 1)
    expect(frame).toContain("Eng:");
  });

  it("reports which Earth-42 variants get which corner", async () => {
    const { findPanelCorner } = await import("../apps/client/src/ui/battle-report.js");
    const { FULL_W, FULL_H, COND_W, COND_H } = await import("../apps/client/src/ui/BattlePanel.js");
    const results: string[] = [];
    for (const variant of EARTH_42_BUNDLE.renderVariants) {
      const full = findPanelCorner(variant.grid, FULL_W, FULL_H);
      const condensed = findPanelCorner(variant.grid, COND_W, COND_H);
      results.push(
        `${variant.profile}: full ${FULL_W}×${FULL_H} → ${full?.corner ?? "no fit"}, condensed ${COND_W}×${COND_H} → ${condensed?.corner ?? "no fit"}`
      );
    }
    console.log("=== Earth-42 panel corner assignments ===");
    for (const r of results) console.log(r);
    console.log("=== End ===");
    // Standard and above should fit full panel at bottom-left
    const standardVariant = EARTH_42_BUNDLE.renderVariants.find(v => v.profile === "standard")!;
    expect(findPanelCorner(standardVariant.grid, FULL_W, FULL_H)?.corner).toBe("bottom-left");
    // Compact variants should fit condensed panel at bottom-left
    const compactVariant = EARTH_42_BUNDLE.renderVariants.find(v => v.profile === "compact")!;
    expect(findPanelCorner(compactVariant.grid, COND_W, COND_H)?.corner).toBe("bottom-left");
  });
});
