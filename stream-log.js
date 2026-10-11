const fs = require('node:fs');
const path = require('node:path');

const STREAM_LOG_PATH = path.join(
  process.env.ProgramData || 'C:\\ProgramData',
  'NVIDIA Corporation', 'NvStream', 'NvStreamerCurrent.log',
);
const FIRST_READ_BYTES = 4 * 1024 * 1024;
const MAX_CHUNK_BYTES = 512 * 1024;
const POLL_MS = 1000;
const CLIENT_POLL_MS = 15000;
const SERVICE_CHUNK_BYTES = 8 * 1024 * 1024;
// The streamer log is flushed in bursts, so ride out quiet gaps before calling the session over.
const STALE_MS = 90000;

const QOS_PATTERN = /Frame Number: (\d+), Client Q-score: (\d+), RTD: (\d+) ms, BW score: (\d+), Loss score: (\d+), Latency score: (\d+), Avg Game FPS: ([\d.]+)/g;
const MODE_PATTERN = /Streaming mode changed to (\d+)x(\d+)@(\d+)/g;
const BITRATE_PATTERN = /Actual Bitrate: ([\d.]+)Mbps Max Bitrate: ([\d.]+)Mbps/g;
const SA_PATTERN = /SA Scores : Overall: ([\d.]+), Gpu: ([\d.]+), Server: ([\d.]+), Visual: ([\d.]+), Decoder: ([\d.]+), DownlinkLag: ([\d.]+), DownlinkCongestion: ([\d.]+), Uplink: ([\d.]+)/g;
const SA_LABELS = ['GPU', 'Server', 'Visual', 'Decoder', 'Downlink lag', 'Congestion', 'Uplink'];
const SERVICE_LOG_PATH = path.join(
  process.env.ProgramData || 'C:\\ProgramData',
  'NVIDIA Corporation', 'nvstreamsvc', 'nvstreamsvcCurrent.log',
);
const CLIENT_TYPE_PATTERN = /Client type is ([\w-]+)/g;
const CLIENT_MODE_PATTERN = /Client version \[([\d.]+)\] has requested \((\d+)x(\d+)@(\d+)Hz\) with HDR: (\w+)/g;
const BOTTLENECK_THRESHOLD = 0.9;
const CODEC_PATTERN = /Stream:\d+ (HEVC|H264|H\.264|AV1) video format selected/g;
const SURFACE_PATTERN = /Capture SurfaceFormat used: (\w+)/g;
const SURFACE_FORMATS = {
  yuv444_10: { chroma: '4:4:4', bits: 10 },
  yuv444: { chroma: '4:4:4', bits: 8 },
  yuv420_10: { chroma: '4:2:0', bits: 10 },
  p010: { chroma: '4:2:0', bits: 10 },
  nv12: { chroma: '4:2:0', bits: 8 },
  yuv420: { chroma: '4:2:0', bits: 8 },
};
const CODEC_NAMES = { HEVC: 'H.265', H264: 'H.264', 'H.264': 'H.264', AV1: 'AV1' };

function featureFlag(text, name) {
  const match = lastMatch(text, new RegExp(`\\(${name}:(True|False)\\)`, 'gi'));
  return match ? match[1].toLowerCase() === 'true' : undefined;
}

function lastMatch(text, pattern) {
  let found = null;
  for (const match of text.matchAll(pattern)) found = match;
  return found;
}

function parseServiceLog(text) {
  const result = {};
  const type = lastMatch(text, CLIENT_TYPE_PATTERN);
  if (type) result.clientType = type[1];
  const mode = lastMatch(text, CLIENT_MODE_PATTERN);
  if (mode) Object.assign(result, { clientVersion: mode[1], hdr: mode[5].toLowerCase() === 'enabled' });
  const codec = lastMatch(text, CODEC_PATTERN);
  if (codec) result.codec = CODEC_NAMES[codec[1]];
  const surface = SURFACE_FORMATS[lastMatch(text, SURFACE_PATTERN)?.[1]?.toLowerCase()];
  if (surface) Object.assign(result, { chroma: surface.chroma, bitDepth: surface.bits });
  for (const [key, name] of [['reflex', 'reflex'], ['cloudGsync', 'cloud gsync'], ['l4s', 'L4s enabled']]) {
    const value = featureFlag(text, name);
    if (value !== undefined) result[key] = value;
  }
  return result;
}

