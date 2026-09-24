const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 650,
    title: 'WormForge Code Editor',
    backgroundColor: '#0d1117',
    darkTheme: true,
    autoHideMenuBar: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: false,
    },
  });

  // Create native menu
  createApplicationMenu();

  // Load the built app from dist/ or dev server
  const distHtml = path.join(__dirname, '..', 'dist', 'index.html');
  if (fs.existsSync(distHtml)) {
    mainWindow.loadFile(distHtml);
  } else {
    mainWindow.loadURL('http://localhost:3000');
  }

  // Open external links in default OS browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createApplicationMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Mod File...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            if (!mainWindow) return;
            const res = await dialog.showOpenDialog(mainWindow, {
              title: 'Open WormForge Lua Script',
              filters: [
                { name: 'Lua Script', extensions: ['lua'] },
                { name: 'Toml Config', extensions: ['toml'] },
                { name: 'All Files', extensions: ['*'] },
              ],
              properties: ['openFile'],
            });
            if (!res.canceled && res.filePaths.length > 0) {
              const filePath = res.filePaths[0];
              const content = fs.readFileSync(filePath, 'utf-8');
              mainWindow.webContents.send('file-opened', {
                path: filePath,
                name: path.basename(filePath),
                content,
              });
            }
          },
        },
        {
          label: 'Save File',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('trigger-save');
            }
          },
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'WormForge Lua Documentation',
          click: async () => {
            await shell.openExternal('https://github.com/LucianoWorms');
          },
        },
        {
          label: 'About WormForge Editor',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About WormForge Code Editor',
              message: 'WormForge Code Editor',
              detail: 'Custom Lua Editor with syntax verification, class methods/verbs support, and real-time collaboration.\nTargeting WormForge game mod engine.',
            });
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// IPC Handlers for native save / load dialogs
ipcMain.handle('save-file-dialog', async (event, { defaultName, content }) => {
  if (!mainWindow) return { canceled: true };
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'Save WormForge File',
    defaultPath: defaultName || 'script.lua',
    filters: [
      { name: 'Lua Script', extensions: ['lua'] },
      { name: 'Toml Config', extensions: ['toml'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (!res.canceled && res.filePath) {
    fs.writeFileSync(res.filePath, content, 'utf-8');
    return { canceled: false, filePath: res.filePath };
  }
  return { canceled: true };
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
