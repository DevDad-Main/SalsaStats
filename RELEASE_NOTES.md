# SalsaStats 1.0.36

- On GeForce NOW, the CPU line now shows the specific processor for the detected rig (Threadripper PRO 5955WX or EPYC 9375F), plus tier, core/thread allocation and RAM.

# SalsaStats 1.0.35 (test build)

- Replaced WMIC-based GPU and disk counter queries with PowerShell CIM queries for newer Windows installs.
- Added optional PresentMon CPU/GPU busy, presentation, frame-type, click-to-photon, and video-busy readings when available.
- Added a click-through in-game quick menu on Ctrl+Alt+I for toggling overlay readings.
- Click-to-photon is session-side telemetry; it does not measure GeForce NOW network or client-display latency.
