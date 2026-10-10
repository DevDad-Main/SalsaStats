# SalsaStats

![Windows release](https://github.com/DevDad-Main/SalsaStats/actions/workflows/release.yml/badge.svg)

A lightweight Windows dashboard and overlay for live CPU, memory, and available GPU telemetry. SalsaStats runs without administrator privileges, injectors, or game hooks.

## Download

Get the latest x64 installer from [GitHub Releases](https://github.com/DevDad-Main/SalsaStats/releases/latest). The NSIS installer is configured for the current user and does not request administrator elevation.

The installer is unsigned. Windows SmartScreen may show a reputation warning, and managed-device application-control policies may block it. An unsigned build cannot override local organization policy.

## What It Shows

- CPU usage, model, core count, and available temperature/clock readings
- Memory usage
- GPU model, utilization, temperature, memory, clock, and power when exposed by the driver
- A short CPU/GPU usage history
- Full dashboard, compact view, and a configurable always-on-top overlay
- Local rotating logs and recovery options for application errors

Hardware availability depends on what Windows and the installed drivers expose. In GeForce NOW, SalsaStats can report only hardware visible inside that remote Windows session. Virtual display adapters are ignored when a physical GPU is available. If Electron's hardware library returns no GPU, SalsaStats silently queries Windows WMI for adapter names and GPU-engine/VRAM counters, then tries NVIDIA-SMI for additional readings. Missing commands or unsupported sensors are treated as unavailable, not fatal errors. WMI counters do not provide GPU temperature or board power, and may not expose total VRAM.

## Overlay

Choose **Overlay** in the dashboard. Use **Setup** in the overlay to adjust its size, position, colors, and displayed metrics. Normal mode stays above ordinary windows without repeatedly raising itself. If a fullscreen game covers it, enable **Customize → Window behavior → Force above fullscreen games**. That stronger mode reasserts the overlay position and can disrupt games that react badly to focus/z-order changes; turn it off if a game minimizes or closes. Windows protected/exclusive-fullscreen presentation may still cover any desktop overlay.

## GeForce NOW And FPS

SalsaStats does not currently capture game-render FPS. GeForce NOW's own statistics panel is the authoritative source for stream/network statistics; there is no documented API for SalsaStats to read those values. The local GeForce NOW client's presentation rate is not the same as the game's server-side render FPS, so SalsaStats does not label one as the other.

If a game provides its own FPS counter, it may be visible in the streamed image, but SalsaStats does not read that counter. Reliable game FPS requires a supported capture source and may require permissions that are unavailable in a non-admin session.

## NVIDIA NVAPI Support (Experimental)

SalsaStats includes an optional native Node addon that uses the NVIDIA NVAPI SDK to query GPU performance counters directly. This works without administrator privileges on GeForce NOW and can provide:

- GPU utilization, temperature, clock speeds, power draw, fan speed
- Memory usage (VRAM) and total memory
- PCIe throughput and utilization
- Frame rate counter (if exposed by the driver on GFN hardware)

The addon is built at install time via `node-gyp`. If the addon fails to load, SalsaStats gracefully falls back to the existing WMI/nvidia-smi/systeminformation sources. The telemetry source is shown in the dashboard as `nvapi` when active.

To enable NVAPI support, build on Windows with Visual Studio Build Tools installed:
```bash
npm run build:addon
npm run build:win
```

The addon requires the NVIDIA display driver to be installed (present on GFN rigs).

## Updates And Logs

Packaged builds check GitHub Releases at startup and every six hours. Updates download in the background; SalsaStats offers a restart button after the download completes and will not restart in the middle of a session. Existing v1.0.0 installs must be manually upgraded to v1.0.2 once; v1.0.2 is the first published release with the updater.

Logs default to `%APPDATA%\salsastats\logs`. Change or open the log folder from **Customize** under **Log folder**. Logs are JSON Lines, rotate at 2 MB, and retain up to three backups. A one-time startup record includes detected CPU/GPU names, adapters, and the telemetry source to help diagnose remote-session differences. Hardware readings and error logs stay on the PC; update checks contact GitHub.

## Build And Test

Requirements: Node.js 24 and npm. From a Windows development prompt:

```bash
npm ci
npm run check
npm test
npm start
```

Build a local x64 per-user installer without publishing it:

```bash
npm run build:win
```

The installer and update metadata are written under `release/`. To publish, push a version tag such as `v1.0.2`; the Windows GitHub Actions workflow builds the installer and publishes the required updater feed files to the Releases page.

## License

MIT