const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  applyStartupBlock, clearFailedStarts, getStartupStatus, hasBlock, readFailedStarts, setStartupEnabled,
} = require('../startup-batch');

const EXE = 'C:\\Users\\kiosk\\AppData\\Local\\Programs\\salsastats\\SalsaStats.exe';
const COUNTER = 'C:\\Users\\kiosk\\AppData\\Roaming\\salsastats\\startup-failures.txt';

test('adds a guarded start block to a new batch file', () => {
  const text = applyStartupBlock('', EXE, COUNTER, true);
  assert.match(text, /^@echo off\r\n/);
  assert.match(text, /if not exist "%SS_EXE%" goto salsastats_end/);
  assert.match(text, /start "" "%SS_EXE%"/);
  assert.equal(hasBlock(text), true);
});

test('keeps existing batch content, adds the block last and removes only its own block', () => {
  const original = '@echo off\r\nstart "" "C:\\Tools\\other.exe"\r\nREM my note\r\n';
  const enabled = applyStartupBlock(original, EXE, COUNTER, true);
  assert.ok(enabled.startsWith(original.trimEnd()));
  assert.equal(applyStartupBlock(enabled, EXE, COUNTER, true), enabled);
  assert.equal(applyStartupBlock(enabled, EXE, COUNTER, false), original);
});

test('keeps LF line endings and escapes percent signs in paths', () => {
  const text = applyStartupBlock('@echo off\nstart "" "x.exe"\n', 'C:\\100%\\a.exe', COUNTER, true);
  assert.ok(!text.includes('\r'));
  assert.match(text, /100%%/);
});

test('reports availability and writes a backup before the first change', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'salsanow-'));
  try {
    const file = path.join(directory, 'StartupBatch.bat');
    const original = '@echo off\r\nstart "" "C:\\Tools\\other.exe"\r\n';
    fs.writeFileSync(file, original);
    assert.deepEqual(getStartupStatus({ directory }), { available: true, enabled: false, paused: false, path: file });
    assert.equal(setStartupEnabled(true, EXE, { directory, counterPath: COUNTER }).ok, true);
    assert.equal(getStartupStatus({ directory }).enabled, true);
    assert.equal(fs.readFileSync(`${file}.salsastats-backup`, 'utf8'), original);
    assert.equal(setStartupEnabled(false, EXE, { directory, counterPath: COUNTER }).ok, true);
    assert.equal(fs.readFileSync(file, 'utf8'), original);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('refuses to run when the SalsaNOW folder does not exist', () => {
  const directory = path.join(os.tmpdir(), 'salsanow-missing-folder');
  assert.equal(getStartupStatus({ directory }).available, false);
  assert.equal(setStartupEnabled(true, EXE, { directory, counterPath: COUNTER }).ok, false);
  assert.equal(fs.existsSync(directory), false);
});

test('the counter defaults to the SalsaNOW folder, so it survives between sessions', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'salsanow-default-'));
  try {
    const file = path.join(directory, 'StartupBatch.bat');
    const counter = path.join(directory, 'SalsaStatsFailures.txt');
    // Nothing may ever be written as a file named "undefined", wherever the batch runs from.
    assert.equal(setStartupEnabled(true, EXE, { directory }).ok, true);
    assert.ok(fs.readFileSync(file, 'utf8').includes(`set "SS_COUNT=${counter}"`));
    assert.equal(getStartupStatus({ directory }).paused, false);
    fs.writeFileSync(counter, '3');
    assert.equal(getStartupStatus({ directory }).paused, true, 'a full counter pauses automatic start');
    // Switching the option on again is a resume, so it starts from a clean counter.
    assert.equal(setStartupEnabled(true, EXE, { directory }).ok, true);
    assert.equal(readFailedStarts(counter), 0);
    assert.equal(getStartupStatus({ directory }).paused, false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('the generated batch stops launching after repeated failed starts and never blocks other commands', { skip: process.platform !== 'win32' }, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'salsanow-run-'));
  try {
    const counter = path.join(directory, 'startup-failures.txt');
    const marker = path.join(directory, 'after.txt');
    const batch = path.join(directory, 'StartupBatch.bat');
    const exe = path.join(process.env.SystemRoot, 'System32', 'whoami.exe');
    const run = () => {
      fs.rmSync(marker, { force: true });
      execFileSync('cmd.exe', ['/d', '/c', batch], { stdio: 'ignore', windowsHide: true });
      assert.ok(fs.existsSync(marker), 'commands after the block still ran');
    };
    const write = executable => fs.writeFileSync(batch, `${applyStartupBlock('@echo off\r\n', executable, counter, true)}echo done>"${marker}"\r\n`);

    write(path.join(directory, 'missing.exe'));
    run();
    assert.equal(fs.existsSync(counter), false, 'a missing exe is never launched or counted');

    write(exe);
    run();
    assert.equal(readFailedStarts(counter), 1);
    run();
    assert.equal(readFailedStarts(counter), 2);
    run();
    assert.equal(readFailedStarts(counter), 3);
    run();
    assert.equal(readFailedStarts(counter), 3, 'the fourth start is skipped');
    assert.equal(getStartupStatus({ directory, file: batch, counterPath: counter }).paused, true);

    clearFailedStarts(counter);
    run();
    assert.equal(readFailedStarts(counter), 1, 'a settled run resets the breaker');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
