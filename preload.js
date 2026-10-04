const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('keyApi', {
  onKey: cb => ipcRenderer.on('global-key', (_e, k, f) => cb(k, f)),
  showOverlay: (buf, type, secs) => ipcRenderer.send('overlay-show', buf, type, secs),
  hideOverlay: () => ipcRenderer.send('overlay-hide'),
  onToggle: cb => ipcRenderer.on('toggle-background', () => cb())
});
