# SalsaStats 1.0.28

## What's new

- Find installed games: one button scans Steam libraries, Epic's installed list and common game folders, and lets you add the ones you want to your library.
- Session history: after you play for a minute or more, the Games tab records average FPS, 1% low, peak GPU temperature, peak VRAM and average ping for that session.
- Optional network readout (off by default): ping, jitter and packet loss to a host you choose. In GeForce NOW this measures the cloud PC's internet connection, not your stream.
- More hardware: GPU encoder load (the stream being encoded on GeForce NOW), per-core CPU bars on the Overview tab, and Net In, Net Out, Disk Read and Disk Write rows for the overlay. The I/O rows need Windows' `wmic` tool and hide themselves where it isn't available.
- Startup options: start with Windows, open straight into the overlay, and show the overlay only while a game is running.
- Share: copy the current readings as text, or the live preview as an image, from the Overlay tab.

## Install and update

Download `SalsaStats-1.0.28-x64-Setup.exe` and run it to install for the current user; administrator elevation is not requested.

The installer is unsigned. SmartScreen or managed-device application-control policies may still warn or block it.
