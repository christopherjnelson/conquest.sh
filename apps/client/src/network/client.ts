import {
  ServerInfoSchema,
  RoomSummarySchema,
  RoomSummariesSchema,
  type ClientAttack,
  type ClientChat,
  type ClientCreateRoom,
  type ClientDeploy,
  type ClientEndTurn,
  type ClientFortify,
  type ClientJoin,
  type ClientLeaveRoom,
  type ClientMessage,
  type ClientPing,
  type ClientReady,
  type ClientRematch,
  type ClientSkipPhase,
  type GameEvent,
  type GameState,
  type RoomSummary,
  type RoomVisibility,
  type ServerInfo,
  type ServerMessage,
} from "@conquest/protocol";
import * as fs from "node:fs";
import * as path from "node:path";

export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

export interface SessionData {
  token: string;
  playerName: string;
  roomCode?: string;
  playerId?: string;
}

export interface GameClientOptions {
  host?: string;
  sessionFilePath?: string;
  playerName?: string;
  roomCode?: string;
  forceNewSession?: boolean;
  autoReconnect?: boolean;
  reconnectIntervalMs?: number;
  maxReconnectAttempts?: number;
}

export class GameClient {
  public ws: WebSocket | null = null;
  public status: ConnectionStatus = "disconnected";
  public state: GameState | null = null;
  public myPlayerId: string | null = null;
  public roomCode: string | null = null;
  public explicitRoomCode?: string;
  public sessionToken: string | null = null;
  public serverName: string | null = null;
  public playerName: string = "";
  public eventHistory: GameEvent[] = [];

  public readonly wsUrl: string;
  public sessionFilePath: string;
  public readonly options: GameClientOptions;

  private isExplicitDisconnect: boolean = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts: number = 0;

  private snapshotListeners = new Set<(state: GameState, myPlayerId: string) => void>();
  private eventListeners = new Set<(event: GameEvent) => void>();
  private statusListeners = new Set<(status: ConnectionStatus, error?: string) => void>();
  private errorListeners = new Set<(msg: string, code?: string) => void>();

  public get httpUrl(): string {
    if (this.wsUrl.startsWith("wss://")) {
      return this.wsUrl.replace("wss://", "https://");
    }
    return this.wsUrl.replace("ws://", "http://");
  }

  constructor(options: GameClientOptions = {}) {
    this.options = options;
    if (options.playerName) {
      this.playerName = options.playerName;
    }
    if (options.roomCode) {
      this.explicitRoomCode = options.roomCode;
      this.roomCode = options.roomCode;
    }
    const rawHost = options.host ?? "localhost:4000";
    this.wsUrl = this.normalizeWsUrl(rawHost);

    if (options.sessionFilePath) {
      this.sessionFilePath = options.sessionFilePath;
    } else {
      const safeName = (this.playerName || "default").replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
      const portOrHost = this.extractPortOrHost(this.wsUrl);
      this.sessionFilePath = path.resolve(process.cwd(), `.conquest-session-${safeName}-${portOrHost}.json`);
    }

    if (options.forceNewSession) {
      this.clearSession();
    } else {
      const cached = this.loadSession();
      if (cached) {
        if (!this.playerName || cached.playerName === this.playerName) {
          this.sessionToken = cached.token;
          this.playerName = cached.playerName;
          if (cached.roomCode && !this.roomCode) {
            this.roomCode = cached.roomCode;
          }
          if (cached.playerId) {
            this.myPlayerId = cached.playerId;
          }
        }
      }
    }
  }

  private normalizeWsUrl(host: string): string {
    if (host.startsWith("ws://") || host.startsWith("wss://")) {
      return host;
    }
    if (host.startsWith("http://")) {
      return host.replace("http://", "ws://");
    }
    if (host.startsWith("https://")) {
      return host.replace("https://", "wss://");
    }
    return `ws://${host}`;
  }

