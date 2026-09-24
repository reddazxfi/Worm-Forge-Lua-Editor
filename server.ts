import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

app.use(express.json({ limit: '10mb' }));

// In-memory rooms state for real-time collaboration
interface ClientInfo {
  ws: WebSocket;
  room: string;
  userId: string;
  userName: string;
  userColor: string;
}

const clients = new Map<WebSocket, ClientInfo>();
const roomCodes = new Map<string, { code: string; lastUpdated: number }>();

wss.on('connection', (ws: WebSocket, req) => {
  const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
  const room = url.searchParams.get('room') || 'main-forge';

  const clientInfo: ClientInfo = {
    ws,
    room,
    userId: `user_${Math.random().toString(36).substring(2, 9)}`,
    userName: 'Anonymous Modder',
    userColor: '#f59e0b',
  };
  clients.set(ws, clientInfo);

  // Send current room code if available
  const existingDoc = roomCodes.get(room);
  if (existingDoc) {
    ws.send(
      JSON.stringify({
        type: 'change',
        code: existingDoc.code,
        userId: 'server',
        room,
      })
    );
  }

  ws.on('message', (data: Buffer | string) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.room) {
        clientInfo.room = msg.room;
      }
      if (msg.userId) clientInfo.userId = msg.userId;
      if (msg.userName) clientInfo.userName = msg.userName;
      if (msg.userColor) clientInfo.userColor = msg.userColor;

      if (msg.type === 'change' && msg.code !== undefined) {
        roomCodes.set(clientInfo.room, {
          code: msg.code,
          lastUpdated: Date.now(),
        });
      }

      // Broadcast to other clients in the same room
      const payload = JSON.stringify(msg);
      for (const [otherWs, info] of clients.entries()) {
        if (otherWs !== ws && info.room === clientInfo.room && otherWs.readyState === WebSocket.OPEN) {
          otherWs.send(payload);
        }
      }
    } catch (e) {
      console.error('Error handling WS message:', e);
    }
  });

  ws.on('close', () => {
    // Notify room of departure
    const departureMsg = JSON.stringify({
      type: 'leave',
      userId: clientInfo.userId,
      userName: clientInfo.userName,
      room: clientInfo.room,
    });

    clients.delete(ws);

    for (const [otherWs, info] of clients.entries()) {
      if (info.room === clientInfo.room && otherWs.readyState === WebSocket.OPEN) {
        otherWs.send(departureMsg);
      }
    }
  });
});

// REST API
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', activeUsers: clients.size, time: new Date().toISOString() });
});

// Rooms status
app.get('/api/rooms', (req, res) => {
  const rooms: Record<string, number> = {};
  for (const info of clients.values()) {
    rooms[info.room] = (rooms[info.room] || 0) + 1;
  }
  res.json({ rooms });
});

// Dev server vs Production setup
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';
  const PORT = process.env.PORT || 3000;

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  server.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`[WormForge Code Studio] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
