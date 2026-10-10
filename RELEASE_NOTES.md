# SalsaStats 1.0.19

## What's new

- Replace the experimental C++ NVAPI addon with a small out-of-process helper built on NvAPIWrapper, so GPU temperature, clock and memory readings can no longer crash the app. It runs automatically and fills any gaps left by other GPU sources.
- Add game frame rate capture (FPS, average and 1% low, with live graphs) using PresentMon. This needs administrator rights or membership of the "Performance Log Users" group; the dashboard explains when it is unavailable.
- Fix a crash when dragging the overlay window.
- Refreshed interface with a cooler palette, larger text and clearer cards.
- Remove the NVAPI toggle from Setup now that the helper is safe to run by default.
- Fix the Windows build scripts so release builds succeed in CI (1.0.18 was never published).

## Install and update

Download `SalsaStats-1.0.19-x64-Setup.exe` and run it to install for the current user; administrator elevation is not requested.

The installer is unsigned. SmartScreen or managed-device application-control policies may still warn or block it.
