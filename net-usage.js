const { execFile } = require('node:child_process');

const REFRESH_MS = 2000;
const STREAM_CONNECTION = 'STREAM';

function normalizeName(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseCsv(output) {
  const lines = String(output || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(',');
  return lines.slice(1).map(line => {
    const cells = line.split(',');
    return Object.fromEntries(header.map((key, index) => [key, cells[index]]));
  });
}

// The adapter named STREAM carries the video; APP and STORAGE carry other traffic.
function parseStreamAdapterName(output) {
  const row = parseCsv(output).find(entry => entry.Name);
  return row ? row.Name : null;
}

function findInterfaceCounters(output, adapterName) {
  const wanted = normalizeName(adapterName);
  const row = parseCsv(output).find(entry => normalizeName(entry.Name) === wanted);
  if (!row) return null;
  const received = Number(row.BytesReceivedPersec);
  const sent = Number(row.BytesSentPersec);
  return Number.isFinite(received) && Number.isFinite(sent) ? { received, sent } : null;
}

function megabitsPerSecond(bytes, milliseconds) {
  return milliseconds > 0 ? (bytes * 8) / (milliseconds / 1000) / 1e6 : null;
}

// Per-adapter byte counters through wmic, which needs no administrator rights.
function createNetUsageReader(run = execFile) {
  let adapterName;
  let previous = null;
  let usage = null;
  let inFlight = false;
  let lastRefresh = -Infinity;

  const wmic = args => new Promise(resolve => {
    run('wmic.exe', args, { windowsHide: true, timeout: 8000 }, (error, stdout) => resolve(error ? null : stdout));
  });

  async function refresh(now) {
    inFlight = true;
    try {
      if (adapterName === undefined) {
        adapterName = parseStreamAdapterName(await wmic(['nic', 'where', `NetConnectionID="${STREAM_CONNECTION}"`, 'get', 'Name', '/format:csv']));
      }
      if (!adapterName) return;
      const totals = findInterfaceCounters(
        await wmic(['path', 'Win32_PerfRawData_Tcpip_NetworkInterface', 'get', 'Name,BytesReceivedPersec,BytesSentPersec', '/format:csv']),
        adapterName,
      );
      if (!totals) return;
      if (previous && totals.sent >= previous.sent && totals.received >= previous.received) {
        const elapsed = now - previous.at;
        usage = {
          sentMbps: megabitsPerSecond(totals.sent - previous.sent, elapsed),
          receivedMbps: megabitsPerSecond(totals.received - previous.received, elapsed),
        };
      }
      previous = { ...totals, at: now };
    } finally {
      inFlight = false;
    }
  }

  return function readNetUsage(now = Date.now()) {
    if (!inFlight && now - lastRefresh >= REFRESH_MS) {
      lastRefresh = now;
      refresh(now).catch(() => {});
    }
    return usage;
  };
}

module.exports = { createNetUsageReader, findInterfaceCounters, parseStreamAdapterName };
