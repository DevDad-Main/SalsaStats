# SalsaStats

A small, non-intrusive Windows desktop monitor for live CPU, memory, and available GPU stats. Built with Electron and `systeminformation`.

## Features

- Live CPU and memory usage with a rolling CPU/GPU history chart
- GPU load and temperature when reported by the installed graphics driver
- Full dashboard and a compact overlay layout
- Optional always-on-top pin
- No game injection and no administrator privileges required
- Opens directly to the dashboard without a loading screen

## Run

Install [Node.js](https://nodejs.org/), then run:

```bash
npm install
npm run check
npm test
npm start
```

## Windows release

Build the x64 per-user NSIS installer with:

```bash
npm run build:win
```

The installer is created under `release/` and is configured to install for the current user without administrator privileges. Pushing a version tag such as `v1.0.0` runs the Windows release workflow and attaches the `.exe` to the repository's GitHub Releases page. The installer is currently unsigned, so SmartScreen may show a reputation warning and managed-PC application-control policies may block it. Code signing can improve publisher trust, but it cannot override an organization's local policy.

Packaged builds check GitHub Releases at startup and every six hours, download updates in the background, and offer a restart button once the download finishes. Existing `v1.0.0` installs need one manual upgrade to `v1.0.1`; releases from `v1.0.1` onward include the updater.

The dashboard samples CPU and memory every two seconds. Less predictable hardware sensors are cached between reads to keep polling overhead down.

Logs are written to the app's user-data `logs` directory by default. Choose a different folder from **Customize** under **Log folder**. Logs use JSON lines and rotate at 2 MB, retaining up to three backups. Fatal errors are written before the app offers reload or close actions; shutdown has a timeout fallback if the window cannot close normally.

## FPS limitation

The app does not currently capture a game's frame rate. Average FPS and 1% low need a game capture source; they are shown as unavailable rather than estimated. Adding reliable game FPS capture requires a separate capture integration and may have different permission and compatibility requirements.

## License

MIT