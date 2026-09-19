# conquest.sh Architecture & Technical Design

## 1. Executive Summary

`conquest.sh` is a modern, multiplayer-first terminal territorial strategy game. It pairs a server-authoritative backend with a clickable, responsive Terminal User Interface (TUI) built using OpenTUI (`@opentui/core` and `@opentui/react`).

The game centers on territorial conquest across a fictional continent ("The Ironreach"). Players command factions, deploy reinforcements, mount invasions across frontiers, fortify positions, and negotiate in real time. Multiplayer, server authority, and self-hosting are core foundational pillars.

---

## 2. Monorepo Structure

```text
conquest.sh/
├── apps/
│   ├── client/              # OpenTUI clickable React client (CLI, terminal renderer, keyboard & mouse controls)
│   │   ├── src/
│   │   │   ├── ui/          # OpenTUI components (HomeScreen, RoomBrowser, CreateGameScreen, JoinRoomScreen, App, MapCanvas, etc.)
│   │   │   ├── network/     # WebSocket client, reconnection manager, HTTP API client
│   │   │   └── index.ts     # Client CLI entry point & screen navigation
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── server/              # Authoritative server (WebSockets, RoomManager, SQLite sessions)
│       ├── src/
│       │   ├── server.ts    # WebSocket server lifecycle & HTTP REST endpoints (/api/server, /api/rooms, /health)
│       │   ├── room.ts      # Game room lifecycle, matchmaking, public/unlisted rooms
│       │   ├── session.ts   # Reconnect token store & SQLite persistence
│       │   └── index.ts     # Server CLI entry point & environment configuration
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
│   │   │   ├── messages.ts  # Client & Server message definitions (join, create_room, deploy, attack, etc.)
│   │   │   ├── events.ts    # Structured game events & state snapshots
│   │   │   ├── api.ts       # Shared HTTP API schemas (ServerInfo, RoomSummary, RoomVisibility, RoomKind)
│   │   │   └── index.ts
│   │   └── package.json
│   ├── map-engine/          # Canonical microcell templates, topologies, geometry helpers
│   │   ├── src/
│   │   │   ├── maps/        # Ironreach map definitions (grid-ironreach.ts, sector-07.ts)
│   │   │   ├── grid-engine.ts # Canonical microcell centroids, bounds, hit-testing, half-block rendering
│   │   │   ├── layout.ts    # Responsive viewport modes (compact, standard, wide)
│   │   │   └── index.ts
│   │   └── package.json
│   └── shared/              # Shared constants, colors, ID generators, logging
│       ├── src/
│       │   ├── colors.ts    # ANSI & RGB color utilities
│       │   ├── id.ts        # Nanoid / token generation
│       │   └── index.ts
│       └── package.json
├── tests/                   # Integration & unit test suites
├── conquest.sh              # Client executable wrapper
├── conquest-server.sh       # Server executable wrapper
├── Dockerfile               # Container packaging for self-hosted servers
├── docker-compose.yml       # Production-ready compose configuration
├── .bun-version             # Pinned Bun version (1.4.2)
├── package.json             # Monorepo root workspace scripts
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
                       All connected terminals update
```

### Turn Phases:
1. **Deployment**: Sovereign receives reinforcements based on owned territories ($\max(3, \lfloor N/3 \rfloor)$) plus continental control bonuses. Deploys armies to owned realms.
2. **Attack**: Sovereign can mount an assault against adjacent enemy realms from any owned territory with $\ge 2$ armies. Resolves probabilistic combat (highest-to-highest comparison, defender wins ties). If realm is conquered, victorious armies occupy the land.
3. **Fortify**: Sovereign may redeploy garrison troops between friendly connected territories.
4. **End Turn**: Passes turn to next living lord, recalculates reinforcements, updates chronicle.

---

## 4. Reconnection & Session Handling

Each connected client receives an isolated per-player `sessionToken`.
- **Session Tokens**: Client caches `sessionToken`, `playerName`, `playerId`, and `roomCode` to a local disk session file.
- **Server Tracking**: Server persists player sessions to SQLite via `SessionStore`.
- If a terminal closes or network drops, the server marks `connected = false` and broadcasts a departure event.
- When the client restarts, it can resume its active match with cached credentials, receiving an authoritative `server:snapshot`.
- **Memory vs Disk Persistence**: Client identities and reconnect tokens survive server restarts via SQLite. However, active match and room state are held in server memory. An ongoing match will not survive a server process restart.

---

## 5. Strategic Realm Map: "The Ironreach"

A 20-territory fictional strategic realm engineered for terminal space:

- **🌲 Verdant Fringe (+2 bonus armies)**:
  - `A1 Highwatch`: Windswept towers overlooking the western sea and ancient pine forests.
  - `A2 Whispering Woods`: Canopies of ancient moss where the trees remember forgotten kings.
  - `A3 Stoneveil`: Limestone ramparts standing sentinel against eastern marauders.
- **🌾 Amber Steppes (+2 bonus armies)**:
  - `B1 Sunken Pass`: Carved sandstone ravines that channel howling northern gale winds.
  - `B2 The Marches`: Rolling gold grasslands fought over in countless seasonal wars.
  - `B3 Golden Vale`: Sun-drenched terraces rich in barley, copper mines, and proud cavalry.
