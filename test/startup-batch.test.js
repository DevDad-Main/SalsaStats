const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { applyStartupBlock, getStartupStatus, hasBlock, setStartupEnabled } = require('../startup-batch');

const EXE = 'C:\\Users\\kiosk\\AppData\\Local\\Programs\\salsastats\\SalsaStats.exe';

test('adds a marked start line to a new batch file', () => {
  const text = applyStartupBlock('', EXE, true);
  assert.match(text, /^@echo off\r\n/);
  assert.match(text, /start "" "C:\\Users\\kiosk\\AppData\\Local\\Programs\\salsastats\\SalsaStats\.exe"/);
  assert.equal(hasBlock(text), true);
});

test('keeps existing batch content and removes only its own block', () => {
  const original = '@echo off\r\nstart "" "C:\\Tools\\other.exe"\r\nREM my note\r\n';
  const enabled = applyStartupBlock(original, EXE, true);
  assert.ok(enabled.startsWith(original.trimEnd()));
  assert.equal(applyStartupBlock(enabled, EXE, true), enabled);
  assert.equal(applyStartupBlock(enabled, EXE, false), original);
});

test('keeps LF line endings and escapes percent signs', () => {
  const text = applyStartupBlock('@echo off\nstart "" "x.exe"\n', 'C:\\100%\\a.exe', true);
  assert.ok(!text.includes('\r'));
  assert.match(text, /100%%/);
});

test('reports availability and writes a backup before the first change', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'salsanow-'));
  try {
    const file = path.join(directory, 'StartupBatch.bat');
    fs.writeFileSync(file, '@echo off\r\nstart "" "C:\\Tools\\other.exe"\r\n');
    assert.deepEqual(getStartupStatus({ directory }), { available: true, enabled: false, path: file });
    assert.equal(setStartupEnabled(true, EXE, { directory }).ok, true);
    assert.equal(getStartupStatus({ directory }).enabled, true);
    assert.equal(fs.readFileSync(`${file}.salsastats-backup`, 'utf8'), '@echo off\r\nstart "" "C:\\Tools\\other.exe"\r\n');
    assert.equal(setStartupEnabled(false, EXE, { directory }).ok, true);
    assert.equal(fs.readFileSync(file, 'utf8'), '@echo off\r\nstart "" "C:\\Tools\\other.exe"\r\n');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('refuses to run when the SalsaNOW folder does not exist', () => {
  const directory = path.join(os.tmpdir(), 'salsanow-missing-folder');
  assert.equal(getStartupStatus({ directory }).available, false);
  assert.equal(setStartupEnabled(true, EXE, { directory }).ok, false);
  assert.equal(fs.existsSync(directory), false);
});