  private extractPortOrHost(urlStr: string): string {
    try {
      const parsed = new URL(urlStr);
      if (parsed.port) {
        return parsed.port;
      }
      if (parsed.hostname) {
        const sanitizedHost = parsed.hostname.replace(/^\[|\]$/g, "").replace(/[^a-zA-Z0-9_-]/g, "_");
        if (sanitizedHost) {
          return sanitizedHost;
        }
      }
      return "4000";
    } catch {
      const portMatch = urlStr.match(/:(\d+)/);
      if (portMatch) return portMatch[1];
      const hostMatch = urlStr.match(/(?:https?|wss?):\/\/([^/:]+)/i) || urlStr.match(/^([^/:]+)/);
      if (hostMatch && hostMatch[1]) {
        const sanitized = hostMatch[1].replace(/^\[|\]$/g, "").replace(/[^a-zA-Z0-9_-]/g, "_");
        if (sanitized) return sanitized;
      }
      return "4000";
    }
  }

  public loadSession(): SessionData | null {
    if (this.options.forceNewSession) return null;
    try {
      if (fs.existsSync(this.sessionFilePath)) {
        const raw = fs.readFileSync(this.sessionFilePath, "utf-8");
        const cached = JSON.parse(raw) as SessionData;
        if (this.playerName && cached.playerName && cached.playerName !== this.playerName) {
          return null;
        }
        return cached;
      }
    } catch {
      // Ignore read errors
    }
    return null;
  }

  public saveSession(data: SessionData): void {
    try {
      fs.writeFileSync(this.sessionFilePath, JSON.stringify(data, null, 2), "utf-8");
    } catch {
      // Ignore write errors
    }
  }

  public clearSession(): void {
    this.sessionToken = null;
    this.roomCode = null;
    this.explicitRoomCode = undefined;
    try {
      if (fs.existsSync(this.sessionFilePath)) {
        fs.unlinkSync(this.sessionFilePath);
      }
    } catch {
      // Ignore delete errors
    }
  }

