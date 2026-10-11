const fs = require('node:fs');
const path = require('node:path');

// SalsaNOW runs this batch file at the start of every session if it exists.
const DEFAULT_DIRECTORY = 'I:\\Apps\\SalsaNOW';
const FILE_NAME = 'StartupBatch.bat';
const BACKUP_SUFFIX = '.salsastats-backup';
const START_MARKER = 'REM >>> SalsaStats (managed by SalsaStats, remove with the setting)';
const END_MARKER = 'REM <<< SalsaStats';

function startupDirectory(env = process.env) {
  return env.SALSANOW_DIR || DEFAULT_DIRECTORY;
}

function startupBatchPath(env = process.env) {
  return path.join(startupDirectory(env), FILE_NAME);
}

function lineEnding(text) {
  return /\n/.test(text) && !/\r\n/.test(text) ? '\n' : '\r\n';
}

function removeBlock(text) {
  const eol = lineEnding(text);
  const lines = text.split(/\r?\n/);
  const kept = [];
  let skipping = false;
  for (const line of lines) {
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

// Everything the user already put in the batch file is kept; only our own marked block is touched.
function applyStartupBlock(text, exePath, enabled) {
  const eol = lineEnding(text);
  const cleaned = removeBlock(text).replace(/(\r?\n)+$/, '');
  if (!enabled) return cleaned ? `${cleaned}${eol}` : '';
  const command = `start "" "${exePath.replace(/%/g, '%%')}"`;
  const block = [START_MARKER, command, END_MARKER].join(eol);
  const head = cleaned || '@echo off';
  return `${head}${eol}${block}${eol}`;
}

function getStartupStatus({ directory = startupDirectory(), file = path.join(directory, FILE_NAME) } = {}) {
  if (!fs.existsSync(directory)) return { available: false, enabled: false, path: file };
  let enabled = false;
  try {
    enabled = hasBlock(fs.readFileSync(file, 'utf8'));
  } catch {
    // No batch file yet.
  }
  return { available: true, enabled, path: file };
}

function setStartupEnabled(enabled, exePath, { directory = startupDirectory(), file = path.join(directory, FILE_NAME) } = {}) {
  if (!fs.existsSync(directory)) return { ok: false, error: 'The SalsaNOW folder was not found, so this only works inside a SalsaNOW session.' };
  try {
    const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (existing && !fs.existsSync(file + BACKUP_SUFFIX)) fs.writeFileSync(file + BACKUP_SUFFIX, existing);
    const next = applyStartupBlock(existing, exePath, enabled);
    if (next !== existing) fs.writeFileSync(file, next);
    return { ok: true, enabled };
  } catch (error) {
    return { ok: false, error: `Unable to update the startup batch file (${error.code || error.message}).` };
  }
}

module.exports = {
  applyStartupBlock,
  getStartupStatus,
  hasBlock,
  setStartupEnabled,
  startupBatchPath,
};
