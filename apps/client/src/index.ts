import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import React from "react";
import { GameClient } from "./network/client.js";
import { App } from "./ui/App.js";
import { ClientShell } from "./ui/ClientShell.js";

export * from "./ui/ClientShell.js";

const RESERVED_FLAGS = new Set([
  "--server",
  "--name",
  "--room",
  "--quick",
  "--new",
  "--help",
  "--host",
  "-s",
  "-n",
  "-r",
  "-q",
  "-h",
]);

export function parseArgs(rawArgs: string[] = process.argv.slice(2), exitOnHelp = true): {
  server: string;
  name: string;
  room?: string;
  quick: boolean;
  forceNew: boolean;
} {
  const args = rawArgs;
  let server = process.env.CONQUEST_SERVER || "localhost:4000";
  let name = `Agent-${Math.floor(Math.random() * 1000)}`;
  let room: string | undefined = undefined;
  let quick = false;
  let forceNew = false;
  let nameSetByName = false;
  let nameSetByPositionalOrTypo = false;
  let showHelp = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--server" || arg === "--host" || arg === "-s") {
      server = args[++i] ?? server;
    } else if (arg.startsWith("--server=")) {
      server = arg.slice("--server=".length) || server;
    } else if (arg.startsWith("--host=")) {
      server = arg.slice("--host=".length) || server;
    } else if (arg.startsWith("-s=")) {
      server = arg.slice("-s=".length) || server;
    } else if (arg === "--name" || arg === "-n") {
      const val = args[++i];
      if (val !== undefined && val.length > 0) {
        name = val;
        nameSetByName = true;
      }
    } else if (arg.startsWith("--name=")) {
      const val = arg.slice("--name=".length);
      if (val.length > 0) {
        name = val;
        nameSetByName = true;
      }
    } else if (arg.startsWith("-n=")) {
      const val = arg.slice("-n=".length);
      if (val.length > 0) {
        name = val;
        nameSetByName = true;
      }
    } else if (arg === "--room" || arg === "-r") {
      room = args[++i] || undefined;
    } else if (arg.startsWith("--room=")) {
      room = arg.slice("--room=".length) || undefined;
    } else if (arg.startsWith("-r=")) {
      room = arg.slice("-r=".length) || undefined;
    } else if (arg === "--quick" || arg === "-q") {
      quick = true;
    } else if (arg === "--new") {
      forceNew = true;
    } else if (arg === "--help" || arg === "-h") {
      showHelp = true;
    } else if (arg.startsWith("--")) {
      const flag = arg.split("=")[0];
      if (!RESERVED_FLAGS.has(flag)) {
        const typoName = arg.slice(2);
        if (typoName.length > 0 && !nameSetByName && !nameSetByPositionalOrTypo) {
          name = typoName;
          nameSetByPositionalOrTypo = true;
        }
      }
    } else if (!arg.startsWith("-")) {
      if (arg.length > 0 && !nameSetByName && !nameSetByPositionalOrTypo) {
        name = arg;
        nameSetByPositionalOrTypo = true;
      }
    }
  }

  if (showHelp) {
    console.log(`
CONQUEST.SH — A Terminal Strategy Game

Playing as: ${name}

Usage:
  ./conquest.sh [options] [player-name]

Options:
  --server, --host, -s <host:port>   Server address (default: CONQUEST_SERVER or localhost:4000)
  --name, -n <player-name>           Player handle (default: Agent-XXX)
  --room, -r <room-code>             Directly join room by code
  --quick, -q                        Immediately enter Quick Match
  --new                              Force new session (disregard cached credentials)
  --help, -h                         Show this manual
`);
    if (exitOnHelp) {
      process.exit(0);
    }
  }

  return { server, name, room, quick, forceNew };
}

async function main() {
  const { server, name, room, quick, forceNew } = parseArgs();

  console.log(`Playing as: ${name}`);

  const client = new GameClient({
    host: server,
    playerName: name,
    forceNewSession: forceNew,
  });

  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
  });

  const root = createRoot(renderer);

  let isExiting = false;
  const cleanup = () => {
    if (isExiting) return;
    isExiting = true;
    try {
      client.disconnect();
    } catch {
      // Ignore disconnect errors during exit
    }
    try {
      root.unmount();
    } catch {
      // Ignore unmount errors during exit
    }
    try {
      renderer.destroy();
    } catch {
      // Ignore destroy errors
    }
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  // Render OpenTUI React Tree with ClientShell
  root.render(
    React.createElement(ClientShell, {
      client,
      initialRoomCode: room,
      initialQuick: quick,
      onExit: cleanup,
    })
  );

  // Initiate connection
  try {
    await client.connect();
    if (quick) {
      client.quickMatch(name);
    } else if (room) {
      client.join(name, room);
    }
  } catch {
    // If connection initially fails, auto-reconnect logic in GameClient will handle retries
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("Fatal error starting Conquest client:", err);
    process.exit(1);
  });
}
