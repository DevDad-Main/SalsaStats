const path = require('node:path');
const { app } = require('electron');

let nvidiaPerf = null;
let loadError = null;

function getAddonPath() {
  const candidates = [
    // Packaged app (ASAR extracted or unpacked)
    path.join(process.resourcesPath, 'nvidia-perf-addon', 'build', 'Release', 'nvidia_perf.node'),
    // Development
    path.join(__dirname, 'nvidia-perf-addon', 'build', 'Release', 'nvidia_perf.node'),
    // Alternative dev location
    path.join(__dirname, '..', 'nvidia-perf-addon', 'build', 'Release', 'nvidia_perf.node'),
  ];

  for (const p of candidates) {
    if (require('node:fs').existsSync(p)) return p;
  }
  return null;
}

function tryLoadAddon() {
  if (nvidiaPerf !== null || loadError !== null) return;

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
  isAvailable,
  getGpuMetrics,
  getFrameRate
};