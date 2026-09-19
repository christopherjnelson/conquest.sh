import React, { useState } from "react";
import { useKeyboard } from "@opentui/react";
import { RoomCodeSchema } from "@conquest/protocol";

export interface JoinRoomScreenProps {
  onJoin: (roomCode: string) => void;
  onBack: () => void;
  errorMessage?: string | null;
  terminalDimensions?: { columns: number; rows: number };
}

export function JoinRoomScreen({ onJoin, onBack, errorMessage }: JoinRoomScreenProps) {
  const [code, setCode] = useState("");

  const clean = code.trim().toUpperCase();
  const isValidCode = RoomCodeSchema.safeParse(clean).success;

  useKeyboard((key) => {
    if (key.name === "escape") {
      onBack();
      return;
    }

    if (key.name === "return" || key.name === "enter") {
      if (isValidCode) {
        onJoin(clean);
      }
      return;
    }

    if (key.name === "backspace") {
      setCode((prev) => prev.slice(0, -1));
      return;
    }

    if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
      const char = key.sequence.toUpperCase();
      if (/^[A-Z0-9]$/.test(char) && code.length < 4) {
        setCode((prev) => prev + char);
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
          <b>! JOIN BY ROOM CODE</b>
        </text>
        <text fg="#64748b">
          direct match entry
        </text>
      </box>

      {/* Main Form Area */}
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
        <text fg="#e2e8f0">
          Enter 4-character room code (e.g. <b>ABCD</b>):
        </text>

        {/* Code Input Box */}
        <box
          flexDirection="row"
          justifyContent="center"
          alignItems="center"
          border
          borderStyle="single"
          borderColor="#00d2ff"
          backgroundColor="#0c2b3d"
          style={{ width: 32, height: 3 }}
          paddingLeft={2}
          paddingRight={2}
        >
          <text fg="#ffffff">
            <b>{code || " "}</b>
          </text>
          <text fg="#00ff66">_</text>
        </box>

        {/* Error Notification */}
        {errorMessage ? (
          <box
            flexDirection="row"
            border
            borderStyle="single"
            borderColor="#ef4444"
            backgroundColor="#2a0d12"
            paddingLeft={2}
            paddingRight={2}
          >
            <text fg="#ef4444">
              <b>⚠️  {errorMessage}</b>
            </text>
          </box>
        ) : (
          <text fg="#64748b">
            <i>Codes are uppercase alphanumeric. Unknown codes will be rejected.</i>
          </text>
        )}
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
            borderColor={isValidCode ? "#00ff66" : "#334155"}
            backgroundColor={isValidCode ? "#052e16" : "#1e293b"}
            paddingLeft={2}
            paddingRight={2}
            onMouseDown={() => {
              if (isValidCode) {
                onJoin(code.trim().toUpperCase());
              }
            }}
          >
            <text fg={isValidCode ? "#00ff66" : "#64748b"}>
              <b>[ Enter: Join Room ]</b>
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
          [Type Code]  │  [Enter] Join  │  [Esc] Back
        </text>
      </box>
    </box>
  );
}
