import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useKeyboard } from "@opentui/react";
import type { GameEvent, GameState } from "@conquest/protocol";
import { areTerritoriesConnected } from "@conquest/game-core";
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

export function getAttackSourceError(territoryName: string): string {
  return `You don't control ${territoryName}. Select a territory you own to attack from.`;
}

export type PendingPhaseAction = "skip-attack" | "end-turn";
type PendingQuantityAction = "deployment" | "fortify";

export function getPhaseActionConfirmationMessage(action: PendingPhaseAction): string {
  const label = action === "skip-attack" ? "Skip attack" : "End turn";
  return `${label}? Enter confirms; Esc cancels.`;
}

export function advancePhaseActionConfirmation(
  pending: PendingPhaseAction | null,
  action: PendingPhaseAction,
): { pending: PendingPhaseAction | null; confirmed: boolean } {
  return pending === action
    ? { pending: null, confirmed: true }
    : { pending: action, confirmed: false };
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
  const [mapNotice, setMapNotice] = useState<string | null>(null);
  const [pendingPhaseAction, setPendingPhaseAction] = useState<PendingPhaseAction | null>(null);
  const [pendingQuantityAction, setPendingQuantityAction] = useState<PendingQuantityAction | null>(null);
  const [fortifyUnits, setFortifyUnits] = useState(1);
  // OpenTUI keeps a keyboard listener alive between renders. Keep the armed
  // action in a ref as well so a rapid Enter observes the first E immediately.
  const pendingPhaseActionRef = useRef<PendingPhaseAction | null>(null);
  const setPhaseActionConfirmation = useCallback((action: PendingPhaseAction | null) => {
    pendingPhaseActionRef.current = action;
    setPendingPhaseAction(action);
  }, []);

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
  const previousPendingConquestMoveRef = useRef<typeof pendingConquestMove>(pendingConquestMove);
  const previousTurnRef = useRef<{ activePlayerId?: string; wasMyTurn: boolean } | null>(null);
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

  // A conquest move is complete only when the server's snapshot removes the
  // pending action. Do not leave the former source or conquered target armed.
  useEffect(() => {
    if (previousPendingConquestMoveRef.current && !pendingConquestMove) {
      setSelectedTerritoryId(null);
      setTargetTerritoryId(null);
    }
    previousPendingConquestMoveRef.current = pendingConquestMove;
  }, [pendingConquestMove]);

  // Fortifying ends a turn on the server. Show that authoritative handoff on
  // the map itself, where it cannot be missed in the footer activity stream.
  useEffect(() => {
    const prior = previousTurnRef.current;
    if (prior && prior.wasMyTurn && !isMyTurn && activePlayer?.id && activePlayer.id !== prior.activePlayerId) {
      setMapNotice(`TURN PASSED — ${activePlayer.name} is now active`);
      setSelectedTerritoryId(null);
      setTargetTerritoryId(null);
    }
    previousTurnRef.current = { activePlayerId: activePlayer?.id, wasMyTurn: isMyTurn };
  }, [activePlayer?.id, activePlayer?.name, isMyTurn, state?.turnNumber]);

  useEffect(() => {
    if (!mapNotice) return;
    const timer = setTimeout(() => setMapNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [mapNotice]);

  // A confirmation only belongs to this exact player and phase. Snapshots are
  // authoritative, so never carry a stale confirmation into the next action.
  useEffect(() => {
    if (
      pendingPhaseAction &&
      (!isMyTurn ||
        (pendingPhaseAction === "skip-attack" && phase !== "attack") ||
        (pendingPhaseAction === "end-turn" && phase !== "fortify"))
    ) {
      setPhaseActionConfirmation(null);
    }
  }, [pendingPhaseAction, phase, isMyTurn, activePlayer?.id, setPhaseActionConfirmation]);

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

  const handleInvalidAttackTarget = useCallback((sourceTerritoryId: string, targetTerritoryId: string) => {
    setPhaseActionConfirmation(null);
    setTargetTerritoryId(null);
    showToast(
      `${territoryName(targetTerritoryId)} is not adjacent to ${territoryName(sourceTerritoryId)}. Select an adjacent enemy territory to attack.`,
      "error",
    );
  }, [showToast, territoryName, setPhaseActionConfirmation]);

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

    setPendingQuantityAction("deployment");
  }, [state, selectedTerritoryId, myPlayerId, isMyTurn, showToast]);

  const confirmDeploy = useCallback(() => {
    if (!state || !selectedTerritoryId) return;
    const territory = state.territories[selectedTerritoryId];
    if (!isMyTurn || state.phase !== "deployment" || territory?.ownerId !== myPlayerId || state.pendingReinforcements <= 0) {
      setPendingQuantityAction(null);
      showToast("Deployment is no longer available", "error");
      return;
    }
    const count = Math.min(Math.max(1, deploymentCount), state.pendingReinforcements);
    client.deploy(selectedTerritoryId, count);
    showToast(`Deploying ${count} reinforcement${count === 1 ? "" : "s"} to ${territoryName(selectedTerritoryId)}...`, "info");
    setPendingQuantityAction(null);
  }, [client, state, selectedTerritoryId, deploymentCount, myPlayerId, isMyTurn, showToast, territoryName]);

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
      showToast(getAttackSourceError(territoryName(selectedTerritoryId)), "error");
      return;
    }
    if (!isMyTurn) {
      showToast("You can only attack on your turn", "error");
      return;
    }
    if (source.units < 2) {
      showToast("Need at least 2 units to attack", "error");
      return;
    }
    if (!targetTerritoryId) {
      showToast("Click an adjacent enemy or press N to choose an attack target", "info");
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
  }, [client, state, selectedTerritoryId, targetTerritoryId, myPlayerId, isMyTurn, showToast, territoryName]);

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
    if (!isMyTurn) {
      showToast("You can only fortify on your turn", "error");
      return;
    }
    if (source.units < 2) {
      showToast("Must leave at least 1 unit behind", "error");
      return;
    }
    if (!targetTerritoryId) {
      showToast("Click a connected friendly territory or press N to choose a fortify target", "info");
      return;
    }
    const target = state.territories[targetTerritoryId];
    if (!target || target.ownerId !== myPlayerId) {
      showToast("Target territory must also be controlled by you", "error");
      return;
    }
    if (!areTerritoriesConnected(state.territories, selectedTerritoryId, targetTerritoryId, myPlayerId!)) {
      showToast("Fortify through a continuous route of territories you control", "error");
      return;
    }

    setFortifyUnits(Math.max(1, source.units - 1));
    setPendingQuantityAction("fortify");
  }, [state, selectedTerritoryId, targetTerritoryId, myPlayerId, isMyTurn, showToast]);

  const confirmFortify = useCallback(() => {
    if (!state || !selectedTerritoryId || !targetTerritoryId) return;
    const source = state.territories[selectedTerritoryId];
    const target = state.territories[targetTerritoryId];
    if (!source || !target || !isMyTurn || state.phase !== "fortify" || source.ownerId !== myPlayerId || target.ownerId !== myPlayerId || source.units < 2 || !areTerritoriesConnected(state.territories, selectedTerritoryId, targetTerritoryId, myPlayerId!)) {
      setPendingQuantityAction(null);
      showToast("Fortification is no longer available", "error");
      return;
    }
    const unitsToMove = Math.min(Math.max(1, fortifyUnits), source.units - 1);
    client.fortify(selectedTerritoryId, targetTerritoryId, unitsToMove);
    showToast(`Fortifying ${unitsToMove} units to ${territoryName(targetTerritoryId)}...`, "info");
    setPendingQuantityAction(null);
  }, [client, state, selectedTerritoryId, targetTerritoryId, fortifyUnits, myPlayerId, isMyTurn, showToast, territoryName]);

  const cycleTarget = useCallback((reverse = false) => {
    if (!state || !selectedTerritoryId || !myPlayerId || (phase !== "attack" && phase !== "fortify")) {
      showToast("Select a friendly territory before choosing a target", "info");
      return;
    }
    const source = state.territories[selectedTerritoryId];
    if (!source || source.ownerId !== myPlayerId) {
      showToast("Select a territory you control first", "error");
      return;
    }
    const candidates = phase === "attack"
      ? source.neighbors.filter((id) => state.territories[id]?.ownerId && state.territories[id]?.ownerId !== myPlayerId)
      : Object.keys(state.territories).filter((id) =>
          id !== selectedTerritoryId &&
          state.territories[id]?.ownerId === myPlayerId &&
          areTerritoriesConnected(state.territories, selectedTerritoryId, id, myPlayerId),
        );
    if (candidates.length === 0) {
      showToast(phase === "attack" ? "No adjacent enemy territories to attack" : "No connected friendly territories to fortify", "info");
      return;
    }
    const current = targetTerritoryId ? candidates.indexOf(targetTerritoryId) : (reverse ? 0 : -1);
    const offset = reverse ? -1 : 1;
    const next = candidates[(current + offset + candidates.length) % candidates.length]!;
    setPhaseActionConfirmation(null);
    setTargetTerritoryId(next);
    showToast(`Target: ${territoryName(next)} (${candidates.length} legal ${candidates.length === 1 ? "choice" : "choices"})`, "info");
  }, [state, selectedTerritoryId, myPlayerId, phase, targetTerritoryId, showToast, territoryName, setPhaseActionConfirmation]);

  const skipPhase = useCallback(() => {
    client.skipPhase();
    showToast("Skipped phase", "info");
  }, [client, showToast]);

  const endTurn = useCallback(() => {
    client.endTurn();
    showToast("Ended turn", "info");
    setSelectedTerritoryId(null);
    setTargetTerritoryId(null);
  }, [client, showToast]);

  const requestPhaseAction = useCallback((action: PendingPhaseAction, confirm = false) => {
    if (pendingConquestMove) {
      showToast("Choose how many troops move into the conquered territory first", "error");
      return;
    }
    if ((action === "skip-attack" && phase !== "attack") ||
        (action === "end-turn" && phase !== "fortify") || !isMyTurn) {
      setPhaseActionConfirmation(null);
      return;
    }
    const confirmation = confirm
      ? advancePhaseActionConfirmation(pendingPhaseActionRef.current, action)
      : { pending: action, confirmed: false };
    setPhaseActionConfirmation(confirmation.pending);
    if (confirmation.confirmed) {
      if (action === "skip-attack") skipPhase();
      else endTurn();
      return;
    }
    showToast(getPhaseActionConfirmationMessage(action), "info");
  }, [pendingConquestMove, phase, isMyTurn, skipPhase, endTurn, showToast, setPhaseActionConfirmation]);

  const handleSkipPhase = useCallback(() => requestPhaseAction("skip-attack", true), [requestPhaseAction]);
  const handleEndTurn = useCallback(() => requestPhaseAction("end-turn", true), [requestPhaseAction]);

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

    if (pendingQuantityAction) {
      const delta = key.name === "left" || key.name === "[" ? -1 : key.name === "right" || key.name === "]" ? 1 : 0;
      if (delta) {
        if (pendingQuantityAction === "deployment") adjustDeploymentCount(delta);
        else setFortifyUnits((current) => Math.max(1, Math.min((state?.territories[selectedTerritoryId ?? ""]?.units ?? 2) - 1, current + delta)));
      } else if (key.name === "return" || key.name === "enter") {
        if (pendingQuantityAction === "deployment") confirmDeploy(); else confirmFortify();
      } else if (key.name === "home") {
        if (pendingQuantityAction === "deployment") selectMinimumDeployment(); else setFortifyUnits(1);
      } else if (key.name === "end") {
        if (pendingQuantityAction === "deployment") selectAllDeployments(); else setFortifyUnits(Math.max(1, (state?.territories[selectedTerritoryId ?? ""]?.units ?? 2) - 1));
      } else if (key.name === "escape") {
        setPendingQuantityAction(null);
      }
      return;
    }

    if (pendingPhaseActionRef.current) {
      if (key.name === "escape") {
        setPhaseActionConfirmation(null);
        showToast("Phase action cancelled", "info");
        return;
      }
      if (key.name === "return" || key.name === "enter" || key.name === "e" || key.name === "E") {
        if (key.name === "return" || key.name === "enter") requestPhaseAction(pendingPhaseActionRef.current, true);
        else requestPhaseAction(pendingPhaseActionRef.current);
        return;
      }
      // Any other keyboard intent abandons the armed phase action before it
      // is processed, so a later E can never confirm a stale request.
      setPhaseActionConfirmation(null);
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

    // Keep the selected source armed while cycling legal action targets. This
    // reaches targets that are not adjacent on the rendered raster, including
    // a fortify route that crosses several friendly territories.
    if (key.name === "n" || key.name === "N") {
      cycleTarget(Boolean(key.shift));
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

  const mapOverlay = pendingConquestMove ? {
    title: "MOVE TROOPS INTO CONQUERED TERRITORY",
    message: `Advance from ${territoryName(pendingConquestMove.sourceTerritoryId)} to ${territoryName(pendingConquestMove.targetTerritoryId)}.`,
    tone: "quantity" as const,
    quantity: { value: conquestMoveUnits, minimum: pendingConquestMove.minimumUnits, maximum: pendingConquestMove.maximumUnits },
  } : pendingQuantityAction === "deployment" ? {
    title: "DEPLOY REINFORCEMENTS",
    message: `Deploy to ${selectedTerritoryId ? territoryName(selectedTerritoryId) : "selected territory"}.`,
    tone: "quantity" as const,
    quantity: { value: deploymentCount, minimum: 1, maximum: state?.pendingReinforcements ?? 1 },
  } : pendingQuantityAction === "fortify" ? {
    title: "FORTIFY TROOP MOVEMENT",
    message: `Move troops from ${selectedTerritoryId ? territoryName(selectedTerritoryId) : "source territory"} to ${targetTerritoryId ? territoryName(targetTerritoryId) : "target territory"}.`,
    tone: "quantity" as const,
    quantity: { value: fortifyUnits, minimum: 1, maximum: Math.max(1, (selectedTerritoryId ? state?.territories[selectedTerritoryId]?.units ?? 2 : 2) - 1) },
  } : pendingPhaseAction ? {
    title: pendingPhaseAction === "skip-attack" ? "SKIP ATTACK PHASE?" : "SKIP FORTIFICATION & END TURN?",
    message: pendingPhaseAction === "skip-attack" ? "No more attacks this turn." : "Pass command to the next player.",
    tone: "confirm" as const,
  } : mapNotice ? { title: "TURN COMPLETE", message: mapNotice, tone: "success" as const } : null;

  const confirmMapOverlay = () => {
    if (pendingConquestMove) confirmConquestMove();
    else if (pendingQuantityAction === "deployment") confirmDeploy();
    else if (pendingQuantityAction === "fortify") confirmFortify();
    else if (pendingPhaseAction) requestPhaseAction(pendingPhaseAction, true);
  };
  const cancelMapOverlay = () => {
    if (pendingQuantityAction) setPendingQuantityAction(null);
    else if (pendingPhaseAction) setPhaseActionConfirmation(null);
  };
  const decreaseMapOverlay = () => {
    if (pendingConquestMove) adjustConquestMove(-1);
    else if (pendingQuantityAction === "deployment") adjustDeploymentCount(-1);
    else if (pendingQuantityAction === "fortify") setFortifyUnits((value) => Math.max(1, value - 1));
  };
  const increaseMapOverlay = () => {
    if (pendingConquestMove) adjustConquestMove(1);
    else if (pendingQuantityAction === "deployment") adjustDeploymentCount(1);
    else if (pendingQuantityAction === "fortify") setFortifyUnits((value) => Math.min(Math.max(1, (selectedTerritoryId ? state?.territories[selectedTerritoryId]?.units ?? 2 : 2) - 1), value + 1));
  };
  const minimumMapOverlay = () => {
    if (pendingConquestMove) setConquestMoveUnits(pendingConquestMove.minimumUnits);
    else if (pendingQuantityAction === "deployment") selectMinimumDeployment();
    else if (pendingQuantityAction === "fortify") setFortifyUnits(1);
  };
  const maximumMapOverlay = () => {
    if (pendingConquestMove) setConquestMoveUnits(pendingConquestMove.maximumUnits);
    else if (pendingQuantityAction === "deployment") selectAllDeployments();
    else if (pendingQuantityAction === "fortify") setFortifyUnits(Math.max(1, (selectedTerritoryId ? state?.territories[selectedTerritoryId]?.units ?? 2 : 2) - 1));
  };

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
        currentPlayer={myPlayer}
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
                setPhaseActionConfirmation(null);
                setSelectedTerritoryId(id);
                setTargetTerritoryId(null);
              }}
              onSelectTarget={(id) => {
                setPhaseActionConfirmation(null);
                setTargetTerritoryId(id);
              }}
              onInvalidAttackTarget={handleInvalidAttackTarget}
              onDeselect={() => {
                setPhaseActionConfirmation(null);
                setSelectedTerritoryId(null);
                setTargetTerritoryId(null);
              }}
              overlay={mapOverlay}
              onOverlayConfirm={confirmMapOverlay}
              onOverlayCancel={cancelMapOverlay}
              onOverlayDecrease={decreaseMapOverlay}
              onOverlayIncrease={increaseMapOverlay}
              onOverlayMinimum={minimumMapOverlay}
              onOverlayMaximum={maximumMapOverlay}
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
            pendingConquestMove={pendingConquestMove}
            onAttack={handleAttack}
            onFortify={handleFortify}
            onSkipPhase={handleSkipPhase}
            onEndTurn={handleEndTurn}
            pendingPhaseAction={pendingPhaseAction}
            onReady={handleReady}
            onSelectTarget={(id) => {
              setPhaseActionConfirmation(null);
              setTargetTerritoryId(id);
            }}
            onSelectTerritory={(id) => {
              setPhaseActionConfirmation(null);
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
                setPhaseActionConfirmation(null);
                setSelectedTerritoryId(id);
                setTargetTerritoryId(null);
              }}
              onSelectTarget={(id) => {
                setPhaseActionConfirmation(null);
                setTargetTerritoryId(id);
              }}
              onInvalidAttackTarget={handleInvalidAttackTarget}
              onDeselect={() => {
                setPhaseActionConfirmation(null);
                setSelectedTerritoryId(null);
                setTargetTerritoryId(null);
              }}
              overlay={mapOverlay}
              onOverlayConfirm={confirmMapOverlay}
              onOverlayCancel={cancelMapOverlay}
              onOverlayDecrease={decreaseMapOverlay}
              onOverlayIncrease={increaseMapOverlay}
              onOverlayMinimum={minimumMapOverlay}
              onOverlayMaximum={maximumMapOverlay}
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
              pendingConquestMove={pendingConquestMove}
              onAttack={handleAttack}
              onFortify={handleFortify}
              onSkipPhase={handleSkipPhase}
              onEndTurn={handleEndTurn}
              pendingPhaseAction={pendingPhaseAction}
              onReady={handleReady}
              onSelectTarget={(id) => {
                setPhaseActionConfirmation(null);
                setTargetTerritoryId(id);
              }}
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
