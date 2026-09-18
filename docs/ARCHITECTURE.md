# conquest.sh Architecture & Technical Design

## 1. Executive Summary

`conquest.sh` is a modern, multiplayer-first terminal territorial strategy game. It pairs a server-authoritative backend with a clickable, responsive Terminal User Interface (TUI) built using OpenTUI (`@opentui/core` and `@opentui/react`).

The core loop focuses on strategic territory control, resource reinforcements, combat resolution, and tactical fortification. From the first milestone, multiplayer and server authority are the foundational pillars.

---

## 2. Monorepo Structure

```text
conquest.sh/
├── apps/
│   ├── client/              # OpenTUI client (CLI, terminal renderer, keyboard & mouse controls)
│   │   ├── src/
│   │   │   ├── ui/          # React OpenTUI components (MapCanvas, Sidebar, ActionModal, Chat)
│   │   │   ├── network/     # WebSocket client & reconnect manager
│   │   │   ├── state/       # Client game state store
│   │   │   └── index.ts     # CLI entry point
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── server/              # Authoritative server (WebSockets, RoomManager, SQLite sessions)
│       ├── src/
│       │   ├── server.ts    # WebSocket server lifecycle
│       │   ├── room.ts      # Game room / match manager
│       │   ├── session.ts   # Reconnect token store & SQLite persistence
│       │   └── index.ts     # Server CLI entry point
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   ├── game-core/           # Pure, deterministic game state machine & combat engine
│   │   ├── src/
│   │   │   ├── state.ts     # Game state types & initialization
│   │   │   ├── rules.ts     # Reinforcements, validation, turn transitions
│   │   │   ├── combat.ts    # Probabilistic server-side dice & conquest logic
│   │   │   └── index.ts
│   │   └── package.json
│   ├── protocol/            # Shared typed protocol with Zod schemas
│   │   ├── src/
│   │   │   ├── messages.ts  # Client & Server message definitions
│   │   │   ├── events.ts    # Structured game events
│   │   │   └── index.ts
│   │   └── package.json
│   ├── map-engine/          # Map topology, layout coordinates, ASCII/Unicode connectors
│   │   ├── src/
│   │   │   ├── maps/        # Predefined maps (Sector 07, Kernel Grid)
│   │   │   ├── layout.ts    # Terminal coordinate calculation & grid rendering
│   │   │   └── index.ts
│   │   └── package.json
│   └── shared/              # Shared constants, colors, ID generators, logging
│       ├── src/
│       │   ├── colors.ts    # ANSI & RGB color utilities
│       │   ├── id.ts        # Nanoid / token generation
│       │   └── index.ts
│       └── package.json
├── tests/                   # Integration & end-to-end tests
├── package.json             # Monorepo root workspace
├── tsconfig.json            # Base TypeScript config
└── README.md
```

---

## 3. Server-Authoritative State & Turn Model

Clients emit **intents** (`client:deploy`, `client:attack`, `client:fortify`, `client:end_turn`).
The server processes these strictly through `game-core`:

```text
Client A (Intent: Attack)  ─┐
                           ├─► Server validates & executes combat (deterministic PRNG)
Client B (Observes)        ─┘         │
                                      ▼
                        Broadcast Event + State Snapshot
                                      ▼
                       Both terminals update immediately
```

### Turn Phases:
1. **Deployment**: Player receives reinforcements based on owned territories ($\max(3, \lfloor N/3 \rfloor)$) plus continent bonuses. Deploys units to owned territories.
2. **Attack**: Player can attack adjacent enemy territories from any owned territory with $\ge 2$ units. Resolves probabilistic combat. If territory is conquered, units move in.
3. **Fortify**: Player may optionally move units from one owned territory to another connected owned territory.
4. **End Turn**: Passes turn to next living player, recalculates reinforcements, updates turn number.

---

## 4. Reconnection & Session Handling

Each connected client receives a unique `sessionToken`.
- If a terminal closes or the network drops, the server retains the game room and marks `connected = false`.
- When the client reconnects with its stored `sessionToken`, the server restores the player's identity and emits an authoritative `server:snapshot`.
- The game state is unaffected by client disconnection.

---

## 5. Development Map: "Sector 07"

An 8-territory cyber-defense topology optimized for terminal grids:

- **WAN Sector (Bonus: +2)**:
  - `A1: GATEWAY` (Connects to A2, A3, B1)
  - `A2: FIREWALL` (Connects to A1, A3, C1)
  - `A3: ROUTER` (Connects to A1, A2, B2, C1)
- **DMZ Sector (Bonus: +2)**:
  - `B1: PROXY` (Connects to A1, B2, C2)
  - `B2: SUBNET` (Connects to A3, B1, C2)
- **CORE Sector (Bonus: +3)**:
  - `C1: KERNEL` (Connects to A2, A3, C2)
  - `C2: DAEMON` (Connects to B1, B2, C1, C3)
  - `C3: VAULT` (Connects to C2)

---

## 6. OpenTUI Terminal Architecture

The client uses `@opentui/core` and `@opentui/react`:
- Full mouse support: clicking territory boxes, action buttons, selecting target nodes.
- Full keyboard support: Arrow keys / `hjkl` navigation, hotkeys `[A]`ttack, `[D]`eploy, `[F]`ortify, `[E]`nd Turn, `[C]`hat.
- Responsive layout: adapts to terminal height & width.
- Rich terminal aesthetics: Unicode box borders, ANSI colors, health/strength gauges, status badges.
