# SalsaStats 1.0.46

- The SalsaNOW automatic start now has a proper safety net, so a broken build can never lock anyone out of their session. The startup block counts sessions where SalsaStats was launched but was gone again within 10 minutes, in a file that lives next to the batch file (`I:\Apps\SalsaNOW\SalsaStatsFailures.txt`, the folder that survives between sessions). After three early exits in a row it stops launching SalsaStats on its own, so the next session just opens. A session where SalsaStats stays up for 10 minutes resets the count.
- Settings shows when automatic start has paused itself, explains why, and offers a **Resume automatic start** button. Switching the option off and on resets the count as well.
- Fixed the safety net of 1.0.45 never working: the counter path was missing, so the generated batch line could write a file named "undefined" and the breaker could never trip, and nothing ever reset the count after a good run.

# SalsaStats 1.0.45

- Added Settings > Start SalsaStats when SalsaNOW starts. It adds one marked line to SalsaNOW's own startup batch file (I:\Apps\SalsaNOW\StartupBatch.bat), keeps everything else in that file, and saves a one-time backup of the original.
- Encoder load now sits with the GPU options in Customize overlay.
- Removed the System I/O group and the disk read and write readings, which were not available on cloud PCs.

# SalsaStats 1.0.44

- Disk read, disk write and encoder load now fall back to wmic when PowerShell is blocked, so System I/O can show data on locked-down cloud PCs.
- Rewrote the README with a guide to the GeForce NOW stream readout, which readings stay live, and troubleshooting tips.

# SalsaStats 1.0.43

- Added hover tooltips to every overlay reading and control in Customize overlay and Settings.
- Readings that are estimates or only live early in a session now carry a small tag (Early session, Estimate, Needs capture, Session only), and the GeForce NOW stream section explains why some values stop updating.
- The last known round trip is now shown for 10 minutes after NVIDIA stops logging it, then hidden. Data age is off by default.

# SalsaStats 1.0.42

- Bandwidth used now reads only the GeForce NOW STREAM network adapter, so game-file and other rig traffic no longer inflate it.
- Round trip stays on screen after NVIDIA stops logging it, shown as the last known value with its age, for example `22 ms · 76 min ago`. Live round trip is not available from the rig once the streamer log stops.

# SalsaStats 1.0.41

- Fixed the STREAM readout showing old values. NVIDIA stops writing round-trip and score lines to the streamer log part-way through a session, so those readings are now hidden once they are more than 30 seconds old, and Data age shows how old they are.
- Added Bandwidth used, a live reading of the data the cloud PC is sending, taken from the network adapter counters.
- Codec, resolution, client and feature details are unaffected because they are written once at the start of the session.

# SalsaStats 1.0.40

- Added STREAM readings worked out from the streamer log: Stream FPS (from the stream's frame counter and log timestamps), Loss dips (how many samples this session had a Loss score below 100) and Data age (how far behind the log is, so you can tell a frozen readout from a steady connection).
- These are estimates from NVIDIA's session scores. Real packet and frame loss counts are only measured on the client and are not available to SalsaStats.

# SalsaStats 1.0.39

- The GeForce NOW STREAM group no longer disappears and reappears. It now rides out the pauses in the streamer log and keeps the last reading briefly if a sample is empty.
- Stream readings now update every second by reading only the new log lines, so values follow the session instead of repeating old ones.

# SalsaStats 1.0.38

- Fixed the GeForce NOW STREAM readout not appearing: the session is now detected by the streamer log growing instead of its last-modified time, which Windows reports late for a log that is being written.
- The Logs panel now records why the stream readout is unavailable.

# SalsaStats 1.0.37

- Closing the window now hides SalsaStats to a tray icon. Click it to restore, or use its menu to show, hide or quit.
- Added a GeForce NOW STREAM group read from the NVIDIA streamer logs: round trip, stream quality, network scores, health, weakest link, stream resolution, bitrate limit, codec, client / HDR and stream features.
- Renamed the top-bar Overlay button to Show overlay and the Overlay tab to Customize overlay so they are easy to tell apart.

# SalsaStats 1.0.36

- On GeForce NOW, the CPU line now shows the specific processor for the detected rig (Threadripper PRO 5955WX or EPYC 9375F), plus tier, core/thread allocation and RAM.

# SalsaStats 1.0.35 (test build)

- Replaced WMIC-based GPU and disk counter queries with PowerShell CIM queries for newer Windows installs.
- Added optional PresentMon CPU/GPU busy, presentation, frame-type, click-to-photon, and video-busy readings when available.
- Added a click-through in-game quick menu on Ctrl+Alt+I for toggling overlay readings.
- Click-to-photon is session-side telemetry; it does not measure GeForce NOW network or client-display latency.
