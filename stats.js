const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const os = require('node:os');
const systeminformation = require('systeminformation');
const nvidiaPerf = require('./nvidia-perf');

const execFileAsync = promisify(execFile);

const SENSOR_REFRESH_MS = 5000;
const GPU_REFRESH_MS = 15000;
const GPU_COUNTER_REFRESH_MS = 5000;
const VIRTUAL_GPU_PATTERN = /microsoft basic display adapter|vnc mirror driver|virtual|remote display|indirect display/i;

function resolveCpuName(cpuInfo, systemCpuModel) {
  return cpuInfo.brand || systemCpuModel || cpuInfo.manufacturer || 'Processor';
}

const TR_PRO = 'AMD Ryzen Threadripper PRO 5955WX 16-Core (Zen3)';
const EPYC = 'AMD EPYC 9375F 32-Core (Zen5)';
const GFN_RIGS = [
  { match: /RTX 3050/i, rig: '3050b (RTX 3050)', tier: 'Free', cpu: TR_PRO, allocation: '5C/5T', memory: '8GB / 14GB', vram: '6GB' },
  { match: /RTX 3060/i, rig: '3060d (RTX 3060)', tier: 'Performance', cpu: TR_PRO, allocation: '4C/8T', memory: '28GB', vram: '12GB' },
  { match: /RTX 5080/i, rig: '5080h (RTX 5080)', tier: 'Ultimate', cpu: EPYC, allocation: '8C/16T', memory: '56GB', vram: '48GB' },
  { match: /RTX 4080/i, rig: '4080h (RTX 4080)', tier: 'Ultimate', cpu: TR_PRO, allocation: '8C/16T', memory: '56GB', vram: '24GB' },
];

function resolveGfnRig(gpuName) {
  const name = String(gpuName || '');
  return GFN_RIGS.find(entry => entry.match.test(name)) || null;
}

function decodeProcessOutput(output) {
  const buffer = Buffer.isBuffer(output) ? output : Buffer.from(String(output || ''), 'utf8');
  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString('utf16le').replace(/^\uFEFF/, '');
  }

  const sample = buffer.subarray(0, Math.min(buffer.length, 512));
  let zeroEven = 0;
  let zeroOdd = 0;
  for (let index = 0; index < sample.length; index += 1) {
    if (sample[index] === 0) {
      if (index % 2 === 0) zeroEven += 1;
      else zeroOdd += 1;
    }
  }
  if (zeroOdd > sample.length / 10 && zeroOdd > zeroEven) return buffer.toString('utf16le').replace(/^\uFEFF/, '');
  return buffer.toString('utf8').replace(/^\uFEFF/, '');
}

function normalizeRows(rows) {
  if (Array.isArray(rows)) return rows;
  return rows && typeof rows === 'object' ? [rows] : [];
}

function parseCimGpuNames(rows) {
  return normalizeRows(rows).map(row => String(row.Name || '')).filter(Boolean);
}

function selectPhysicalGpuName(names) {
  return names.find(name => !VIRTUAL_GPU_PATTERN.test(name)) || null;
}

