import { CollabMessage, CollabUser } from '../types/wormforge';

export const USER_COLORS = [
  '#f59e0b', // amber
  '#10b981', // emerald
  '#06b6d4', // cyan
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#3b82f6', // blue
  '#f97316', // orange
  '#14b8a6', // teal
  '#ef4444', // red
];

export class CollaborationService {
  private ws: WebSocket | null = null;
  private bc: BroadcastChannel | null = null;
  private room: string = 'main-forge';
  private currentUser: CollabUser;
  private users: Map<string, CollabUser> = new Map();
  private isConnected: boolean = false;
  private reconnectTimer: any = null;

  // Listeners
  public onCodeReceived?: (code: string, senderId: string, file?: string) => void;
  public onUserCursor?: (user: CollabUser) => void;
  public onUsersChanged?: (users: CollabUser[]) => void;
  public onChatMessage?: (msg: NonNullable<CollabMessage['chatMsg']>) => void;
  public onConnectionStatus?: (connected: boolean) => void;

  constructor() {
    const storedName = localStorage.getItem('wf_username') || `WormModder_${Math.floor(Math.random() * 899 + 100)}`;
    const storedColor = localStorage.getItem('wf_usercolor') || USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
    const storedId = localStorage.getItem('wf_userid') || `user_${Math.random().toString(36).substring(2, 9)}`;

    localStorage.setItem('wf_username', storedName);
    localStorage.setItem('wf_usercolor', storedColor);
    localStorage.setItem('wf_userid', storedId);

    this.currentUser = {
      id: storedId,
      name: storedName,
      color: storedColor,
      lastActive: Date.now(),
    };

    // Initialize BroadcastChannel as reliable fallback
    try {
      this.bc = new BroadcastChannel(`wf_room_${this.room}`);
      this.bc.onmessage = (event) => {
        this.handleMessage(event.data, false);
      };
    } catch {
      // BroadcastChannel might not be supported in some hermetic test runners
    }

    this.connect();
  }

  public getRoom(): string {
    return this.room;
  }

  public setRoom(newRoom: string): void {
    if (this.room === newRoom) return;
    this.leaveCurrent();
    this.room = newRoom;

    if (this.bc) {
      this.bc.close();
      this.bc = new BroadcastChannel(`wf_room_${this.room}`);
      this.bc.onmessage = (event) => this.handleMessage(event.data, false);
    }

    this.connect();
  }

  public getCurrentUser(): CollabUser {
    return this.currentUser;
  }

  public updateUserName(name: string, color?: string): void {
    this.currentUser.name = name;
    if (color) this.currentUser.color = color;
    localStorage.setItem('wf_username', name);
    if (color) localStorage.setItem('wf_usercolor', color);

    this.broadcast({
      type: 'join',
      userId: this.currentUser.id,
      userName: this.currentUser.name,
      userColor: this.currentUser.color,
      room: this.room,
    });
    this.notifyUsers();
  }

  public getConnectedUsers(): CollabUser[] {
    const list = Array.from(this.users.values());
    // Always include current user in active users display
    if (!list.some((u) => u.id === this.currentUser.id)) {
      list.unshift(this.currentUser);
    }
    return list;
  }

  public sendCodeChange(code: string, file?: string): void {
    this.broadcast({
      type: 'change',
      userId: this.currentUser.id,
      userName: this.currentUser.name,
      room: this.room,
      code,
      file,
    });
  }

  public sendCursor(line: number, column: number, file?: string): void {
    this.currentUser.cursor = { line, column };
    this.broadcast({
      type: 'cursor',
      userId: this.currentUser.id,
      userName: this.currentUser.name,
      userColor: this.currentUser.color,
      room: this.room,
      cursor: { line, column },
      file,
    });
  }

