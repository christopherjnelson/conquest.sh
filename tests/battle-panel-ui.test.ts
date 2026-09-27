/**
 * BattlePanel render tests – assert dice values, pair outcomes, and conquest banner.
 * animate=false so we get stable (non-randomised) dice.
 */
import { describe, expect, it } from "bun:test";
import type { BattleReport } from "../apps/client/src/ui/battle-report.js";

function makeReport(overrides: Partial<BattleReport> = {}): BattleReport {
  return {
    key: "test-key",
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
    engagementRound: 1,
    engagementAttackerLosses: 1,
    engagementDefenderLosses: 1,
    ...overrides,
  };
}

async function renderPanel(report: BattleReport, condensed = false): Promise<string> {
  // @ts-ignore runtime-only OpenTUI test helpers
  const React = (await import("../apps/client/node_modules/react/index.js")).default;
  // @ts-ignore
  const { act } = await import("../apps/client/node_modules/react/index.js");
  // @ts-ignore
  const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");
  const { BattlePanel } = await import("../apps/client/src/ui/BattlePanel.js");

  const setup = await testRender(
    React.createElement(BattlePanel, { report, animate: false, condensed }),
    { width: 40, height: 12 },
  );
  await act(async () => { await setup.renderOnce(); });
  const frame: string = setup.captureCharFrame();
  await act(async () => { setup.renderer.destroy(); });
  return frame;
}

describe("BattlePanel render (animate=false)", () => {
  it("renders attacker and defender dice values", async () => {
    const frame = await renderPanel(makeReport());
    // Dice values should appear in the frame
    expect(frame).toContain("6");
    expect(frame).toContain("5");
    // Header
    expect(frame).toContain("BATTLE");
    expect(frame).toContain("Round 1");
    // Player name
    expect(frame).toContain("Atlas");
    // Territory names
    expect(frame).toContain("Alaska Range");
    expect(frame).toContain("Kamchatka");
  });

  it("shows win/loss outcome indicators", async () => {
    const frame = await renderPanel(makeReport());
    expect(frame).toContain("✓"); // attacker win on pair 0
    expect(frame).toContain("✗"); // attacker loss on pair 1
    expect(frame).toContain("tie→DEF"); // tie marker on pair 1 (4 vs 4)
  });

  it("renders conquest banner when conquered=true", async () => {
    const conquestReport = makeReport({
      conquered: true,
      pairs: [],
      unpairedAttackerDice: [],
    });
    const frame = await renderPanel(conquestReport);
    // Banner shows "CONQUERED" + territory name (not just "CONQUERED!")
    expect(frame).toContain("CONQUERED");
    expect(frame).toContain("Kamchatka");
    // Should NOT show the outcome checkmarks
    expect(frame).not.toContain("✓");
    expect(frame).not.toContain("✗");
  });

  it("renders troop count lines", async () => {
    const frame = await renderPanel(makeReport());
    // Two-line troop format: "ATK 7→6 −1" / "DEF 3→2 −1"
    expect(frame).toContain("ATK 7→6");
    expect(frame).toContain("DEF 3→2");
  });

  it("renders the condensed variant", async () => {
    const frame = await renderPanel(makeReport(), true);
    expect(frame).toContain("BATTLE R1");
    // Dice shown inline
    expect(frame).toContain("6");
    expect(frame).toContain("5");
    // Location info
    expect(frame).toContain("Alaska Range");
  });

  it("truncates long names and handles 3-digit counts without exceeding reserved dimensions", async () => {
    // @ts-ignore runtime-only
    const React = (await import("../apps/client/node_modules/react/index.js")).default;
    // @ts-ignore
    const { act } = await import("../apps/client/node_modules/react/index.js");
    // @ts-ignore
    const { testRender } = await import("../apps/client/node_modules/@opentui/react/test-utils.js");
    const { BattlePanel, FULL_W, FULL_H, COND_W, COND_H } = await import("../apps/client/src/ui/BattlePanel.js");

    const longReport: BattleReport = makeReport({
      attackerName: "Bartholomew Thunderstrike",
      sourceTerritoryName: "Northwestern Canadian Territories",
      targetTerritoryName: "Central Asian Steppes and Plains",
      attackerUnitsBefore: 123,
      attackerUnitsAfter: 120,  // 123 - 2 losses - 1 moved (non-conquest, so unitsMoved undefined)
      defenderUnitsBefore: 100,
      defenderUnitsAfter: 98,
      attackerLosses: 2,
      defenderLosses: 2,
      engagementRound: 15,
      engagementAttackerLosses: 12,
      engagementDefenderLosses: 8,
    });

    // Full panel
    const fullSetup = await testRender(
      React.createElement(BattlePanel, { report: longReport, animate: false, condensed: false }),
      { width: FULL_W, height: FULL_H },
    );
    await act(async () => { await fullSetup.renderOnce(); });
    const fullFrame: string = fullSetup.captureCharFrame();
    await act(async () => { fullSetup.renderer.destroy(); });

    // Each line must fit within FULL_W columns
    const fullLines = fullFrame.split("\n").filter(Boolean);
    for (const line of fullLines) {
      expect(line.length, `Full panel line exceeds ${FULL_W} cols: "${line}"`).toBeLessThanOrEqual(FULL_W);
    }
    // Total rendered height must match FULL_H
    expect(fullLines.length, "Full panel height").toBe(FULL_H);

    // Long territory name should be truncated (ends with …)
    expect(fullFrame).toContain("…");

    // Condensed panel
    const condSetup = await testRender(
      React.createElement(BattlePanel, { report: longReport, animate: false, condensed: true }),
      { width: COND_W, height: COND_H },
    );
    await act(async () => { await condSetup.renderOnce(); });
    const condFrame: string = condSetup.captureCharFrame();
    await act(async () => { condSetup.renderer.destroy(); });

    const condLines = condFrame.split("\n").filter(Boolean);
    for (const line of condLines) {
      expect(line.length, `Cond panel line exceeds ${COND_W} cols: "${line}"`).toBeLessThanOrEqual(COND_W);
    }
    expect(condLines.length, "Condensed panel height").toBe(COND_H);
  });
});
