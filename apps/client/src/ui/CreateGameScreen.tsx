import React, { useState } from "react";
import { useKeyboard } from "@opentui/react";
import type { RoomVisibility } from "@conquest/protocol";

export interface CreateGameScreenProps {
  defaultName?: string;
  onCreate: (options: { displayName: string; maxPlayers: number; visibility: RoomVisibility }) => void;
  onBack: () => void;
  terminalDimensions?: { columns: number; rows: number };
}

type FieldIndex = 0 | 1 | 2;

export function CreateGameScreen({ defaultName, onCreate, onBack }: CreateGameScreenProps) {
  const [activeField, setActiveField] = useState<FieldIndex>(0);
  const [displayName, setDisplayName] = useState(defaultName || "Conquest Campaign");
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [visibility, setVisibility] = useState<RoomVisibility>("public");
  const [nameInputFocused, setNameInputFocused] = useState(false);

  useKeyboard((key) => {
    if (key.name === "escape") {
      onBack();
      return;
    }

    if (key.name === "tab") {
      setActiveField((prev) => ((prev + 1) % 3) as FieldIndex);
      return;
    }

    if (key.name === "up") {
      setActiveField((prev) => ((prev - 1 + 3) % 3) as FieldIndex);
      return;
    }

    if (key.name === "down") {
      setActiveField((prev) => ((prev + 1) % 3) as FieldIndex);
      return;
    }

    // Enter submits if on buttons or fields
    if (key.name === "return" || key.name === "enter") {
      const trimmed = displayName.trim() || "Conquest Campaign";
      onCreate({ displayName: trimmed, maxPlayers, visibility });
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
        setMaxPlayers((prev) => Math.max(2, prev - 1));
        return;
      }
      if (key.name === "right" || key.name === "+") {
        setMaxPlayers((prev) => Math.min(6, prev + 1));
        return;
      }
      const num = parseInt(key.name, 10);
      if (num >= 2 && num <= 6) {
        setMaxPlayers(num);
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
  });

  return (
    <box
      flexDirection="column"
      backgroundColor="#080f1a"
      style={{ width: "100%", height: "100%" }}
      padding={1}
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
          configure realm rules & visibility
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
        marginTop={1}
        marginBottom={1}
        padding={2}
        alignItems="center"
        justifyContent="center"
        gap={2}
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
            marginTop={1}
          >
            <text fg="#ffffff">
              <b>{displayName || " "}</b>
            </text>
            {activeField === 0 && <text fg="#00ff66">_</text>}
          </box>
          <text fg="#64748b" marginTop={0}>
            <i>Type directly to change room name</i>
          </text>
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
            marginTop={1}
          >
            <text
              fg="#38bdf8"
              onMouseDown={() => setMaxPlayers((prev) => Math.max(2, prev - 1))}
            >
              <b>[ ◄ Decrement ]</b>
            </text>
            <text fg="#00ff66">
              <b>{maxPlayers} Players</b>
            </text>
            <text
              fg="#38bdf8"
              onMouseDown={() => setMaxPlayers((prev) => Math.min(6, prev + 1))}
            >
              <b>[ Increment ► ]</b>
            </text>
          </box>
          <text fg="#64748b" marginTop={0}>
            <i>Use Left/Right arrows or click buttons to adjust</i>
          </text>
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
            marginTop={1}
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
          <text fg="#64748b" marginTop={0}>
            <i>Unlisted rooms do not appear in public browser</i>
          </text>
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
              const trimmed = displayName.trim() || "Conquest Campaign";
              onCreate({ displayName: trimmed, maxPlayers, visibility });
            }}
          >
            <text fg="#00ff66">
              <b>[ Enter: Create Game ]</b>
            </text>
          </box>

          <box
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
          </box>
        </box>

        <text fg="#64748b">
          [Tab / ↑ / ↓] Switch Field  │  [Enter] Create Game
        </text>
      </box>
    </box>
  );
}
