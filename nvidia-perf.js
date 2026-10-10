const path = require('node:path');
const fs = require('node:fs');

let nvidiaPerf = null;
let loadError = null;

function getAddonPath() {
  const relative = path.join('nvidia-perf-addon', 'build', 'Release', 'nvidia_perf.node');
  const candidates = [
    // Packaged app: native modules must live outside the asar archive
    path.join(__dirname.replace('app.asar', 'app.asar.unpacked'), relative),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', relative),
    path.join(__dirname, relative),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function tryLoadAddon() {
  if (nvidiaPerf !== null || loadError !== null) return;

  // The addon calls NVAPI function IDs that are unverified and can crash the process.
  if (process.env.SALSASTATS_NVAPI !== '1') {
    loadError = new Error('NVAPI addon disabled (set SALSASTATS_NVAPI=1 to enable)');
    return;
  }

  const addonPath = getAddonPath();
  if (!addonPath) {
    loadError = new Error('NVAPI addon not found (not built yet?)');
    console.warn('NVIDIA NVAPI addon not available:', loadError.message);
    return;
  }

  try {
    nvidiaPerf = require(addonPath);
    console.log('NVAPI addon loaded from:', addonPath);
  } catch (error) {
    loadError = error;
    console.warn('NVIDIA NVAPI addon failed to load:', error.message);
    nvidiaPerf = null;
  }
}

function getStatus() {
  tryLoadAddon();
  return { loaded: nvidiaPerf !== null, error: loadError ? loadError.message : null };
}

function isAvailable() {
  tryLoadAddon();
  return nvidiaPerf !== null;
}

function getGpuMetrics() {
  tryLoadAddon();
  if (!nvidiaPerf) return { error: loadError?.message || 'NVAPI addon not loaded', gpus: [], count: 0, source: 'nvapi' };
  return nvidiaPerf.getGpuMetrics();
}

function getFrameRate() {
  tryLoadAddon();
  if (!nvidiaPerf) return { error: loadError?.message || 'NVAPI addon not loaded', frameRate: 0, available: false };
  return nvidiaPerf.getFrameRate();
}

module.exports = {
  getStatus,
  isAvailable,
  getGpuMetrics,
  getFrameRate
};