import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', engine: 'WormForge 0.8.0', time: new Date().toISOString() });
});

// Filesystem helper endpoint for loading local mod folders
app.get('/api/fs/scan-folder', (req, res) => {
  try {
    const rawPath = String(req.query.path || '').trim();
    if (!rawPath) {
      return res.status(400).json({ success: false, error: 'Path query parameter is required' });
    }
    // Clean wrapping quotes, trailing slashes, and trim spaces
    const cleanPath = rawPath.replace(/^["']|["']$/g, '').trim().replace(/[\\/]+$/, '');

    if (!fs.existsSync(cleanPath)) {
      return res.status(404).json({
        success: false,
        error: `Folder not found: "${cleanPath}". Note: If using the remote cloud web preview, local drives (such as D:\\) are not on this Linux container. In the browser use 'Open Folder' (Directory Picker), or run the local desktop app / local Node server to access your local drive.`,
      });
    }

    const stat = fs.statSync(cleanPath);
    if (!stat.isDirectory()) {
      return res.status(400).json({ success: false, error: `Path "${cleanPath}" is not a directory` });
    }

    const TEXT_EXTS = ['.lua', '.toml', '.md', '.txt', '.json', '.ini'];
    const files: Record<string, string> = {};
    const MAX_FILES = 500;

    const walk = (dir: string, rel: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        if (Object.keys(files).length >= MAX_FILES) return;
        if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'target' || e.name === 'dist') continue;
        const full = path.join(dir, e.name);
        const relPath = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) {
          walk(full, relPath);
        } else if (e.isFile()) {
          const ext = path.extname(e.name).toLowerCase();
          if (TEXT_EXTS.includes(ext)) {
            try {
              files[relPath] = fs.readFileSync(full, 'utf-8');
            } catch (err) {
              console.warn(`Could not read ${full}:`, err);
            }
          }
        }
      }
    };

    walk(cleanPath, '');
    const folderName = path.basename(cleanPath) || cleanPath;
    res.json({
      success: true,
      name: folderName,
      root: cleanPath,
      files,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// Filesystem helper endpoint for saving files to local mod folder
app.post('/api/fs/save-file', (req, res) => {
  try {
    const { root, relPath, content } = req.body;
    if (!root || !relPath) {
      return res.status(400).json({ success: false, error: 'Missing root or relPath' });
    }
    const cleanRoot = String(root).replace(/^["']|["']$/g, '').trim();
    const full = path.join(cleanRoot, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, String(content), 'utf-8');
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
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
