import React, { useEffect, useState } from "react";
import { useKeyboard } from "@opentui/react";
import type { RoomVisibility } from "@conquest/protocol";

export interface CreateGameScreenProps {
  defaultName?: string;
  onCreate: (options: { displayName: string; maxPlayers: number; visibility: RoomVisibility; cardMode: "escalating" | "off"; botCount: number }) => void;
  onBack: () => void;
  terminalDimensions?: { columns: number; rows: number };
}

type FieldIndex = 0 | 1 | 2 | 3 | 4;
const FIELD_COUNT = 5;

export function CreateGameScreen({ defaultName, onCreate, onBack, terminalDimensions }: CreateGameScreenProps) {
  const [activeField, setActiveField] = useState<FieldIndex>(0);
  const [displayName, setDisplayName] = useState(defaultName || "Conquest Campaign");
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [visibility, setVisibility] = useState<RoomVisibility>("public");
  const [cardMode, setCardMode] = useState<"escalating" | "off">("escalating");
  const [botCount, setBotCount] = useState(0);
  useEffect(() => setBotCount((current) => Math.min(current, maxPlayers - 1)), [maxPlayers]);
  const compact = (terminalDimensions?.rows ?? 40) <= 36;

  const create = () => onCreate({ displayName: displayName.trim() || "Conquest Campaign", maxPlayers, visibility, cardMode, botCount });
  const changeCapacity = (next: number) => {
    setMaxPlayers(next);
    setBotCount((current) => Math.min(current, next - 1));
  };

  useKeyboard((key) => {
    if (key.ctrl && key.name === "p") {
      setMaxPlayers(2);
      setBotCount(1);
      setVisibility("unlisted");
      setActiveField(4);
      return;
    }
    if (key.name === "escape") {
      onBack();
      return;
    }

    if (key.name === "tab") {
      setActiveField((prev) => ((prev + 1) % FIELD_COUNT) as FieldIndex);
      return;
    }

    if (key.name === "up") {
      setActiveField((prev) => ((prev - 1 + FIELD_COUNT) % FIELD_COUNT) as FieldIndex);
      return;
    }

    if (key.name === "down") {
      setActiveField((prev) => ((prev + 1) % FIELD_COUNT) as FieldIndex);
      return;
    }

    // Enter submits
    if (key.name === "return" || key.name === "enter") {
      create();
      return;
    }

    // Field 0: Game Name
    if (activeField === 0) {
      if (key.name === "backspace") {
        setDisplayName((prev) => prev.slice(0, -1));
        return;
      }
      if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
        if (displayName.length < 40) {
          setDisplayName((prev) => prev + key.sequence);
        }
        return;
      }
    }

    // Field 1: Max Players
    if (activeField === 1) {
      if (key.name === "left" || key.name === "-") {
        changeCapacity(Math.max(2, maxPlayers - 1));
        return;
      }
      if (key.name === "right" || key.name === "+") {
        changeCapacity(Math.min(6, maxPlayers + 1));
        return;
      }
      const num = parseInt(key.name, 10);
      if (num >= 2 && num <= 6) {
        changeCapacity(num);
        return;
      }
    }

    // Field 2: Visibility
    if (activeField === 2) {
      if (key.name === "left" || key.name === "right" || key.name === "space") {
        setVisibility((prev) => (prev === "public" ? "unlisted" : "public"));
        return;
      }
    }

    // Field 3: Card Mode
    if (activeField === 3) {
      if (key.name === "left" || key.name === "right" || key.name === "space") {
        setCardMode((prev) => (prev === "escalating" ? "off" : "escalating"));
        return;
      }
    }
    if (activeField === 4 && (key.name === "left" || key.name === "right" || key.name === "space")) {
      setBotCount((prev) => Math.max(0, Math.min(maxPlayers - 1, prev + (key.name === "left" ? -1 : 1))));
      return;
    }
  });

  return (
    <box
      flexDirection="column"
      backgroundColor="#080f1a"
      style={{ width: "100%", height: "100%" }}
      padding={compact ? 0 : 1}
      justifyContent="space-between"
    >
      {/* Title Bar */}
      <box
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
        border
        borderStyle="single"
        borderColor="#00d2ff"
        backgroundColor="#0c1929"
        paddingLeft={2}
        paddingRight={2}
      >
        <text fg="#00d2ff">
          <b>! HOST CUSTOM BATTLE</b>
        </text>
        <text fg="#64748b">
          {compact ? "Ctrl+P Solo Practice" : "configure realm rules & visibility"}
        </text>
      </box>

      {/* Configuration Form */}
      <box
        flexDirection="column"
        border
        borderStyle="single"
        borderColor="#1e293b"
        backgroundColor="#091220"
        flexGrow={1}
        marginTop={compact ? 0 : 1}
        marginBottom={compact ? 0 : 1}
        padding={compact ? 0 : 1}
        alignItems="center"
        justifyContent="center"
        gap={compact ? 0 : 1}
      >
        {/* Field 0: Game Name */}
        <box
          flexDirection="column"
          style={{ width: 60 }}
          onMouseDown={() => setActiveField(0)}
        >
          <text fg={activeField === 0 ? "#00d2ff" : "#94a3b8"}>
            <b>1. GAME NAME (1–40 chars):</b>
          </text>
          <box
            flexDirection="row"
            border
            borderStyle="single"
            borderColor={activeField === 0 ? "#00d2ff" : "#334155"}
            backgroundColor={activeField === 0 ? "#0c2b3d" : "#080f1a"}
            paddingLeft={1}
            paddingRight={1}
          >
            <text fg="#ffffff">
              <b>{displayName || " "}</b>
            </text>
            {activeField === 0 && <text fg="#00ff66">_</text>}
          </box>
          {!compact && <text fg="#64748b" marginTop={0}>
            <i>Type directly to change room name</i>
          </text>}
        </box>

        {/* Field 1: Max Players */}
        <box
          flexDirection="column"
          style={{ width: 60 }}
          onMouseDown={() => setActiveField(1)}
        >
          <text fg={activeField === 1 ? "#00d2ff" : "#94a3b8"}>
            <b>2. MAXIMUM PLAYERS (2–6):</b>
          </text>
          <box
            flexDirection="row"
            gap={2}
            alignItems="center"
            border
            borderStyle="single"
            borderColor={activeField === 1 ? "#00d2ff" : "#334155"}
            backgroundColor={activeField === 1 ? "#0c2b3d" : "#080f1a"}
            paddingLeft={2}
            paddingRight={2}
          >
            <text
              fg="#38bdf8"
              onMouseDown={() => changeCapacity(Math.max(2, maxPlayers - 1))}
            >
              <b>[ ◄ Decrement ]</b>
            </text>
            <text fg="#00ff66">
              <b>{maxPlayers} Players</b>
            </text>
            <text
              fg="#38bdf8"
              onMouseDown={() => changeCapacity(Math.min(6, maxPlayers + 1))}
            >
              <b>[ Increment ► ]</b>
            </text>
          </box>
          {!compact && <text fg="#64748b" marginTop={0}>
            <i>Use Left/Right arrows or click buttons to adjust</i>
          </text>}
        </box>

        {/* Field 2: Visibility */}
        <box
          flexDirection="column"
          style={{ width: 60 }}
          onMouseDown={() => setActiveField(2)}
        >
          <text fg={activeField === 2 ? "#00d2ff" : "#94a3b8"}>
            <b>3. LOBBY VISIBILITY:</b>
          </text>
          <box
            flexDirection="row"
            gap={3}
            alignItems="center"
            border
            borderStyle="single"
            borderColor={activeField === 2 ? "#00d2ff" : "#334155"}
            backgroundColor={activeField === 2 ? "#0c2b3d" : "#080f1a"}
            paddingLeft={2}
            paddingRight={2}
          >
            <box
              flexDirection="row"
              gap={1}
              onMouseDown={() => setVisibility("public")}
            >
              <text fg={visibility === "public" ? "#00ff66" : "#64748b"}>
                {visibility === "public" ? "(●)" : "( )"}
              </text>
              <text fg={visibility === "public" ? "#ffffff" : "#94a3b8"}>
                <b>Public</b> (listed in browser)
              </text>
            </box>

            <box
              flexDirection="row"
              gap={1}
              onMouseDown={() => setVisibility("unlisted")}
            >
              <text fg={visibility === "unlisted" ? "#00ff66" : "#64748b"}>
                {visibility === "unlisted" ? "(●)" : "( )"}
              </text>
              <text fg={visibility === "unlisted" ? "#ffffff" : "#94a3b8"}>
                <b>Unlisted</b> (invite code only)
              </text>
            </box>
          </box>
          {!compact && <text fg="#64748b" marginTop={0}>
            <i>Unlisted rooms do not appear in public browser</i>
          </text>}
        </box>

        {/* Field 3: Card Mode */}
        <box
          flexDirection="column"
          style={{ width: 60 }}
          onMouseDown={() => setActiveField(3)}
        >
          <text fg={activeField === 3 ? "#00d2ff" : "#94a3b8"}>
            <b>4. CARDS:</b>
          </text>
          <box
            flexDirection="row"
            gap={3}
            alignItems="center"
            border
            borderStyle="single"
            borderColor={activeField === 3 ? "#00d2ff" : "#334155"}
            backgroundColor={activeField === 3 ? "#0c2b3d" : "#080f1a"}
            paddingLeft={2}
            paddingRight={2}
          >
            <box
              flexDirection="row"
              gap={1}
              onMouseDown={() => setCardMode("escalating")}
            >
              <text fg={cardMode === "escalating" ? "#a78bfa" : "#64748b"}>
                {cardMode === "escalating" ? "(●)" : "( )"}
              </text>
              <text fg={cardMode === "escalating" ? "#ffffff" : "#94a3b8"}>
                <b>Escalating</b> (4→6→8→10→12→15→+5)
              </text>
            </box>

            <box
              flexDirection="row"
              gap={1}
              onMouseDown={() => setCardMode("off")}
            >
              <text fg={cardMode === "off" ? "#a78bfa" : "#64748b"}>
                {cardMode === "off" ? "(●)" : "( )"}
              </text>
              <text fg={cardMode === "off" ? "#ffffff" : "#94a3b8"}>
                <b>Off</b>
              </text>
            </box>
          </box>
          {!compact && <text fg="#64748b" marginTop={0}>
            <i>Escalating: territory cards with bonus armies per traded set</i>
          </text>}
        </box>

        <box flexDirection="column" style={{ width: 60 }} onMouseDown={() => setActiveField(4)}>
          <text fg={activeField === 4 ? "#00d2ff" : "#94a3b8"}><b>5. BOT SEATS (0–{maxPlayers - 1}):</b></text>
          <box flexDirection="row" gap={2} alignItems="center" border borderStyle="single" borderColor={activeField === 4 ? "#00d2ff" : "#334155"} paddingLeft={1} paddingRight={1}>
            <text fg="#38bdf8" onMouseDown={() => setBotCount((n) => Math.max(0, n - 1))}><b>[ − ]</b></text>
            <text fg="#00ff66"><b>{botCount} {botCount === 1 ? "bot" : "bots"} · {maxPlayers - botCount} human seats · {maxPlayers} total</b></text>
            <text fg="#38bdf8" onMouseDown={() => setBotCount((n) => Math.min(maxPlayers - 1, n + 1))}><b>[ + ]</b></text>
          </box>
        </box>
      </box>

      {/* Action Footer */}
      <box
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
        border
        borderStyle="single"
        borderColor="#1e293b"
        backgroundColor="#0b1320"
        paddingLeft={2}
        paddingRight={2}
      >
        <box flexDirection="row" gap={2}>
          <box
            border
            borderStyle="single"
            borderColor="#00ff66"
            backgroundColor="#052e16"
            paddingLeft={2}
            paddingRight={2}
            onMouseDown={() => {
              create();
            }}
          >
            <text fg="#00ff66">
              <b>[ Enter: Create Game ]</b>
            </text>
          </box>

          {!compact && <box
            border
            borderStyle="single"
            borderColor="#64748b"
            backgroundColor="#1e293b"
            paddingLeft={2}
            paddingRight={2}
            onMouseDown={onBack}
          >
            <text fg="#cbd5e1">
              <b>[ Esc: Cancel / Back ]</b>
            </text>
          </box>}
        </box>

        {!compact && <text fg="#64748b">[Ctrl+P] Solo Practice · [Tab/↑/↓] Fields · [Enter] Create</text>}
      </box>
    </box>
  );
}
