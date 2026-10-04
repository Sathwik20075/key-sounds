const { app, BrowserWindow, Menu, Tray, nativeImage, globalShortcut, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');

let win = null, tray = null, quitting = false;

// Global key listener (lets the app hear keys while it is in the background).
// If it can't load on this system, the app still works while its window is focused.
let uIOhook = null, keyNames = {};
try {
  const m = require('uiohook-napi');
  uIOhook = m.uIOhook;
  // our key ids (same as the browser's KeyboardEvent.code) -> possible names in uiohook-napi
  const want = {};
  for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') want['Key' + c] = [c];
  for (let d = 0; d <= 9; d++) want['Digit' + d] = [String(d)];
  for (let f = 1; f <= 12; f++) want['F' + f] = ['F' + f];
  for (const n of ['Escape', 'Tab', 'CapsLock', 'Enter', 'Backspace', 'Space', 'Delete',
    'ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'Backquote', 'Minus', 'Equal',
    'BracketLeft', 'BracketRight', 'Backslash', 'Semicolon', 'Quote', 'Comma', 'Period', 'Slash'])
    want[n] = [n];
  Object.assign(want, {
    ShiftLeft: ['Shift', 'ShiftLeft'], ShiftRight: ['ShiftRight'],
    ControlLeft: ['Ctrl', 'ControlLeft'], ControlRight: ['CtrlRight', 'ControlRight'],
    AltLeft: ['Alt', 'AltLeft'], AltRight: ['AltRight'],
    MetaLeft: ['Meta', 'MetaLeft'], MetaRight: ['MetaRight']
  });
  for (const [id, names] of Object.entries(want)) {
    const name = names.find(n => m.UiohookKey[n] !== undefined);
    if (name) keyNames[m.UiohookKey[name]] = id;
  }
} catch (e) { console.warn('Background keys unavailable:', e.message); }

// Picture overlay shown on the screen while charging
let ov = null, ovTimer = null;
function hideOverlay() {
  clearTimeout(ovTimer);
  const w = ov; ov = null;
  if (!w) return;
  try { w.webContents.executeJavaScript("document.body.classList.add('out')"); } catch (e) {}
  setTimeout(() => { try { w.destroy(); } catch (e) {} }, 500);
}
ipcMain.on('overlay-hide', hideOverlay);
ipcMain.on('overlay-show', (_e, buf, type, secs) => {
  try {
    hideOverlay();
    const dir = app.getPath('userData');
    for (const f of fs.readdirSync(dir)) if (/^overlay-/.test(f)) { try { fs.unlinkSync(path.join(dir, f)); } catch (e) {} }
    const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg' }[type] || 'png';
    const stamp = Date.now();
    fs.writeFileSync(path.join(dir, `overlay-${stamp}.${ext}`), Buffer.from(buf));
    const htmlFile = path.join(dir, `overlay-${stamp}.html`);
    fs.writeFileSync(htmlFile, `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;overflow:hidden;background:transparent}body{display:flex;align-items:center;justify-content:center}img{max-width:60vw;max-height:60vh;animation:in .5s ease both}@keyframes in{from{opacity:0;transform:scale(.85)}to{opacity:1;transform:scale(1)}}body.out img{animation:out .5s ease both}@keyframes out{to{opacity:0;transform:scale(.9)}}</style><img src="overlay-${stamp}.${ext}">`);
    const d = screen.getPrimaryDisplay().bounds;
    ov = new BrowserWindow({
      x: d.x, y: d.y, width: d.width, height: d.height,
      transparent: true, frame: false, focusable: false, skipTaskbar: true,
      alwaysOnTop: true, hasShadow: false, resizable: false, show: false,
      webPreferences: { backgroundThrottling: false }
    });
    ov.setIgnoreMouseEvents(true);
    ov.setAlwaysOnTop(true, 'screen-saver');
    ov.loadFile(htmlFile);
    ov.once('ready-to-show', () => { if (ov) ov.showInactive(); });
    if (secs > 0) ovTimer = setTimeout(hideOverlay, secs * 1000);
  } catch (e) { console.warn('Overlay failed:', e.message); }
});

function showWindow() {
  if (!win) return;
  win.show();
  if (win.isMinimized()) win.restore();
  win.focus();
}

function createWindow() {
  win = new BrowserWindow({
    width: 940,
    height: 900,
    title: 'Key Sounds',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required'
    }
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  // Closing the window keeps the app running in the tray
  win.on('close', e => {
    if (!quitting && tray) { e.preventDefault(); win.hide(); }
  });
}

function createTray() {
  try {
    const img = nativeImage.createFromPath(path.join(__dirname, 'icon.png')).resize({ width: 18, height: 18 });
    tray = new Tray(img);
    tray.setToolTip('Key Sounds');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open Key Sounds', click: showWindow },
      { label: 'Turn background sounds on/off', click: () => win && win.webContents.send('toggle-background') },
      { type: 'separator' },
      { label: 'Quit', click: () => { quitting = true; app.quit(); } }
    ]));
    tray.on('click', showWindow);
  } catch (e) { tray = null; }
}

function startKeyListener() {
  if (!uIOhook) return;
  const down = new Set();
  uIOhook.on('keydown', e => {
    if (down.has(e.keycode)) return;          // ignore key repeat
    down.add(e.keycode);
    const k = keyNames[e.keycode];
    if (!k || !win) return;
    // when the window is focused it handles keys itself
    if (win.isVisible() && win.isFocused()) return;
    win.webContents.send('global-key', k, { ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey });
  });
  uIOhook.on('keyup', e => down.delete(e.keycode));
  uIOhook.start();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    createWindow();
    createTray();
    startKeyListener();
    globalShortcut.register('CommandOrControl+Alt+K', () => win && win.webContents.send('toggle-background'));
    app.on('activate', showWindow);
  });
  app.on('before-quit', () => { quitting = true; });
  app.on('will-quit', () => { globalShortcut.unregisterAll(); if (uIOhook) { try { uIOhook.stop(); } catch (e) {} } });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin' && !tray) app.quit(); });
}
