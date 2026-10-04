const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('keyApi', {
  onKey: cb => ipcRenderer.on('global-key', (_e, k) => cb(k)),
  onToggle: cb => ipcRenderer.on('toggle-background', () => cb())
});
