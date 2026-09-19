import React, { useState, useEffect, useCallback } from "react";
import type { RoomVisibility } from "@conquest/protocol";
import { isActiveMatchPhase } from "@conquest/game-core";
import { GameClient, type ConnectionStatus, type SessionData } from "../network/client.js";
import { HomeScreen } from "./HomeScreen.js";
import { RoomBrowser } from "./RoomBrowser.js";
import { CreateGameScreen } from "./CreateGameScreen.js";
import { JoinRoomScreen } from "./JoinRoomScreen.js";
import { ServerInfoScreen } from "./ServerInfoScreen.js";
import { App } from "./App.js";

export type ClientScreen =
  | "home"
  | "room-browser"
  | "create-game"
  | "join-code"
  | "server-info"
  | "game";

export interface ClientShellProps {
  client: GameClient;
  initialRoomCode?: string;
  initialQuick?: boolean;
  onExit?: () => void;
  terminalDimensions?: { columns: number; rows: number };
}

export function ClientShell({
  client,
  initialRoomCode,
  initialQuick,
  onExit,
  terminalDimensions,
}: ClientShellProps) {
  const isDirectEntry = Boolean(initialRoomCode || initialQuick);

  const [screen, setScreen] = useState<ClientScreen>(() => (isDirectEntry ? "game" : "home"));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cachedSession, setCachedSession] = useState<SessionData | null>(() => client.getCachedSession());
  const [status, setStatus] = useState<ConnectionStatus>(client.status);
  const [serverName, setServerName] = useState<string | null>(client.serverName);

  // Monitor connection status
  useEffect(() => {
    const unsubStatus = client.onStatusChange((newStatus) => {
      setStatus(newStatus);
    });
    return () => {
      unsubStatus();
    };
  }, [client]);

  // Monitor snapshots to know when we are successfully in a game
  useEffect(() => {
    const unsubSnapshot = client.onSnapshot((state) => {
      setServerName(client.serverName);
      setCachedSession(client.getCachedSession());
      setErrorMessage(null);
    });
    return () => {
      unsubSnapshot();
    };
  }, [client]);

  // Error handling across screens
  useEffect(() => {
    const unsubError = client.onError((msg, code) => {
      if (code === "ROOM_NOT_FOUND" || code === "JOIN_FAILED" || code === "INVALID_ROOM_CODE") {
        if (screen === "game") {
          client.leaveRoom();
          setCachedSession(null);
          setErrorMessage(code === "ROOM_NOT_FOUND" ? "Previous battle room is no longer active." : msg);
          setScreen("home");
        } else {
          setErrorMessage(msg);
        }
      } else {
        setErrorMessage(msg);
      }
    });

    return () => {
      unsubError();
    };
  }, [client, screen]);

  // Screen actions
  const handleQuickMatch = useCallback(() => {
    setErrorMessage(null);
    client.quickMatch();
    setScreen("game");
  }, [client]);

  const handleBrowseGames = useCallback(() => {
    setErrorMessage(null);
    setScreen("room-browser");
  }, []);

  const handleCreateGame = useCallback(() => {
    setErrorMessage(null);
    setScreen("create-game");
  }, []);

  const handleJoinByCode = useCallback(() => {
    setErrorMessage(null);
    setScreen("join-code");
  }, []);

  const handleResumeGame = useCallback(
    (roomCode: string) => {
      setErrorMessage(null);
      client.join(client.playerName, roomCode);
      setScreen("game");
    },
    [client]
  );

  const handleServerInfo = useCallback(() => {
    setErrorMessage(null);
    setScreen("server-info");
  }, []);

  const handleJoinFromBrowser = useCallback(
    (roomCode: string) => {
      setErrorMessage(null);
      client.join(client.playerName, roomCode);
      setScreen("game");
    },
    [client]
  );

  const handleCreateSubmit = useCallback(
    (options: { displayName: string; maxPlayers: number; visibility: RoomVisibility }) => {
      setErrorMessage(null);
      client.createRoom(options);
      setScreen("game");
    },
    [client]
  );

  const handleJoinCodeSubmit = useCallback(
    (roomCode: string) => {
      setErrorMessage(null);
      client.join(client.playerName, roomCode);
      setScreen("game");
    },
    [client]
  );

  switch (screen) {
    case "home":
      return (
        <HomeScreen
          serverName={serverName}
          serverHost={client.wsUrl.replace(/^wss?:\/\//, "")}
          connectionStatus={status}
          playerName={client.playerName}
          cachedSession={cachedSession}
          errorMessage={errorMessage}
          onQuickMatch={handleQuickMatch}
          onBrowseGames={handleBrowseGames}
          onCreateGame={handleCreateGame}
          onJoinByCode={handleJoinByCode}
          onResumeGame={handleResumeGame}
          onServerInfo={handleServerInfo}
          onQuit={() => onExit?.()}
          terminalDimensions={terminalDimensions}
        />
      );

    case "room-browser":
      return (
        <RoomBrowser
          client={client}
          onJoinRoom={handleJoinFromBrowser}
          onBack={() => setScreen("home")}
          terminalDimensions={terminalDimensions}
        />
      );

    case "create-game":
      return (
        <CreateGameScreen
          defaultName={`${client.playerName}'s Campaign`}
          onCreate={handleCreateSubmit}
          onBack={() => setScreen("home")}
          terminalDimensions={terminalDimensions}
        />
      );

    case "join-code":
      return (
        <JoinRoomScreen
          onJoin={handleJoinCodeSubmit}
          onBack={() => setScreen("home")}
          errorMessage={errorMessage}
          terminalDimensions={terminalDimensions}
        />
      );

    case "server-info":
      return (
        <ServerInfoScreen
          client={client}
          onBack={() => setScreen("home")}
          terminalDimensions={terminalDimensions}
        />
      );

    case "game":
    default:
      return (
        <App
          client={client}
          onReturnHome={() => {
            client.leaveRoom();
            setCachedSession(client.getCachedSession());
            setErrorMessage(null);
            setScreen("home");
          }}
          onExit={() => {
            if (isDirectEntry) {
              onExit?.();
              return;
            }
            // Once a match is actively underway, prefer Q quitting the client/preserving reconnect
            // rather than silently abandoning the match and switching rooms.
            if (client.state && isActiveMatchPhase(client.state.phase)) {
              onExit?.();
              return;
            }
            // In lobby or game_over phase, exiting returns cleanly to Home
            client.leaveRoom();
            setCachedSession(client.getCachedSession());
            setErrorMessage(null);
            setScreen("home");
          }}
          terminalDimensions={terminalDimensions}
        />
      );
  }
}
