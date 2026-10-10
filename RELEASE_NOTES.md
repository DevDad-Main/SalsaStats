# SalsaStats 1.0.22

## What's new

- Fix a crash on systems that block SalsaStats from starting PowerShell (spawn EPERM). Looking up a friendly game name now fails quietly and falls back to the executable name instead of stopping the app.

## Also in 1.0.21

- The overlay is now fully click-through and never takes focus, so hovering over it can't interrupt a game.
- New keybinds: Ctrl+Alt+O opens the dashboard and overlay settings, Ctrl+Alt+M switches the overlay between full and minimal, and Ctrl+Alt+H hides or shows it.
- Minimal overlay view showing only the readings you choose.
- Readings the machine can't provide are hidden automatically; this can be turned off in the Overlay tab.
- Rewritten README.

## Install and update

Download `SalsaStats-1.0.22-x64-Setup.exe` and run it to install for the current user; administrator elevation is not requested.

The installer is unsigned. SmartScreen or managed-device application-control policies may still warn or block it.
