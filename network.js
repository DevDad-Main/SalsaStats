const net = require('node:net');

const WINDOW = 12;

// Rolling ping, jitter and loss from the last WINDOW probes (null entries are failures).
function summarize(samples) {
  if (!samples.length) return null;
  const ok = samples.filter(value => value !== null);
  const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
  let jitter = null;
  if (ok.length > 1) {
    const diffs = ok.slice(1).map((value, index) => Math.abs(value - ok[index]));
    jitter = mean(diffs);
  }
  return {
    pingMs: ok.length ? mean(ok) : null,
    jitterMs: jitter,
    lossPct: Math.round((100 * (samples.length - ok.length)) / samples.length),
  };
}

function createNetworkProbe({ intervalMs = 4000, timeoutMs = 2000 } = {}) {
  let timer = null;
  let target = null;
  let samples = [];

  function probe() {
    if (!target) return;
    const started = process.hrtime.bigint();
    let finished = false;
    const socket = net.connect({ host: target.host, port: target.port });
    const finish = ok => {
      if (finished) return;
      finished = true;
      socket.destroy();
      samples.push(ok ? Number(process.hrtime.bigint() - started) / 1e6 : null);
      if (samples.length > WINDOW) samples.shift();
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  }

  function stop() {
    clearInterval(timer);
    timer = null;
    target = null;
    samples = [];
  }

  function start(host, port = 443) {
    stop();
    if (!/^[A-Za-z0-9.-]{1,100}$/.test(String(host)) || !Number.isInteger(port) || port < 1 || port > 65535) return false;
    target = { host, port };
    probe();
    timer = setInterval(probe, intervalMs);
    timer.unref();
    return true;
  }

  return { start, stop, getStats: () => summarize(samples) };
}

module.exports = { createNetworkProbe, summarize };
