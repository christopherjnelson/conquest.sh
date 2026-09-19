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

Inspired by classic grand strategy territory-control loops, reimagined as a terminal-native, clickable, keyboard-first tactical battle for continental dominion.

---

## Features

- **Server-Authoritative Multiplayer**: All dice rolls, reinforcements, combat resolutions, and state transitions are verified and resolved authoritatively on the server. Clients emit typed intents; the server broadcasts canonical state snapshots.
- **Canonical Microcell Realm Map**: Built on sub-pixel half-block raster rendering (`▀`, `▄`, `▌`, `▐`, `█`, `·`) producing organic coastlines, staggered boundaries, and high-contrast territorial silhouettes that occupy the full tactical viewport.
- **Responsive Terminal Presentation**:
  - **Wide Mode** ($\ge 185 \times 48$): Full 3-line ASCII banner, expansive tactical map, and deep 4-card strategic sidebar.
  - **Standard Mode** ($130\text{--}184 \times 38\text{--}47$): Compact branding bar maximizing vertical space for the map and sidebar.
  - **Compact Mode** ($< 130$ cols or $< 38$ rows): Full-width map canvas paired with an integrated bottom tactical inspector strip.
- **Multiplayer Front Door**:
  - **Quick Match**: Immediate matchmaking into available public lobbies.
  - **Public Room Browser**: Interactive list of active open games with live player counts and status.
  - **Custom Game Creation**: Host public or unlisted matches with custom room names and player capacities (2–6 players).
  - **Join by Code**: Direct entry for private or unlisted matches using 4-character room codes.
  - **Session Resume**: Automatic detection of cached sessions with instant reconnection to ongoing matches.
- **Dual Mouse & Keyboard Controls**: Click territories and action buttons directly with the mouse (with full hover inspector preview), or navigate spatially with geometric cardinal arrow keys, `Tab` cycling, and hotkeys.
- **The Ironreach Realm**: 20 canonical territories partitioned across 6 strategic regions:
  - 🌲 **Verdant Fringe** (+2 bonus armies): *Highwatch (A1), Whispering Woods (A2), Stoneveil (A3)*
  - 🌾 **Goldfields** (+2 bonus armies): *Sunken Pass (B1), The Marches (B2), Golden Vale (B3)*
  - ❄ **Frostpeak** (+3 bonus armies): *Frostfell (C1), Crown Citadel (C2), Glacier Bay (C3), White Cliff (C4)*
  - 🌋 **Cinder Wastes** (+2 bonus armies): *Ember Coast (D1), Ashmoor (D2), Red Basin (D3), Obsidian Spire (D4)*
  - 🏜 **Dunemere** (+2 bonus armies): *Hollowmere (E1), Dune Sea (E2), Duskfall (E3)*
  - 🌊 **Mistveil Isles** (+2 bonus armies): *Mossgate (F1), Verdant Reach (F2), Mist Isle (F3)*
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

# Join or create an explicit room by code
./conquest.sh --room ABCD --name Bob

# Connect to a remote server
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

Data is persisted to the mounted `./data` directory (`/data/conquest.sqlite`).

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
| `-d, --db` | `CONQUEST_DB_PATH` | `:memory:` | SQLite session database path (e.g. `/data/conquest.sqlite`) |
| `-m, --max-players` | `CONQUEST_MAX_PLAYERS` | `6` | Maximum allowed players per room |

For client connections, the default server can also be configured via:

```bash
export CONQUEST_SERVER="localhost:4000"
```

Resolution order: `--server <host>` > `CONQUEST_SERVER` env > `localhost:4000`.

---

## Controls

### Mouse
- **Click Territory**: Selects territory for orders, troop deployment, and inspection.
- **Click Adjacent Enemy**: Selects adjacent territory as attack target.
- **Click Adjacent Friendly**: Selects connected friendly territory as fortify destination.
- **Click Action Buttons**: `[ Deploy ]`, `[ Attack ]`, `[ Fortify ]`, `[ Skip / End Turn ]`, `[ Ready ]`.
- **Hover**: Previews territory intel, owner, and defensive garrison armies in real time.

### Keyboard
- **`Arrow Keys`**: Spatial 2D navigation between territories using centroid geometry.
- **`Tab` / `Shift+Tab`**: Cycle selected territory across the continent.
- **`D`**: Deploy available reinforcements to selected territory.
- **`A`**: Attack targeted enemy province from selected territory.
- **`F`**: Fortify troops between connected friendly territories.
- **`E`**: Skip attack phase or end turn.
- **`R`**: Mark ready in lobby phase.
- **`C`**: Toggle in-game Raven Chat.
- **`Esc`**: Clear selection, cancel target, or close modal/chat.
- **`Q`**: Quit game or return to previous screen.

---

## Architecture & Project Structure

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed technical specifications, protocol schemas, and state machine designs.
