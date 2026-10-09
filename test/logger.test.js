const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createLogger } = require('../logger');

function withTempDirectory(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'salsastats-'));
  try {
    run(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('persists the selected log directory and writes structured records', () => {
  withTempDirectory(root => {
    const fallbackDirectory = path.join(root, 'default-logs');
    const settingsPath = path.join(root, 'settings', 'log-directory.json');
    const selectedDirectory = path.join(root, 'selected-logs');
    const logger = createLogger({ fallbackDirectory });

    logger.initialize({ defaultDirectory: fallbackDirectory, settingsPath });
    logger.setDirectory(selectedDirectory);
    logger.writeSync('error', 'A test failure.', new Error('example'));

    const record = JSON.parse(fs.readFileSync(path.join(selectedDirectory, 'salsastats.log'), 'utf8').trim().split('\n').at(-1));
    assert.equal(record.level, 'error');
    assert.equal(record.message, 'A test failure.');
    assert.equal(record.details.message, 'example');

    const restored = createLogger({ fallbackDirectory });
    restored.initialize({ defaultDirectory: fallbackDirectory, settingsPath });
    assert.equal(restored.getDirectory(), selectedDirectory);
  });
});

test('rotates logs and retains only the configured number of backups', () => {
  withTempDirectory(root => {
    const logger = createLogger({ fallbackDirectory: root, maxBytes: 256, backupCount: 2 });
    logger.initialize({ defaultDirectory: root });

    for (let index = 0; index < 8; index += 1) {
      logger.writeSync('error', `Failure ${index}: ${'x'.repeat(100)}`);
    }

    assert.ok(fs.existsSync(path.join(root, 'salsastats.log')));
    assert.ok(fs.existsSync(path.join(root, 'salsastats.log.1')));
    assert.ok(fs.existsSync(path.join(root, 'salsastats.log.2')));
    assert.equal(fs.existsSync(path.join(root, 'salsastats.log.3')), false);
  });
});

test('rejects an unwritable selected directory and keeps the fallback active', () => {
  withTempDirectory(root => {
    const fallbackDirectory = path.join(root, 'default-logs');
    const blockedPath = path.join(root, 'not-a-directory');
    fs.writeFileSync(blockedPath, 'file');

    const logger = createLogger({ fallbackDirectory });
    logger.initialize({ defaultDirectory: fallbackDirectory });
    assert.throws(() => logger.setDirectory(blockedPath));
    assert.equal(logger.getDirectory(), fallbackDirectory);
    assert.ok(logger.writeSync('error', 'Fallback still works.'));
  });
});

test('switches to the fallback if the selected directory later becomes unavailable', () => {
  withTempDirectory(root => {
    const fallbackDirectory = path.join(root, 'default-logs');
    const selectedDirectory = path.join(root, 'selected-logs');
    const logger = createLogger({ fallbackDirectory });
    logger.initialize({ defaultDirectory: fallbackDirectory });
    logger.setDirectory(selectedDirectory);

    fs.rmSync(selectedDirectory, { recursive: true, force: true });
    fs.writeFileSync(selectedDirectory, 'no longer a directory');
    const logFile = logger.writeSync('error', 'Fallback after path failure.');

    assert.equal(logger.getDirectory(), fallbackDirectory);
    assert.equal(logFile, path.join(fallbackDirectory, 'salsastats.log'));
    const records = fs.readFileSync(logFile, 'utf8').trim().split('\n').map(JSON.parse);
    assert.ok(records.some(record => record.message.includes('unavailable')));
    assert.ok(records.some(record => record.message === 'Fallback after path failure.'));
  });
});