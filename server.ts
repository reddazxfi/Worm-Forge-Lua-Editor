import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', engine: 'WormForge 0.8.22', time: new Date().toISOString() });
});

// NOTE: the /api/fs/* endpoints that used to live here (scan-folder, save-file)
// are GONE. They took an arbitrary path straight off the request and had no
// validation, no `..` check and no allowlist -- while the server bound 0.0.0.0,
// that was unauthenticated arbitrary file read AND write for anything that could
// reach the port on the LAN. All folder access is now Tauri's plugin-fs dialog,
// which the user picks explicitly. Keep this server to what it still needs:
// /api/health plus the Vite middleware that `tauri dev` loads through devUrl.

// Dev server vs Production setup
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';
  const PORT = process.env.PORT || 3000;

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  // Loopback only, and bound as a LITERAL IP rather than the hostname
  // 'localhost'. `localhost` resolves to ::1 before 127.0.0.1 on this machine,
  // while tauri.conf.json's devUrl is resolved by WebView2 -- a mismatch there
  // gives a blank dev window with a perfectly working EXE. 127.0.0.1 is
  // unambiguous IPv4 and still unreachable from the network.
  server.listen(Number(PORT), '127.0.0.1', () => {
    console.log(`[WormForge Code Studio] Server running on http://127.0.0.1:${PORT}`);
  });
}

startServer();
