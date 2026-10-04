# Key Sounds

Press a key, hear a sound. Comes with built-in sounds, lets you add your own, trim any sound to just the part you want, and choose exactly which keys make noise.

## Download

Go to the [Releases page](../../releases/latest) and download the file for your system:

- Windows: the `.exe` installer
- Mac: the `.dmg` file
- Linux: the `.AppImage` file

The app is not code-signed, so Windows and Mac may show a warning the first time.
Windows: click "More info", then "Run anyway". Mac: right-click the app, choose Open.

## Background mode

Close the window and Key Sounds keeps running in the system tray (near the clock), so your keys still play sounds while you use other apps. Right-click the tray icon and choose Quit to stop it completely.

- Turn background sounds on or off with Ctrl+Alt+K (or the tick box in the app). Turn it off when you want to type normally without sounds.
- The app only reacts to keys you assigned a sound to. It does not record, store or send what you type.
- Mac: allow Key Sounds under System Settings > Privacy & Security > Accessibility and Input Monitoring.
- Linux: works on X11. Wayland desktops may block global keys.

## Run from source

Requires [Node.js](https://nodejs.org).

    npm install
    npm start

## Build an installer yourself

    npm run build

The installer appears in the `dist` folder.

## Publish a new version (maintainers)

Change `version` in `package.json`, then:

    git tag v1.0.1
    git push origin v1.0.1

GitHub Actions builds the Windows, Mac and Linux installers and attaches them to a new release.