function parseOptionalNumber(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text || /^n\/a$/i.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function parseNvidiaSmiOutput(output) {
  const row = decodeProcessOutput(output).split(/\r?\n/).map(line => line.trim()).find(Boolean);
  if (!row) return {};

  const [name, usage, temperature, memoryUsed, memoryTotal, power, clock] = row.split(',').map(value => value.trim());
  if (!name) return {};
  return {
    name,
    utilizationGpu: parseOptionalNumber(usage),
    temperatureGpu: parseOptionalNumber(temperature),
    memoryUsed: parseOptionalNumber(memoryUsed),
    memoryTotal: parseOptionalNumber(memoryTotal),
    powerDraw: parseOptionalNumber(power),
    clockCore: parseOptionalNumber(clock),
  };
}

function parseCimGpuEngineOutput(rows) {
  const engineUsage = new Map();
  for (const row of normalizeRows(rows)) {
    const utilization = parseOptionalNumber(row.UtilizationPercentage);
    if (utilization === null) continue;

    const instanceName = String(row.Name || '');
    const engineType = instanceName.match(/engtype_([^,\s]+)/i)?.[1];
    if (!engineType) continue;
    const adapter = instanceName.match(/luid_(.+?)_phys_(\d+)/i);
    const key = `${adapter ? `${adapter[1]}:${adapter[2]}` : 'gpu'}:${engineType.toLowerCase()}`;
    engineUsage.set(key, (engineUsage.get(key) || 0) + utilization);
  }

  if (!engineUsage.size) return null;
  return Math.round(Math.max(0, Math.min(100, Math.max(...engineUsage.values()))));
}

function selectMaxMemoryAdapter(adapters) {
  const usable = adapters.filter(adapter => Number.isFinite(adapter.memoryUsed));
  if (!usable.length) return {};

  const selected = usable.sort((left, right) => right.memoryUsed - left.memoryUsed)[0];
  return {
    memoryUsed: selected.memoryUsed / 1024 ** 2,
    memoryTotal: null,
    adapterName: selected.name || null,
  };
}

function parseCimGpuMemoryRows(rows) {
  return selectMaxMemoryAdapter(normalizeRows(rows).map(row => ({
    name: row.Name || '',
    memoryUsed: parseOptionalNumber(row.DedicatedUsage),
  })));
}

async function readGpuAdapterMemory() {
  return parseCimGpuMemoryRows(await readCimRows(
    'Win32_PerfFormattedData_GPUPerformanceCounters_GPUAdapterMemory',
    ['Name', 'DedicatedUsage'],
  ));
}

async function runGpuCommand(executable, args, timeout = 3000) {
  try {
    const result = await execFileAsync(executable, args, {
      encoding: 'buffer',
      timeout,
      windowsHide: true,
      maxBuffer: 128 * 1024,
    });
    return decodeProcessOutput(result.stdout);
  } catch {
    return '';
  }
}

function parseWmicCsv(output) {
  const lines = String(output || '').split(/\r*\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(',');
  return lines.slice(1).map(line => {
    const cells = line.split(',');
    return Object.fromEntries(header.map((key, index) => [key, cells[index]]));
  });
}

function parseVideoEncoderLoad(rows) {
  const perAdapter = new Map();
  for (const row of normalizeRows(rows)) {
    const name = String(row.Name || '');
    if (!/engtype_VideoEncode/i.test(name)) continue;
    const utilization = parseOptionalNumber(row.UtilizationPercentage);
    if (utilization === null) continue;
    const adapter = name.match(/luid_(.+?)_phys_(\d+)/i)?.[0] || 'gpu';
    perAdapter.set(adapter, (perAdapter.get(adapter) || 0) + utilization);
  }
  if (!perAdapter.size) return null;
  return Math.round(Math.max(0, Math.min(100, Math.max(...perAdapter.values()))));
}

async function readCimRows(className, properties) {
  const propertyList = properties.join(',');
  const script = `$ErrorActionPreference='Stop'; $rows = @(Get-CimInstance -ClassName '${className}' | Select-Object -Property ${propertyList}); ConvertTo-Json -InputObject $rows -Compress`;
  const output = await runGpuCommand('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command', script,
  ], 5000);
  if (!output) return [];
  try {
    return normalizeRows(JSON.parse(output));
  } catch {
    return [];
  }
}

async function readGpuNames() {
  return parseCimGpuNames(await readCimRows('Win32_VideoController', ['Name']));
}

// Some locked-down machines block PowerShell, so counters fall back to wmic.
let cimBlocked = false;
async function readPerfRows(className, properties) {
  if (!cimBlocked) {
    const rows = await readCimRows(className, properties);
    if (rows.length) return rows;
    cimBlocked = true;
  }
  return parseWmicCsv(await runGpuCommand('wmic.exe', ['path', className, 'get', properties.join(','), '/format:csv'], 5000));
}

async function readNvidiaSmiMetrics() {
  const programFiles = process.env.ProgramW6432 || process.env.ProgramFiles;
  const candidates = [
    process.env.NVIDIA_SMI_PATH,
    programFiles && path.join(programFiles, 'NVIDIA Corporation', 'NVSMI', 'nvidia-smi.exe'),
    process.env.SystemRoot && path.join(process.env.SystemRoot, 'System32', 'nvidia-smi.exe'),
    'nvidia-smi.exe',
  ].filter(Boolean);
  const args = [
    '--query-gpu=name,utilization.gpu,temperature.gpu,memory.used,memory.total,power.draw,clocks.gr',
    '--format=csv,noheader,nounits',
  ];

  for (const executable of [...new Set(candidates)]) {
    if (path.isAbsolute(executable) && !fs.existsSync(executable)) continue;
    const metrics = parseNvidiaSmiOutput(await runGpuCommand(executable, args));
    if (metrics.name) return metrics;
  }
  return {};
}

function firstFinite(...values) {
  return values.find(Number.isFinite) ?? null;
}

function selectGpuController(controllers) {
  if (!Array.isArray(controllers)) return {};

  const physicalControllers = controllers.filter(controller => {
    const label = [controller.vendor, controller.model, controller.name]
      .filter(value => typeof value === 'string')
      .join(' ');
    return label && !VIRTUAL_GPU_PATTERN.test(label);
  });

  if (!physicalControllers.length) return {};

  return physicalControllers
    .map((controller, index) => {
      const label = `${controller.vendor || ''} ${controller.model || ''} ${controller.name || ''}`;
      const hasTelemetry = [
        controller.utilizationGpu,
        controller.temperatureGpu,
        controller.memoryTotal,
        controller.memoryUsed,
        controller.clockCore,
        controller.powerDraw,
      ].some(Number.isFinite);
      const isKnownVendor = /nvidia|amd|radeon|intel/i.test(label);
      return { controller, index, score: (hasTelemetry ? 100 : 0) + (isKnownVendor ? 20 : 0) };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)[0].controller;
}

function createStatsReader() {
  let cpuInfo;
  let cpuSensors = { temperature: null, clock: null };
  let lastCpuSensorRefresh = 0;
  let gpuController = {};
  let gpuControllers = [];
  let gpuCimAdapters = [];
  let gpuSmiController = {};
  let gpuCounterMetrics = { usage: null, memoryUsed: null, memoryTotal: null };
  let gpuTelemetrySource = 'unavailable';
  let hasPrimaryGpuTelemetry = false;
  let lastGpuRefresh = 0;
  let lastGpuCounterRefresh = 0;
  let lastEncoderRefresh = 0;
  let encoderCounter = null;

  return async function readStats() {
    const [load, memory] = await Promise.all([
      systeminformation.currentLoad(),
      systeminformation.mem(),
    ]);
    if (!cpuInfo) cpuInfo = await systeminformation.cpu();

    const now = Date.now();
    if (now - lastCpuSensorRefresh >= SENSOR_REFRESH_MS) {
      lastCpuSensorRefresh = now;
      try {
        const [temperature, speed] = await Promise.all([
          systeminformation.cpuTemperature(),
          systeminformation.cpuCurrentSpeed(),
        ]);
        cpuSensors = {
          temperature: Number.isFinite(temperature.main) ? Math.round(temperature.main) : null,
          clock: Number.isFinite(speed.avg) ? Math.round(speed.avg * 1000) : null,
        };
      } catch (error) {
        console.warn('Some CPU sensors are unavailable:', error.message);
      }
    }

    // NVAPI (out-of-process helper) fills gaps left by the other GPU sources.
    const nvapiMetrics = nvidiaPerf.isAvailable() ? nvidiaPerf.getGpuMetrics() : null;
    const nvapiGpu = nvapiMetrics?.gpus?.[0] || null;

    if (!hasPrimaryGpuTelemetry && (now - lastGpuRefresh >= GPU_REFRESH_MS)) {
      lastGpuRefresh = now;
      try {
        const graphics = await systeminformation.graphics();
        gpuControllers = Array.isArray(graphics.controllers) ? graphics.controllers : [];
        gpuController = selectGpuController(gpuControllers);
      } catch (error) {
        console.warn('GPU stats are unavailable:', error.message);
        gpuControllers = [];
        gpuController = {};
      }

      const systemTelemetry = [
        gpuController.utilizationGpu,
        gpuController.temperatureGpu,
        gpuController.memoryTotal,
        gpuController.memoryUsed,
        gpuController.clockCore,
        gpuController.powerDraw,
      ].some(Number.isFinite);
      gpuCimAdapters = !gpuController.model && !gpuController.name
        ? await readGpuNames()
        : [];
      gpuSmiController = systemTelemetry ? {} : await readNvidiaSmiMetrics();
      hasPrimaryGpuTelemetry = systemTelemetry || Object.values(gpuSmiController).some(Number.isFinite);
      gpuTelemetrySource = systemTelemetry
        ? 'systeminformation'
        : hasPrimaryGpuTelemetry ? 'nvidia-smi' : 'unavailable';
    }

    if (!hasPrimaryGpuTelemetry && now - lastGpuCounterRefresh >= GPU_COUNTER_REFRESH_MS) {
      lastGpuCounterRefresh = now;
      gpuCounterMetrics = {
        usage: parseCimGpuEngineOutput(await readCimRows(
          'Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine',
          ['Name', 'UtilizationPercentage'],
        )),
        ...(await readGpuAdapterMemory()),
      };
      if ([gpuCounterMetrics.usage, gpuCounterMetrics.memoryUsed, gpuCounterMetrics.memoryTotal].some(Number.isFinite)) {
        gpuTelemetrySource = 'windows-performance-counters';
      }
    }

    // Build the GPU object from the standard sources, then overlay NVAPI readings.
    let gpuName = 'Graphics device not detected';
    let gpuUsage = null;
    let gpuTemp = null;
    let gpuMemUsed = null;
    let gpuMemTotal = null;
    let gpuClock = null;
    let gpuPower = null;
    let detectedAdapters = [];

    {
      gpuName = gpuController.model || gpuController.name
        || gpuSmiController.name || selectPhysicalGpuName(gpuCimAdapters)
        || 'Graphics device not detected';
      gpuUsage = firstFinite(gpuController.utilizationGpu, gpuSmiController.utilizationGpu, gpuCounterMetrics.usage);
      gpuTemp = firstFinite(gpuController.temperatureGpu, gpuSmiController.temperatureGpu);
      gpuMemUsed = firstFinite(gpuController.memoryUsed, gpuSmiController.memoryUsed, gpuCounterMetrics.memoryUsed);
      gpuMemTotal = firstFinite(gpuController.memoryTotal, gpuSmiController.memoryTotal, gpuCounterMetrics.memoryTotal);
      gpuClock = firstFinite(gpuController.clockCore, gpuSmiController.clockCore);
      gpuPower = firstFinite(gpuController.powerDraw, gpuSmiController.powerDraw);

      detectedAdapters = [
        ...gpuControllers.map(controller => ({
          vendor: controller.vendor || null,
          model: controller.model || null,
          name: controller.name || null,
          source: 'systeminformation',
          hasTelemetry: [
            controller.utilizationGpu,
            controller.temperatureGpu,
            controller.memoryTotal,
            controller.memoryUsed,
            controller.clockCore,
            controller.powerDraw,
          ].some(Number.isFinite),
        })),
        ...gpuCimAdapters.map(name => ({ name, model: name, source: 'cim', hasTelemetry: false })),
        ...(gpuSmiController.name
          ? [{ name: gpuSmiController.name, model: gpuSmiController.name, source: 'nvidia-smi', hasTelemetry: gpuTelemetrySource === 'nvidia-smi' }]
          : []),
      ];
    }

    if (nvapiGpu) {
      gpuTemp = firstFinite(nvapiGpu.temperature, gpuTemp);
      gpuClock = firstFinite(nvapiGpu.clockGraphics, gpuClock);
      gpuUsage = firstFinite(gpuUsage, nvapiGpu.utilization);
      gpuMemUsed = firstFinite(gpuMemUsed, nvapiGpu.memoryUsed);
      gpuMemTotal = firstFinite(gpuMemTotal, nvapiGpu.memoryTotal);
      if (gpuName === 'Graphics device not detected' && nvapiGpu.name) gpuName = nvapiGpu.name;
      if (!hasPrimaryGpuTelemetry) gpuTelemetrySource = 'nvapi';
    }

    if (!Number.isFinite(nvapiGpu?.videoEngine) && now - lastEncoderRefresh >= 5000) {
      lastEncoderRefresh = now;
      try {
        encoderCounter = parseVideoEncoderLoad(await readPerfRows(
          'Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine',
          ['Name', 'UtilizationPercentage'],
        ));
      } catch {
        // Counters are optional.
      }
    }

    const gfnRig = resolveGfnRig(gpuName);

    return {
      cpu: {
        name: gfnRig?.cpu || resolveCpuName(cpuInfo, os.cpus().find(cpu => cpu.model)?.model),
        rig: gfnRig ? { rig: gfnRig.rig, tier: gfnRig.tier, allocation: gfnRig.allocation, memory: gfnRig.memory, vram: gfnRig.vram } : null,
        cores: cpuInfo.physicalCores || cpuInfo.cores || 0,
        perCore: Array.isArray(load.cpus) ? load.cpus.map(core => Math.round(core.load || 0)) : [],
        usage: Math.round(load.currentLoad || 0),
        temperature: cpuSensors.temperature,
        clock: cpuSensors.clock,
      },
      memory: {
        used: memory.used,
        total: memory.total,
        usage: memory.total ? Math.round((memory.used / memory.total) * 100) : 0,
      },
      gpu: {
        name: gpuName,
        usage: gpuUsage === null ? null : Math.round(gpuUsage),
        temperature: gpuTemp === null ? null : Math.round(gpuTemp),
        memoryUsed: gpuMemUsed,
        memoryTotal: gpuMemTotal,
        clock: gpuClock === null ? null : Math.round(gpuClock),
        power: gpuPower,
        encoder: Number.isFinite(nvapiGpu?.videoEngine) ? Math.round(nvapiGpu.videoEngine) : encoderCounter,
        telemetrySource: gpuTelemetrySource,
        detectedAdapters,
      },
      sampledAt: now,
    };
  };
}

module.exports = {
  createStatsReader,
  parseNvidiaSmiOutput,
  parseVideoEncoderLoad,
  parseWmicCsv,
  parseCimGpuEngineOutput,
  parseCimGpuMemoryRows,
  parseCimGpuNames,
  resolveCpuName,
  resolveGfnRig,
  selectGpuController,
  selectPhysicalGpuName,
};