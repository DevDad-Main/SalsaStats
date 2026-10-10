# SalsaStats 1.0.29

- Fixed: 1.0.28 failed to start with "Cannot find module './network'". The network module was missing from the installer.
- Only one SalsaStats can run at a time. Launching it again brings the running window forward.
- Added a test that fails if a required module is missing from the packaged files.

If 1.0.28 is installed it cannot start, so it cannot update itself. Download and run the 1.0.29 installer manually.
