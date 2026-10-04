const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('keyApi', {
  onKey: cb => ipcRenderer.on('global-key', (_e, k, f) => cb(k, f)),
  onToggle: cb => ipcRenderer.on('toggle-background', () => cb())
});
