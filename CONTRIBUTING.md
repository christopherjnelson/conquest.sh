# Contributing to conquest.sh

Thanks for your interest in contributing!

---

## Setup

```bash
# Prerequisites: Bun 1.4.2 (see .bun-version)
bun install --frozen-lockfile
```

## Verify

```bash
bun run check
```

This runs the full test suite followed by TypeScript type-checking (`tsc --noEmit`). Both must pass before opening a PR.

---

## Test Conventions

- Tests live in `tests/`. Do **not** write to the repository root or to any path outside the test runner's sandbox.
- Territory assignment is **non-deterministic** by default (shuffled per match). If a test depends on specific territory ownership, either:
  - Derive moves from the observed `GameState` after start, or
  - Inject a fixed `rngSeed` via `ConquestServer` options (see `tests/earth-deployment-e2e.test.ts` for examples).
- UI tests use OpenTUI's `testRender` / `captureCharFrame` / `captureSpans` from `@opentui/react/test-utils`. Keep rendered terminal dimensions explicit so layout mode is predictable.

---

## Branch & PR Flow

1. Fork the repository and create a feature branch off `main`:
   ```bash
   git checkout -b feat/your-feature
   ```
2. Make your changes, run `bun run check`, commit.
3. Open a pull request against `main`. Fill out the PR template.
4. CI runs tests and typecheck automatically on every push.

---

## Code Style

- TypeScript throughout. No `any` in library code without a comment justifying it.
- Pure-function game logic belongs in `packages/game-core`. Server I/O belongs in `apps/server`. UI belongs in `apps/client`.
- New maps go in `packages/map-engine/src/maps/` as registered bundles with topology and geometry tests.

---

## Performance

Game-core actions (`deployUnits`, `attackTerritory`, etc.) are pure functions that must **never** copy or replace `state.history`. They return `{ state, events }` where `state.history` is the same array reference as the input; `GameRoom` is the sole owner and appends via `state.history.push(...events)` after each action.

To benchmark history-append performance manually:

```bash
bun run scripts/bench-history.ts
```

This runs 6k seeded bot actions on Earth-42 (6 players) in both the new append-only mode and a simulated old copy-per-action mode, reporting median µs/action for the first and last 1k steps. The new code should show a ratio near 1× (flat); the old pattern grows to ≥ 7× by action 6k.

The `tests/frozen-history.test.ts` suite guards this deterministically: it calls every game-core action on a state with a frozen history array (any mutation throws) and also runs a 2k-action seeded simulation asserting `result.state.history === inputHistory` on every step.

---

## Questions?

Open a [GitHub Discussion](https://github.com/christopherjnelson/conquest.sh/discussions) or an issue.
