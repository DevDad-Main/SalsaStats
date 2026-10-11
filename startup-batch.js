const fs = require('node:fs');
const path = require('node:path');

// SalsaNOW runs this batch file at the start of every session if it exists.
const DEFAULT_DIRECTORY = 'I:\\Apps\\SalsaNOW';
const FILE_NAME = 'StartupBatch.bat';
// The counter lives next to the batch file: that folder is the one place that survives between sessions.
const FAILURE_FILE_NAME = 'SalsaStatsFailures.txt';
const BACKUP_SUFFIX = '.salsastats-backup';
const START_MARKER = 'REM >>> SalsaStats (managed by SalsaStats, remove with the setting)';
const END_MARKER = 'REM <<< SalsaStats';
// After this many sessions that ended before SalsaStats settled, the batch stops launching it.
const MAX_FAILED_STARTS = 3;

function startupDirectory(env = process.env) {
  return env.SALSANOW_DIR || DEFAULT_DIRECTORY;
}

// Always defaulted here, never trusted from a caller, so the batch can never get a broken counter path.
function defaultCounterPath(env = process.env) {
  return path.join(startupDirectory(env), FAILURE_FILE_NAME);
}

function lineEnding(text) {
  return /\n/.test(text) && !/\r\n/.test(text) ? '\n' : '\r\n';
}

function escapeLiteral(value) {
  return String(value).replace(/%/g, '%%');
}

// The block can never stop the session's other startup commands: it only runs a guarded, non-blocking start.
function buildBlock(exePath, counterPath, eol) {
  return [
    START_MARKER,
    'setlocal',
    `set "SS_EXE=${escapeLiteral(exePath)}"`,
    `set "SS_COUNT=${escapeLiteral(counterPath)}"`,
    'if not exist "%SS_EXE%" goto salsastats_end',
    'set /a SS_N=0',
    'if exist "%SS_COUNT%" set /p SS_N=<"%SS_COUNT%"',
    `if %SS_N% GEQ ${MAX_FAILED_STARTS} goto salsastats_end`,
    'set /a SS_N+=1',
    '2>nul >"%SS_COUNT%" echo %SS_N%',
    'start "" "%SS_EXE%"',
    ':salsastats_end',
    'endlocal',
    END_MARKER,
  ].join(eol);
}

function removeBlock(text) {
  const eol = lineEnding(text);
  const kept = [];
  let skipping = false;
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === START_MARKER) {
      skipping = true;
      continue;
    }
    if (skipping) {
      if (line.trim() === END_MARKER) skipping = false;
      continue;
    }
    kept.push(line);
  }
  return kept.join(eol);
}

function hasBlock(text) {
  return text.split(/\r?\n/).some(line => line.trim() === START_MARKER);
}

// Everything the user already put in the batch file is kept; only our own marked block, added last, is touched.
function applyStartupBlock(text, exePath, counterPath, enabled) {
  const eol = lineEnding(text);
  const cleaned = removeBlock(text).replace(/(\r?\n)+$/, '');
  if (!enabled) return cleaned ? `${cleaned}${eol}` : '';
  return `${cleaned || '@echo off'}${eol}${buildBlock(exePath, counterPath, eol)}${eol}`;
}

function getStartupStatus({ directory = startupDirectory(), file = path.join(directory, FILE_NAME), counterPath = path.join(directory, FAILURE_FILE_NAME) } = {}) {
  if (!fs.existsSync(directory)) return { available: false, enabled: false, paused: false, path: file };
  let enabled = false;
  try {
    enabled = hasBlock(fs.readFileSync(file, 'utf8'));
  } catch {
    // No batch file yet.
  }
  return { available: true, enabled, paused: enabled && readFailedStarts(counterPath) >= MAX_FAILED_STARTS, path: file };
}

function setStartupEnabled(enabled, exePath, { directory = startupDirectory(), file = path.join(directory, FILE_NAME), counterPath = path.join(directory, FAILURE_FILE_NAME) } = {}) {
  if (!fs.existsSync(directory)) return { ok: false, error: 'The SalsaNOW folder was not found, so this only works inside a SalsaNOW session.' };
  try {
    const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (existing && !fs.existsSync(file + BACKUP_SUFFIX)) fs.writeFileSync(file + BACKUP_SUFFIX, existing);
    const next = applyStartupBlock(existing, exePath, counterPath, enabled);
    if (next !== existing) fs.writeFileSync(file, next);
    // Switching the option on or off is a deliberate choice, so it always gets a fresh start.
    clearFailedStarts(counterPath);
    return { ok: true, enabled };
  } catch (error) {
    return { ok: false, error: `Unable to update the startup batch file (${error.code || error.message}).` };
  }
}

function readFailedStarts(counterPath) {
  if (!counterPath) return 0;
  try {
    const value = Number.parseInt(fs.readFileSync(counterPath, 'utf8'), 10);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

// Called once SalsaStats has stayed up long enough to prove it is not breaking the session,
// so only a genuinely good run resets the crash-loop breaker.
function clearFailedStarts(counterPath) {
  if (!counterPath) return;
  try {
    fs.rmSync(counterPath, { force: true });
  } catch {
    // The counter is only a safety net.
  }
}

module.exports = {
  FAILURE_FILE_NAME,
  MAX_FAILED_STARTS,
  applyStartupBlock,
  clearFailedStarts,
  defaultCounterPath,
  getStartupStatus,
  hasBlock,
  readFailedStarts,
  setStartupEnabled,
};
