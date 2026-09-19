#!/usr/bin/env bun
import { parseArgs } from "node:util";
import type { MapDefinition } from "@conquest/game-core";
import { MAP_GRID_IRONREACH, MAP_IRONREACH, MAP_SECTOR_07 } from "@conquest/map-engine";
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
  -m, --map <string>          Map id to load: ironreach, ironreach-legacy, sector-07 (default: "ironreach")
  -d, --db <path>             SQLite database path or :memory: (env: CONQUEST_DB_PATH, default: ":memory:")
      --max-players <number>  Default maximum players per room (env: CONQUEST_MAX_PLAYERS, default: 4)
  -h, --help                  Show this help message
`);
    process.exit(0);
  }

  const port = parseInt(values.port ?? process.env.CONQUEST_PORT ?? "4000", 10);
  const serverName = values.name ?? process.env.CONQUEST_SERVER_NAME ?? "conquest.sh-server";
  const mapChoice = values.map ?? process.env.CONQUEST_MAP ?? "ironreach";
  const dbPath = values.db ?? process.env.CONQUEST_DB_PATH ?? ":memory:";
  const maxPlayers = parseInt(values["max-players"] ?? process.env.CONQUEST_MAX_PLAYERS ?? "4", 10);

  let map: MapDefinition = MAP_GRID_IRONREACH;
  if (mapChoice === "sector-07") {
    map = MAP_SECTOR_07;
  } else if (mapChoice === "ironreach" || mapChoice === "grid-ironreach") {
    map = MAP_GRID_IRONREACH;
  } else if (mapChoice === "ironreach-legacy") {
    map = MAP_IRONREACH;
  } else {
    logger.warn(`Unknown map "${mapChoice}", defaulting to ironreach`);
    map = MAP_GRID_IRONREACH;
  }

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
