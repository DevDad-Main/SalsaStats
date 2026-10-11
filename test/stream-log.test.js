const assert = require('node:assert/strict');
const test = require('node:test');
const { createStreamLogReader, parseServiceLog, parseStreamLog } = require('../stream-log');

test('reads stream health and names the weakest link below the threshold', () => {
  const line = 'Frame Number: 1, SA Scores : Overall: 0.82, Gpu: 0.99, Server: 1.00, Visual: 0.99, Decoder: 0.55, DownlinkLag: 0.98, DownlinkCongestion: 1.00, Uplink: 0.94, WiFiScan: 0.00, Throttling: 0.00';
  assert.deepEqual(parseStreamLog(line), { health: 82, bottleneck: 'Decoder' });
  assert.equal(parseStreamLog(line.replace('Decoder: 0.55', 'Decoder: 0.95')).bottleneck, null);
});

test('reads the active codec, surface format and stream features from the service log', () => {
  const text = [
    'Capture SurfaceFormat used: yuv444_10',
    'Stream:0 HEVC video format selected',
    'Subscribed streaming features are (reflex:True), (cloud gsync:True), (Bit Depth:10), (L4s enabled:True) (TrueHdr:False), (Chroma Format:YUV444)',
  ].join('\n');
  assert.deepEqual(parseServiceLog(text), {
    codec: 'H.265', chroma: '4:4:4', bitDepth: 10, reflex: true, cloudGsync: true, l4s: true,
  });
});

test('reads client type, version and HDR from the service log', () => {
  const text = 'Mode selection: Client version [30.0] has requested (3840x2160@60Hz) with HDR: disabled | audio mode: 2\nClient type is GFN-PC, 3840x2160@60Hz is supported directly.';
  assert.deepEqual(parseServiceLog(text), { clientType: 'GFN-PC', clientVersion: '30.0', hdr: false });
});

const LOG = [
  '<QosManagerTxNati> Bitrate params Initial Bitrate: 25.0Mbps Actual Bitrate: 25.0Mbps Max Bitrate: 100.0Mbps Min Bitrate: 1.0Mbps',
  '<ResolutionManage> [0] Streaming mode changed to 3840x2160@60 with max rate [100000000.000000]',
  '<QosManagerTxNati> Frame Number: 69339, Client Q-score: 90, RTD: 30 ms, BW score: 100, Loss score: 100, Latency score: 90, Avg Game FPS: 5.82',
  '<QosManagerTxNati> Frame Number: 69431, Client Q-score: 95, RTD: 21 ms, BW score: 100, Loss score: 99, Latency score: 95, Avg Game FPS: 4.29',
].join('\n');

test('reads the latest QoS sample and the stream mode from the streamer log', () => {
  const result = parseStreamLog(LOG);
  assert.deepEqual(result, {
    quality: 95,
    rtd: 21,
    bandwidthScore: 100,
    lossScore: 99,
    latencyScore: 95,
    gameFps: 4.29,
    qosFrame: 69431,
    qosAt: null,
    chunkSamples: 2,
    chunkLossDips: 1,
    width: 3840,
    height: 2160,
    fps: 60,
    startBitrateMbps: 25,
    maxBitrateMbps: 100,
  });
});

test('reads the UTC timestamp of a QoS line', () => {
  const line = '#1(I)[2026-10-11 05:47:17,886]=07:47:17*00002*{0000b38}&D9F5C687&^0001^<QosManagerTxNati> Frame Number: 5, Client Q-score: 95, RTD: 21 ms, BW score: 100, Loss score: 100, Latency score: 95, Avg Game FPS: 5.0';
  assert.equal(parseStreamLog(line).qosAt, Date.UTC(2026, 9, 11, 5, 47, 17, 886));
});

test('reader follows new log lines, derives stream FPS and counts loss dips', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'stream-')), 'log.txt');
  const line = (second, frame, rtd, loss) => `#1(I)[2026-10-11 05:47:${String(second).padStart(2, '0')},000]=x^0001^<QosManagerTxNati> Frame Number: ${frame}, Client Q-score: 95, RTD: ${rtd} ms, BW score: 100, Loss score: ${loss}, Latency score: 95, Avg Game FPS: 5.0\n`;
  try {
    fs.writeFileSync(file, line(10, 100, 21, 100));
    const read = createStreamLogReader(file, file);
    const base = Date.UTC(2026, 9, 11, 5, 47, 10);
    assert.equal(read(base).rtd, 21);
    fs.appendFileSync(file, line(12, 220, 30, 90));
    const next = read(base + 2000);
    assert.equal(next.rtd, 30);
    assert.equal(next.streamFps, 60);
    assert.equal(next.lossDips, 1);
    assert.equal(next.samples, 2);
    assert.equal(next.ageMs, 0);
    assert.equal(next.live, true);
    assert.equal(read(base + 2000 + 60000).live, false);
  } finally {
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  }
});


test('returns nothing for a log without stream data', () => {
  assert.deepEqual(parseStreamLog('<NvStreamer> Using Grid mode.'), {});
});
