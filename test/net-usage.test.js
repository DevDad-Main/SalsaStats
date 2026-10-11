const assert = require('node:assert/strict');
const test = require('node:test');
const { createNetUsageReader, findInterfaceCounters, parseStreamAdapterName } = require('../net-usage');

const NIC = 'Node,Name\r\nGFN,ConnectX Family mlx5Gen Virtual Function #4\r\n';
const counters = (streamSent, storageSent) => [
  'Node,BytesReceivedPersec,BytesSentPersec,Name',
  'GFN,1000,5,Red Hat VirtIO Ethernet Adapter',
  `GFN,2000,${streamSent},ConnectX Family mlx5Gen Virtual Function _4`,
  `GFN,9000,${storageSent},ConnectX Family mlx5Gen Virtual Function _5`,
].join('\r\n');

test('finds the STREAM adapter and matches its counter row despite renamed characters', () => {
  assert.equal(parseStreamAdapterName(NIC), 'ConnectX Family mlx5Gen Virtual Function #4');
  assert.deepEqual(findInterfaceCounters(counters(500, 800), 'ConnectX Family mlx5Gen Virtual Function #4'), { received: 2000, sent: 500 });
  assert.equal(findInterfaceCounters(counters(500, 800), 'Missing adapter'), null);
});

test('reports megabits per second for the STREAM adapter only', async () => {
  const outputs = [NIC, counters(0, 0), counters(25000000, 900000000)];
  const run = (_file, _args, _options, callback) => callback(null, outputs.shift());
  const read = createNetUsageReader(run);
  read(0);
  await new Promise(resolve => setImmediate(resolve));
  read(2000);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(Math.round(read(2001).sentMbps), 100);
});

test('stays empty when the machine has no STREAM adapter', async () => {
  const run = (_file, _args, _options, callback) => callback(null, 'Node,Name\r\n');
  const read = createNetUsageReader(run);
  read(0);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(read(2000), null);
});
