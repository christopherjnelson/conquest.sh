import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useKeyboard } from "@opentui/react";
import type { GameEvent, GameState } from "@conquest/protocol";
import {
  MAP_GRID_IRONREACH,
  getTerritoryAt,
  getNextTerritoryInDirection,
  getMapContentDimensionsForTerminal,
  getMapForTerminalDimensions,
} from "@conquest/map-engine";
import { GameClient, type ConnectionStatus } from "../network/client.js";
import { Header } from "./Header.js";
import { MapCanvas } from "./MapCanvas.js";
import { Sidebar } from "./Sidebar.js";
import { EventLog } from "./EventLog.js";
import { Footer } from "./Footer.js";

export interface AppProps {
  client: GameClient;
  onExit?: () => void;
  terminalDimensions?: { columns: number; rows: number };
}

export interface TerminalSizeWarningProps {
  columns: number;
  rows: number;
  onIgnore?: () => void;
  onExit?: () => void;
}

export function TerminalSizeWarning({
  columns,
  rows,
  onIgnore,
  onExit,
}: TerminalSizeWarningProps) {
  return (
    <box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      backgroundColor="#080f1a"
      style={{ width: "100%", height: "100%" }}
    >
      <box
        flexDirection="column"
        alignItems="center"
        border
        borderStyle="double"
        borderColor="#f59e0b"
        backgroundColor="#080f1a"
        paddingLeft={3}
        paddingRight={3}
        paddingTop={1}
        paddingBottom={1}
        gap={1}
      >
        <text fg="#f59e0b">
          <b>⚠️  TERMINAL WINDOW TOO SMALL</b>
        </text>

        <text fg="#e2e8f0">
          conquest.sh requires at least 105 columns x 34 rows for the tactical realm map.
        </text>

        <text fg="#f59e0b">
          {`Current: ${columns} cols × ${rows} rows`}
        </text>

        <text fg="#94a3b8">
          Please expand or zoom out your terminal window to resume play.
        </text>

        <box flexDirection="row" gap={1} marginTop={1}>
          <text fg="#64748b">
            Press <span fg="#f59e0b"><b>[Ignore / Any Key]</b></span> to force render  │  Press <span fg="#ef4444"><b>[Q]</b></span> to quit
          </text>
        </box>
      </box>
    </box>
  );
}


