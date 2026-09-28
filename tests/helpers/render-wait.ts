/**
 * Shared wait helpers for OpenTUI frame assertions.
 *
 * OpenTUI's character buffer can lag a render cycle behind React's commit,
 * especially when a component mounts or unmounts (e.g. an overlay appearing
 * or a toast text changing).  On a CI runner under load, the lag becomes
 * visible: a test that calls setup.renderOnce() inside act() and then
 * immediately asserts on setup.captureCharFrame() can see a stale frame.
 *
 * These helpers repeatedly call renderOnce() and re-check captureCharFrame()
 * until the predicate is satisfied or a deadline is exceeded.  They build on
 * the built-in setup.waitForFrame() for the common scheduler-driven case and
 * fall back to explicit render pumping for the cases where the OpenTUI
 * scheduler has gone idle before the React commit has been flushed into the
 * character buffer.
 *
 * Usage:
 *
 *   import { waitForFrameToContain, waitForFrameNotToContain } from "./helpers/render-wait.js";
 *
 *   // positive assertion
 *   await waitForFrameToContain(setup, "SKIP ATTACK PHASE?");
 *   expect(setup.captureCharFrame()).toContain("SKIP ATTACK PHASE?");
 *
 *   // negative assertion
 *   await waitForFrameNotToContain(setup, "SKIP ATTACK PHASE?");
 *   expect(setup.captureCharFrame()).not.toContain("SKIP ATTACK PHASE?");
 */

/** Minimal subset of TestRendererSetup that our helpers need. */
export interface RenderSetup {
  renderOnce: () => Promise<void>;
  captureCharFrame: () => string;
  waitForFrame: (
    predicate: (frame: string) => boolean,
    options?: { maxPasses?: number },
  ) => Promise<string>;
}

export interface WaitForFrameOptions {
  /** Maximum wall-clock time to wait before throwing.  Default: 3000 ms. */
  timeoutMs?: number;
  /**
   * Human-readable description of what we are waiting for, included in the
   * timeout error to aid debugging.
   */
  description?: string;
  /**
   * Maximum number of extra renderOnce() pumps to attempt after the built-in
   * waitForFrame returns.  Default: 60.
   */
  maxRenders?: number;
}

/**
 * Wait until predicate(captureCharFrame()) returns true, pumping extra render
 * cycles as needed to flush React commits into the OpenTUI character buffer.
 *
 * Returns the first frame that satisfies the predicate.
 * Throws with a descriptive error (including the last frame excerpt) on timeout.
 */
export async function waitForFrame(
  setup: RenderSetup,
  predicate: (frame: string) => boolean,
  options: WaitForFrameOptions = {},
): Promise<string> {
  const { timeoutMs = 3000, description, maxRenders = 60 } = options;

  // Fast path: the built-in waitForFrame already handles the common case where
  // the scheduler has pending renders queued.
  try {
    const frame = await setup.waitForFrame(predicate, { maxPasses: 50 });
    return frame;
  } catch {
    // Falls through to the pump loop below.
  }

  // Slow path: pump explicit render cycles until the predicate is met or we
  // exceed the deadline / iteration cap.  This handles the case where the
  // OpenTUI scheduler believes it is idle but React still has pending work
  // (e.g. a useEffect cleanup that unmounts an overlay).
  const deadline = Date.now() + timeoutMs;
  let lastFrame = setup.captureCharFrame();
  if (predicate(lastFrame)) return lastFrame;

  for (let i = 0; i < maxRenders && Date.now() < deadline; i++) {
    await setup.renderOnce();
    lastFrame = setup.captureCharFrame();
    if (predicate(lastFrame)) return lastFrame;
    // Yield to the event loop so React can schedule any deferred effects.
    await new Promise<void>(resolve => process.nextTick(resolve));
    lastFrame = setup.captureCharFrame();
    if (predicate(lastFrame)) return lastFrame;
  }

  const excerpt = lastFrame.split("\n").slice(0, 15).join("\n");
  throw new Error(
    `waitForFrame timed out after ${timeoutMs} ms` +
      (description ? ` — expected: ${description}` : "") +
      `\nLast frame (first 15 rows):\n${excerpt}\n`,
  );
}

/**
 * Wait until the rendered frame contains `text`.
 * Equivalent to `waitForFrame(setup, frame => frame.includes(text))`.
 */
export async function waitForFrameToContain(
  setup: RenderSetup,
  text: string,
  options?: WaitForFrameOptions,
): Promise<string> {
  return waitForFrame(setup, frame => frame.includes(text), {
    description: `frame to contain ${JSON.stringify(text)}`,
    ...options,
  });
}

/**
 * Wait until the rendered frame no longer contains `text`.
 * Equivalent to `waitForFrame(setup, frame => !frame.includes(text))`.
 */
export async function waitForFrameNotToContain(
  setup: RenderSetup,
  text: string,
  options?: WaitForFrameOptions,
): Promise<string> {
  return waitForFrame(setup, frame => !frame.includes(text), {
    description: `frame NOT to contain ${JSON.stringify(text)}`,
    ...options,
  });
}
