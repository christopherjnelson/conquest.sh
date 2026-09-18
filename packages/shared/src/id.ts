import { randomBytes, randomUUID } from "node:crypto";

export function generateId(prefix: string = "id"): string {
  return `${prefix}_${randomBytes(4).toString("hex")}`;
}

export function generateSessionToken(): string {
  return `sess_${randomBytes(16).toString("hex")}`;
}

export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  const bytes = randomBytes(4);
  for (let i = 0; i < 4; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

export function generatePlayerId(): string {
  return `usr_${randomBytes(4).toString("hex")}`;
}
