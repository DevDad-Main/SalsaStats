const assert = require('node:assert/strict');
const test = require('node:test');
const { summarize } = require('../network');

test('summarises ping, jitter and loss', () => {
  const result = summarize([20, 30, null, 40]);
  assert.equal(Math.round(result.pingMs), 30);
  assert.equal(Math.round(result.jitterMs), 10);
  assert.equal(result.lossPct, 25);
});

test('reports no ping when every probe fails', () => {
  const result = summarize([null, null]);
  assert.equal(result.pingMs, null);
  assert.equal(result.jitterMs, null);
  assert.equal(result.lossPct, 100);
  assert.equal(summarize([]), null);
});
