<div align="center">

# SalsaStats

**A clean, click-through performance overlay for Windows and GeForce NOW sessions.**

GPU, CPU, memory, frame rate and stream health, always on top, never in your way.

[![Latest release](https://img.shields.io/github/v/release/DevDad-Main/SalsaStats?style=flat-square&color=6ea8fe)](https://github.com/DevDad-Main/SalsaStats/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/DevDad-Main/SalsaStats/total?style=flat-square&color=3ddc97)](https://github.com/DevDad-Main/SalsaStats/releases)
[![License](https://img.shields.io/github/license/DevDad-Main/SalsaStats?style=flat-square&color=8b98a9)](#license)

[Download](https://github.com/DevDad-Main/SalsaStats/releases/latest) · [Quick start](#quick-start) · [GeForce NOW](#geforce-now) · [Frame rate](#frame-rate) · [Troubleshooting](#troubleshooting)

</div>

---

In a cloud session all you normally see is the video stream. SalsaStats runs inside the remote Windows session and shows what that machine is really doing while you play. It works just as well on a normal gaming PC.

It was built for GeForce NOW sessions, including setups made with tools like SalsaNOW. It is an independent project and isn't affiliated with NVIDIA or SalsaNOW.

## Highlights

- **Click-through overlay** that never takes focus, so it can't minimise your game
- **Per-game layouts**: give each game its own name and overlay look, applied automatically while it runs
- **Minimal view** with its own appearance, one keypress away
- **Real frame rate** with average, 1% low and live graphs, raw or capped to your stream rate
- **GeForce NOW rig details**: the specific CPU for your rig tier, plus tier, core allocation and RAM
- **GeForce NOW stream readout**: round trip, stream health, weakest link, codec, resolution, bandwidth and more
- **Lives in the tray**: closing the window hides SalsaStats instead of quitting it
- **Hover tooltips** on every reading and control, with tags for estimates and early-session readings
- **Everything is configurable**: readings, colours, size, spacing, border and keybinds
- **Built-in log panel** and one-click updates

## Install

1. Download `SalsaStats-x.y.z-x64-Setup.exe` from [Releases](https://github.com/DevDad-Main/SalsaStats/releases/latest).
2. Run it. It installs for your user only and doesn't ask for administrator rights.
3. SalsaStats keeps itself up to date from then on.

> [!NOTE]
> The installer isn't code-signed, so Windows SmartScreen may warn you. Choose **More info**, then **Run anyway**.

## Quick start

Open the app and press **Show overlay** in the top bar. From then on you control it with the keyboard, because the overlay ignores the mouse.

> [!TIP]
> Two buttons sound alike but do different things. **Show overlay** (top bar) switches the app into the in-game overlay. The **Customize overlay** tab is where you choose what the overlay shows and how it looks.

### Keybinds

| Default keys | Action |
| --- | --- |
| `Ctrl` `Alt` `O` | Open the dashboard and overlay settings |
| `Ctrl` `Alt` `M` | Switch between the full and the minimal overlay |
| `Ctrl` `Alt` `H` | Hide or show the overlay |
| `Ctrl` `Alt` `E` | Unlock the overlay to move it and resize it from any corner, then lock it again |
| `Ctrl` `Alt` `I` | Open the click-through quick menu to toggle readings while you play |

Every one of these can be changed in **Settings → Keybinds**. In the dashboard, `Ctrl` `` ` `` toggles the log panel.

### The dashboard

| Tab | What it's for |
| --- | --- |
| **Overview** | Live CPU, GPU and memory, usage history and frame rate |
| **Games** | Your library. Add a game by its `.exe`, add a whole folder at once, or press **Add running game** |
| **Customize overlay** | Choose readings, colours, size, spacing and border, and design the minimal view separately |
| **Settings** | Updates, keybinds, frame rate mode, window behaviour and the log folder |

In the **Customize overlay** tab, the **Layout for** menu switches between the default layout and any game in your library. Hover any option to see what it does.

### Tray

Closing the window hides SalsaStats to the system tray and keeps it running, so your overlay and game layouts keep working. Click the tray icon to bring it back, or right-click it for **Show**, **Hide** and **Quit**.

> [!IMPORTANT]
> The window's close button only hides the app. Use **Quit** in the tray menu to exit completely.

## GeForce NOW

SalsaStats runs on the cloud PC, so everything it shows is what that machine sees, not your own device.

### Rig details

On a GeForce NOW session the CPU line shows the specific processor for your rig, matched from the detected graphics card, instead of a generic name:

| Detected GPU | Rig | Tier |
| --- | --- | --- |
| RTX 3050 | 3050b | Free |
| RTX 3060 | 3060d | Performance |
| RTX 4080 | 4080h | Ultimate |
| RTX 5080 | 5080h | Ultimate |

The CPU card also shows the tier, the core and thread allocation, and the RAM available to your session.

### Stream readout

Turn the **STREAM** group on in **Customize overlay → GeForce NOW stream**. It reads the NVIDIA streamer logs and the network adapter on the cloud PC, and is hidden outside a GeForce NOW session.

| Reading | What it tells you | How long it stays live |
| --- | --- | --- |
| **Round trip** | Delay between the cloud PC and your client | Early in a session, then shown as the last known value for 10 minutes |
| **Quality**, **Network scores**, **Health** | NVIDIA's own 0-100 stream scores | Early in a session |
| **Weakest link** | The lowest scoring part of the stream, shown only when it drops under 90% | Early in a session |
| **Stream FPS** | Stream frame rate worked out from log timestamps (an estimate) | Early in a session |
| **Loss dips** | How many samples had a loss score under 100 (a rough hint, not a packet count) | Early in a session |
| **Bandwidth used** | Data the cloud PC is sending on the stream network adapter | Always |
| **Stream resolution**, **Bitrate limit** | Resolution, frame rate and the bitrate cap | Whole session |
| **Codec**, **Client / HDR**, **Features** | Codec, bit depth, colour format, client version, HDR, Reflex, cloud G-Sync and L4S | Whole session |
| **Data age** | How old the newest stream score is | Always (off by default) |

> [!WARNING]
> NVIDIA stops writing the round trip and score lines to the streamer log after roughly 35 minutes of a session. Those readings are only live early on. Once they are more than 30 seconds old they are hidden, and round trip stays as its last known value for 10 minutes. This is a limit of the data NVIDIA exposes, not a bug. Restarting the stream starts a fresh log.

> [!NOTE]
> Raw packet and frame loss counts, Wi-Fi details and live ping are measured on your own device and are not available to SalsaStats. NVIDIA's own overlay (the one that shows ping and packet loss) is the place to read those.

### Encoder load

**Encoder load** is an optional row in the GPU group. It shows the video engine load, which on GeForce NOW is the stream being encoded. It comes from the NVIDIA sensor helper, with a Windows performance counter (read through PowerShell, or `wmic` where PowerShell is locked down) as a fallback.

> [!TIP]
> If the row is blank on your machine, the counter isn't available there. Turn on **Hide readings that are unavailable** and it disappears instead of showing dashes.

### Start with SalsaNOW

A SalsaNOW session starts from a clean Windows each time, so the normal **Start SalsaStats with Windows** option doesn't carry over. SalsaNOW instead runs a batch file at the start of every session, `I:\Apps\SalsaNOW\StartupBatch.bat`, if one exists ([SalsaNOW documentation](https://documentation.salsanowfiles.work/Features/StartupBatchScript/)).

Turn on **Settings → Start SalsaStats when SalsaNOW starts** and SalsaStats adds a small guarded block to the end of that file:

```bat
REM >>> SalsaStats (managed by SalsaStats, remove with the setting)
setlocal
set "SS_EXE=C:\Users\kiosk\AppData\Local\Programs\salsastats\SalsaStats.exe"
set "SS_COUNT=I:\Apps\SalsaNOW\SalsaStatsFailures.txt"
if not exist "%SS_EXE%" goto salsastats_end
set /a SS_N=0
if exist "%SS_COUNT%" set /p SS_N=<"%SS_COUNT%"
if %SS_N% GEQ 3 goto salsastats_end
set /a SS_N+=1
2>nul >"%SS_COUNT%" echo %SS_N%
start "" "%SS_EXE%"
:salsastats_end
endlocal
REM <<< SalsaStats
```

> [!NOTE]
> Anything else already in `StartupBatch.bat` is left exactly as it was, and a copy of the original is saved once as `StartupBatch.bat.salsastats-backup` before the first change. Turning the option off removes only the SalsaStats lines. The option only works in the installed app, inside a SalsaNOW session.

#### The safety net

The block is built so that a broken SalsaStats can never stop you getting into your session:

- The block only ever starts SalsaStats in the background and never stops the batch. If anything about it goes wrong, the rest of the file still runs and the session still opens.
- If the exe isn't there (for example after a reset), the block does nothing at all.
- The block counts sessions in `I:\Apps\SalsaNOW\SalsaStatsFailures.txt`, the folder that survives between sessions. The count goes up by one each session where SalsaStats was launched but was gone again within 10 minutes, which is what a session-crashing bug looks like from the outside.
- After **three** early exits in a row the block simply stops launching SalsaStats, so the next session opens normally. There is nothing left to crash.
- The first session where SalsaStats stays up for 10 minutes resets the count, so ordinary use never trips it.
- When it has paused itself, the app says so in **Settings**, with a **Resume automatic start** button. Switching the option off and on does the same thing, or you can delete `SalsaStatsFailures.txt` by hand.

> [!TIP]
> If you ever suspect the app and want in quickly before anything else: open a session, and the block is already skipping SalsaStats (three strikes). If you need it out of the way for just this session, delete the marked block from `I:\Apps\SalsaNOW\StartupBatch.bat` — you don't need to be in a session for long to do that.

## Frame rate

SalsaStats reads the frames a game presents on the machine it runs on, using [PresentMon](https://github.com/GameTechDev/PresentMon). That is the true render rate, which in a cloud session can be well above the rate of the stream you see.

In **Settings → Frame rate** you can choose:

- **Raw render FPS**, exactly what the game renders
- **Cap displayed FPS** (30 to 240), to make SalsaStats' readings easier to compare with a stream rate. This only changes displayed values; it does not limit the game or GeForce NOW stream.

The optional **Frame analysis** readings (CPU and GPU busy time, click-to-photon, present mode, frame type, GPU video busy) come from the same capture.

> [!IMPORTANT]
> Frame capture needs administrator rights, or membership of the Windows "Performance Log Users" group. Right-click SalsaStats and choose **Run as administrator**. Everything else works without it, and the status bar tells you when capture is unavailable.

> [!NOTE]
> Click-to-photon is measured inside the game session. It does not include GeForce NOW network or client-display latency. The CPU/GPU limit note is a heuristic, not a measurement.

## Troubleshooting

- **A game minimises or loses focus.** Turn off **Force above fullscreen games** in Settings.
- **GPU temperature or clock is missing.** Open the log panel from the **Logs** button and check the startup line to see which hardware sources responded.
- **The overlay hides behind a game.** Exclusive-fullscreen games can cover any overlay. Use borderless or windowed mode.
- **A game isn't recognised.** Games are matched by executable name, ignoring suffixes like `-Win64-Shipping`. Use **Add running game** for an exact match.
- **The STREAM group isn't showing.** It only appears on a GeForce NOW session. Untick **Hide readings that are unavailable** to see every row, and check the log panel for the line "GeForce NOW stream log status changed".
- **Round trip and scores vanished.** See the warning in [Stream readout](#stream-readout). NVIDIA stops logging them after about 35 minutes.
- **Closing the window didn't quit.** That's the tray behaviour. Use **Quit** from the tray icon's menu.
- **SalsaStats doesn't open with SalsaNOW.** Turn on **Start SalsaStats when SalsaNOW starts** in Settings, then start a new session. The option is greyed out if `I:\Apps\SalsaNOW` isn't found or you're running from source. If it paused itself after several early exits, Settings shows a **Resume automatic start** button; deleting `I:\Apps\SalsaNOW\SalsaStatsFailures.txt` does the same thing.

The log panel has filter, copy, pause and clear buttons, which makes it easy to paste into a bug report. Logs live in `%APPDATA%\salsastats\logs` and rotate automatically. Nothing leaves your machine except the update check to GitHub.

## Build it yourself

You need Windows and Node.js 24.

```bash
npm ci
npm start          # run from source
npm run build:win  # build the installer into release/
```

The build downloads PresentMon and compiles a small helper that reads NVIDIA sensors through [NvAPIWrapper](https://github.com/falahati/NvAPIWrapper). Pushing a `v*` tag publishes a release through GitHub Actions.

> [!TIP]
> If the build stops with an `EPERM` rename error, the repo is probably inside a OneDrive folder. Delete `release/win-unpacked.tmp` and run it again, or move the project outside OneDrive.

## Credits

[PresentMon](https://github.com/GameTechDev/PresentMon) by Intel for frame timing · [NvAPIWrapper](https://github.com/falahati/NvAPIWrapper) for NVIDIA sensors · [systeminformation](https://github.com/sebhildebrandt/systeminformation) for CPU and GPU details · [Electron](https://www.electronjs.org/)

## License

MIT
