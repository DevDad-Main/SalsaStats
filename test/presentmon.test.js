const assert = require('node:assert/strict');
const test = require('node:test');
const { createFrameTracker, pickDisplayName } = require('../presentmon');

const HEADER = 'Application,ProcessID,SwapChainAddress,MsBetweenPresents';

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
