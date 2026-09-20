import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useKeyboard } from "@opentui/react";
import type { GameEvent, GameState } from "@conquest/protocol";
import {
  getDefaultMap,
  getMap,
  selectRenderVariant,
  getTerritoryAt,
  getNextTerritoryInDirection,
  getNextTabTerritoryId,
  getMapContentDimensionsForLayout,
  getSidebarWidthForTerminal,
  getLayoutModeForMap,
  canRenderMapInPane,
  getMinimumTerminalDimensionsForMap,
  type LayoutMode,
} from "@conquest/map-engine";
import { GameClient, type ConnectionStatus } from "../network/client.js";
import { Header } from "./Header.js";
import { MapCanvas } from "./MapCanvas.js";
import { Sidebar } from "./Sidebar.js";
import { CompactInspector } from "./CompactInspector.js";
import { EventLog } from "./EventLog.js";
import { Footer } from "./Footer.js";
import { MatchResultsScreen } from "./MatchResultsScreen.js";

export interface AppProps {
  client: GameClient;
  onExit?: () => void;
  onQuit?: () => void;
  onReturnHome?: () => void;
  terminalDimensions?: { columns: number; rows: number };
  initialSelectedTerritoryId?: string | null;
  initialTargetTerritoryId?: string | null;
  initialHoveredTerritoryId?: string | null;
}

export interface TerminalSizeWarningProps {
  columns: number;
  rows: number;
  minimumDimensions?: { columns: number; rows: number };
  onIgnore?: () => void;
  onExit?: () => void;
}

