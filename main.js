const { app, BrowserWindow, Menu, Tray, nativeImage, globalShortcut } = require('electron');
const path = require('path');

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
    // ignore shortcut combos like Ctrl+C (but let the modifier keys themselves play)
    if (!/^(Control|Alt|Meta)/.test(k) && (e.ctrlKey || e.altKey || e.metaKey)) return;
    // when the window is focused it handles keys itself
    if (win.isVisible() && win.isFocused()) return;
    win.webContents.send('global-key', k);
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
