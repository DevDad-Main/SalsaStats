# SalsaStats

A small Windows overlay that shows what your PC is doing while you play: GPU, CPU, memory and frame rate, in a panel that stays out of your way.

I built it for GeForce NOW sessions (including setups made with tools like SalsaNOW), where all you normally see is the video stream. It runs inside the remote Windows session and reports what that machine is doing. It works on a normal gaming PC too.

SalsaStats is an independent project and isn't affiliated with NVIDIA or SalsaNOW.

## Install

1. Download the latest `SalsaStats-x.y.z-x64-Setup.exe` from [Releases](https://github.com/DevDad-Main/SalsaStats/releases/latest).
2. Run it. It installs for your user only and doesn't ask for administrator rights.
3. SalsaStats updates itself from then on.

The installer isn't code-signed, so Windows SmartScreen may warn you. Choose **More info**, then **Run anyway**.

## Using it

Open the app and press **Overlay** to turn it into an always-on-top panel. The overlay ignores the mouse and never takes focus from your game, so you can leave it up without it getting in the way. Because of that, you control it with keys:

| Keys | What it does |
| --- | --- |
| `Ctrl` `Alt` `O` | Open the dashboard and overlay settings |
| `Ctrl` `Alt` `M` | Switch between the full and the minimal overlay |
| `Ctrl` `Alt` `H` | Hide or show the overlay |
| `Ctrl` `Alt` `E` | Unlock the overlay to drag it around and resize it from the corner, then press again to lock it in place |
| `Ctrl` `` ` `` | Show or hide the log panel (in the dashboard) |

The dashboard has four tabs:

- **Overview** shows live CPU, GPU and memory, a usage history and your frame rate.
- **Games** is your library. Add a game by picking its `.exe`, or press **Add running game** while it's open. Each game gets a proper name and can have its own overlay layout, which switches on automatically while that game runs.
- **Overlay** lets you choose which readings appear, set colours, size and screen corner, and pick what the minimal view shows. Use the **Layout for** menu to edit the default layout or a single game's.
- **Settings** has the update check, FPS mode, window behaviour and the log folder.

## What it shows

- **GPU:** usage, temperature, clock and VRAM
- **CPU:** usage, clock and temperature where Windows exposes them
- **Memory:** RAM in use
- **Frame rate:** current FPS, average and 1% low, with live graphs, for whichever game is running

Readings the machine doesn't provide are hidden automatically. Power draw isn't shown at all, because cloud sessions don't expose it.

## Frame rate

SalsaStats measures frames the game presents on the machine it runs on, using [PresentMon](https://github.com/GameTechDev/PresentMon). That is the real render rate. In a cloud session it can be well above the rate of the stream you see.

You can switch in **Settings → Frame rate**:

- **Raw render FPS** is what the game actually renders.
- **Capped to stream rate** limits the numbers to your stream rate (30 to 240) to roughly match what GeForce NOW shows. SalsaStats can't read the real stream rate, so you set the cap yourself.

Frame capture needs administrator rights, or membership of the Windows "Performance Log Users" group. Right-click SalsaStats and choose **Run as administrator**. Without that, everything else still works. The status bar tells you when capture is unavailable.

The game name comes from its window title. For a name you prefer, add the game to your library on the **Games** tab and rename it there.

## If something looks off

- **A game minimises or loses focus:** turn off **Force above fullscreen games** in Settings.
- **GPU temperature or clock is missing:** open the log panel with the **Logs** button and check the startup line. It lists which hardware sources responded.
- **The overlay is hidden behind a game:** exclusive-fullscreen games can cover any overlay. Use borderless or windowed mode.

The log panel has filter, copy, pause and clear buttons, so it's easy to paste into a bug report. Logs are stored in `%APPDATA%\salsastats\logs` and rotate automatically. Nothing leaves your machine except the update check to GitHub.

## Build it yourself

You need Windows and Node.js 24.

```bash
npm ci
npm start          # run from source
npm run build:win  # build the installer into release/
```

The build downloads PresentMon and compiles a small helper that reads NVIDIA sensors through [NvAPIWrapper](https://github.com/falahati/NvAPIWrapper). Pushing a `v*` tag publishes a release through GitHub Actions.

## Credits

- [PresentMon](https://github.com/GameTechDev/PresentMon) by Intel for frame timing
- [NvAPIWrapper](https://github.com/falahati/NvAPIWrapper) for NVIDIA sensor readings
- [systeminformation](https://github.com/sebhildebrandt/systeminformation) for CPU and GPU details
- [Electron](https://www.electronjs.org/)

## License

MIT
