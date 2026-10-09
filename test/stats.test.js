const assert = require('node:assert/strict');
const test = require('node:test');
const { resolveCpuName, selectGpuController } = require('../stats');

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