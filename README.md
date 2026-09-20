# conquest.sh

[![CI](https://github.com/christopherjnelson/conquest.sh/actions/workflows/ci.yml/badge.svg)](https://github.com/christopherjnelson/conquest.sh/actions/workflows/ci.yml)

```text
╔══════════════════════════════════════════════╗
║                 conquest.sh                  ║
║                                              ║
║        conquer • negotiate • survive         ║
╚══════════════════════════════════════════════╝
```

A modern, multiplayer-first terminal territorial strategy game built with **OpenTUI** (`@opentui/core` + `@opentui/react`), **TypeScript**, and **Bun**.

Inspired by classic grand strategy territory-control loops, reimagined as a terminal-native, clickable, keyboard-first tactical battle for global dominion.

---

## Features

- **Server-Authoritative Multiplayer**: All dice rolls, reinforcements, combat resolutions, and state transitions are verified and resolved authoritatively on the server. Clients emit typed intents; the server broadcasts canonical state snapshots.
- **Canonical Earth-42 Map**: The default map, **Earth — Global Front**, has 42 strategic territories across 6 continents. Its original terminal artwork uses recognizable world geography, strategic regional borders, and explicit sea routes.
- **Map Platform**: Logical game topology is separate from terminal render variants. A map bundle supplies its definition, metadata, and any number of authored render profiles; the client selects the largest geography that fits its measured WORLD MAP pane.
- **Canonical Microcell Rendering**: Sub-pixel half-block rendering (`▀`, `▄`, `▌`, `▐`, `█`, `·`) produces organic coastlines, staggered boundaries, and high-contrast territorial silhouettes that occupy the tactical viewport.
- **Responsive Terminal Presentation**:
  - **Wide Mode** ($\ge 180$ cols and $\ge 51$ rows): Full 3-line ASCII banner, expansive tactical map, and deep 4-card strategic sidebar.
  - **Standard Mode** ($130\text{--}179$ cols and $38\text{--}50$ rows): Compact branding bar maximizing vertical space for the map and sidebar.
  - **Compact Mode** ($< 130$ cols or $< 38$ rows): Full-width map canvas paired with an integrated bottom tactical inspector strip.
- **Multiplayer Front Door**:
  - **Quick Match**: Immediate matchmaking into available public lobbies.
  - **Public Room Browser**: Interactive list of active open games with live player counts and status.
  - **Custom Game Creation**: Host public or unlisted matches with custom room names and player capacities (2–6 players).
  - **Join by Code**: Direct entry for private or unlisted matches using exactly 4-character uppercase alphanumeric room codes.
  - **Session Resume**: Automatic detection of cached sessions with instant reconnection to ongoing matches.
- **Dual Mouse & Keyboard Controls**: Click territories and action buttons directly with the mouse (with full hover inspector preview), or navigate spatially with geometric cardinal arrow keys, `Tab` cycling, and hotkeys.
- **On-Map Army Badges**: Once a match begins, owned territories show their army counts directly on the map. The inspector retains exact counts and full geographic details.
- **Six Continent Bonuses**: North America (+5), South America (+2), Europe (+5), Africa (+3), Asia (+7), and Oceania (+2).
- **Additional Built-in Map**: The 20-territory fictional **Ironreach** map remains available for existing servers and games.
- **Resilient Reconnection**: Per-player session tokens are stored locally. If your connection drops or terminal closes, launching the client seamlessly reconnects you with full match state.
- **Self-Hosting First**: Run your own community server with Docker Compose or standalone Bun, complete with configurable ports, persistence paths, and server metadata.

> [!NOTE]
> **Persistence Model**: Client session tokens and player associations are persisted to SQLite. Active game/room states are maintained in server memory. Client disconnects and terminal restarts seamlessly resume, but ongoing games do not currently survive a full server process restart.

---

## Quickstart

### Prerequisites

- [Bun](https://bun.sh) (pinned to v1.4.2 via `.bun-version`)

### 1. Install Dependencies

```bash
bun install --frozen-lockfile
```

### 2. Verify Suite

```bash
bun run check
```

Runs the full test suite across pure game rules, canonical map geometry, UI components, authoritative server networking, and client reconnection flows, followed by TypeScript verification (`tsc --noEmit`).

---

## Playing

### Launching the Interactive Front Door

```bash
./conquest.sh
```

Arrives at the multiplayer home screen:
```text
┌──────────────────────────────────────────────────────────────┐
│                        CONQUEST.SH                           │
│                CONQUER • NEGOTIATE • SURVIVE                 │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                     [ QUICK MATCH ]                          │
│                                                              │
│                     [ BROWSE GAMES ]                         │
│                                                              │
│                     [ CREATE GAME ]                          │
│                                                              │
│                     [ JOIN BY CODE ]                         │
│                                                              │
│                     [ RESUME GAME ]                          │
│                                                              │
│                     [ SERVER INFO ]                          │
│                                                              │
│                     [ QUIT ]                                 │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ ● conquest.sh-server                  Connected              │
└──────────────────────────────────────────────────────────────┘
```

### Direct CLI Workflows

Automation, scripts, and power users can bypass the front door directly:

```bash
# Connect and immediately enter Quick Match
./conquest.sh --quick --name Alice

# Join an existing room by code
./conquest.sh --room ABCD --name Bob

# Connect to a remote server and join an existing room
./conquest.sh --server wss://conquest.example.com --room ABCD
```

---

## Self-Hosting

The official server and self-hosted instances use the exact same server implementation and protocol.

### Option A: Docker Compose (Recommended)

1. Start the server container:
   ```bash
   docker compose up -d
   ```
2. Verify container status and logs:
   ```bash
   docker compose ps
   docker compose logs -f
   ```
3. Connect clients to your local server:
   ```bash
   ./conquest.sh --server localhost:4000
   ```

Data is persisted to the named `conquest-data` Docker volume (`/data/conquest.sqlite`).

### Option B: Standalone Bun Server

Run the server directly with Bun:

```bash
./conquest-server.sh --port 4000 --name "My Battle Realm"
```

### Configuration & Environment Variables

The server supports CLI arguments and environment variables (CLI arguments take precedence):

| CLI Flag | Environment Variable | Default | Description |
| :--- | :--- | :--- | :--- |
| `-p, --port` | `CONQUEST_PORT` | `4000` | Port to bind HTTP & WebSocket server |
| `-n, --name` | `CONQUEST_SERVER_NAME` | `conquest.sh-server` | Server name displayed in lobbies and browser |
| `-m, --map` | `CONQUEST_MAP` | `earth-42` | Default map for new rooms. Built-ins: `earth-42`, `ironreach`, `sector-07`; compatibility aliases include `grid-ironreach` and `ironreach-legacy`. |
| `-d, --db` | `CONQUEST_DB_PATH` | `:memory:` | SQLite session database path (e.g. `/data/conquest.sqlite`) |
| `--max-players` | `CONQUEST_MAX_PLAYERS` | `4` | Default maximum players per room |

For client connections, the default server can also be configured via:

```bash
export CONQUEST_SERVER="localhost:4000"
```

Resolution order: `--server <host>` > `CONQUEST_SERVER` env > `localhost:4000`.

For example, start a server with the retained Ironreach map:

```bash
./conquest-server.sh --map ironreach
```

## Adding a Map

Maps are registered bundles. The game core receives only a logical `MapDefinition`; terminal artwork is supplied as independent render variants.

1. Define the logical map: stable semantic territory IDs, names, regions, bonuses, and bidirectional adjacency.
2. Define one or more authored render variants at useful terminal densities, including raster geometry, labels, army-marker anchors where needed, decorations, and sea routes.
3. Register the bundle with its metadata (region terminology, display codes, and navigation anchor).
4. Add topology and geometry tests, including route validation for non-land adjacencies.

Built-in registration belongs in `packages/map-engine`; client components, server routing, and game rules resolve maps through the registry. See [the architecture guide](docs/ARCHITECTURE.md#5-map-platform-and-built-in-maps) for the API boundary.

---

## Controls

### Mouse
- **Click Territory**: Selects territory for orders, troop deployment, and inspection.
- **Click Adjacent Enemy**: Selects adjacent territory as attack target.
- **Click Friendly Territory**: Selects any friendly territory connected through your owned territories as a fortify destination.
- **Click Action Buttons**: Choose a deployment amount with `−`, `+`, or `All`, then use `[ Deploy ]` on any territory you own. Use `[ Attack ]`, `[ Fortify ]`, `[ Skip / End Turn ]`, or `[ Ready ]` as the phase allows.
- **After a Conquest**: Choose how many surviving troops enter the captured territory with `−` and `+`, then confirm the move before continuing the attack phase.
- **Skip / End Turn**: Click once to open the confirmation dialog on the world map, then use its Confirm or Cancel control. `Enter` confirms and `Esc` cancels.
- **Hover**: Previews territory intel, owner, and defensive garrison armies in real time.

### Keyboard
- **`Arrow Keys`**: Spatial 2D navigation between territories using centroid geometry.
- **`Tab` / `Shift+Tab`**: Cycle selected territory across the continent.
- **`N` / `Shift+N`**: Cycle legal targets while keeping the selected attack or fortify source armed.
- **`[` / `]` / `0`**: Decrease, increase, or set the deployment amount to one.
- **`D`**: Deploy the chosen amount to the selected owned territory. You can split reinforcements across territories.
- **`A`**: Attack targeted enemy province from selected territory.
- **`Left` / `Right`, then `Enter`**: Choose and confirm the troop move after a conquest.
- **`F`**: Fortify troops between connected friendly territories.
- **`E`**: Request to leave the attack phase or end your turn. Press `Enter` to confirm or `Esc` to cancel.
- **`R`**: Mark ready in lobby phase.
- **`C`**: Toggle in-game Raven Chat.
- **`Esc`**: Clear selection, cancel target, or close modal/chat.
- **`Q`**: Quit game or return to previous screen.

---

## Architecture & Project Structure

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed technical specifications, protocol schemas, and state machine designs.
