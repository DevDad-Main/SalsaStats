const assert = require('node:assert/strict');
const test = require('node:test');
const { createFrameTracker } = require('../presentmon');

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
