const assert = require('node:assert/strict');
const test = require('node:test');
const {
  parseCimDiskCounters,
  parseCimGpuEngineOutput,
  parseCimGpuMemoryRows,
  parseCimGpuNames,
  parseNvidiaSmiOutput,
  parseVideoEncoderLoad,
  parseWmicCsv,
  resolveCpuName,
  resolveGfnRig,
  selectGpuController,
  selectPhysicalGpuName,
} = require('../stats');

test('maps auto-detected RTX names to GeForce NOW rigs', () => {
  assert.equal(resolveGfnRig('NVIDIA GeForce RTX 5080').tier, 'Ultimate');
  assert.match(resolveGfnRig('NVIDIA GeForce RTX 4080').cpu, /Threadripper/);
  assert.equal(resolveGfnRig('NVIDIA GeForce GTX 1060'), null);
});

test('parses wmic csv output into rows and feeds the disk and encoder parsers', () => {
  const disk = parseWmicCsv('\r\r\nNode,DiskReadBytesPersec,DiskWriteBytesPersec,Name\r\r\nGFN,2097152,1048576,_Total\r\r\n');
  assert.deepEqual(parseCimDiskCounters(disk), { diskReadMBps: 2, diskWriteMBps: 1 });
  const engines = parseWmicCsv([
    'Node,Name,UtilizationPercentage',
    'GFN,pid_1_luid_0x0_0x1_phys_0_eng_3_engtype_VideoEncode,12',
    'GFN,pid_2_luid_0x0_0x1_phys_0_eng_3_engtype_VideoEncode,8',
    'GFN,pid_2_luid_0x0_0x1_phys_0_eng_0_engtype_3D,90',
  ].join('\r\n'));
  assert.equal(parseVideoEncoderLoad(engines), 20);
  assert.equal(parseVideoEncoderLoad([]), null);
});

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

test('parses CIM GPU names and selects the physical adapter', () => {
  const names = parseCimGpuNames([
    { Name: 'RealVNC VNC Mirror Driver' },
    { Name: 'Microsoft Basic Display Adapter' },
    { Name: 'NVIDIA GeForce RTX 5080' },
  ]);

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

test('aggregates CIM GPU engine utilization by adapter and engine type', () => {
  const rows = [
    { Name: 'pid_812_luid_0x0000_phys_0_eng_8_engtype_3D', UtilizationPercentage: 20 },
    { Name: 'pid_912_luid_0x0000_phys_0_eng_9_engtype_3D', UtilizationPercentage: 35 },
    { Name: 'pid_812_luid_0x0000_phys_0_eng_10_engtype_VideoDecode', UtilizationPercentage: 12 },
  ];

  assert.equal(parseCimGpuEngineOutput(rows), 55);
  assert.equal(parseCimGpuEngineOutput([]), null);
});

test('selects CIM dedicated GPU memory usage and converts bytes to MiB', () => {
  const rows = [
    { Name: 'luid_0x0000_phys_0', DedicatedUsage: 2147483648 },
    { Name: 'luid_0x0001_phys_0', DedicatedUsage: 1073741824 },
  ];

  assert.deepEqual(parseCimGpuMemoryRows(rows), {
    memoryUsed: 2048,
    memoryTotal: null,
    adapterName: 'luid_0x0000_phys_0',
  });
});

test('reads aggregate disk counters from CIM rows', () => {
  assert.deepEqual(parseCimDiskCounters([
    { Name: '0 C:', DiskReadBytesPersec: 100, DiskWriteBytesPersec: 200 },
    { Name: '_Total', DiskReadBytesPersec: 1048576, DiskWriteBytesPersec: 2097152 },
  ]), {
    diskReadMBps: 1,
    diskWriteMBps: 2,
  });
  assert.deepEqual(parseCimDiskCounters([]), {
    diskReadMBps: null,
    diskWriteMBps: null,
  });
});
