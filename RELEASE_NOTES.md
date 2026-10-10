# SalsaStats 1.0.15

## What's new

- Update the npm lockfile to match the declared node-gyp 11 dependency so clean CI installs succeed.
- Pin Windows release builds to Windows Server 2022 and explicitly select the Visual Studio 2022 toolchain for the native addon.
- Fix the native addon's Windows condition and node-addon-api include path so MSVC can compile it.
- Remove unused NVAPI import-library dependencies; the addon resolves the NVAPI DLL dynamically.
- Build and package the Windows installer in CI before publishing a release tag.

## Install and update

Download `SalsaStats-1.0.15-x64-Setup.exe` and run it to install for the current user; administrator elevation is not requested.

The installer is unsigned. SmartScreen or managed-device application-control policies may still warn or block it.