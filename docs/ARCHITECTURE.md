# conquest.sh Architecture & Technical Design

## 1. Executive Summary

`conquest.sh` is a modern, multiplayer-first terminal territorial strategy game. It pairs a server-authoritative backend with a clickable, responsive Terminal User Interface (TUI) built using OpenTUI (`@opentui/core` and `@opentui/react`).

The game centers on territorial conquest across a fictional continent ("The Ironreach"). Players command factions, deploy reinforcements, mount invasions across frontiers, fortify positions, and negotiate in real time. From the first milestone, multiplayer and server authority are the foundational pillars.

---

## 2. Monorepo Structure

```text
conquest.sh/
├── apps/
│   ├── client/              # OpenTUI clickable React client (CLI, terminal renderer, keyboard & mouse controls)
│   │   ├── src/
│   │   │   ├── ui/          # OpenTUI components (MapCanvas, Sidebar, Header, EventLog, Footer, App)
│   │   │   ├── network/     # WebSocket client & reconnect manager
│   │   │   ├── state/       # Client game state store
│   │   │   └── index.ts     # CLI entry point
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── server/              # Authoritative server (WebSockets, RoomManager, SQLite sessions)
│       ├── src/
│       │   ├── server.ts    # WebSocket server lifecycle & HTTP health endpoints
│       │   ├── room.ts      # Game room / matchmaking manager
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
│   │   │   ├── events.ts    # Structured game events & territory schemas
│   │   │   └── index.ts
│   │   └── package.json
│   ├── map-engine/          # Realm map topologies, layout coordinates, bounding boxes
│   │   ├── src/
│   │   │   ├── maps/        # Predefined maps (ironreach.ts, sector-07.ts)
│   │   │   ├── layout.ts    # Terminal coordinate calculation & area detection
│   │   │   └── index.ts
│   │   └── package.json
│   └── shared/              # Shared constants, colors, ID generators, logging
│       ├── src/
│       │   ├── colors.ts    # ANSI & RGB color utilities
│       │   ├── id.ts        # Nanoid / token generation
│       │   └── index.ts
│       └── package.json
├── tests/                   # Integration & unit test suites (37 passing tests)
├── conquest.sh              # Client executable wrapper
├── conquest-server.sh       # Server executable wrapper
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
1. **Deployment**: Sovereign receives reinforcements based on owned territories ($\max(3, \lfloor N/3 \rfloor)$) plus continental control bonuses. Deploys armies to owned realms.
2. **Attack**: Sovereign can mount an assault against adjacent enemy realms from any owned territory with $\ge 2$ armies. Resolves probabilistic combat (highest-to-highest comparison, defender wins ties). If realm is conquered, victorious armies occupy the land.
3. **Fortify**: Sovereign may redeploy garrison troops between friendly connected territories.
4. **End Turn**: Passes turn to next living lord, recalculates reinforcements, updates chronicle.

---

## 4. Reconnection & Session Handling

Each connected client receives an isolated per-player `sessionToken`.
- If a terminal closes or network drops, the server marks `connected = false` and broadcasts a departure event.
- When the client restarts under their handle, the client resumes seamlessly with its cached token and receives an authoritative `server:snapshot`.
- Quick-match matchmaking prevents stale room isolation: clients without an explicit `--room` flag automatically enter the active open game room.

---

## 5. Strategic Realm Map: "The Ironreach"

A 10-territory fictional strategic realm engineered for terminal space:

- **❄ Northreach (+3 bonus armies)**:
  - `frostfell`: Glacial mountain fortress guarding the northern passes.
  - `highwatch`: Craggy peak citadel overseeing the border trails into the central valley.
  - `iron_hollow`: Deep subterranean bastion with rich iron veins and fortifications.
- **⚔ The Marches (+2 bonus armies)**:
  - `stoneveil`: Contested hillside bastion standing between Northreach and the river valley.
  - `red_basin`: Fertile crimson river valley and battlefield of historic rivalries.
  - `mossgate`: Fortified wooden gatehouse straddling the central trade and marsh roads.
  - `sunken_pass`: Mist-shrouded gorge forming the vital chokepoint into the southern rim.
- **🌋 Emberlands (+3 bonus armies)**:
  - `ember_coast`: Rugged volcanic coastline with obsidian harbors.
  - `ashmoor`: Vast scorched plains under perpetual smoke and cinder.
  - `hollowmere`: Sunken caldera basin housing the southern warlord seat.

---

## 6. OpenTUI Terminal Presentation

The client uses `@opentui/core` and `@opentui/react`:
- **Screen Dominance**: The map canvas occupies ~68 columns by 31 rows with clear land boundaries, regional domain headers, garrison badges, ruler banners, and mountain pass/waterway connectors.
- **Mouse Tracking**: Full mouse support. Clicking directly on a realm selects it; clicking a neighbor sets an attack target or fortify destination. Sidebar bordering realm chips can also be clicked directly.
- **Keyboard Navigation**: Spatial 2D arrow keys (`Up`/`Down`/`Left`/`Right`), `Tab`/`Shift+Tab` cycling, and hotkeys (`[A]ttack`, `[D]eploy`, `[F]ortify`, `[E]nd Turn`, `[C]hat`, `[Esc]`, `[Q]uit`).
- **Sidebar Strategic Intel**: Factions & armies leaderboard, deep territory inspector (lore, garrison, bordering realms list), and context-sensitive action council buttons.
- **Military Chronicle**: Historical narrative action log for conquests, battles, deployments, and raven chat.
