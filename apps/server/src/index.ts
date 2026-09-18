#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { MAP_IRONREACH, MAP_SECTOR_07 } from "@conquest/map-engine";
import { logger } from "@conquest/shared";
import { ConquestServer } from "./server.js";

export * from "./server.js";
export * from "./room.js";
export * from "./session.js";

if (import.meta.main) {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      port: { type: "string", short: "p", default: "4000" },
      name: { type: "string", short: "n", default: "conquest.sh-server" },
      map: { type: "string", short: "m", default: "ironreach" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

  if (values.help) {
    console.log(`
conquest.sh authoritative game server

Options:
  -p, --port <number>  Port to bind to (default: 4000)
  -n, --name <string>  Server display name (default: "conquest.sh-server")
  -m, --map <string>   Map id to load (default: "ironreach")
  -h, --help           Show this help message
`);
    process.exit(0);
  }

  const port = parseInt(values.port ?? "4000", 10);
  const serverName = values.name ?? "conquest.sh-server";
  const mapChoice = values.map ?? "ironreach";

  let map = MAP_IRONREACH;
  if (mapChoice === "sector-07") {
    map = MAP_SECTOR_07;
  } else if (mapChoice === "ironreach") {
    map = MAP_IRONREACH;
  } else {
    logger.warn(`Unknown map "${mapChoice}", defaulting to ironreach`);
  }

  const server = new ConquestServer({
    port,
    serverName,
    defaultMap: map,
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
