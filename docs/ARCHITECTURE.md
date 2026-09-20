# conquest.sh Architecture & Technical Design

## 1. Executive Summary

`conquest.sh` is a modern, multiplayer-first terminal territorial strategy game. It pairs a server-authoritative backend with a clickable, responsive Terminal User Interface (TUI) built using OpenTUI (`@opentui/core` and `@opentui/react`).

The default game centers on territorial conquest across **Earth — Global Front**, a 42-territory world map with six continents. Players command factions, deploy reinforcements, mount invasions across frontiers, fortify positions, and negotiate in real time. Multiplayer, server authority, and self-hosting are core foundational pillars.

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
│   │   │   ├── maps/        # Built-in bundles and authored render data (earth-42.ts, grid-ironreach.ts)
│   │   │   ├── registry.ts  # Built-in map registration and render-variant selection
│   │   │   ├── grid-engine.ts # Microcell centroids, bounds, hit-testing, half-block rendering
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

## 5. Map Platform and Built-in Maps

Maps are first-class bundles. The logical game map is independent of terminal geometry, so the rules and authoritative state use semantic territory IDs such as `na_alaska_range`, while raster symbols remain private to a render variant.

```text
MapBundle
├── definition: MapDefinition
│   ├── id, name, description, recommendedPlayers
│   ├── territories and semantic IDs
│   └── regions, reinforcement bonuses, and adjacency
├── renderVariants: MapRenderVariant[]
│   └── profile, raster geometry, labels, sea routes, decorations
└── metadata
    └── region terminology, display codes, navigation anchor
```

`registerMap`, `getMap`, `getDefaultMap`, `listMaps`, and `getRenderVariant` form the map-engine registry API. A bundle may have any number of named render profiles. `getRenderVariant` selects the largest authored geography that fits the actual map pane. Application code passes maps explicitly to deep geometry helpers; it does not rely on a hidden default map.

`GameState.mapId` is authoritative from lobby through rematches. A room fixes its map at creation, and rematches retain it. The server resolves a requested `mapId` through the registry; clients resolve the bundle from `state.mapId` and use its logical metadata and selected render variant.

### Earth — Global Front (default)

`earth-42` is the default built-in map. It has 42 territories, uses 6 continent regions, and recommends 2–6 players:

| Continent | Territories | Reinforcement bonus |
| --- | ---: | ---: |
| North America | 9 | +5 |
| South America | 4 | +2 |
| Europe | 7 | +5 |
| Africa | 6 | +3 |
| Asia | 12 | +7 |
| Oceania | 4 | +2 |

Earth provides a sequence of terminal render densities from compact through ultra. The visual foundation is recognizable real-world continental geography, with strategic regional boundaries rather than country borders. Cross-ocean adjacency is declared logically and drawn as restrained sea-route metadata. The sidebar has a bounded width so additional desktop columns expand the world pane. Once play begins, each owned territory has an independent army marker; lobby maps omit those markers.

| Render profile | Raster dimensions |
| --- | ---: |
| compact | 96×24 |
| compact-tall | 96×30 |
| standard | 124×34 |
| wide | 144×38 |
| large | 160×42 |
| ultra | 190×42 |

The standard layout caps its sidebar at 38 columns; wide layouts cap it at 42. `getMapContentDimensionsForTerminal` shares those measurements with App and variant selection. Army badge placement uses an optional per-variant `unitPos` preference, falling back to a wholly owned interior run. Labels yield to badges; counts at 100 or more render as `100+` on the map while the inspector shows the exact value.
The checked-in rasters were constructed from [Natural Earth 1:110m land polygons](https://www.naturalearthdata.com/downloads/110m-physical-vectors/110m-land/), which are [public domain](https://www.naturalearthdata.com/about/terms-of-use/). The generation script documents the source; the game never fetches map data at runtime.

### Additional built-in map: Ironreach

The existing 20-territory fictional `ironreach` map remains registered through the same bundle API. `grid-ironreach` and `ironreach-legacy` continue as compatibility aliases for server configuration.
The earlier `sector-07` cyber grid remains available as a built-in compatibility map.

### Adding a Map

1. Define a logical `MapDefinition` with stable territory IDs, region membership, bonuses, and bidirectional adjacency.
2. Author the map's render variants with geometry, labels, display codes, optional army-marker anchors, and sea routes.
3. Register a `MapBundle` with `registerMap` at the map-engine bootstrap boundary.
4. Add topology, geometry, navigation, and render-selection tests.

No change to game rules, client map components, or server map-routing branches should be required for another built-in map.

---

## 6. OpenTUI Terminal Presentation & Canonical Microcell Engine

The client renders with `@opentui/core` and `@opentui/react`:
- **Authored Microcell Raster**: Rather than drawing coarse rectangular character blocks, each map render variant uses sub-pixel half-blocks (`▀`, `▄`, `▌`, `▐`, `█`, `·`) and an authored microcell raster. This allows diagonal coastlines, organic peninsulas, and smooth political borders without coupling map topology to a terminal size.
- **Same-Owner Political Boundaries**: Alternating tonal depth and visible boundary glyphs prevent same-owner territories from melting into a single monochrome mass.
- **Responsive Viewport Modes**:
  - `compact` (< 130 cols or < 38 rows): Full-width map canvas paired with an integrated bottom tactical inspector strip.
  - `standard` (130–179 cols and 38–49 rows): Single-row branding bar maximizing vertical space for the map and sidebar.
  - `wide` ($\ge 180$ cols and $\ge 51$ rows): Expansive 3-line ASCII banner, maximum tactical map dimensions, and deep 4-card strategic sidebar.
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