function parseStreamLog(text) {
  const result = {};
  const sa = lastMatch(text, SA_PATTERN);
  if (sa) {
    const parts = sa.slice(2, 9).map(Number);
    result.health = Math.round(Number(sa[1]) * 100);
    const worst = parts.reduce((low, value, index) => (value < parts[low] ? index : low), 0);
    result.bottleneck = parts[worst] < BOTTLENECK_THRESHOLD ? SA_LABELS[worst] : null;
  }
  const qos = lastMatch(text, QOS_PATTERN);
  if (qos) {
    Object.assign(result, {
      quality: Number(qos[2]),
      rtd: Number(qos[3]),
      bandwidthScore: Number(qos[4]),
      lossScore: Number(qos[5]),
      latencyScore: Number(qos[6]),
      gameFps: Number(qos[7]),
    });
  }
  const mode = lastMatch(text, MODE_PATTERN);
  if (mode) Object.assign(result, { width: Number(mode[1]), height: Number(mode[2]), fps: Number(mode[3]) });
  const bitrate = lastMatch(text, BITRATE_PATTERN);
  if (bitrate) Object.assign(result, { startBitrateMbps: Number(bitrate[1]), maxBitrateMbps: Number(bitrate[2]) });
  return result;
}

function createStreamLogReader(logPath = STREAM_LOG_PATH, servicePath = SERVICE_LOG_PATH, onStatus = null) {
  let sticky = {};
  let offset = -1;
  let lastGrowth = Date.now();
  let lastSize = 0;
  let lastStatus = null;
  let lastPoll = 0;
  let cached = null;
  let client = {};
  let clientOffset = 0;
  let lastClientPoll = 0;

  // Codec and client lines are written once at session start, so scan the service log incrementally.
  function readClient(now) {
    if (now - lastClientPoll < CLIENT_POLL_MS) return;
    lastClientPoll = now;
    try {
      const { size } = fs.statSync(servicePath);
      if (size < clientOffset) {
        client = {};
        clientOffset = 0;
      }
      if (size === clientOffset) return;
      const length = Math.min(size - clientOffset, SERVICE_CHUNK_BYTES);
      const buffer = Buffer.alloc(length);
      const fd = fs.openSync(servicePath, 'r');
      try {
        fs.readSync(fd, buffer, 0, length, clientOffset);
      } finally {
        fs.closeSync(fd);
      }
      clientOffset += length;
      client = { ...client, ...parseServiceLog(buffer.toString('utf8')) };
    } catch {
      client = {};
      clientOffset = 0;
    }
  }

  // Reads only the bytes added since the last poll, up to the last complete line.
  function readNew(fd, size) {
    if (offset < 0 || size < offset) {
      sticky = size < offset ? {} : sticky;
      offset = Math.max(0, size - FIRST_READ_BYTES);
    } else if (size - offset > MAX_CHUNK_BYTES) {
      offset = size - MAX_CHUNK_BYTES;
    }
    const length = size - offset;
    if (length <= 0) return '';
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, offset);
    const end = buffer.lastIndexOf(10) + 1;
    if (end === 0) return '';
    offset += end;
    return buffer.toString('utf8', 0, end);
  }

  function setStatus(status) {
    if (status === lastStatus) return;
    lastStatus = status;
    if (onStatus) onStatus(status);
  }

  // File times on a log held open by another process lag behind, so liveness comes from growth.
  return function readStream(now = Date.now()) {
    if (now - lastPoll < POLL_MS) return cached;
    lastPoll = now;
    let fd;
    try {
      fd = fs.openSync(logPath, 'r');
      const { size } = fs.fstatSync(fd);
      if (size !== lastSize) lastGrowth = now;
      lastSize = size;
      if (size === 0 || now - lastGrowth > STALE_MS) {
        cached = null;
        sticky = {};
        offset = -1;
        setStatus('idle');
        return cached;
      }
      readClient(now);
      sticky = { ...sticky, ...parseStreamLog(readNew(fd, size)) };
      cached = Number.isFinite(sticky.rtd) ? { ...sticky, ...client } : null;
      setStatus(cached ? 'ok' : 'no-qos-data');
    } catch (error) {
      setStatus(`error:${error.code || error.message}`);
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
    return cached;
  };
}

module.exports = { createStreamLogReader, parseServiceLog, parseStreamLog };
