# SalsaStats 1.0.16

## What's new

- Fix a crash when dragging the window: fractional window coordinates are now rounded before they reach Electron.
- Load the NVAPI addon from the unpacked ASAR location in packaged builds and log its load status in the startup telemetry sample.
- Keep the experimental NVAPI addon disabled by default (set `SALSASTATS_NVAPI=1` to opt in); GPU telemetry continues to use NVIDIA-SMI and WMI.

## Install and update

Download `SalsaStats-1.0.16-x64-Setup.exe` and run it to install for the current user; administrator elevation is not requested.

The installer is unsigned. SmartScreen or managed-device application-control policies may still warn or block it.
