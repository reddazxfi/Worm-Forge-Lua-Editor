const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wormforgeDesktop', {
  isDesktop: true,
  platform: process.platform,
  onFileOpened: (callback) => {
    ipcRenderer.on('file-opened', (_event, data) => callback(data));
  },
  onTriggerSave: (callback) => {
    ipcRenderer.on('trigger-save', () => callback());
  },
  saveFileDialog: (options) => ipcRenderer.invoke('save-file-dialog', options),
});
