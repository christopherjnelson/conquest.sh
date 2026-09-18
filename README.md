# conquest.sh

```text
╔══════════════════════════════════════════════╗
║                 conquest.sh                  ║
║                                              ║
║        conquer • negotiate • survive         ║
╚══════════════════════════════════════════════╝
```

A modern, multiplayer-first terminal territorial strategy game built with **OpenTUI** (`@opentui/core` + `@opentui/react`), **TypeScript**, and **Bun**.

Inspired by the high-level territory-control loop of games like Risk, but reimagined as a terminal-native, clickable, keyboard-first cyberpunk battle for network dominance.

---

## Features

- **Server Authoritative**: All dice rolls, reinforcements, validations, and game rules are computed and verified server-side.
- **Clickable Terminal UI**: Built with OpenTUI with native mouse tracking (click territories and buttons directly in your terminal) and keyboard navigation (`Tab`, `hjkl`/arrow keys, `[A]ttack`, `[D]eploy`, `[F]ortify`, `[E]nd Turn`, `[C]hat`).
- **Resilient Reconnection**: Disconnected sessions generate a local session token. Closing and reopening your terminal seamlessly reconnects you to your active match with state intact.
- **Sector 07 Dev Map**: 8-territory cyber-defense perimeter (WAN, DMZ, CORE sectors) designed specifically for standard terminal grids with ASCII/Unicode connectors.
- **Instant Local / Self-Hosted Multi-Player**: Standalone server with built-in WebSocket support and SQLite session persistence.

---

## Project Structure

```text
conquest.sh/
├── apps/
│   ├── client/              # OpenTUI clickable React terminal UI & CLI
│   └── server/              # Authoritative Bun WebSocket server & SQLite store
├── packages/
│   ├── game-core/           # Pure deterministic rules, combat, reinforcements, state machine
│   ├── map-engine/          # Sector 07 map definition, layout & bounding boxes
│   ├── protocol/            # Zod schemas, typed client intents, server events, snapshots
│   └── shared/              # Colors, ANSI styling, IDs, logger
├── tests/
│   ├── game-core.test.ts    # Unit tests for combat, rules, conquests, win conditions
│   ├── server.test.ts       # Server integration tests (multi-client WebSocket lifecycle)
│   └── client-flow.test.ts  # End-to-end client network flow & reconnection tests
├── conquest.sh              # Client executable wrapper script
├── conquest-server.sh       # Server executable wrapper script
└── docs/
    └── ARCHITECTURE.md      # Detailed architectural specification
```

---

## Quickstart

### Prerequisites

- [Bun](https://bun.sh) (v1.2+) or Node.js (v22+)

### 1. Install Dependencies

```bash
bun install
```

### 2. Run Test Suite

```bash
bun test
```

All 15 tests across the game core, authoritative server, and client flow should pass.

---

## Playing Milestone 1 (Two Terminals)

### Step 1: Start the Authoritative Server

In Terminal 1:

```bash
./conquest-server.sh --port 4000
```

The server starts listening on `http://localhost:4000` with WebSocket support, health check, and active room tracking.

### Step 2: Connect Player 1

In Terminal 2:

```bash
./conquest.sh --server localhost:4000 --name Alice
```

Alice joins the lobby and waits for an opponent.

### Step 3: Connect Player 2

In Terminal 3:

```bash
./conquest.sh --server localhost:4000 --name Bob
```

Bob joins the same game. The game auto-starts:
- Territories in Sector 07 are evenly distributed.
- Initial units are assigned (3 units each).
- Player 1 (Alice) becomes the active player in the **Deployment** phase with reinforcements.

---

## Controls

### Mouse
- **Click Territory Box**: Selects territory.
- **Click Neighbor Box**: Selects adjacent target territory.
- **Click Action Buttons**: `[ Deploy ]`, `[ Attack ]`, `[ Fortify ]`, `[ Skip / End Turn ]`.

### Keyboard
- **`Tab` / `Shift+Tab`**: Cycle selected territory.
- **`Arrow Keys`**: Spatial 2D navigation between territories on the map grid.
- **`D`**: Deploy pending reinforcements to selected friendly territory.
- **`A`**: Attack selected enemy neighbor from selected territory.
- **`F`**: Fortify troops between connected friendly territories.
- **`E`**: Skip current phase or End Turn.
- **`C`**: Toggle in-game Chat input box.
- **`Esc`**: Clear selection or cancel action.
- **`Q`**: Quit game client (restoring terminal screen).

---

## Testing Reconnection

1. While playing in Terminal 3 (Bob), close the window or hit `Ctrl+C`.
2. Notice Terminal 2 (Alice) reports `Player Bob disconnected` in the event log.
3. Re-run in Terminal 3:
   ```bash
   ./conquest.sh --server localhost:4000
   ```
4. Bob automatically resumes with their cached session token! The authoritative game state is restored seamlessly.
