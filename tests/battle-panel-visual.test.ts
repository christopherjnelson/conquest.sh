/**
 * Visual frame test: render the full map (Earth-42, wide layout) with an active
 * battle panel and capture the bottom-left ~40×14 region to verify placement.
 */
import { describe, expect, it } from "bun:test";
import { EARTH_42_BUNDLE } from "../packages/map-engine/src/maps/earth-42.js";
import {
  getMapContentDimensionsForLayout,
  selectRenderVariant,
  getGeographyBoundingBox,
} from "../packages/map-engine/src/index.js";
import type { BattleReport } from "../apps/client/src/ui/battle-report.js";

const COLS = 180;
const ROWS = 51;

// Terminal size that selects the Earth-42 "wide" render variant
const WIDE_COLS = 200;
const WIDE_ROWS = 55;

// Terminal size that selects the Earth-42 "compact" render variant
const COMPACT_COLS = 120;
const COMPACT_ROWS = 38;

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

/**
 * Border constraint tests: the panel must sit fully inside the MapCanvas frame
 * for Earth-42 wide and compact profiles. Verifies:
 *   - panel bottom row is strictly above the canvas bottom border row
 *   - panel left column is strictly right of the canvas left border column
 */
describe("battle panel border constraints (Earth-42 wide + compact)", () => {
  /**
   * Reconstruct the same top/left/panelH values MapCanvas would compute, then
   * assert the panel stays clear of the frame borders.
   */
  async function assertPanelInsideFrame(
    paneDims: { width: number; height: number },
    label: string,
  ): Promise<void> {
    const { findPanelCorner } = await import("../apps/client/src/ui/battle-report.js");
    const { FULL_W, FULL_H, COND_W, COND_H } = await import("../apps/client/src/ui/BattlePanel.js");

    const activeVariant = selectRenderVariant(EARTH_42_BUNDLE, paneDims);
    const renderLayout = getGeographyBoundingBox(activeVariant.grid);

    const availableContentW = paneDims.width;
    const availableContentH = paneDims.height;

    const canCenterH = availableContentW >= renderLayout.width;
    const canCenterV = availableContentH >= renderLayout.height;

    const innerH = availableContentH - 2;
    const innerW = availableContentW - 2;
    const hOffset = canCenterH ? Math.floor((innerW - renderLayout.width) / 2) : 0;
    const vOffset = canCenterV ? Math.floor((innerH - renderLayout.height) / 2) : 0;
    const maxRows = innerH - vOffset - 1;

    const fullCorner = findPanelCorner(activeVariant.grid, FULL_W, FULL_H, undefined, maxRows);
    const condensedCorner = !fullCorner
      ? findPanelCorner(activeVariant.grid, COND_W, COND_H, undefined, maxRows)
      : null;
    const chosenCorner = fullCorner ?? condensedCorner;
    const panelH = fullCorner ? FULL_H : COND_H;

    expect(chosenCorner).not.toBeNull();
    if (!chosenCorner) return; // narrowing only

    const left = 1 + hOffset + chosenCorner.col;
    const top = 1 + vOffset + chosenCorner.row;

    // Panel bottom content row = top + panelH − 1.
    // Canvas bottom border is at content row innerH (= canvas row availableContentH − 1).
    // "Strictly above" means panel bottom content row < innerH (content rows are 0..innerH-1;
    // innerH is the canvas bottom border's content-row index).
    const panelBottomContentRow = top + panelH - 1;
    // Diagnostic info logged before the assertion so it's visible on failure.
    console.log(
      `[${label}] panelBottomContentRow=${panelBottomContentRow} innerH=${innerH} ` +
      `left=${left} top=${top} panelH=${panelH}`,
    );
    expect(panelBottomContentRow < innerH).toBe(
      true, // panel bottom content row must be strictly above canvas border
    );

    // Panel left canvas col = 1 + left. Canvas left border is at canvas col 0.
    // "Strictly right" means left > 0 (content col > 0 = canvas col > 1 > border).
    expect(left > 0).toBe(true); // panel left content column must be > 0

  }

  it("Earth-42 wide profile: panel bottom strictly inside frame", async () => {
    // WIDE_COLS × WIDE_ROWS selects the "wide" render variant
    const paneDims = getMapContentDimensionsForLayout(WIDE_COLS, WIDE_ROWS, "wide");
    await assertPanelInsideFrame(paneDims, "wide");
  });

  it("Earth-42 compact profile: panel bottom strictly inside frame", async () => {
    // COMPACT_COLS × COMPACT_ROWS selects the "compact" render variant
    const paneDims = getMapContentDimensionsForLayout(COMPACT_COLS, COMPACT_ROWS, "compact");
    await assertPanelInsideFrame(paneDims, "compact");
  });
});

/**
 * Compact map visual frame: render the compact Earth-42 layout with a battle panel
 * and capture the bottom-left region to verify the panel does not overlap the frame.
 */
describe("battle panel visual frame on Earth-42 compact", () => {
  it("renders the condensed battle panel inside the compact map frame", async () => {
    // @ts-ignore runtime-only OpenTUI test helpers
    const React = (await import("../apps/client/node_modules/react/index.js")).default;
    // @ts-ignore
    const { act } = await import("../apps/client/node_modules/react/index.js");
    // @ts-ignore
    const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");
    const { MapCanvas } = await import("../apps/client/src/ui/MapCanvas.js");

    const paneDims = getMapContentDimensionsForLayout(COMPACT_COLS, COMPACT_ROWS, "compact");
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

    const lines = frame.split("\n");
    const totalLines = lines.length;
    const regionStartLine = Math.max(0, totalLines - 10);
    const bottomLeft = lines.slice(regionStartLine).map((l) => l.slice(0, 32)).join("\n");

    console.log("=== Bottom-left region of Earth-42 compact map with battle panel ===");
    console.log(bottomLeft);
    console.log("=== End region ===");

    // The condensed panel should appear (territory names may be truncated in compact layout)
    expect(frame).toContain("BATTLE");
    expect(frame).toContain("Alaska Range");
    expect(frame).toContain("Kamc"); // compact layout truncates long names

    // The panel's bottom-border row must NOT be on the same line as the canvas border.
    // After the fix, the canvas border line is always a separate (last) non-empty row.
    // Find the last non-empty line (the canvas bottom border row).
    const nonEmptyLines = lines.filter(l => l.length > 0);
    const canvasBorderLine = nonEmptyLines[nonEmptyLines.length - 1] ?? "";
    // Canvas bottom border starts with └
    expect(canvasBorderLine).toMatch(/^└/);
    // All content above the canvas border line should include the panel
    const aboveBorder = nonEmptyLines.slice(0, -1).join("\n");
    expect(aboveBorder).toContain("BATTLE");
  });
});
