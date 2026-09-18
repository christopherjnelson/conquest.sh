# conquest.sh

```text
╔══════════════════════════════════════════════╗
║                 conquest.sh                  ║
║                                              ║
║        conquer • negotiate • survive         ║
╚══════════════════════════════════════════════╝
```

A modern, multiplayer-first terminal territorial strategy game built with **OpenTUI** (`@opentui/core` + `@opentui/react`), **TypeScript**, and **Bun**.

Inspired by the high-level territory-control loop of classic grand strategy games, reimagined as a terminal-native, clickable, keyboard-first tactical battle for continental dominion.

---

## Features

- **Server Authoritative**: All dice rolls, reinforcements, validations, and game rules are computed and verified server-side. Clients send intents; the server resolves canonical outcomes.
- **Clickable & Keyboard-Navigable Realm Map**: Built with OpenTUI with native mouse tracking (click territories and command chips directly in your terminal) and keyboard navigation (`Tab`, spatial arrow keys, `[A]ttack`, `[D]eploy`, `[F]ortify`, `[E]nd Turn`, `[C]hat`, `[Q]uit`).
- **The Ironreach Realm**: An original 10-territory fictional continent partitioned across 3 strategic regions:
  - ❄ **Northreach** (+3 bonus armies): *Frostfell, Highwatch, Iron Hollow*
  - ⚔ **The Marches** (+2 bonus armies): *Stoneveil, Red Basin, Mossgate, Sunken Pass*
  - 🌋 **Emberlands** (+3 bonus armies): *Ember Coast, Ashmoor, Hollowmere*
- **Tactical Territory Intel & Roster**: Rich side inspector showing realm lords, standing garrison armies, territory flavor lore, and interactive neighbor attack/fortify chips.
- **Resilient Reconnection**: Sessions generate isolated per-player session tokens. Closing and reopening your terminal seamlessly reconnects you to your ongoing match with state intact.
- **Instant Local / Self-Hosted Multiplayer**: Lightweight standalone server with WebSocket matchmaking, HTTP health checks, and SQLite session persistence.

---

## Project Structure

```text
conquest.sh/
├── apps/
│   ├── client/              # OpenTUI clickable React terminal UI & CLI
│   │   ├── src/network/     # WebSocket client & reconnect manager
│   │   ├── src/ui/          # MapCanvas, Sidebar, Header, EventLog, Footer, App
│   │   └── src/index.ts     # Client CLI entry point
│   └── server/              # Authoritative Bun WebSocket server & SQLite store
│       ├── src/room.ts      # Matchmaking & GameRoom lifecycle
│       ├── src/server.ts    # WebSocket server & HTTP endpoints
│       ├── src/session.ts   # SQLite session persistence
│       └── src/index.ts     # Server CLI entry point
├── packages/
│   ├── game-core/           # Pure deterministic rules, combat, reinforcements, state machine
│   ├── map-engine/          # Ironreach map schema, layout engine, bounding box bounds
│   ├── protocol/            # Zod schemas, typed client intents, server events, snapshots
│   └── shared/              # Colors, ANSI styling, IDs, logger
├── tests/
│   ├── game-core.test.ts    # Unit tests for combat, rules, conquests, win conditions
│   ├── map-engine.test.ts   # Tests for Ironreach schema, adjacency symmetry, bounding boxes
│   ├── ui.test.ts           # Chronicle formatting & non-overlapping realm layout tests
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

All 37 tests across the game core, map engine, UI formatting, authoritative server, and client flow should pass.

---

## Playing (Two Terminals)

### Step 1: Start the Authoritative Server

In Terminal 1:

```bash
./conquest-server.sh --port 4000
```

The server starts listening on `http://localhost:4000` with WebSocket support, health check, and active room tracking.

### Step 2: Connect Player 1

In Terminal 2:

```bash
./conquest.sh Alice
```

Alice joins the quick-match lobby and awaits an opponent.

### Step 3: Connect Player 2

In Terminal 3:

```bash
./conquest.sh Bob
```

Bob joins the same match. The game automatically begins:
- The 10 territories of **The Ironreach** are distributed evenly (5 each).
- Initial armies are placed on all realms (3 armies each).
- Player 1 (Alice) becomes the active sovereign in the **Deployment** phase with reinforcements.

---

## Controls

### Mouse
- **Click Territory Realm**: Selects realm for inspection and tactical orders.
- **Click Neighboring Realm**: Sets adjacent enemy as invasion target or friendly realm as fortify destination.
- **Click Neighbor Chips**: In the right sidebar, click `[Attack ⚔]` or `[Fortify 🛡]` directly beside any bordering realm.
- **Click War Council Buttons**: `[ Deploy (+N) ]`, `[ Attack Target ]`, `[ Fortify Troops ]`, `[ Skip / End Turn ]`.

### Keyboard
- **`Tab` / `Shift+Tab`**: Cycle selected territory across the continent.
- **`Arrow Keys`**: Spatial 2D navigation between territories on the map grid.
- **`D`**: Deploy pending reinforcements to selected friendly territory.
- **`A`**: Attack selected enemy neighbor from selected territory.
- **`F`**: Fortify troops between connected friendly territories.
- **`E`**: Skip current phase or End Turn.
- **`C`**: Toggle in-game Raven Chat input box.
- **`Esc`**: Clear target/selection or close chat.
- **`Q`**: Quit game client cleanly (restoring terminal screen).

---

## Testing Reconnection

1. While playing in Terminal 3 (Bob), close the window or hit `Ctrl+C`.
2. Notice Terminal 2 (Alice) reports `Lord Bob disconnected` in the chronicle event log.
3. Re-run in Terminal 3:
   ```bash
   ./conquest.sh Bob
   ```
4. Bob automatically resumes with his cached session token! The authoritative game state is restored seamlessly.
