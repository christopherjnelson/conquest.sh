import { describe, expect, it } from "bun:test";
import { GameClient } from "../apps/client/src/network/client.js";

describe("bot room setup UI", () => {
  it("submits bot seats from keyboard and mouse controls at supported sizes", async () => {
    // @ts-ignore OpenTUI runtime dependency
    const React=(await import("../apps/client/node_modules/react/index.js")).default;
    // @ts-ignore OpenTUI runtime dependency
    const { act }=await import("../apps/client/node_modules/react/index.js");
    // @ts-ignore OpenTUI runtime dependency
    const { testRender }=await import("../apps/client/node_modules/@opentui/react/test-utils.js");
    const { CreateGameScreen }=await import("../apps/client/src/ui/CreateGameScreen.js");

    for (const size of [{ columns: 105, rows: 34 }, { columns: 140, rows: 45 }, { columns: 180, rows: 51 }]) {
      let submitted: any;
      const setup=await testRender(React.createElement(CreateGameScreen, {
        defaultName: "Bot Room",
        onCreate: (options: unknown) => { submitted=options; },
        onBack: () => { },
        terminalDimensions: size,
      }), { width: size.columns, height: size.rows });
      await act(async () => { await setup.renderOnce(); });
      await setup.waitFor(() => (setup.renderer.keyInput as any).listenerCount("keypress")>=1);
      const frame=setup.captureCharFrame();
      expect(frame).toContain("BOT SEATS");
      expect(frame).toContain("GAME NAME");
      expect(frame).toContain("MAXIMUM PLAYERS");
      expect(frame).toContain("LOBBY VISIBILITY");
      expect(frame).toContain("CARDS:");
      expect(frame).toContain("Escalating");
      expect(frame).toContain("[ − ]");
      expect(frame).toContain("[ + ]");
      expect(frame).toContain("Create Game");
      expect(frame.trimEnd().split("\n").length).toBeLessThanOrEqual(size.rows);

      if (size.columns===105) {
        await act(async () => { setup.mockInput.pressKey("p", { ctrl: true }); await setup.flush(); await setup.renderOnce(); });
        await setup.waitFor(() => setup.captureCharFrame().includes("1 bot · 1 human seats · 2 total"), { timeoutMs: 1000 });
        await act(async () => { setup.mockInput.pressEnter(); await setup.renderOnce(); });
        expect(submitted).toMatchObject({ maxPlayers: 2, botCount: 1, visibility: "unlisted" });
      } else if (size.columns===140) {
        await act(async () => { setup.mockInput.pressTab(); await setup.renderOnce(); });
        await act(async () => { setup.mockInput.pressArrow("right"); await setup.renderOnce(); });
        await act(async () => { setup.mockInput.pressArrow("right"); await setup.renderOnce(); });
        await act(async () => { setup.mockInput.pressArrow("left"); await setup.renderOnce(); });
        await act(async () => { setup.mockInput.pressArrow("left"); await setup.renderOnce(); });
        await act(async () => { setup.mockInput.pressArrow("left"); await setup.renderOnce(); });
        await act(async () => { setup.mockInput.pressTab(); await setup.renderOnce(); });
        await act(async () => { setup.mockInput.pressTab(); await setup.renderOnce(); });
        await act(async () => { setup.mockInput.pressTab(); await setup.renderOnce(); });
        await act(async () => { setup.mockInput.pressArrow("right"); await setup.renderOnce(); });
        await act(async () => { setup.mockInput.pressArrow("right"); await setup.renderOnce(); });
        const beforeClamp = setup.captureCharFrame();
        const capacityRow = beforeClamp.split("\n").findIndex((row: string) => row.includes("Decrement"));
        const decrementColumn = beforeClamp.split("\n")[capacityRow]?.indexOf("Decrement") ?? -1;
        await act(async () => { await setup.mockMouse.click(decrementColumn, capacityRow); await setup.renderOnce(); });
        await act(async () => { await setup.mockMouse.click(decrementColumn, capacityRow); await setup.renderOnce(); });
        expect(setup.captureCharFrame()).toContain("1 bot · 1 human seats · 2 total");
        await act(async () => { setup.mockInput.pressEnter(); await setup.renderOnce(); });
        expect(submitted).toMatchObject({ maxPlayers: 2, botCount: 1 });
      } else {
        const latestFrame=setup.captureCharFrame();
        const line=latestFrame.split("\n").findIndex((row: string) => row.includes("0 bots"));
        const column=latestFrame.split("\n")[line]?.indexOf("[ + ]")??-1;
        expect(line).toBeGreaterThanOrEqual(0);
        expect(column).toBeGreaterThanOrEqual(0);
        await act(async () => { await setup.mockMouse.click(column, line); await setup.renderOnce(); });
        await setup.waitFor(() => setup.captureCharFrame().includes("1 bot · 3 human seats · 4 total"), { timeoutMs: 1000 });
        expect(setup.captureCharFrame()).toContain("1 bot · 3 human seats · 4 total");
        await act(async () => { setup.mockInput.pressEnter(); await setup.renderOnce(); });
        expect(submitted).toMatchObject({ maxPlayers: 4, botCount: 1, visibility: "public" });
      }
      await act(async () => { setup.renderer.destroy(); });
    }
  });

  it("includes the selected bot count in the create room network payload", () => {
    const client=new GameClient({ playerName: "Solo" });
    let message: any;
    client.send=(msg: any) => { message=msg; };
    client.createRoom({ displayName: "Practice", maxPlayers: 2, botCount: 1, visibility: "unlisted" });
    expect(message).toMatchObject({ type: "client:create_room", displayName: "Practice", maxPlayers: 2, botCount: 1, visibility: "unlisted" });
  });
});