  public async connect(): Promise<void> {
    this.isExplicitDisconnect = false;

    return new Promise((resolve, reject) => {
      this.status = "connecting";
      this.notifyStatusChange("connecting");

      try {
        this.ws = new WebSocket(this.wsUrl);
      } catch (err) {
        this.status = "disconnected";
        this.notifyStatusChange("disconnected", String(err));
        reject(err);
        return;
      }

      let opened = false;

      this.ws.onopen = () => {
        opened = true;
        this.status = "connected";
        this.reconnectAttempts = 0;
        this.notifyStatusChange("connected");
        resolve();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onclose = (event) => {
        this.handleClose(event.code, event.reason);
        if (!opened) {
          reject(new Error(`WebSocket connection closed: code ${event.code}, reason: ${event.reason}`));
        }
      };

      this.ws.onerror = (err) => {
        this.notifyError(`WebSocket error: ${String(err)}`);
      };
    });
  }

  public disconnect(): void {
    this.isExplicitDisconnect = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore close error
      }
      this.ws = null;
    }
    this.status = "disconnected";
    this.notifyStatusChange("disconnected");
  }

  private handleClose(code: number, reason: string): void {
    this.ws = null;
    if (this.isExplicitDisconnect) {
      this.status = "disconnected";
      this.notifyStatusChange("disconnected");
      return;
    }

    if (this.options.autoReconnect !== false) {
      this.status = "reconnecting";
      this.notifyStatusChange("reconnecting", reason || `Code ${code}`);
      this.scheduleReconnect();
    } else {
      this.status = "disconnected";
      this.notifyStatusChange("disconnected", reason);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const maxAttempts = this.options.maxReconnectAttempts ?? Infinity;
    if (this.reconnectAttempts >= maxAttempts) {
      this.status = "disconnected";
      this.notifyStatusChange("disconnected", "Max reconnect attempts reached");
      return;
    }

    this.reconnectAttempts++;
    const baseDelay = this.options.reconnectIntervalMs ?? 1500;
    const delay = Math.min(baseDelay * Math.pow(1.2, this.reconnectAttempts - 1), 8000);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (this.isExplicitDisconnect) return;

      try {
        await this.connect();
        // Automatically re-join if we have player name or token
        if (this.playerName || this.sessionToken) {
          this.join(this.playerName, this.explicitRoomCode || undefined);
        }
      } catch {
        // Next attempt will be scheduled if onclose fires
      }
    }, delay);
  }

  private handleMessage(raw: unknown): void {
    try {
      const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw as ArrayBuffer);
      const msg = JSON.parse(text) as ServerMessage;

      switch (msg.type) {
        case "server:welcome": {
          this.sessionToken = msg.sessionToken;
          this.myPlayerId = msg.playerId;
          this.roomCode = msg.roomCode;
          this.serverName = msg.serverName;

          this.saveSession({
            token: msg.sessionToken,
            playerName: this.playerName,
            roomCode: msg.roomCode,
            playerId: msg.playerId,
          });
          break;
        }

        case "server:snapshot": {
          this.state = msg.state;
          this.myPlayerId = msg.myPlayerId;
          if (msg.state.history) {
            for (const h of msg.state.history) {
              if (!this.eventHistory.includes(h)) {
                this.eventHistory.push(h);
              }
            }
          }
          this.notifySnapshot(msg.state, msg.myPlayerId);
          break;
        }

        case "server:event": {
          this.eventHistory.push(msg.event);
          this.notifyEvent(msg.event);
          if (msg.state) {
            this.state = msg.state;
            if (this.myPlayerId) {
              this.notifySnapshot(msg.state, this.myPlayerId);
            }
          } else if (this.state) {
            this.state = {
              ...this.state,
              history: [...this.state.history, msg.event],
            };
            if (this.myPlayerId) {
              this.notifySnapshot(this.state, this.myPlayerId);
            }
          }
          break;
        }

        case "server:error": {
          if (["JOIN_FAILED", "ROOM_NOT_FOUND", "ROOM_FULL", "GAME_ALREADY_STARTED", "INVALID_ROOM_CODE"].includes(msg.code)) {
            this.roomCode = null;
            this.explicitRoomCode = undefined;
            this.state = null;
          }
          this.notifyError(msg.message, msg.code);
          break;
        }

        case "server:pong": {
          // Heartbeat pong received
          break;
        }
      }
    } catch (err) {
      this.notifyError(`Failed to process message from server: ${String(err)}`);
    }
  }

  public send(msg: ClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.notifyError("Cannot send message: WebSocket is not open");
      return;
    }
    try {
      this.ws.send(JSON.stringify(msg));
    } catch (err) {
      this.notifyError(`Send error: ${String(err)}`);
    }
  }

  public join(name: string, roomCode?: string): void {
    const previousName = this.playerName;
    this.playerName = name;
    if (roomCode) {
      const normalizedCode = roomCode.trim().toUpperCase();
      this.explicitRoomCode = normalizedCode;
      this.roomCode = normalizedCode;
    } else if (this.explicitRoomCode) {
      this.explicitRoomCode = this.explicitRoomCode.trim().toUpperCase();
      this.roomCode = this.explicitRoomCode;
    }

    if (!this.options.sessionFilePath && (!previousName || previousName !== name)) {
      const safeName = (this.playerName || "default").replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
      const portOrHost = this.extractPortOrHost(this.wsUrl);
      this.sessionFilePath = path.resolve(process.cwd(), `.conquest-session-${safeName}-${portOrHost}.json`);
    }

    if (this.sessionToken && previousName && previousName !== name) {
      this.sessionToken = null;
      this.myPlayerId = null;
      this.roomCode = null;
      this.explicitRoomCode = undefined;
    }

    // Check cached session if token not loaded yet
    if (!this.sessionToken) {
      const cached = this.loadSession();
      if (cached) {
        if (cached.playerName === this.playerName) {
          this.sessionToken = cached.token;
          if (!this.roomCode && cached.roomCode) {
            this.roomCode = cached.roomCode;
          }
          if (cached.playerId) {
            this.myPlayerId = cached.playerId;
          }
        } else {
          this.sessionToken = null;
        }
      }
    } else {
      // If sessionToken was already set, verify it belongs to this player name
      try {
        if (fs.existsSync(this.sessionFilePath)) {
          const raw = fs.readFileSync(this.sessionFilePath, "utf-8");
          const cached = JSON.parse(raw) as SessionData;
          if (cached && cached.playerName && cached.playerName !== this.playerName) {
            this.sessionToken = null;
            this.myPlayerId = null;
          }
        }
      } catch {
        // Ignore read errors
      }
    }

    const payload: ClientJoin = {
      type: "client:join",
      name: this.playerName,
      roomCode: this.explicitRoomCode ?? undefined,
      sessionToken: this.sessionToken ?? undefined,
    };
    this.send(payload);
  }

  public ready(ready: boolean = true): void {
    const msg: ClientReady = {
      type: "client:ready",
      ready,
    };
    this.send(msg);
  }

  public deploy(territoryId: string, count: number): void {
    const msg: ClientDeploy = {
      type: "client:deploy",
      territoryId,
      count,
    };
    this.send(msg);
  }

  public attack(sourceId: string, targetId: string, units?: number): void {
    const msg: ClientAttack = {
      type: "client:attack",
      sourceTerritoryId: sourceId,
      targetTerritoryId: targetId,
      units,
    };
    this.send(msg);
  }

  public fortify(sourceId: string, targetId: string, units: number): void {
    const msg: ClientFortify = {
      type: "client:fortify",
      sourceTerritoryId: sourceId,
      targetTerritoryId: targetId,
      units,
    };
    this.send(msg);
  }

  public skipPhase(): void {
    const msg: ClientSkipPhase = {
      type: "client:skip_phase",
    };
    this.send(msg);
  }

  public endTurn(): void {
    const msg: ClientEndTurn = {
      type: "client:end_turn",
    };
    this.send(msg);
  }

  public sendChat(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    const msg: ClientChat = {
      type: "client:chat",
      text: trimmed,
    };
    this.send(msg);
  }

  public rematch(ready: boolean = true): void {
    const msg: ClientRematch = {
      type: "client:rematch",
      ready,
    };
    this.send(msg);
  }

  public requestRematch(ready: boolean = true): void {
    this.rematch(ready);
  }

  public ping(timestamp: number = Date.now()): void {
    const msg: ClientPing = {
      type: "client:ping",
      timestamp,
    };
    this.send(msg);
  }

  public onSnapshot(cb: (state: GameState, myPlayerId: string) => void): () => void {
    this.snapshotListeners.add(cb);
    if (this.state && this.myPlayerId) {
      cb(this.state, this.myPlayerId);
    }
    return () => {
      this.snapshotListeners.delete(cb);
    };
  }

  public onEvent(cb: (event: GameEvent) => void): () => void {
    this.eventListeners.add(cb);
    return () => {
      this.eventListeners.delete(cb);
    };
  }

  public onStatusChange(cb: (status: ConnectionStatus, error?: string) => void): () => void {
    this.statusListeners.add(cb);
    cb(this.status);
    return () => {
      this.statusListeners.delete(cb);
    };
  }

  public onError(cb: (msg: string, code?: string) => void): () => void {
    this.errorListeners.add(cb);
    return () => {
      this.errorListeners.delete(cb);
    };
  }

  public createRoom(
    options: {
      playerName?: string;
      displayName?: string;
      roomName?: string;
      visibility?: RoomVisibility;
      maxPlayers?: number;
      mapId?: string;
    } = {}
  ): void {
    if (options.playerName) {
      this.playerName = options.playerName;
    }
    const msg: ClientCreateRoom = {
      type: "client:create_room",
      playerName: this.playerName,
      displayName: options.displayName ?? options.roomName,
      visibility: options.visibility ?? "public",
      maxPlayers: options.maxPlayers ?? 4,
      mapId: options.mapId,
      sessionToken: this.sessionToken ?? undefined,
    };
    this.send(msg);
  }

  public quickMatch(playerName?: string): void {
    if (playerName) {
      this.playerName = playerName;
    }
    this.explicitRoomCode = undefined;
    this.join(this.playerName);
  }

  public leaveRoom(): void {
    if (this.roomCode) {
      const msg: ClientLeaveRoom = {
        type: "client:leave_room",
      };
      this.send(msg);
    }
    this.roomCode = null;
    this.explicitRoomCode = undefined;
    this.state = null;
    this.clearSession();
  }

  public async fetchServerInfo(): Promise<ServerInfo> {
    const res = await fetch(`${this.httpUrl}/api/server`);
    if (!res.ok) {
      throw new Error(`Failed to fetch server info: HTTP ${res.status}`);
    }
    const data = await res.json();
    return ServerInfoSchema.parse(data);
  }

  public async fetchRooms(): Promise<RoomSummary[]> {
    const res = await fetch(`${this.httpUrl}/api/rooms`);
    if (!res.ok) {
      throw new Error(`Failed to fetch rooms: HTTP ${res.status}`);
    }
    const data = await res.json();
    return RoomSummariesSchema.parse(data);
  }

  public getCachedSession(): SessionData | null {
    return this.loadSession();
  }

  private notifySnapshot(state: GameState, myPlayerId: string): void {
    for (const listener of this.snapshotListeners) {
      try {
        listener(state, myPlayerId);
      } catch (err) {
        console.error("Error in snapshot listener:", err);
      }
    }
  }

  private notifyEvent(event: GameEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("Error in event listener:", err);
      }
    }
  }

  private notifyStatusChange(status: ConnectionStatus, error?: string): void {
    for (const listener of this.statusListeners) {
      try {
        listener(status, error);
      } catch (err) {
        console.error("Error in status change listener:", err);
      }
    }
  }

  private notifyError(msg: string, code?: string): void {
    for (const listener of this.errorListeners) {
      try {
        listener(msg, code);
      } catch (err) {
        console.error("Error in error listener:", err);
      }
    }
  }

  // Testing & Synchronization Helpers
  public waitForSnapshot(
    predicate?: (state: GameState) => boolean,
    timeoutMs: number = 4000
  ): Promise<GameState> {
    if (this.state && (!predicate || predicate(this.state))) {
      return Promise.resolve(this.state);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("Timeout waiting for snapshot"));
      }, timeoutMs);

      const unsub = this.onSnapshot((state) => {
        if (!predicate || predicate(state)) {
          clearTimeout(timer);
          unsub();
          resolve(state);
        }
      });
    });
  }

  public waitForEvent(
    predicate: (event: GameEvent) => boolean,
    timeoutMs: number = 4000
  ): Promise<GameEvent> {
    const existing = this.eventHistory.find(predicate);
    if (existing) {
      return Promise.resolve(existing);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            `Timeout waiting for event. Recorded ${this.eventHistory.length} events.`
          )
        );
      }, timeoutMs);

      const unsub = this.onEvent((event) => {
        if (predicate(event)) {
          clearTimeout(timer);
          unsub();
          resolve(event);
        }
      });
    });
  }

  public waitForStatus(status: ConnectionStatus, timeoutMs: number = 4000): Promise<void> {
    if (this.status === status) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for status "${status}" (current: "${this.status}")`));
      }, timeoutMs);

      const unsub = this.onStatusChange((s) => {
        if (s === status) {
          clearTimeout(timer);
          unsub();
          resolve();
        }
      });
    });
  }
}
