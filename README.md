<div align="center">

# SalsaStats

**A clean, click-through performance overlay for Windows and GeForce NOW sessions.**

GPU, CPU, memory and frame rate, always on top, never in your way.

[![Latest release](https://img.shields.io/github/v/release/DevDad-Main/SalsaStats?style=flat-square&color=6ea8fe)](https://github.com/DevDad-Main/SalsaStats/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/DevDad-Main/SalsaStats/total?style=flat-square&color=3ddc97)](https://github.com/DevDad-Main/SalsaStats/releases)
[![License](https://img.shields.io/github/license/DevDad-Main/SalsaStats?style=flat-square&color=8b98a9)](#license)

[Download](https://github.com/DevDad-Main/SalsaStats/releases/latest) · [Keybinds](#keybinds) · [Frame rate](#frame-rate) · [Troubleshooting](#troubleshooting)

</div>

---

In a cloud session all you normally see is the video stream. SalsaStats runs inside the remote Windows session and shows what that machine is really doing while you play. It works just as well on a normal gaming PC.

It was built for GeForce NOW sessions, including setups made with tools like SalsaNOW. It is an independent project and isn't affiliated with NVIDIA or SalsaNOW.

## Highlights

- **Click-through overlay** that never takes focus, so it can't minimise your game
- **Per-game layouts**: give each game its own name and overlay look, applied automatically while it runs
- **Minimal view** with its own appearance, one keypress away
- **Real frame rate** with average, 1% low and live graphs, raw or capped to your stream rate
- **Everything is configurable**: readings, colours, size, spacing, border and keybinds
- **Built-in log panel** and one-click updates

## Install

1. Download `SalsaStats-x.y.z-x64-Setup.exe` from [Releases](https://github.com/DevDad-Main/SalsaStats/releases/latest).
2. Run it. It installs for your user only and doesn't ask for administrator rights.
3. SalsaStats keeps itself up to date from then on.

The installer isn't code-signed, so Windows SmartScreen may warn you. Choose **More info**, then **Run anyway**.

## Quick start

Open the app and press **Overlay**. From then on you control it with the keyboard, because the overlay ignores the mouse.

### Keybinds

| Default keys | Action |
| --- | --- |
| `Ctrl` `Alt` `O` | Open the dashboard and overlay settings |
| `Ctrl` `Alt` `M` | Switch between the full and the minimal overlay |
| `Ctrl` `Alt` `H` | Hide or show the overlay |
| `Ctrl` `Alt` `E` | Unlock the overlay to move it and resize it from any corner, then lock it again |

Every one of these can be changed in **Settings → Keybinds**. In the dashboard, `Ctrl` `` ` `` toggles the log panel.

### The dashboard

| Tab | What it's for |
| --- | --- |
| **Overview** | Live CPU, GPU and memory, usage history and frame rate |
| **Games** | Your library. Add a game by its `.exe`, add a whole folder at once, or press **Add running game** |
| **Overlay** | Choose readings, colours, size, spacing and border, and design the minimal view separately |
| **Settings** | Updates, keybinds, frame rate mode, window behaviour and the log folder |

In the **Overlay** tab, the **Layout for** menu switches between the default layout and any game in your library.

## Frame rate

SalsaStats reads the frames a game presents on the machine it runs on, using [PresentMon](https://github.com/GameTechDev/PresentMon). That is the true render rate, which in a cloud session can be well above the rate of the stream you see.

In **Settings → Frame rate** you can choose:

- **Raw render FPS**, exactly what the game renders
- **Cap displayed FPS** (30 to 240), to make SalsaStats' readings easier to compare with a stream rate. This only changes displayed values; it does not limit the game or GeForce NOW stream.

Frame capture needs administrator rights, or membership of the Windows "Performance Log Users" group. Right-click SalsaStats and choose **Run as administrator**. Everything else works without it, and the status bar tells you when capture is unavailable.

## Troubleshooting

- **A game minimises or loses focus.** Turn off **Force above fullscreen games** in Settings.
- **GPU temperature or clock is missing.** Open the log panel from the **Logs** button and check the startup line to see which hardware sources responded.
- **The overlay hides behind a game.** Exclusive-fullscreen games can cover any overlay. Use borderless or windowed mode.
- **A game isn't recognised.** Games are matched by executable name, ignoring suffixes like `-Win64-Shipping`. Use **Add running game** for an exact match.

The log panel has filter, copy, pause and clear buttons, which makes it easy to paste into a bug report. Logs live in `%APPDATA%\salsastats\logs` and rotate automatically. Nothing leaves your machine except the update check to GitHub.

## Build it yourself

You need Windows and Node.js 24.

```bash
npm ci
npm start          # run from source
npm run build:win  # build the installer into release/
```

The build downloads PresentMon and compiles a small helper that reads NVIDIA sensors through [NvAPIWrapper](https://github.com/falahati/NvAPIWrapper). Pushing a `v*` tag publishes a release through GitHub Actions.

## Credits

[PresentMon](https://github.com/GameTechDev/PresentMon) by Intel for frame timing · [NvAPIWrapper](https://github.com/falahati/NvAPIWrapper) for NVIDIA sensors · [systeminformation](https://github.com/sebhildebrandt/systeminformation) for CPU and GPU details · [Electron](https://www.electronjs.org/)

## License

MIT
