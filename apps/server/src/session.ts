import { Database } from "bun:sqlite";
import { generatePlayerId, generateSessionToken, logger } from "@conquest/shared";

export interface SessionRecord {
  token: string;
  playerId: string;
  playerName: string;
  roomCode: string | null;
  createdAt: number;
  lastSeenAt: number;
}

export class SessionStore {
  private db: Database;

  constructor(dbPath: string = ":memory:") {
    this.db = new Database(dbPath);
    this.init();
  }

  private init() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        player_id TEXT NOT NULL,
        player_name TEXT NOT NULL,
        room_code TEXT,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL
      );
    `);
  }

  get(token: string): SessionRecord | null {
    const row = this.db
      .query("SELECT * FROM sessions WHERE token = ?")
      .get(token) as {
      token: string;
      player_id: string;
      player_name: string;
      room_code: string | null;
      created_at: number;
      last_seen_at: number;
    } | null;

    if (!row) return null;

    return {
      token: row.token,
      playerId: row.player_id,
      playerName: row.player_name,
      roomCode: row.room_code,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
    };
  }

  create(playerName: string, roomCode?: string): SessionRecord {
    const token = generateSessionToken();
    const playerId = generatePlayerId();
    const now = Date.now();

    this.db
      .query(
        "INSERT INTO sessions (token, player_id, player_name, room_code, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(token, playerId, playerName, roomCode ?? null, now, now);

    return {
      token,
      playerId,
      playerName,
      roomCode: roomCode ?? null,
      createdAt: now,
      lastSeenAt: now,
    };
  }

  updateLastSeen(token: string, roomCode?: string) {
    const now = Date.now();
    if (roomCode) {
      this.db
        .query("UPDATE sessions SET last_seen_at = ?, room_code = ? WHERE token = ?")
        .run(now, roomCode, token);
    } else {
      this.db.query("UPDATE sessions SET last_seen_at = ? WHERE token = ?").run(now, token);
    }
  }
}