export function TerminalSizeWarning({
  columns,
  rows,
  minimumDimensions,
  onIgnore,
  onExit,
}: TerminalSizeWarningProps) {
  const effectiveMinimum = minimumDimensions ?? getMinimumTerminalDimensionsForMap(getDefaultMap());
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
          {`This map requires at least ${effectiveMinimum.columns} columns × ${effectiveMinimum.rows} rows for its smallest authored render.`}
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


export function App({
  client,
  onExit,
  onQuit,
  onReturnHome,
  terminalDimensions,
  initialSelectedTerritoryId,
  initialTargetTerritoryId,
  initialHoveredTerritoryId,
}: AppProps) {
  const [state, setState] = useState<GameState | null>(client.state);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(client.myPlayerId);
  const [status, setStatus] = useState<ConnectionStatus>(client.status);
  const [events, setEvents] = useState<GameEvent[]>(client.state?.history ?? []);
  const mapBundle = getMap(state?.mapId ?? getDefaultMap().definition.id) ?? getDefaultMap();

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
      // Reset an ignored warning once the active map fits its full-width pane.
      if (canRenderMapInPane(mapBundle, getMapContentDimensionsForLayout(nextCols, nextRows, "compact"))) {
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
  }, [mapBundle]);

  const cols = dimensions.columns;
  const rows = dimensions.rows;
  // In non-TTY environments (or tests without real TTY), columns/rows are undefined or 0
  const hasTtyDimensions = cols > 0 && rows > 0;
  const compactPaneDimensions = getMapContentDimensionsForLayout(cols, rows, "compact");
  const isTooSmall = !overrideWarning && hasTtyDimensions && !canRenderMapInPane(mapBundle, compactPaneDimensions);
  const layoutMode: LayoutMode = getLayoutModeForMap(cols, rows, mapBundle);
  const isCompact = layoutMode === "compact";

  // Territory selection, target, and hover state
  const [selectedTerritoryId, setSelectedTerritoryId] = useState<string | null>(
    initialSelectedTerritoryId ?? null
  );
  const [targetTerritoryId, setTargetTerritoryId] = useState<string | null>(
    initialTargetTerritoryId ?? null
  );
  const [hoveredTerritoryId, setHoveredTerritoryId] = useState<string | null>(
    initialHoveredTerritoryId ?? null
  );
  // Start each reinforcement pool with every army selected, while allowing the
  // player to split that pool across any of their territories.
  const [deploymentCount, setDeploymentCount] = useState(client.state?.pendingReinforcements ?? 0);
  const [conquestMoveUnits, setConquestMoveUnits] = useState(0);
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
      setDeploymentCount(newState.pendingReinforcements);
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

  const pendingConquestMove = state?.pendingConquestMove;
  useEffect(() => {
    if (pendingConquestMove) setConquestMoveUnits(pendingConquestMove.minimumUnits);
  }, [pendingConquestMove?.sourceTerritoryId, pendingConquestMove?.targetTerritoryId, pendingConquestMove?.minimumUnits]);

  const activePlayer = state ? state.players[state.activePlayerIndex] : undefined;
  const isMyTurn = Boolean(activePlayer && activePlayer.id === myPlayerId);
  const myPlayer = state?.players.find((p) => p.id === myPlayerId);
  const isEliminated = Boolean(myPlayer && !myPlayer.isAlive);
  const phase = state?.phase ?? "deployment";
  const paneDimensions = getMapContentDimensionsForLayout(dimensions.columns, dimensions.rows, layoutMode);
  const sidebarWidth = getSidebarWidthForTerminal(dimensions.columns, dimensions.rows, layoutMode);
  const activeMapDef = selectRenderVariant(mapBundle, paneDimensions).grid;

  const allTerritoryIds = useMemo(() => {
    if (state?.territories && Object.keys(state.territories).length > 0) {
      return Object.keys(state.territories);
    }
    return mapBundle.definition.territories.map((t) => t.id);
  }, [state, mapBundle]);

  // Logical IDs are deliberately opaque to players.  The active bundle owns
  // their human-readable names, including for maps added after this client.
  const territoryName = useCallback((territoryId: string) => {
    return mapBundle.definition.territories.find((territory) => territory.id === territoryId)?.name
      ?? mapBundle.metadata.displayCodes[territoryId]
      ?? "selected territory";
  }, [mapBundle]);

  // Action Dispatchers
  const handleDeploy = useCallback(() => {
    if (!state || !selectedTerritoryId) {
      showToast("Select a territory to deploy troops to", "error");
      return;
    }
    if (!isMyTurn) {
      showToast("You can only deploy on your turn", "error");
      return;
    }
    if (state.phase !== "deployment") {
      showToast(`Cannot deploy during ${state.phase} phase`, "error");
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

    const count = Math.min(Math.max(1, deploymentCount), state.pendingReinforcements);
    client.deploy(selectedTerritoryId, count);
    showToast(`Deploying ${count} reinforcement${count === 1 ? "" : "s"} to ${territoryName(selectedTerritoryId)}...`, "info");
  }, [client, state, selectedTerritoryId, myPlayerId, isMyTurn, deploymentCount, showToast, territoryName]);

  const adjustDeploymentCount = useCallback((delta: number) => {
    const available = state?.pendingReinforcements ?? 0;
    if (available <= 0) return;
    setDeploymentCount((current) => Math.min(available, Math.max(1, current + delta)));
  }, [state?.pendingReinforcements]);

  const selectAllDeployments = useCallback(() => {
    setDeploymentCount(state?.pendingReinforcements ?? 0);
  }, [state?.pendingReinforcements]);

  const selectMinimumDeployment = useCallback(() => {
    if ((state?.pendingReinforcements ?? 0) > 0) setDeploymentCount(1);
  }, [state?.pendingReinforcements]);

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
    showToast(`Attacking ${territoryName(targetTerritoryId)} from ${territoryName(selectedTerritoryId)}...`, "info");
  }, [client, state, selectedTerritoryId, targetTerritoryId, myPlayerId, showToast, territoryName]);

  const adjustConquestMove = useCallback((delta: number) => {
    if (!pendingConquestMove) return;
    setConquestMoveUnits((current) => Math.min(
      pendingConquestMove.maximumUnits,
      Math.max(pendingConquestMove.minimumUnits, current + delta)
    ));
  }, [pendingConquestMove]);

  const confirmConquestMove = useCallback(() => {
    if (!pendingConquestMove) return;
    client.completeConquestMove(conquestMoveUnits);
  }, [client, conquestMoveUnits, pendingConquestMove]);

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
    showToast(`Fortified ${unitsToMove} units to ${territoryName(targetTerritoryId)}`, "success");
    setSelectedTerritoryId(null);
    setTargetTerritoryId(null);
  }, [client, state, selectedTerritoryId, targetTerritoryId, myPlayerId, showToast, territoryName]);

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
    if (state?.phase === "game_over") return;
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
      if (hasTtyDimensions && !canRenderMapInPane(mapBundle, compactPaneDimensions)) {
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

    if (pendingConquestMove && isMyTurn) {
      if (key.name === "left" || key.name === "[") {
        adjustConquestMove(-1);
      } else if (key.name === "right" || key.name === "]") {
        adjustConquestMove(1);
      } else if (key.name === "return" || key.name === "enter") {
        confirmConquestMove();
      }
      return;
    }

    // Number keys 1-5 for bottom pill tabs
    if (["1", "2", "3", "4", "5"].includes(key.name)) {
      setActiveTab(parseInt(key.name, 10));
      return;
    }

    if (phase === "deployment" && key.name === "0") {
      selectMinimumDeployment();
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
      const nextId = getNextTabTerritoryId(allTerritoryIds, selectedTerritoryId, key.shift);
      if (!nextId) return;
      setSelectedTerritoryId(nextId);
      setTargetTerritoryId(null);
      return;
    }

    // Arrow keys spatial navigation using geometry-based centroid search
    if (["up", "down", "left", "right"].includes(key.name)) {
      if (allTerritoryIds.length === 0) return;
      if (!selectedTerritoryId) {
        setSelectedTerritoryId(mapBundle.metadata.navigationAnchorTerritoryId);
        return;
      }
      const dir = key.name as "up" | "down" | "left" | "right";
      const nextId = getNextTerritoryInDirection(selectedTerritoryId, dir, activeMapDef);
      if (nextId) {
        setSelectedTerritoryId(nextId);
        setTargetTerritoryId(null);
      }
      return;
    }

    // Action shortcuts (disabled for eliminated spectators)
    if (!isEliminated) {
      if (key.name === "d" || key.name === "D") {
        handleDeploy();
        return;
      }

      if (phase === "deployment" && key.name === "[") {
        adjustDeploymentCount(-1);
        return;
      }

      if (phase === "deployment" && key.name === "]") {
        adjustDeploymentCount(1);
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
        } else if (phase === "fortify") {
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
    }
  });

  // When game is over, render the dedicated MatchResultsScreen
  if (state && state.phase === "game_over") {
    return (
      <MatchResultsScreen
        mapBundle={mapBundle}
        state={state}
        myPlayerId={myPlayerId}
        onRematch={(ready) => client.requestRematch(ready)}
        onReturnHome={onReturnHome}
        onQuit={onQuit ?? onExit}
        onSendChat={(text) => client.sendChat(text)}
        terminalDimensions={dimensions}
      />
    );
  }

  if (isTooSmall) {
    return (
      <TerminalSizeWarning
        columns={cols}
        rows={rows}
        minimumDimensions={getMinimumTerminalDimensionsForMap(mapBundle)}
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
        isEliminated={isEliminated}
        layoutMode={layoutMode}
      />

      {/* Main Tactical Area */}
      {isCompact ? (
        <box
          flexDirection="column"
          flexGrow={1}
          style={{ width: "100%", marginTop: 0, marginBottom: 0 }}
          gap={1}
        >
          {/* Top: Full-width MapCanvas */}
          <box flexGrow={1} flexDirection="column" style={{ width: "100%" }}>
            <MapCanvas
              mapBundle={mapBundle}
              contentDimensions={paneDimensions}
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

          {/* Compact Inspector Strip beneath Map */}
          <CompactInspector
            mapBundle={mapBundle}
            state={state}
            myPlayerId={myPlayerId}
            selectedTerritoryId={selectedTerritoryId}
            hoveredTerritoryId={hoveredTerritoryId}
            targetTerritoryId={targetTerritoryId}
            roomCode={client.roomCode}
            phase={phase}
            onDeploy={handleDeploy}
            deploymentCount={deploymentCount}
            onDecreaseDeployment={() => adjustDeploymentCount(-1)}
            onIncreaseDeployment={() => adjustDeploymentCount(1)}
            onSelectAllDeployments={selectAllDeployments}
            pendingConquestMove={pendingConquestMove}
            conquestMoveUnits={conquestMoveUnits}
            onDecreaseConquestMove={() => adjustConquestMove(-1)}
            onIncreaseConquestMove={() => adjustConquestMove(1)}
            onConfirmConquestMove={confirmConquestMove}
            onSelectMinimumDeployment={selectMinimumDeployment}
            onAttack={handleAttack}
            onFortify={handleFortify}
            onSkipPhase={handleSkipPhase}
            onEndTurn={handleEndTurn}
            onReady={handleReady}
            onSelectTarget={(id) => setTargetTerritoryId(id)}
            onSelectTerritory={(id) => {
              setSelectedTerritoryId(id);
              setTargetTerritoryId(null);
            }}
          />
        </box>
      ) : (
        <box
          flexDirection="row"
          flexGrow={1}
          style={{ width: "100%", marginTop: 0, marginBottom: 0 }}
          gap={1}
        >
          {/* The inspector has a fixed reading width; extra columns belong to the world map. */}
          <box flexGrow={1} flexBasis={0} flexDirection="column" style={{ width: 0, height: "100%" }}>
            <MapCanvas
              mapBundle={mapBundle}
              contentDimensions={paneDimensions}
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

          {/* Right: readable tactical inspector without unbounded width growth. */}
          <box flexShrink={0} flexDirection="column" style={{ width: sidebarWidth, height: "100%" }}>
            <Sidebar
              mapBundle={mapBundle}
              state={state}
              myPlayerId={myPlayerId}
              roomCode={client.roomCode}
              connectionStatus={status}
              selectedTerritoryId={selectedTerritoryId}
              hoveredTerritoryId={hoveredTerritoryId}
              targetTerritoryId={targetTerritoryId}
              onDeploy={handleDeploy}
              deploymentCount={deploymentCount}
              onDecreaseDeployment={() => adjustDeploymentCount(-1)}
              onIncreaseDeployment={() => adjustDeploymentCount(1)}
              onSelectAllDeployments={selectAllDeployments}
              pendingConquestMove={pendingConquestMove}
              conquestMoveUnits={conquestMoveUnits}
              onDecreaseConquestMove={() => adjustConquestMove(-1)}
              onIncreaseConquestMove={() => adjustConquestMove(1)}
              onConfirmConquestMove={confirmConquestMove}
              onSelectMinimumDeployment={selectMinimumDeployment}
              onAttack={handleAttack}
              onFortify={handleFortify}
              onSkipPhase={handleSkipPhase}
              onEndTurn={handleEndTurn}
              onReady={handleReady}
              onSelectTarget={(id) => setTargetTerritoryId(id)}
              layoutMode={layoutMode}
            />
          </box>
        </box>
      )}

      {/* EventLog beneath Map + Sidebar (width 100%) */}
      <EventLog
        mapBundle={mapBundle}
        events={events}
        chatOpen={chatOpen}
        players={state?.players ?? []}
        onToggleChat={() => setChatOpen(!chatOpen)}
        onSendChat={(text) => client.sendChat(text)}
        layoutMode={layoutMode}
      />

      {/* Bottom Footer with Pills & Keybindings */}
      <Footer
        toastMessage={toastMessage}
        toastType={toastType}
        activeTab={activeTab}
        onSelectTab={(tab) => setActiveTab(tab)}
        layoutMode={layoutMode}
      />
    </box>
  );
}
