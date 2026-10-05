const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('keyApi', {
  onKey: cb => ipcRenderer.on('global-key', (_e, k, f) => cb(k, f)),
  showOverlay: (buf, type, secs, opts) => ipcRenderer.send('overlay-show', buf, type, secs, opts),
  hideOverlay: () => ipcRenderer.send('overlay-hide'),
  setChords: list => ipcRenderer.send('chords-set', list),
  pickApp: () => ipcRenderer.invoke('pick-app'),
  onSys: cb => ipcRenderer.on('sys-event', (_e, n) => cb(n)),
  onToggle: cb => ipcRenderer.on('toggle-background', () => cb())
});