- **❄ Northreach (+3 bonus armies)**:
  - `C1 Frostfell`: Frozen tundras swept by unending blizzards under the aurora.
  - `C2 Crown Citadel`: An impregnable mountain redoubt carved straight out of glacial bedrock.
  - `C3 Glacier Bay`: Deep sea fjords where ice floes crush unwary longships.
  - `C4 White Cliff`: Sheer chalk precipices dropping hundreds of feet into churning waters.
- **🌋 Crimson Caldera (+3 bonus armies)**:
  - `D1 Ember Coast`: Black sand shores warmed by subterranean magma vents.
  - `D2 Ashmoor`: Smoldering peat bogs blanketed in dense volcanic ash and sulfur.
  - `D3 Red Basin`: Blood-red clay canyons scarred by centuries of continuous warfare.
  - `D4 Iron Hollow`: Deep underground foundries that forge the realm's sharpest steel.
- **🏜 The Blackfen (+2 bonus armies)**:
  - `E1 Hollowmere`: A sunken caldera lake shrouded in violet mists and ancient ruins.
  - `E2 Blackfen`: Treacherous quickmire where unwary warbands vanish without a trace.
  - `E3 Duskfall`: Gloomy basalt bluffs watching the eastern straits under purple dusk.
- **🌊 Emerald Isles (+2 bonus armies)**:
  - `F1 Mossgate`: An overgrown harbor fort commanding the southern trade channels.
  - `F2 Verdant Reach`: Lush tropical headlands blessed with fertile soil and gentle trade winds.
  - `F3 Mist Isle`: An isolated emerald sanctuary veiled by perpetual sea fog.

---

## 6. OpenTUI Terminal Presentation & Canonical Microcell Engine

The client renders with `@opentui/core` and `@opentui/react`:
- **Canonical Microcell Raster**: Rather than drawing coarse rectangular character blocks, the map uses sub-pixel half-blocks (`▀`, `▄`, `▌`, `▐`, `█`, `·`) with authored microcell rasters (`136x72` for wide, `104x60` for compact). This allows diagonal coastlines, organic peninsulas, and smooth political borders.
- **Same-Owner Political Boundaries**: Alternating tonal depth and visible boundary glyphs prevent same-owner territories from melting into a single monochrome mass.
- **Responsive Viewport Modes**:
  - `compact` (< 130 cols or < 38 rows): Full-width map canvas paired with an integrated bottom tactical inspector strip.
  - `standard` (130–179 cols and 38–49 rows): Single-row branding bar maximizing vertical space for the map and sidebar.
  - `wide` ($\ge 180$ cols and $\ge 50$ rows): Expansive 3-line ASCII banner, maximum tactical map dimensions, and deep 4-card strategic sidebar.
- **Dual Mouse & Keyboard Controls**: Mouse clicks and hovers are mapped with sub-pixel hit-testing using local microcell neighborhood majority voting. Spatial cardinal arrow keys use canonical continuous centroids.

---

## 7. Multiplayer Front Door & Room Architecture

Client navigation is organized into explicit screens:

```text
                  ┌──────────────┐
                  │  HomeScreen  │
                  └──────┬───────┘
         ┌───────────────┼───────────────┬──────────────┐
         ▼               ▼               ▼              ▼
  [ Quick Match ] [ Browse Games ] [ Create Game ] [ Join Code ]
         │               │               │              │
         └───────────────┼───────────────┴──────────────┘
                         ▼
                   ┌───────────┐
                   │ Game (App)│
                   └───────────┘
```

### Screen Flow:
- `home`: Central launcher displaying quick match, browse games, create game, join by code, resume match, and server info.
- `room-browser`: Live table of public rooms polling `GET /api/rooms` (parsed via `z.array(RoomSummarySchema)`) every 4 seconds. Shows room name, player count, map, and status.
- `create-game`: Configurable game creation (room name, max players 2–6, visibility: public vs unlisted). Emits `client:create_room`.
- `join-code`: Explicit 4-character uppercase alphanumeric code entry validated via `RoomCodeSchema`. Rejects unknown codes with `ROOM_NOT_FOUND` and full rooms with `JOIN_FAILED` instead of silently auto-creating rooms.
- `game`: The tactical match UI (`App.tsx`), encompassing the map canvas, sidebar/compact inspector, event log chronicle, and action council.

### Room Kinds & Lifecycle:
- **`RoomKind`**: `"quick"` (matchmaking queue) vs `"custom"` (created by players).
- **`RoomVisibility`**: `"public"` (listed in browser) vs `"unlisted"` (joinable only by direct room code).
- **Start Conditions**: Quick match rooms can auto-start when full; custom rooms require at least 2 connected players and all participating connected players marked **Ready**.
- **Lobby Disconnect Semantics**: Disconnecting before game start frees the lobby seat immediately so public room summaries and joinability stay in sync. Disconnected lobby players do not receive territory when the match starts.
- **Leaving / Switching Rooms**: Returning from a lobby to Home explicitly detaches the player and clears the room session so subsequent matchmaking or room creation starts clean. Quitting during an active match (`phase !== 'lobby'`) preserves the local session to allow reconnecting.
