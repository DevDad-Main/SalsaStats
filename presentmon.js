const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const WINDOW_MS = 30000;
const RECENT_MS = 2000;
const MIN_RECENT_FRAMES = 3;
const HISTORY_FRAMES = 120;
const IGNORED_APPS = new Set([
  'dwm.exe', 'explorer.exe', 'salsastats.exe', 'electron.exe', 'searchhost.exe',
  'startmenuexperiencehost.exe', 'shellexperiencehost.exe', 'textinputhost.exe', 'presentmon.exe',
]);

function splitCsvLine(line) {
  const fields = [];
  let current = '';
  let quoted = false;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) {
      fields.push(current);
      current = '';
    } else current += char;
  }
  fields.push(current);
  return fields;
}

function createFrameTracker() {
  let columns = null;
  const processes = new Map();

  function ingestLine(line, now = Date.now()) {
    const text = line.trim();
    if (!text) return;
    const fields = splitCsvLine(text);

    if (!columns) {
      const names = fields.map(name => name.trim().toLowerCase());
      const application = names.indexOf('application');
      const processId = names.indexOf('processid');
      let frame = names.indexOf('msbetweenpresents');
      if (frame < 0) frame = names.indexOf('frametime');
      if (application >= 0 && processId >= 0 && frame >= 0) columns = { application, processId, frame };
      return;
    }

    const ms = Number.parseFloat(fields[columns.frame]);
    if (!Number.isFinite(ms) || ms <= 0) return;
    const pid = fields[columns.processId];
    let entry = processes.get(pid);
    if (!entry) {
      entry = { application: fields[columns.application], frames: [] };
      processes.set(pid, entry);
    }
    entry.frames.push({ time: now, ms });
    const cutoff = now - WINDOW_MS;
    while (entry.frames.length && entry.frames[0].time < cutoff) entry.frames.shift();
  }

  function snapshot(now = Date.now()) {
    let best = null;
    for (const [pid, entry] of processes) {
      const cutoff = now - WINDOW_MS;
      while (entry.frames.length && entry.frames[0].time < cutoff) entry.frames.shift();
      if (!entry.frames.length) {
        processes.delete(pid);
        continue;
      }
      if (IGNORED_APPS.has(String(entry.application).toLowerCase())) continue;
      const recent = entry.frames.filter(frame => frame.time >= now - RECENT_MS);
      if (recent.length >= MIN_RECENT_FRAMES && (!best || recent.length > best.recent.length)) {
        best = { entry, recent };
      }
    }
    if (!best) return null;

    const times = best.entry.frames.map(frame => frame.ms);
    const mean = times.reduce((sum, value) => sum + value, 0) / times.length;
    const sorted = [...times].sort((a, b) => a - b);
    const slowest = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))];
    const recentMean = best.recent.reduce((sum, frame) => sum + frame.ms, 0) / best.recent.length;

    return {
      application: best.entry.application,
      current: Math.round(1000 / recentMean),
      average: Math.round(1000 / mean),
      low: Math.round(1000 / slowest),
      frametimes: times.slice(-HISTORY_FRAMES),
    };
  }

  return { ingestLine, snapshot };
}

function createPresentMonCapture({ exePath, logger } = {}) {
  const tracker = createFrameTracker();
  let child = null;
  let status = 'off';
  let message = '';
  let stderr = '';
  let buffer = '';

  function start() {
    if (child) return;
    if (!exePath || !fs.existsSync(exePath)) {
      status = 'missing';
      message = 'PresentMon is not included in this build.';
      return;
    }
    status = 'starting';
    try {
      child = spawn(exePath, [
        '--output_stdout', '--no_console_stats', '--stop_existing_session', '--session_name', 'SalsaStats',
      ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      status = 'error';
      message = error.message;
      logger?.writeSync('warn', 'Unable to start PresentMon.', error);
      return;
    }

    const startedAt = Date.now();
    child.stdout.on('data', chunk => {
      if (status === 'starting') status = 'active';
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      const now = Date.now();
      for (const line of lines) tracker.ingestLine(line, now);
    });
    child.stderr.on('data', chunk => {
      stderr = (stderr + chunk.toString('utf8')).slice(-2000);
    });
    child.on('error', error => {
      status = 'error';
      message = error.message;
      child = null;
      logger?.writeSync('warn', 'PresentMon failed.', error);
    });
    child.on('exit', code => {
      child = null;
      if (status === 'off') return;
      status = 'error';
      const needsAdmin = /administrator|elevat|access (is )?denied|Performance Log Users/i.test(stderr);
      message = needsAdmin
        ? 'FPS capture needs administrator rights. Run SalsaStats as administrator, or add your user to the "Performance Log Users" group.'
        : `Frame capture stopped (exit code ${code}).`;
      logger?.writeSync('warn', 'PresentMon exited.', { code, stderr: stderr.trim(), runtimeMs: Date.now() - startedAt });
    });
  }

  function stop() {
    status = 'off';
    if (child) child.kill();
    child = null;
  }

  function getSnapshot() {
    const fps = status === 'active' ? tracker.snapshot() : null;
    return { status: fps ? 'capturing' : status, message, fps };
  }

  return { start, stop, getSnapshot };
}

function resolvePresentMonPath(resourcesPath, baseDirectory) {
  const candidates = [
    resourcesPath && path.join(resourcesPath, 'PresentMon.exe'),
    path.join(baseDirectory, 'vendor', 'PresentMon.exe'),
  ].filter(Boolean);
  return candidates.find(candidate => fs.existsSync(candidate)) || null;
}

module.exports = { createFrameTracker, createPresentMonCapture, resolvePresentMonPath };
