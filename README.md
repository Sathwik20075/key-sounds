# Key Sounds

Press a key, hear a sound. Comes with built-in sounds, lets you add your own, trim any sound to just the part you want, and choose exactly which keys make noise.

## Download

Go to the [Releases page](../../releases/latest) and download the file for your system:

- Windows: the `.exe` installer
- Mac: the `.dmg` file
- Linux: the `.AppImage` file

The app is not code-signed, so Windows and Mac may show a warning the first time.
Windows: click "More info", then "Run anyway". Mac: right-click the app, choose Open.

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
