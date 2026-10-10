# SalsaStats 1.0.20

## What's new

- Tabbed dashboard: Overview, Overlay and Settings, with a cleaner layout.
- Docked log panel at the bottom of the window with filter, copy, pause, clear and open-folder buttons, plus a bottom status bar showing frame capture and GPU source status. Toggle it with the Logs button or Ctrl+`.
- Choose between raw render FPS and FPS capped to your stream rate (30-240).
- The overlay and dashboard now show which game is being measured, using its window title or product name, falling back to the executable name. Custom names can be set in Settings.
- Fix games being minimised by the overlay: the overlay no longer takes keyboard focus.
- Fix frame capture picking up unnamed processes; process names are now resolved.
- Fix the overlay FPS note showing "Game capture unavailable" while capturing.
- Remove the "Live" indicators.

## Install and update

Download `SalsaStats-1.0.20-x64-Setup.exe` and run it to install for the current user; administrator elevation is not requested.

The installer is unsigned. SmartScreen or managed-device application-control policies may still warn or block it.
