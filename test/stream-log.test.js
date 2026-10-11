const assert = require('node:assert/strict');
const test = require('node:test');
const { parseServiceLog, parseStreamLog } = require('../stream-log');

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
  assert.deepEqual(parseStreamLog(LOG), {
    quality: 95,
    rtd: 21,
    bandwidthScore: 100,
    lossScore: 99,
    latencyScore: 95,
    gameFps: 4.29,
    width: 3840,
    height: 2160,
    fps: 60,
    startBitrateMbps: 25,
    maxBitrateMbps: 100,
  });
});

test('returns nothing for a log without stream data', () => {
  assert.deepEqual(parseStreamLog('<NvStreamer> Using Grid mode.'), {});
});
