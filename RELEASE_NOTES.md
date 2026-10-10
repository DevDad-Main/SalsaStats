# SalsaStats 1.0.14

## What's new

- Update the npm lockfile to match the declared node-gyp 11 dependency so clean CI installs succeed.
- Pin Windows release builds to Windows Server 2022 and explicitly select the Visual Studio 2022 toolchain for the native addon.
- Fix the native addon's Windows condition syntax so node-gyp can configure the NVAPI build.

## Install and update

Download `SalsaStats-1.0.14-x64-Setup.exe` and run it to install for the current user; administrator elevation is not requested.

The installer is unsigned. SmartScreen or managed-device application-control policies may still warn or block it.