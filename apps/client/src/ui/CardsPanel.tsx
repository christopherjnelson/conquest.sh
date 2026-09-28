/**
 * CardsPanel — Risk-style territory card hand and trade UI.
 *
 * Displayed when the player presses [2] or when a forced trade is pending.
 * Shows the player's hand, the current escalation value, and allows
 * selecting three cards to trade.
 */

import React, { useState } from "react";
import type { Card, GameState } from "@conquest/protocol";
import { suggestSets } from "@conquest/game-core";

export interface CardsPanelProps {
  state: GameState | null;
  myPlayerId: string | null;
  onTradeCards: (cardIds: [string, string, string]) => void;
  layoutMode?: "standard" | "compact" | string;
}

const SYMBOL_LABEL: Record<string, string> = {
  infantry: "INF",
  cavalry: "CAV",
  artillery: "ART",
  wild: "WLD",
};

const SYMBOL_COLOR: Record<string, string> = {
  infantry: "#86efac",
  cavalry: "#93c5fd",
  artillery: "#fca5a5",
  wild: "#fde68a",
};

export function CardsPanel({ state, myPlayerId, onTradeCards }: CardsPanelProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const pub = state?.publicCards;
  const hand: Card[] = state?.myHand ?? [];
  const isMyTurn = state && myPlayerId
    ? state.players[state.activePlayerIndex]?.id === myPlayerId
    : false;
  const forcedTrade = pub?.pendingForcedTrade?.playerId === myPlayerId;
  const canTradeInPhase =
    state?.phase === "deployment" || (state?.phase === "attack" && forcedTrade);

  // Owned territories for bonus detection
  const ownedIds = new Set(
    state
      ? Object.values(state.territories)
          .filter((t) => t.ownerId === myPlayerId)
          .map((t) => t.id)
      : []
  );

  // Find best set from current selection
  const selectedCards = hand.filter((c) => selected.has(c.id));
  const validSelection =
    selectedCards.length === 3 && selectedCards.every((c) => c);
  const selectionIsValid = validSelection
    ? suggestSets(selectedCards, ownedIds).length > 0
    : false;

  function toggleCard(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 3) {
        next.add(id);
      }
      return next;
    });
  }

  function handleTrade() {
    if (!selectionIsValid) return;
    const ids = selectedCards.map((c) => c.id) as [string, string, string];
    onTradeCards(ids);
    setSelected(new Set());
  }

  function handleAutoSelect() {
    // Auto-select the best suggested set
    const sets = suggestSets(hand, ownedIds);
    if (sets.length > 0) {
      setSelected(new Set(sets[0]!.map((c) => c.id)));
    }
  }

  if (!pub || pub.mode !== "escalating") {
    return (
      <box
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        flexGrow={1}
        style={{ width: "100%", height: "100%" }}
        paddingLeft={2}
        paddingRight={2}
      >
        <text fg="#64748b">Cards are disabled in this room.</text>
      </box>
    );
  }

  return (
    <box
      flexDirection="column"
      style={{ width: "100%", height: "100%" }}
      paddingLeft={1}
      paddingRight={1}
      gap={1}
    >
      {/* Status bar */}
      <box
        flexDirection="row"
        justifyContent="space-between"
        style={{ height: 1 }}
      >
        <text fg="#64748b">
          Deck: <span fg="#e2e8f0">{pub.deckCount}</span>
          {"  "}Sets traded: <span fg="#e2e8f0">{pub.setsTradedCount}</span>
        </text>
        <text fg="#a78bfa">
          Next trade: <b>{pub.nextTradeValue} armies</b>
        </text>
      </box>

      {/* Forced trade banner */}
      {forcedTrade && (
        <box
          flexDirection="row"
          justifyContent="center"
          style={{ height: 1 }}
        >
          <text fg="#ef4444">
            <b>⚠ FORCED TRADE — select 3 cards and confirm</b>
          </text>
        </box>
      )}

      {/* Hand */}
      <box
        title="! YOUR HAND"
        titleColor="#a78bfa"
        border
        borderStyle="single"
        borderColor="#4c1d95"
        backgroundColor="#080f1a"
        flexDirection="column"
        flexGrow={1}
        paddingLeft={1}
        paddingRight={1}
      >
        {hand.length === 0 ? (
          <box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1}>
            <text fg="#64748b"><i>No cards in hand.</i></text>
          </box>
        ) : (
          <box flexDirection="column" gap={0} flexWrap="wrap">
            {hand.map((card) => {
              const isSelected = selected.has(card.id);
              const sym = card.symbol;
              const label = SYMBOL_LABEL[sym] ?? sym.toUpperCase();
              const color = SYMBOL_COLOR[sym] ?? "#e2e8f0";
              const hasBonus = card.territoryId ? ownedIds.has(card.territoryId) : false;

              return (
                <box
                  key={card.id}
                  flexDirection="row"
                  backgroundColor={isSelected ? "#1e1b4b" : undefined}
                  onMouseDown={() => {
                    if (isMyTurn && canTradeInPhase) toggleCard(card.id);
                  }}
                >
                  <text fg={isSelected ? "#818cf8" : "#64748b"}>
                    {isSelected ? "▶ " : "  "}
                  </text>
                  <text fg={color}>
                    <b>[{label}]</b>
                  </text>
                  <text fg="#e2e8f0">
                    {" "}
                    {card.territoryId ? card.territoryId : "Wild"}
                    {hasBonus && <span fg="#fde68a"> ★</span>}
                  </text>
                </box>
              );
            })}
          </box>
        )}
      </box>

      {/* Trade controls */}
      {isMyTurn && canTradeInPhase && hand.length >= 3 && (
        <box flexDirection="row" gap={2} style={{ height: 1 }}>
          <text
            fg={selectionIsValid ? "#00ff66" : "#64748b"}
            onMouseDown={selectionIsValid ? handleTrade : undefined}
          >
            {selectionIsValid
              ? "[Enter] Confirm trade"
              : `${selected.size}/3 selected${selected.size === 3 ? " (invalid set)" : ""}`}
          </text>
          <text fg="#64748b" onMouseDown={handleAutoSelect}>
            [A] Auto-select
          </text>
          <text fg="#64748b" onMouseDown={() => setSelected(new Set())}>
            [Esc] Clear
          </text>
        </box>
      )}

      {/* Opponent hand counts */}
      {state && (
        <box
          title="! ALL HANDS"
          titleColor="#64748b"
          border
          borderStyle="single"
          borderColor="#24566d"
          backgroundColor="#080f1a"
          flexDirection="column"
          paddingLeft={1}
          paddingRight={1}
          style={{ height: state.players.length + 2 }}
        >
          {state.players.map((p) => (
            <box key={p.id} flexDirection="row" justifyContent="space-between">
              <text fg={p.colorHex}>
                {p.name}
                {p.id === myPlayerId && <span fg="#00ff66"> (you)</span>}
              </text>
              <text fg="#a78bfa">
                {pub.playerHandCounts[p.id] ?? 0} cards
              </text>
            </box>
          ))}
        </box>
      )}
    </box>
  );
}
