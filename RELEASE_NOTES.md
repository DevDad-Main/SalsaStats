# SalsaStats 1.0.2

## What's new

- Add automatic update checks and background downloads, with a user-controlled restart to install.
- Improve GeForce NOW hardware detection by preferring physical GPUs over virtual display adapters.
- Fall back to the Windows CPU model when the hardware library does not provide a CPU brand.
- Raise the overlay above normal windows and improve its chances of remaining visible over fullscreen apps.
- Add startup adapter diagnostics to the local log for troubleshooting remote sessions.
- Refresh the README with installation, update, logging, and GeForce NOW/FPS guidance.

## Install and update

Download `SalsaStats-1.0.2-x64-Setup.exe` and run it to install for the current user; administrator elevation is not requested. Existing v1.0.0 installations need this one manual upgrade. Future versions can download in-app and prompt for a restart when ready.

The installer is unsigned. SmartScreen or managed-device application-control policies may still warn or block it.