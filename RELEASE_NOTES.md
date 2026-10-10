# SalsaStats 1.0.25

## What's new

- Fix a crash when a game starts: window positions and sizes are now always whole numbers, and a failed window request is logged instead of stopping the app.
- Games are now matched by their base name, so `b1.exe` and `b1-Win64-Shipping.exe` count as the same game for names and per-game layouts.
- The overlay now stays on the screen you are using when you drag or resize it, and its height follows its content.
- Drag the bottom edge in edit mode (Ctrl+Alt+E), or use the new Group spacing slider, to space out the GPU, CPU, memory and FPS blocks.
- The dashboard and compact views remember their own size and position when you switch modes or restore the window.
- Add games from a built-in file browser that doesn't depend on the Windows file dialog, and add every game in a folder at once.
- Fix primary buttons showing dark text on a dark background.

## Install and update

Download `SalsaStats-1.0.25-x64-Setup.exe` and run it to install for the current user; administrator elevation is not requested.

The installer is unsigned. SmartScreen or managed-device application-control policies may still warn or block it.
