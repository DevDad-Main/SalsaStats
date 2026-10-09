# SalsaStats 1.0.8

## What's new

- Add automatic update checks and background downloads, with a user-controlled restart to install.
- Improve GeForce NOW hardware detection by preferring physical GPUs over virtual display adapters.
- Fall back to the Windows CPU model when the hardware library does not provide a CPU brand.
- Reassert the overlay's topmost position every second and when it loses focus, without activating it.
- Run future NSIS updates silently and relaunch SalsaStats after installation.
- Make aggressive fullscreen-game overlay raising optional to avoid disrupting games.
- Fall back to WMI for physical GPU names when the graphics library returns no adapters.
- Use Windows GPU performance counters for engine utilization and dedicated memory when NVIDIA-SMI is blocked.
- Query the supported WMI adapter-memory fields and show dedicated MiB used even when total VRAM is unavailable.
- Include the actual GPU readings and telemetry source in the startup log.
- Try NVIDIA-SMI for live GPU readings when standard telemetry is unavailable.
- Record the telemetry source and WMI-detected adapters in the startup log.
- Add startup adapter diagnostics to the local log for troubleshooting remote sessions.
- Refresh the README with installation, update, logging, and GeForce NOW/FPS guidance.

## Install and update

Download `SalsaStats-1.0.8-x64-Setup.exe` and run it to install for the current user; administrator elevation is not requested. Existing v1.0.0 installations need one manual upgrade to v1.0.2 first. The first update from v1.0.3 may still show its installer because that version requested the visible installer UI; subsequent updates install silently and restart SalsaStats.

The installer is unsigned. SmartScreen or managed-device application-control policies may still warn or block it.