export function App({ client, onExit, terminalDimensions }: AppProps) {
  const [state, setState] = useState<GameState | null>(client.state);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(client.myPlayerId);
  const [status, setStatus] = useState<ConnectionStatus>(client.status);
  const [events, setEvents] = useState<GameEvent[]>(client.state?.history ?? []);

  // Terminal dimensions & warning override state
  const [dimensions, setDimensions] = useState(() => ({
    columns:
      terminalDimensions?.columns ??
      (typeof process !== "undefined" && typeof process.stdout?.columns === "number"
        ? process.stdout.columns
        : 0),
    rows:
      terminalDimensions?.rows ??
      (typeof process !== "undefined" && typeof process.stdout?.rows === "number"
        ? process.stdout.rows
        : 0),
  }));
  const [overrideWarning, setOverrideWarning] = useState(false);

  // Sync prop changes if provided
  useEffect(() => {
    if (terminalDimensions) {
      setDimensions(terminalDimensions);
    }
  }, [terminalDimensions?.columns, terminalDimensions?.rows]);

  // Terminal resize listener on process.stdout
  useEffect(() => {
    const handleResize = () => {
      const nextCols = process.stdout?.columns ?? 0;
      const nextRows = process.stdout?.rows ?? 0;
      setDimensions({
        columns: nextCols,
        rows: nextRows,
      });
      // If window expanded to sufficient dimensions, reset override so subsequent shrinks re-warn
      if (nextCols >= 105 && nextRows >= 34) {
        setOverrideWarning(false);
      }
    };

    const stdout = process.stdout;
    stdout?.on?.("resize", handleResize);

    return () => {
      if (stdout?.removeListener) {
        stdout.removeListener("resize", handleResize);
      } else if (stdout?.off) {
        stdout.off("resize", handleResize);
      }
    };
  }, []);

  const cols = dimensions.columns;
  const rows = dimensions.rows;
  // In non-TTY environments (or tests without real TTY), columns/rows are undefined or 0
  const hasTtyDimensions = cols > 0 && rows > 0;
  const isTooSmall = !overrideWarning && hasTtyDimensions && (cols < 105 || rows < 34);

  // No territory selected by default
  const [selectedTerritoryId, setSelectedTerritoryId] = useState<string | null>(null);
  const [targetTerritoryId, setTargetTerritoryId] = useState<string | null>(null);
  const [hoveredTerritoryId, setHoveredTerritoryId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(1);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<"info" | "success" | "error">("info");

  const showToast = useCallback((msg: string, type: "info" | "success" | "error" = "info") => {
    setToastMessage(msg);
    setToastType(type);
  }, []);

  // Listen to GameClient updates
  useEffect(() => {
    const unsubSnapshot = client.onSnapshot((newState, newPlayerId) => {
      setState(newState);
      setMyPlayerId(newPlayerId);
      setEvents(newState.history ?? []);
    });

    const unsubEvent = client.onEvent((newEvent) => {
      setEvents((prev) => [...prev, newEvent]);
    });

    const unsubStatus = client.onStatusChange((newStatus, error) => {
      setStatus(newStatus);
      if (error) {
        showToast(error, "error");
      }
    });

    const unsubError = client.onError((errMsg) => {
      showToast(errMsg, "error");
    });

    return () => {
      unsubSnapshot();
      unsubEvent();
      unsubStatus();
      unsubError();
    };
  }, [client, showToast]);

  const activePlayer = state ? state.players[state.activePlayerIndex] : undefined;
  const isMyTurn = Boolean(activePlayer && activePlayer.id === myPlayerId);
  const phase = state?.phase ?? "deployment";

  const allTerritoryIds = useMemo(() => {
    if (state?.territories && Object.keys(state.territories).length > 0) {
      return Object.keys(state.territories);
    }
    return MAP_GRID_IRONREACH.territories.map((t) => t.id);
  }, [state]);

  // Action Dispatchers
  const handleDeploy = useCallback(() => {
    if (!state || !selectedTerritoryId) {
      showToast("Select a territory to deploy troops to", "error");
      return;
    }
    const territory = state.territories[selectedTerritoryId];
    if (!territory || territory.ownerId !== myPlayerId) {
      showToast("You can only deploy to territories you control", "error");
      return;
    }
    if (state.pendingReinforcements <= 0) {
      showToast("No reinforcements available", "error");
      return;
    }

    client.deploy(selectedTerritoryId, state.pendingReinforcements);
    showToast(`Deployed ${state.pendingReinforcements} reinforcements to ${selectedTerritoryId}`, "success");
  }, [client, state, selectedTerritoryId, myPlayerId, showToast]);

  const handleAttack = useCallback(() => {
    if (!state || !selectedTerritoryId) {
      showToast("Select a friendly territory to attack from", "error");
      return;
    }
    const source = state.territories[selectedTerritoryId];
    if (!source || source.ownerId !== myPlayerId) {
      showToast("You must control the attacking territory", "error");
      return;
    }
    if (source.units < 2) {
      showToast("Need at least 2 units to attack", "error");
      return;
    }
    if (!targetTerritoryId) {
      showToast("Select an adjacent enemy territory to attack", "info");
      return;
    }
    const target = state.territories[targetTerritoryId];
    if (!target || target.ownerId === myPlayerId) {
      showToast("Cannot attack your own territory", "error");
      return;
    }
    if (!source.neighbors.includes(targetTerritoryId)) {
      showToast(`${target.name} is not adjacent to ${source.name}`, "error");
      return;
    }

    client.attack(selectedTerritoryId, targetTerritoryId);
    showToast(`Attacking ${targetTerritoryId} from ${selectedTerritoryId}...`, "info");
  }, [client, state, selectedTerritoryId, targetTerritoryId, myPlayerId, showToast]);

  const handleFortify = useCallback(() => {
    if (!state || !selectedTerritoryId) {
      showToast("Select a friendly territory to fortify from", "error");
      return;
    }
    const source = state.territories[selectedTerritoryId];
    if (!source || source.ownerId !== myPlayerId) {
      showToast("You must control the source territory", "error");
      return;
    }
    if (source.units < 2) {
      showToast("Must leave at least 1 unit behind", "error");
      return;
    }
    if (!targetTerritoryId) {
      showToast("Select a friendly connected territory to move troops to", "info");
      return;
    }
    const target = state.territories[targetTerritoryId];
    if (!target || target.ownerId !== myPlayerId) {
      showToast("Target territory must also be controlled by you", "error");
      return;
    }

    const unitsToMove = Math.max(1, source.units - 1);
    client.fortify(selectedTerritoryId, targetTerritoryId, unitsToMove);
    showToast(`Fortified ${unitsToMove} units to ${targetTerritoryId}`, "success");
    setSelectedTerritoryId(null);
    setTargetTerritoryId(null);
  }, [client, state, selectedTerritoryId, targetTerritoryId, myPlayerId, showToast]);

  const handleSkipPhase = useCallback(() => {
    client.skipPhase();
    showToast("Skipped phase", "info");
  }, [client, showToast]);

  const handleEndTurn = useCallback(() => {
    client.endTurn();
    showToast("Ended turn", "info");
    setSelectedTerritoryId(null);
    setTargetTerritoryId(null);
  }, [client, showToast]);

  const handleReady = useCallback(() => {
    client.ready(true);
    showToast("Marked ready! Waiting for game start...", "success");
  }, [client, showToast]);

  // Keyboard navigation
  useKeyboard((key) => {
    // When window is too small, allow exiting with Q or overriding with [Ignore / Any Key]
    if (isTooSmall) {
      if (key.name === "q" || key.name === "Q") {
        onExit?.();
        return;
      }
      setOverrideWarning(true);
      return;
    }

    // Toggle warning back if dimensions are small and user previously overrode
    if (key.name === "i" || key.name === "I") {
      if (hasTtyDimensions && (cols < 105 || rows < 34)) {
        setOverrideWarning(false);
        return;
      }
    }

    // When chat input is open, only intercept Escape to close it
    if (chatOpen) {
      if (key.name === "escape") {
        setChatOpen(false);
      }
      return;
    }

    // Global quit
    if (key.name === "q" || key.name === "Q") {
      onExit?.();
      return;
    }

    // Toggle chat
    if (key.name === "c" || key.name === "C") {
      setChatOpen(true);
      return;
    }

    // Number keys 1-5 for bottom pill tabs
    if (["1", "2", "3", "4", "5"].includes(key.name)) {
      setActiveTab(parseInt(key.name, 10));
      return;
    }

    // Deselect / clear
    if (key.name === "escape") {
      if (targetTerritoryId) {
        setTargetTerritoryId(null);
      } else {
        setSelectedTerritoryId(null);
      }
      return;
    }

    // Tab territory cycling
    if (key.name === "tab") {
      if (allTerritoryIds.length === 0) return;
      if (key.shift) {
        if (!selectedTerritoryId) {
          setSelectedTerritoryId(allTerritoryIds[allTerritoryIds.length - 1]);
        } else {
          const idx = allTerritoryIds.indexOf(selectedTerritoryId);
          const prevIdx = (idx - 1 + allTerritoryIds.length) % allTerritoryIds.length;
          setSelectedTerritoryId(allTerritoryIds[prevIdx]);
        }
      } else {
        if (!selectedTerritoryId) {
          setSelectedTerritoryId(allTerritoryIds[0]);
        } else {
          const idx = allTerritoryIds.indexOf(selectedTerritoryId);
          const nextIdx = (idx + 1) % allTerritoryIds.length;
          setSelectedTerritoryId(allTerritoryIds[nextIdx]);
        }
      }
      setTargetTerritoryId(null);
      return;
    }

    // Arrow keys spatial navigation using geometry-based centroid search
    if (["up", "down", "left", "right"].includes(key.name)) {
      if (allTerritoryIds.length === 0) return;
      if (!selectedTerritoryId) {
        setSelectedTerritoryId("C2");
        return;
      }
      const dir = key.name as "up" | "down" | "left" | "right";
      const activeMapDef = getMapForTerminalDimensions(dimensions.columns, dimensions.rows);
      const nextId = getNextTerritoryInDirection(selectedTerritoryId, dir, activeMapDef);
      if (nextId) {
        setSelectedTerritoryId(nextId);
        setTargetTerritoryId(null);
      }
      return;
    }

    // Action shortcuts
    if (key.name === "d" || key.name === "D") {
      handleDeploy();
      return;
    }

    if (key.name === "a" || key.name === "A") {
      handleAttack();
      return;
    }

    if (key.name === "f" || key.name === "F") {
      handleFortify();
      return;
    }

    if (key.name === "e" || key.name === "E") {
      if (phase === "attack") {
        handleSkipPhase();
      } else {
        handleEndTurn();
      }
      return;
    }

    if (key.name === "r" || key.name === "R") {
      if (phase === "lobby") {
        handleReady();
      }
      return;
    }
  });

  if (isTooSmall) {
    return (
      <TerminalSizeWarning
        columns={cols}
        rows={rows}
        onIgnore={() => setOverrideWarning(true)}
        onExit={onExit}
      />
    );
  }

  return (
    <box
      flexDirection="column"
      backgroundColor="#080f1a"
      style={{ width: "100%", height: "100%" }}
      padding={0}
    >
      {/* Top Header */}
      <Header
        roomCode={client.roomCode}
        turnNumber={state?.turnNumber ?? 0}
        activePlayer={activePlayer}
        phase={phase}
        pendingReinforcements={state?.pendingReinforcements ?? 0}
        connectionStatus={status}
        isMyTurn={isMyTurn}
      />

      {/* Main Tactical Area (flexDirection="row", flexGrow 1, width "100%", gap 1) */}
      <box
        flexDirection="row"
        flexGrow={1}
        style={{ width: "100%", marginTop: 0, marginBottom: 0 }}
        gap={1}
      >
        {/* Left: MapCanvas (~75% width) */}
        <box flexGrow={3} flexBasis={0} flexDirection="column" style={{ width: "100%", height: "100%" }}>
          <MapCanvas
            contentDimensions={getMapContentDimensionsForTerminal(dimensions.columns, dimensions.rows)}
            terminalDimensions={dimensions}
            territories={state?.territories ?? {}}
            players={state?.players ?? []}
            myPlayerId={myPlayerId}
            phase={phase}
            selectedTerritoryId={selectedTerritoryId}
            targetTerritoryId={targetTerritoryId}
            hoveredTerritoryId={hoveredTerritoryId}
            onHoverTerritory={setHoveredTerritoryId}
            onSelectTerritory={(id) => {
              setSelectedTerritoryId(id);
              setTargetTerritoryId(null);
            }}
            onSelectTarget={(id) => setTargetTerritoryId(id)}
            onDeselect={() => {
              setSelectedTerritoryId(null);
              setTargetTerritoryId(null);
            }}
          />
        </box>

        {/* Right: Sidebar (~25% width) */}
        <box flexGrow={1} flexBasis={0} flexDirection="column" style={{ width: "100%", height: "100%" }}>
          <Sidebar
            state={state}
            myPlayerId={myPlayerId}
            roomCode={client.roomCode}
            connectionStatus={status}
            selectedTerritoryId={selectedTerritoryId}
            targetTerritoryId={targetTerritoryId}
            onDeploy={handleDeploy}
            onAttack={handleAttack}
            onFortify={handleFortify}
            onSkipPhase={handleSkipPhase}
            onEndTurn={handleEndTurn}
            onReady={handleReady}
            onSelectTarget={(id) => setTargetTerritoryId(id)}
          />
        </box>
      </box>

      {/* EventLog beneath Map + Sidebar (width 100%, height 8) */}
      <EventLog
        events={events}
        chatOpen={chatOpen}
        players={state?.players ?? []}
        onToggleChat={() => setChatOpen(!chatOpen)}
        onSendChat={(text) => client.sendChat(text)}
      />

      {/* Bottom Footer with Pills & Keybindings */}
      <Footer
        toastMessage={toastMessage}
        toastType={toastType}
        activeTab={activeTab}
        onSelectTab={(tab) => setActiveTab(tab)}
      />
    </box>
  );
}
