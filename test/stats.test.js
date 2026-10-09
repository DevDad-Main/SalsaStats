const assert = require('node:assert/strict');
const test = require('node:test');
const {
  parseNvidiaSmiOutput,
  parseTypeperfGpuMemoryOutput,
  parseWmiGpuAdapterMemoryListOutput,
  parseWmiGpuAdapterMemoryOutput,
  parseWmiGpuEngineOutput,
  parseWmiGpuNames,
  resolveCpuName,
  selectGpuController,
  selectPhysicalGpuName,
} = require('../stats');

test('uses the operating system CPU model when systeminformation omits the brand', () => {
  assert.equal(resolveCpuName({ brand: '', manufacturer: 'AMD' }, 'AMD Ryzen 7 Processor'), 'AMD Ryzen 7 Processor');
});

test('prefers systeminformation brand and then manufacturer as CPU-name fallbacks', () => {
  assert.equal(resolveCpuName({ brand: 'Intel Core i5', manufacturer: 'Intel' }, 'Other model'), 'Intel Core i5');
  assert.equal(resolveCpuName({ brand: '', manufacturer: 'AMD' }, ''), 'AMD');
});

test('selects the physical NVIDIA GPU when virtual adapters are listed first', () => {
  const nvidia = {
    vendor: 'NVIDIA',
    model: 'NVIDIA GeForce RTX 5080',
    utilizationGpu: 42,
    temperatureGpu: 61,
    memoryTotal: 16384,
  };
  const selected = selectGpuController([
    { vendor: 'RealVNC', model: 'VNC Mirror Driver' },
    { vendor: 'Microsoft', model: 'Microsoft Basic Display Adapter' },
    nvidia,
  ]);

  assert.equal(selected, nvidia);
});

test('prefers an adapter with live readings over one with only a name', () => {
  const telemetryAdapter = { vendor: 'AMD', model: 'Radeon', utilizationGpu: 18 };
  const namedAdapter = { vendor: 'NVIDIA', model: 'GeForce adapter' };

  assert.equal(selectGpuController([namedAdapter, telemetryAdapter]), telemetryAdapter);
});

test('does not report a virtual display driver as the GPU', () => {
  assert.deepEqual(selectGpuController([
    { vendor: 'RealVNC', model: 'VNC Mirror Driver' },
    { vendor: 'Microsoft', model: 'Microsoft Basic Display Adapter' },
  ]), {});
});

test('parses WMI names and selects the physical adapter', () => {
  const names = parseWmiGpuNames([
    'Node=GFN-SESSION',
    'Name=RealVNC VNC Mirror Driver',
    'Name=Microsoft Basic Display Adapter',
    'Name=NVIDIA GeForce RTX 5080',
  ].join('\r\n'));

  assert.deepEqual(names, [
    'RealVNC VNC Mirror Driver',
    'Microsoft Basic Display Adapter',
    'NVIDIA GeForce RTX 5080',
  ]);
  assert.equal(selectPhysicalGpuName(names), 'NVIDIA GeForce RTX 5080');
});

test('parses NVIDIA-SMI utilization and sensor readings', () => {
  assert.deepEqual(parseNvidiaSmiOutput(
    'NVIDIA GeForce RTX 5080, 45, 62, 1234, 16384, 120.5, 1820\r\n',
  ), {
    name: 'NVIDIA GeForce RTX 5080',
    utilizationGpu: 45,
    temperatureGpu: 62,
    memoryUsed: 1234,
    memoryTotal: 16384,
    powerDraw: 120.5,
    clockCore: 1820,
  });
  assert.equal(parseNvidiaSmiOutput(
    'NVIDIA GeForce RTX 5080, N/A, N/A, N/A, N/A, N/A, N/A',
  ).utilizationGpu, null);
});

test('aggregates WMI GPU engine utilization by adapter and engine type', () => {
  const output = [
    'Node,Name,UtilizationPercentage',
    'GFN,GEFORCE-NOW,pid_812_luid_0x0000_phys_0_eng_8_engtype_3D,20',
    'GFN,AnotherProcess,pid_912_luid_0x0000_phys_0_eng_9_engtype_3D,35',
    'GFN,GEFORCE-NOW,pid_812_luid_0x0000_phys_0_eng_10_engtype_VideoDecode,12',
  ].join('\r\n');

  assert.equal(parseWmiGpuEngineOutput(output), 55);
  assert.equal(parseWmiGpuEngineOutput('Node,Name,UtilizationPercentage\r\n'), null);
});

test('converts WMI dedicated GPU memory counters from bytes to MiB', () => {
  const output = [
    'Node,Name,DedicatedUsage,SharedUsage,TotalCommitted',
    'GFN,luid_0x0000_phys_0,2147483648,0,2147483648',
  ].join('\r\n');

  assert.deepEqual(parseWmiGpuAdapterMemoryOutput(output), {
    memoryUsed: 2048,
    memoryTotal: null,
    adapterName: 'luid_0x0000_phys_0',
  });
});

test('parses the GeForce NOW list-format adapter-memory output with multiple adapters', () => {
  const output = [
    'Caption=',
    'DedicatedUsage=2377986048',
    'Description=',
    'Frequency_Object=',
    'Frequency_PerfTime=',
    'Frequency_Sys100NS=',
    'Name=luid_0x00000000_0x0016DEE9_phys_0',
    'SharedUsage=396124160',
    'Timestamp_Object=',
    'Timestamp_PerfTime=',
    'Timestamp_Sys100NS=',
    'TotalCommitted=2989006848',
    '',
    'Caption=',
    'DedicatedUsage=0',
    'Description=',
    'Name=luid_0x00000000_0x0000EEE6_phys_0',
    'SharedUsage=16384',
    'TotalCommitted=13684736',
    '',
  ].join('\r\n');

  assert.deepEqual(parseWmiGpuAdapterMemoryListOutput(output), {
    memoryUsed: 2377986048 / 1024 ** 2,
    memoryTotal: null,
    adapterName: 'luid_0x00000000_0x0016DEE9_phys_0',
  });
});

test('parses typeperf GPU adapter memory output and picks the busiest adapter', () => {
  const output = [
    '"(PDH-CSV 4.0)","\\\\GEFORCE-NOW\\GPU Adapter Memory(luid_0x00000000_0x0000EEE6_phys_0)\\Dedicated Usage","\\\\GEFORCE-NOW\\GPU Adapter Memory(luid_0x00000000_0x0016DEE9_phys_0)\\Dedicated Usage"',
    '"10/09/2026 23:00:04.197","0.000000","2350751744.000000"',
    '"10/09/2026 23:00:05.198","0.000000","2350751744.000000"',
    '',
    'The command completed successfully.',
    '',
  ].join('\r\n');

  assert.deepEqual(parseTypeperfGpuMemoryOutput(output), {
    memoryUsed: 2350751744 / 1024 ** 2,
    memoryTotal: null,
    adapterName: 'luid_0x00000000_0x0016DEE9_phys_0',
  });
});