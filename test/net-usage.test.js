const assert = require('node:assert/strict');
const test = require('node:test');
const { createNetUsageReader, parseNetstatBytes } = require('../net-usage');

const OUTPUT = [
  'Interface Statistics',
  '',
  '                           Received            Sent',
  '',
  'Bytes                   3454336024      1428613848',
  'Unicast packets            3584444         2857760',
].join('\r\n');

test('reads total bytes from netstat -e output', () => {
  assert.deepEqual(parseNetstatBytes(OUTPUT), { received: 3454336024, sent: 1428613848 });
  assert.equal(parseNetstatBytes('nothing useful'), null);
});

test('turns byte deltas into megabits per second', () => {
  const outputs = [
    OUTPUT,
    OUTPUT.replace('1428613848', String(1428613848 + 25000000)).replace('3454336024', String(3454336024 + 1000000)),
  ];
  const run = (_file, _args, _options, callback) => callback(null, outputs.shift());
  const read = createNetUsageReader(run);
  assert.equal(read(0), null);
  const usage = read(2000);
  assert.equal(Math.round(usage.sentMbps), 100);
  assert.equal(Math.round(usage.receivedMbps), 4);
});
