const { app, BrowserWindow, Menu, Tray, nativeImage, globalShortcut, ipcMain, screen, shell, dialog } = require('electron');
const { spawn, execFile } = require('child_process');
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
ipcMain.on('overlay-show', (_e, buf, type, secs, opts) => {
  try {
    hideOverlay();
    const o = Object.assign({ size: 'small', anim: 'float', pos: 'center' }, opts || {});
    const dir = app.getPath('userData');
    for (const f of fs.readdirSync(dir)) if (/^overlay-/.test(f)) { try { fs.unlinkSync(path.join(dir, f)); } catch (e) {} }
    const stamp = Date.now();
    let el;
    if (type === 'emoji') {
      el = `<div class="m e">${String(o.emoji || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</div>`;
    } else {
      const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg',
        'video/mp4': 'mp4', 'video/webm': 'webm', 'video/ogg': 'ogv', 'video/quicktime': 'mov' }[type] || (String(type).startsWith('video/') ? 'mp4' : 'png');
      const name = `overlay-${stamp}.${ext}`;
      fs.writeFileSync(path.join(dir, name), Buffer.from(buf));
      el = String(type).startsWith('video/')
        ? `<video class="m" src="${name}" autoplay loop muted playsinline></video>`
        : `<img class="m" src="${name}">`;
    }
    const H = { small: 14, medium: 24, large: 40 }[o.size] || 14;
    const [av, jh] = { center: ['center', 'center'], 'top-left': ['flex-start', 'flex-start'], 'top-right': ['flex-start', 'flex-end'],
      'bottom-left': ['flex-end', 'flex-start'], 'bottom-right': ['flex-end', 'flex-end'] }[o.pos] || ['center', 'center'];
    const anim = { float: 'float 2.5s ease-in-out infinite', bounce: 'bounce .9s cubic-bezier(.3,0,.4,1) infinite',
      pulse: 'pulse 1.2s ease-in-out infinite', swing: 'swing 1.6s ease-in-out infinite', slide: 'slide 5s linear infinite' }[o.anim] || 'none';
    const top = o.pos.startsWith('top') ? 'top:4vh' : o.pos.startsWith('bottom') ? 'bottom:4vh' : `top:calc(50% - ${H / 2}vh)`;
    const layout = o.anim === 'slide'
      ? `.w{position:relative}.m{position:absolute;left:0;${top}}`
      : `.w{display:flex;align-items:${av};justify-content:${jh};padding:4vh 3vw}`;
    const htmlFile = path.join(dir, `overlay-${stamp}.html`);
    fs.writeFileSync(htmlFile, `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;height:100%;overflow:hidden;background:transparent}
.w{width:100%;height:100%;box-sizing:border-box;animation:in .5s ease both}
${layout}
.m{height:${H}vh;width:auto;max-width:40vw;object-fit:contain;animation:${anim}}
.e{height:auto;font-size:${Math.round(H * 0.9)}vh;line-height:1.1;white-space:nowrap}
@keyframes in{from{opacity:0;transform:scale(.85)}to{opacity:1;transform:scale(1)}}
body.out .w{animation:out .5s ease both}
@keyframes out{to{opacity:0;transform:scale(.9)}}
@keyframes float{50%{transform:translateY(-3vh)}}
@keyframes bounce{50%{transform:translateY(-6vh)}}
@keyframes pulse{50%{transform:scale(1.18)}}
@keyframes swing{0%,100%{transform:rotate(-9deg)}50%{transform:rotate(9deg)}}
@keyframes slide{from{transform:translateX(-100%)}to{transform:translateX(100vw)}}
</style><div class="w">${el}</div>`);
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

// ---- System events: devices, monitors ----
const send = n => { if (win && !win.isDestroyed()) win.webContents.send('sys-event', n); };
const psArgs = script => ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')];

const DEV = { DiskDrive: 'storage', USBSTOR: 'storage', Keyboard: 'usb', Mouse: 'usb', HIDClass: 'usb', USB: 'usb',
  AudioEndpoint: 'audio', Camera: 'camera', Image: 'camera', Bluetooth: 'bluetooth', Printer: 'printer', PrintQueue: 'printer' };
let devSnap = null, devTimer = null;

function snapshot(cb) {
  const script = 'Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $_.Class } | Select-Object Class,InstanceId | ConvertTo-Json -Compress';
  execFile('powershell.exe', psArgs(script), { windowsHide: true, maxBuffer: 64 * 1024 * 1024 }, (err, out) => {
    if (err) return cb(null);
    try {
      let j = JSON.parse(out); if (!Array.isArray(j)) j = [j];
      const m = new Map();
      for (const d of j) if (DEV[d.Class]) m.set(d.InstanceId, DEV[d.Class]);
      cb(m);
    } catch (e) { cb(null); }
  });
}
function emitCats(set, dir) {
  if (set.size > 1) set.delete('usb');      // a specific kind (e.g. pen drive) wins over generic USB
  for (const c of set) send(`${c}_${dir}`);
}
function watchDevices() {
  snapshot(m => { devSnap = m; });
  const script = "Register-WmiEvent -Class Win32_DeviceChangeEvent -SourceIdentifier d | Out-Null; while ($true) { Wait-Event -SourceIdentifier d | Out-Null; Remove-Event -SourceIdentifier d; [Console]::WriteLine('chg') }";
  const ps = spawn('powershell.exe', psArgs(script), { windowsHide: true });
  ps.on('error', () => {});
  ps.stdout.on('data', () => {
    clearTimeout(devTimer);
    devTimer = setTimeout(() => snapshot(m => {
      if (!m) return;
      if (devSnap) {
        const add = new Set(), rem = new Set();
        for (const [id, c] of m) if (!devSnap.has(id)) add.add(c);
        for (const [id, c] of devSnap) if (!m.has(id)) rem.add(c);
        emitCats(add, 'in'); emitCats(rem, 'out');
      }
      devSnap = m;
    }), 1500);
  });
  app.on('will-quit', () => { try { ps.kill(); } catch (e) {} });
}

function startSystemWatchers() {
  screen.on('display-added', () => send('display_in'));
  screen.on('display-removed', () => send('display_out'));
  if (process.platform === 'win32') { watchDevices(); }
}

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

// Shortcuts: holding several keys together opens a website or an app
let chords = [];
const chordTimers = new Map(), chordFired = new Set();
ipcMain.on('chords-set', (_e, list) => {
  chordTimers.forEach(t => clearTimeout(t)); chordTimers.clear(); chordFired.clear();
  chords = (Array.isArray(list) ? list : []).filter(c => c && Array.isArray(c.keys) && c.keys.length > 1 && typeof c.target === 'string').slice(0, 50);
});
ipcMain.handle('pick-app', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'] });
  return r.canceled ? null : r.filePaths[0];
});
function runChord(c) {
  if (c.kind === 'url') { if (/^https?:\/\//i.test(c.target)) shell.openExternal(c.target); }
  else if (c.kind === 'app') shell.openPath(c.target);
}
function checkChords(down) {
  const held = new Set([...down].map(c => keyNames[c]).filter(Boolean));
  chords.forEach((c, i) => {
    if (c.keys.every(k => held.has(k))) {
      if (!chordFired.has(i) && !chordTimers.has(i)) {
        chordTimers.set(i, setTimeout(() => { chordTimers.delete(i); chordFired.add(i); runChord(c); }, Math.max(100, +c.hold || 300)));
      }
    } else {
      if (chordTimers.has(i)) { clearTimeout(chordTimers.get(i)); chordTimers.delete(i); }
      chordFired.delete(i);
    }
  });
}

function startKeyListener() {
  if (!uIOhook) return;
  const down = new Set();
  uIOhook.on('keydown', e => {
    if (down.has(e.keycode)) return;          // ignore key repeat
    down.add(e.keycode);
    const k = keyNames[e.keycode];
    if (!k || !win) return;
    checkChords(down);
    // when the window is focused it handles keys itself
    if (win.isVisible() && win.isFocused()) return;
    win.webContents.send('global-key', k, { ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey });
  });
  uIOhook.on('keyup', e => { down.delete(e.keycode); checkChords(down); });
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
    startSystemWatchers();
    globalShortcut.register('CommandOrControl+Alt+K', () => win && win.webContents.send('toggle-background'));
    app.on('activate', showWindow);
  });
  app.on('before-quit', () => { quitting = true; });
  app.on('will-quit', () => { globalShortcut.unregisterAll(); if (uIOhook) { try { uIOhook.stop(); } catch (e) {} } });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin' && !tray) app.quit(); });
}
