const assert = require('node:assert/strict');
const test = require('node:test');
const { createFrameTracker, pickDisplayName } = require('../presentmon');

const HEADER = 'Application,ProcessID,SwapChainAddress,MsBetweenPresents';
const DETAIL_HEADER = `${HEADER},MsCPUBusy,MsGPUBusy,MsClickToPhotonLatency,SyncInterval,AllowsTearing,PresentMode,FrameType,VideoBusy`;

test('retains optional timing, sync, frame-type, and video metrics', () => {
  const tracker = createFrameTracker();
  tracker.ingestLine(DETAIL_HEADER, 0);
  for (let index = 0; index < 10; index += 1) {
    tracker.ingestLine(`game.exe,10,0x1,16.7,5,12,22,1,true,Hardware: Independent Flip,${index < 8 ? 'Application' : 'Generated'},3`, 1000 + index * 10);
  }

  const result = tracker.snapshot(1100);
  assert.equal(result.cpuBusy, 5);
  assert.equal(result.gpuBusy, 12);
  assert.equal(result.clickToPhotonLatency, 22);
  assert.equal(result.syncInterval, 1);
  assert.equal(result.allowsTearing, true);
  assert.equal(result.presentMode, 'Hardware: Independent Flip');
  assert.equal(result.frameType, 'Generated');
  assert.equal(result.videoBusy, 3);
});

test('keeps optional PresentMon metrics null when columns or values are absent', () => {
  const tracker = createFrameTracker();
  tracker.ingestLine(HEADER, 0);
  for (let index = 0; index < 4; index += 1) tracker.ingestLine(`game.exe,10,0x1,16.7`, 1000 + index * 10);

  const result = tracker.snapshot(1040);
  assert.equal(result.cpuBusy, null);
  assert.equal(result.clickToPhotonLatency, null);
  assert.equal(result.presentMode, null);
});

test('reports fps, average and 1% low for the busiest game process', () => {
  const tracker = createFrameTracker();
  tracker.ingestLine(HEADER, 0);
  for (let i = 0; i < 100; i += 1) tracker.ingestLine(`game.exe,10,0x1,${i === 50 ? 50 : 10}`, 1000 + i * 10);
  tracker.ingestLine('chrome.exe,20,0x2,16.7', 1990);

  const result = tracker.snapshot(2000);
  assert.equal(result.application, 'game.exe');
  assert.equal(result.current, 96);
  assert.equal(result.low, 20);
  assert.equal(result.average, 96);
});

test('ignores system processes and stale frames', () => {
  const tracker = createFrameTracker();
  tracker.ingestLine(HEADER, 0);
  for (let i = 0; i < 10; i += 1) tracker.ingestLine('dwm.exe,4,0x1,16.7', 1000 + i);
  assert.equal(tracker.snapshot(1100), null);

  tracker.ingestLine('game.exe,10,0x1,10', 1000);
  assert.equal(tracker.snapshot(60000), null);
});

test('falls back to the FrameTime column', () => {
  const tracker = createFrameTracker();
  tracker.ingestLine('Application,ProcessID,FrameTime', 0);
  for (let i = 0; i < 5; i += 1) tracker.ingestLine('game.exe,10,8', 1000 + i);
  assert.equal(tracker.snapshot(1100).current, 125);
});

test('prefers named processes and resolves unknown ones', () => {
  const tracker = createFrameTracker();
  tracker.ingestLine(HEADER, 0);
  for (let i = 0; i < 20; i += 1) tracker.ingestLine('<unknown>,7,0x1,8', 1000 + i);
  for (let i = 0; i < 5; i += 1) tracker.ingestLine('game.exe,10,0x1,16', 1000 + i);
  assert.equal(tracker.snapshot(1100).application, 'game.exe');

  assert.deepEqual(tracker.pendingLookups().sort(), ['10', '7']);
  assert.deepEqual(tracker.pendingLookups(), []);
  tracker.setInfo('10', { name: 'game.exe', title: 'My Game', product: 'ignored' });
  assert.equal(tracker.snapshot(1100).displayName, 'My Game');
  tracker.setInfo('7', { name: 'dwm.exe' });
  assert.equal(tracker.snapshot(1100).application, 'game.exe');
});

test('picks a presentable display name with an executable fallback', () => {
  assert.equal(pickDisplayName('b1-Win64-Shipping.exe', { title: 'Black Myth: Wukong ' }), 'Black Myth: Wukong');
  assert.equal(pickDisplayName('b1-Win64-Shipping.exe', { title: '', product: 'Black Myth: Wukong' }), 'Black Myth: Wukong');
  assert.equal(pickDisplayName('game.exe', { title: 'game', product: 'Unreal Engine' }), 'game.exe');
  assert.equal(pickDisplayName('game.exe', null || {}), 'game.exe');
});
