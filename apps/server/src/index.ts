#!/usr/bin/env bun
import { parseArgs } from "node:util";
import type { MapDefinition } from "@conquest/game-core";
import { getDefaultMap, getMap, listMaps } from "@conquest/map-engine";
import { logger } from "@conquest/shared";
import { ConquestServer } from "./server.js";

export * from "./server.js";
export * from "./room.js";
export * from "./session.js";

if (import.meta.main) {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      port: { type: "string", short: "p" },
      name: { type: "string", short: "n" },
      map: { type: "string", short: "m" },
      db: { type: "string", short: "d" },
      "max-players": { type: "string" },
      "max-rooms": { type: "string" },
      "disconnect-grace": { type: "string" },
      "turn-timeout": { type: "string" },
      "abandon-timeout": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

  if (values.help) {
    console.log(`
conquest.sh authoritative game server

Options:
  -p, --port <number>             Port to bind to (env: CONQUEST_PORT, default: 4000)
  -n, --name <string>             Server display name (env: CONQUEST_SERVER_NAME, default: "conquest.sh-server")
  -m, --map <string>              Map id to load: ${listMaps().map(bundle => bundle.definition.id).join(", ")} (default: "${getDefaultMap().definition.id}")
  -d, --db <path>                 SQLite database path or :memory: (env: CONQUEST_DB_PATH, default: ":memory:")
      --max-players <number>      Default maximum players per room (env: CONQUEST_MAX_PLAYERS, default: 4)
      --max-rooms <number>        Maximum concurrent rooms (env: CONQUEST_MAX_ROOMS, default: 500)
      --disconnect-grace <ms>     Grace period ms before forfeiting disconnected active player (env: CONQUEST_DISCONNECT_GRACE_MS, default: 60000)
      --turn-timeout <ms>         Per-turn time limit ms, 0 = disabled (env: CONQUEST_TURN_TIMEOUT_MS, default: 0)
      --abandon-timeout <ms>      ms before abandoned active room is removed (env: CONQUEST_ABANDON_TIMEOUT_MS, default: 600000)
  -h, --help                      Show this help message
`);
    process.exit(0);
  }

  const port = parseInt(values.port ?? process.env.CONQUEST_PORT ?? "4000", 10);
  const serverName = values.name ?? process.env.CONQUEST_SERVER_NAME ?? "conquest.sh-server";
  const mapChoice = values.map ?? process.env.CONQUEST_MAP ?? getDefaultMap().definition.id;
  const dbPath = values.db ?? process.env.CONQUEST_DB_PATH ?? ":memory:";
  const maxPlayers = parseInt(values["max-players"] ?? process.env.CONQUEST_MAX_PLAYERS ?? "4", 10);
  const maxRooms = parseInt(values["max-rooms"] ?? process.env.CONQUEST_MAX_ROOMS ?? "500", 10);
  const disconnectGraceMs = parseInt(values["disconnect-grace"] ?? process.env.CONQUEST_DISCONNECT_GRACE_MS ?? "60000", 10);
  const turnTimeoutMs = parseInt(values["turn-timeout"] ?? process.env.CONQUEST_TURN_TIMEOUT_MS ?? "0", 10);
  const abandonTimeoutMs = parseInt(values["abandon-timeout"] ?? process.env.CONQUEST_ABANDON_TIMEOUT_MS ?? "600000", 10);

  const selected = getMap(mapChoice);
  if (!selected) logger.warn(`Unknown map "${mapChoice}", defaulting to ${getDefaultMap().definition.id}`);
  const map: MapDefinition = (selected ?? getDefaultMap()).definition;

  const server = new ConquestServer({
    port,
    serverName,
    defaultMap: map,
    dbPath,
    maxPlayersPerRoom: maxPlayers,
    maxRooms,
    disconnectGraceMs,
    turnTimeoutMs,
    abandonTimeoutMs,
  });

  server.start();

  logger.info(`Starting ${serverName}...`);
  logger.info(`Server listening on port ${server.port}`);
  logger.info(`Default map: ${map.name} (${map.id})`);
  logger.info(`Health check endpoint: http://localhost:${server.port}/health`);
  logger.info(`Active rooms endpoint: http://localhost:${server.port}/rooms`);

  process.on("SIGINT", () => {
    logger.info("Received SIGINT, shutting down...");
    server.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    logger.info("Received SIGTERM, shutting down...");
    server.stop();
    process.exit(0);
  });
}
