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
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

  if (values.help) {
    console.log(`
conquest.sh authoritative game server

Options:
  -p, --port <number>         Port to bind to (env: CONQUEST_PORT, default: 4000)
  -n, --name <string>         Server display name (env: CONQUEST_SERVER_NAME, default: "conquest.sh-server")
  -m, --map <string>          Map id to load: ${listMaps().map(bundle => bundle.definition.id).join(", ")} (default: "${getDefaultMap().definition.id}")
  -d, --db <path>             SQLite database path or :memory: (env: CONQUEST_DB_PATH, default: ":memory:")
      --max-players <number>  Default maximum players per room (env: CONQUEST_MAX_PLAYERS, default: 4)
  -h, --help                  Show this help message
`);
    process.exit(0);
  }

  const port = parseInt(values.port ?? process.env.CONQUEST_PORT ?? "4000", 10);
  const serverName = values.name ?? process.env.CONQUEST_SERVER_NAME ?? "conquest.sh-server";
  const mapChoice = values.map ?? process.env.CONQUEST_MAP ?? getDefaultMap().definition.id;
  const dbPath = values.db ?? process.env.CONQUEST_DB_PATH ?? ":memory:";
  const maxPlayers = parseInt(values["max-players"] ?? process.env.CONQUEST_MAX_PLAYERS ?? "4", 10);

  const selected = getMap(mapChoice);
  if (!selected) logger.warn(`Unknown map "${mapChoice}", defaulting to ${getDefaultMap().definition.id}`);
  const map: MapDefinition = (selected ?? getDefaultMap()).definition;

  const server = new ConquestServer({
    port,
    serverName,
    defaultMap: map,
    dbPath,
    maxPlayersPerRoom: maxPlayers,
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
