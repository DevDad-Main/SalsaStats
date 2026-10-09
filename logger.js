const fs = require('node:fs');
const path = require('node:path');

const MAX_RECORD_LENGTH = 16000;

function normalizeDetails(details) {
  if (details === undefined) return undefined;

  let value = details;
  if (details instanceof Error) {
    value = {
      name: details.name,
      message: details.message,
      stack: details.stack,
      cause: details.cause instanceof Error ? details.cause.message : details.cause,
    };
  }

  try {
    const serialized = JSON.stringify(value);
    if (serialized.length > MAX_RECORD_LENGTH) {
      return { truncated: serialized.slice(0, MAX_RECORD_LENGTH) };
    }
    return JSON.parse(serialized);
  } catch {
    return String(value).slice(0, MAX_RECORD_LENGTH);
  }
}

function createLogger({
  fallbackDirectory = path.join(process.cwd(), 'logs'),
  maxBytes = 2 * 1024 * 1024,
  backupCount = 3,
} = {}) {
  let defaultDirectory = path.resolve(fallbackDirectory);
  let activeDirectory = defaultDirectory;
  let settingsFile;

  function logFile(directory = activeDirectory) {
    return path.join(directory, 'salsastats.log');
  }

  function testDirectory(directory) {
    fs.mkdirSync(directory, { recursive: true });
    const probe = path.join(directory, `.salsastats-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`);
    try {
      fs.writeFileSync(probe, '', { flag: 'wx' });
    } finally {
      try {
        fs.unlinkSync(probe);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  }

  function moveIfPresent(source, destination) {
    if (!fs.existsSync(source)) return;
    if (fs.existsSync(destination)) fs.unlinkSync(destination);
    fs.renameSync(source, destination);
  }

  function rotateIfNeeded(directory) {
    const file = logFile(directory);
    if (!fs.existsSync(file) || fs.statSync(file).size < maxBytes) return;

    if (backupCount < 1) {
      fs.unlinkSync(file);
      return;
    }

    const oldestBackup = `${file}.${backupCount}`;
    if (fs.existsSync(oldestBackup)) fs.unlinkSync(oldestBackup);
    for (let index = backupCount - 1; index >= 1; index -= 1) {
      moveIfPresent(`${file}.${index}`, `${file}.${index + 1}`);
    }
    moveIfPresent(file, `${file}.1`);
  }

  function writeSync(level, message, details) {
    const record = {
      timestamp: new Date().toISOString(),
      level: String(level).slice(0, 16),
      message: String(message).slice(0, 2000),
    };
    const normalizedDetails = normalizeDetails(details);
    if (normalizedDetails !== undefined) record.details = normalizedDetails;
    const line = `${JSON.stringify(record)}\n`;
    const directories = [...new Set([activeDirectory, defaultDirectory])];
    let lastError;

    for (const directory of directories) {
      try {
        fs.mkdirSync(directory, { recursive: true });
        rotateIfNeeded(directory);
        if (directory !== activeDirectory) {
          const fallbackRecord = {
            timestamp: new Date().toISOString(),
            level: 'warn',
            message: 'Configured log folder is unavailable; using the default folder.',
            details: { previousDirectory: activeDirectory, error: lastError?.message },
          };
          activeDirectory = directory;
          fs.appendFileSync(logFile(directory), `${JSON.stringify(fallbackRecord)}\n`, 'utf8');
        }
        fs.appendFileSync(logFile(directory), line, 'utf8');
        return logFile(directory);
      } catch (error) {
        lastError = error;
      }
    }

    try {
      process.stderr.write(`SalsaStats could not write its log: ${lastError?.message || 'unknown error'}\n`);
    } catch {}
    return null;
  }

  function initialize({ defaultDirectory: preferredDefault, settingsPath } = {}) {
    if (preferredDefault) defaultDirectory = path.resolve(preferredDefault);
    activeDirectory = defaultDirectory;
    settingsFile = settingsPath ? path.resolve(settingsPath) : undefined;

    if (settingsFile) {
      try {
        const saved = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
        if (typeof saved.directory === 'string') {
          const savedDirectory = path.resolve(saved.directory);
          testDirectory(savedDirectory);
          activeDirectory = savedDirectory;
        }
      } catch (error) {
        if (error.code !== 'ENOENT') {
          writeSync('warn', 'Saved log directory could not be used; using the default.', error);
        }
      }
    }

    writeSync('info', 'Logging initialized.', { directory: activeDirectory });
    return activeDirectory;
  }

  function setDirectory(directory) {
    if (typeof directory !== 'string' || !directory.trim()) {
      throw new TypeError('A log directory must be selected.');
    }

    const resolvedDirectory = path.resolve(directory);
    testDirectory(resolvedDirectory);
    if (settingsFile) {
      fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
      const temporaryFile = `${settingsFile}.${process.pid}.tmp`;
      fs.writeFileSync(temporaryFile, JSON.stringify({ directory: resolvedDirectory }, null, 2), 'utf8');
      try {
        fs.renameSync(temporaryFile, settingsFile);
      } catch (error) {
        try {
          fs.unlinkSync(temporaryFile);
        } catch {}
        throw error;
      }
    }

    activeDirectory = resolvedDirectory;
    writeSync('info', 'Log directory changed.', { directory: activeDirectory });
    return activeDirectory;
  }

  return {
    initialize,
    setDirectory,
    getDirectory: () => activeDirectory,
    getLogFilePath: () => logFile(),
    writeSync,
  };
}

module.exports = { createLogger };