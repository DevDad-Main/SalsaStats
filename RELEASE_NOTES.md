# SalsaStats 1.0.3

## What's new

- Add automatic update checks and background downloads, with a user-controlled restart to install.
- Improve GeForce NOW hardware detection by preferring physical GPUs over virtual display adapters.
- Fall back to the Windows CPU model when the hardware library does not provide a CPU brand.
- Reassert the overlay's topmost position every second and when it loses focus, without activating it.
- Add startup adapter diagnostics to the local log for troubleshooting remote sessions.
- Refresh the README with installation, update, logging, and GeForce NOW/FPS guidance.

## Install and update

Download `SalsaStats-1.0.3-x64-Setup.exe` and run it to install for the current user; administrator elevation is not requested. Existing v1.0.0 installations need one manual upgrade to v1.0.2 first. v1.0.2 and later can download this update in-app and prompt for a restart when ready.

The installer is unsigned. SmartScreen or managed-device application-control policies may still warn or block it.