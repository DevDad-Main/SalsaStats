const { execFile } = require('node:child_process');

const REFRESH_MS = 2000;
const BYTES_PATTERN = /^\s*Bytes\s+(\d+)\s+(\d+)/im;

function parseNetstatBytes(output) {
  const match = BYTES_PATTERN.exec(String(output || ''));
  return match ? { received: Number(match[1]), sent: Number(match[2]) } : null;
}

function megabitsPerSecond(bytes, milliseconds) {
  return milliseconds > 0 ? (bytes * 8) / (milliseconds / 1000) / 1e6 : null;
}

// Interface byte totals from `netstat -e`, which works without administrator rights.
function createNetUsageReader(run = execFile) {
  let previous = null;
  let usage = null;
  let inFlight = false;
  let lastRefresh = -Infinity;

  function refresh(now) {
    inFlight = true;
    run('netstat.exe', ['-e'], { windowsHide: true, timeout: 5000 }, (error, stdout) => {
      inFlight = false;
      const totals = error ? null : parseNetstatBytes(stdout);
      if (!totals) return;
      if (previous && totals.sent >= previous.sent && totals.received >= previous.received) {
        const elapsed = now - previous.at;
        usage = {
          sentMbps: megabitsPerSecond(totals.sent - previous.sent, elapsed),
          receivedMbps: megabitsPerSecond(totals.received - previous.received, elapsed),
        };
      }
      previous = { ...totals, at: now };
    });
  }

  return function readNetUsage(now = Date.now()) {
    if (!inFlight && now - lastRefresh >= REFRESH_MS) {
      lastRefresh = now;
      refresh(now);
    }
    return usage;
  };
}

module.exports = { createNetUsageReader, parseNetstatBytes };