  public sendChat(text: string): void {
    const chatMsg = {
      id: `chat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      sender: this.currentUser.name,
      text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      color: this.currentUser.color,
    };

    this.broadcast({
      type: 'chat',
      userId: this.currentUser.id,
      room: this.room,
      chatMsg,
    });

    if (this.onChatMessage) {
      this.onChatMessage(chatMsg);
    }
  }

  private connect(): void {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
    }

    // Desktop (Tauri) build has no bundled server. Use VITE_COLLAB_URL
    // (e.g. wss://your-host.example.com/ws) if set, otherwise stay local-only.
    const isDesktop = typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window);
    const remote = (import.meta as any).env?.VITE_COLLAB_URL as string | undefined;
    let wsUrl: string;
    if (remote) {
      wsUrl = `${remote}${remote.includes('?') ? '&' : '?'}room=${encodeURIComponent(this.room)}`;
    } else if (isDesktop) {
      this.isConnected = false;
      if (this.onConnectionStatus) this.onConnectionStatus(false);
      return;
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//${window.location.host}/ws?room=${encodeURIComponent(this.room)}`;
    }

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        if (this.onConnectionStatus) this.onConnectionStatus(true);
        this.broadcast({
          type: 'join',
          userId: this.currentUser.id,
          userName: this.currentUser.name,
          userColor: this.currentUser.color,
          room: this.room,
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleMessage(msg, true);
        } catch {}
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        if (this.onConnectionStatus) this.onConnectionStatus(false);
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.isConnected = false;
        if (this.onConnectionStatus) this.onConnectionStatus(false);
      };
    } catch {
      this.isConnected = false;
      if (this.onConnectionStatus) this.onConnectionStatus(false);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 4000);
  }

  private leaveCurrent(): void {
    this.broadcast({
      type: 'leave',
      userId: this.currentUser.id,
      room: this.room,
    });
    this.users.clear();
  }

  private broadcast(msg: CollabMessage): void {
    // 1. Send via WebSocket if connected
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
    // 2. Broadcast to other tabs on same machine
    if (this.bc) {
      try {
        this.bc.postMessage(msg);
      } catch {}
    }
  }

  private handleMessage(msg: CollabMessage, isFromWs: boolean): void {
    // Ignore self messages
    if (msg.userId === this.currentUser.id) return;
    if (msg.room && msg.room !== this.room) return;

    switch (msg.type) {
      case 'join':
        if (msg.userId && msg.userName) {
          this.users.set(msg.userId, {
            id: msg.userId,
            name: msg.userName,
            color: msg.userColor || USER_COLORS[0],
            lastActive: Date.now(),
          });
          this.notifyUsers();

          // Respond with state acknowledgment so new user sees us
          this.broadcast({
            type: 'state',
            userId: this.currentUser.id,
            userName: this.currentUser.name,
            userColor: this.currentUser.color,
            room: this.room,
          });
        }
        break;

      case 'state':
        if (msg.userId && msg.userName) {
          this.users.set(msg.userId, {
            id: msg.userId,
            name: msg.userName,
            color: msg.userColor || USER_COLORS[0],
            lastActive: Date.now(),
          });
          this.notifyUsers();
        }
        break;

      case 'leave':
        if (msg.userId) {
          this.users.delete(msg.userId);
          this.notifyUsers();
        }
        break;

      case 'change':
        if (msg.code !== undefined && this.onCodeReceived) {
          this.onCodeReceived(msg.code, msg.userId || 'remote', msg.file);
        }
        break;

      case 'cursor':
        if (msg.userId && msg.cursor) {
          const user = this.users.get(msg.userId) || {
            id: msg.userId,
            name: msg.userName || 'Guest',
            color: msg.userColor || '#10b981',
            lastActive: Date.now(),
          };
          user.cursor = msg.cursor;
          user.activeFile = msg.file;
          user.lastActive = Date.now();
          this.users.set(msg.userId, user);
          if (this.onUserCursor) this.onUserCursor(user);
          this.notifyUsers();
        }
        break;

      case 'chat':
        if (msg.chatMsg && this.onChatMessage) {
          this.onChatMessage(msg.chatMsg);
        }
        break;
    }
  }

  private notifyUsers(): void {
    if (this.onUsersChanged) {
      this.onUsersChanged(this.getConnectedUsers());
    }
  }

  public destroy(): void {
    this.leaveCurrent();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
    }
    if (this.bc) {
      try {
        this.bc.close();
      } catch {}
    }
  }
}

export const collabService = new CollaborationService();
