const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

let child = null;
let latest = null;
let lastError = null;
let buffer = '';

function resolveHelperPath(resourcesPath, baseDirectory) {
  const candidates = [
    resourcesPath && path.join(resourcesPath, 'nvapi', 'NvapiHelper.exe'),
    path.join(baseDirectory, 'vendor', 'nvapi', 'NvapiHelper.exe'),
  ].filter(Boolean);
  return candidates.find(candidate => fs.existsSync(candidate)) || null;
}

function handleLine(line) {
  try {
    const data = JSON.parse(line);
    if (data.error) lastError = data.error;
    else {
      latest = data;
      lastError = null;
    }
  } catch {
    // Ignore partial or non-JSON output.
  }
}

// The helper runs out of process, so a failure in NVAPI cannot take the app down.
function start({ resourcesPath, baseDirectory, logger } = {}) {
  if (child) return;
  const exePath = resolveHelperPath(resourcesPath, baseDirectory);
  if (!exePath) {
    lastError = 'NVAPI helper not found.';
    return;
  }
  try {
    child = spawn(exePath, [], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    lastError = error.message;
    logger?.writeSync('warn', 'Unable to start the NVAPI helper.', error);
    return;
  }
  child.stdout.on('data', chunk => {
    buffer += chunk.toString('utf8');
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop();
    lines.forEach(handleLine);
  });
  child.stderr.on('data', () => {});
  child.on('error', error => {
    lastError = error.message;
    child = null;
  });
  child.on('exit', code => {
    child = null;
    latest = null;
    if (!lastError) lastError = `NVAPI helper exited (code ${code}).`;
    logger?.writeSync('warn', 'NVAPI helper exited.', { code, error: lastError });
  });
}

function stop() {
  if (child) child.kill();
  child = null;
}

function isAvailable() {
  return latest !== null;
}

function getGpuMetrics() {
  return latest || { gpus: [], error: lastError };
}

function getStatus() {
  return { loaded: latest !== null, error: latest ? null : lastError };
}

module.exports = { start, stop, isAvailable, getGpuMetrics, getStatus, resolveHelperPath };
