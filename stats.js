const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const os = require('node:os');
const systeminformation = require('systeminformation');

const execFileAsync = promisify(execFile);

const SENSOR_REFRESH_MS = 5000;
const GPU_REFRESH_MS = 15000;
const GPU_COUNTER_REFRESH_MS = 5000;
const VIRTUAL_GPU_PATTERN = /microsoft basic display adapter|vnc mirror driver|virtual|remote display|indirect display/i;

function resolveCpuName(cpuInfo, systemCpuModel) {
  return cpuInfo.brand || systemCpuModel || cpuInfo.manufacturer || 'Processor';
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

function parseWmiGpuNames(output) {
  return decodeProcessOutput(output)
    .split(/\r?\n/)
    .map(line => line.match(/^\s*Name\s*=\s*(.*?)\s*$/i)?.[1])
    .filter(Boolean);
}

function selectPhysicalGpuName(names) {
  return names.find(name => !VIRTUAL_GPU_PATTERN.test(name)) || null;
}

function parseOptionalNumber(value) {
  if (!value || /^n\/a$/i.test(value.trim())) return null;
  const number = Number(value.trim());
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

function parseWmiGpuEngineOutput(output) {
  const engineUsage = new Map();
  for (const line of decodeProcessOutput(output).split(/\r?\n/)) {
    const separator = line.lastIndexOf(',');
    if (separator < 0) continue;
    const utilization = parseOptionalNumber(line.slice(separator + 1));
    if (utilization === null) continue;

    const fields = line.slice(0, separator).split(',');
    const instanceName = fields.slice(1).join(',');
    const engineType = instanceName.match(/engtype_([^,\s]+)/i)?.[1];
    if (!engineType) continue;
    const adapter = instanceName.match(/luid_(.+?)_phys_(\d+)/i);
    const key = `${adapter ? `${adapter[1]}:${adapter[2]}` : 'gpu'}:${engineType.toLowerCase()}`;
    engineUsage.set(key, (engineUsage.get(key) || 0) + utilization);
  }

  if (!engineUsage.size) return null;
  return Math.round(Math.max(0, Math.min(100, Math.max(...engineUsage.values()))));
}

function parseWmiGpuAdapterMemoryOutput(output) {
  const adapters = [];
  for (const line of decodeProcessOutput(output).split(/\r?\n/)) {
    const fields = line.split(',');
    if (fields.length < 5) continue;
    const dedicatedLimit = parseOptionalNumber(fields[fields.length - 3]);
    const dedicatedUsage = parseOptionalNumber(fields[fields.length - 2]);
    if (dedicatedLimit === null && dedicatedUsage === null) continue;
    adapters.push({
      memoryTotal: dedicatedLimit === null ? null : dedicatedLimit / 1024 ** 2,
      memoryUsed: dedicatedUsage === null ? null : dedicatedUsage / 1024 ** 2,
    });
  }

  return adapters.sort((left, right) => (right.memoryTotal || 0) - (left.memoryTotal || 0))[0] || {};
}

async function runGpuCommand(executable, args) {
  try {
    const result = await execFileAsync(executable, args, {
      encoding: 'buffer',
      timeout: 3000,
      windowsHide: true,
      maxBuffer: 128 * 1024,
    });
    return decodeProcessOutput(result.stdout);
  } catch {
    return '';
  }
}

async function readWmiGpuNames() {
  const output = await runGpuCommand('wmic.exe', [
    'path', 'Win32_VideoController', 'get', 'Name', '/format:list',
  ]);
  return parseWmiGpuNames(output);
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
  let gpuWmiAdapters = [];
  let gpuSmiController = {};
  let gpuCounterMetrics = { usage: null, memoryUsed: null, memoryTotal: null };
  let gpuTelemetrySource = 'unavailable';
  let hasPrimaryGpuTelemetry = false;
  let lastGpuRefresh = 0;
  let lastGpuCounterRefresh = 0;

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

    if (now - lastGpuRefresh >= GPU_REFRESH_MS) {
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
      gpuWmiAdapters = !gpuController.model && !gpuController.name
        ? await readWmiGpuNames()
        : [];
      gpuSmiController = systemTelemetry ? {} : await readNvidiaSmiMetrics();
      hasPrimaryGpuTelemetry = systemTelemetry || Object.values(gpuSmiController).some(Number.isFinite);
      gpuTelemetrySource = systemTelemetry
        ? 'systeminformation'
        : hasPrimaryGpuTelemetry ? 'nvidia-smi' : 'unavailable';
    }

    if (!hasPrimaryGpuTelemetry && now - lastGpuCounterRefresh >= GPU_COUNTER_REFRESH_MS) {
      lastGpuCounterRefresh = now;
      const [engineOutput, memoryOutput] = await Promise.all([
        runGpuCommand('wmic.exe', [
          'path', 'Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine',
          'get', 'Name,UtilizationPercentage', '/format:csv',
        ]),
        runGpuCommand('wmic.exe', [
          'path', 'Win32_PerfFormattedData_GPUPerformanceCounters_GPUAdapterMemory',
          'get', 'Name,DedicatedLimit,DedicatedUsage,SharedUsage', '/format:csv',
        ]),
      ]);
      gpuCounterMetrics = {
        usage: parseWmiGpuEngineOutput(engineOutput),
        ...parseWmiGpuAdapterMemoryOutput(memoryOutput),
      };
      if ([gpuCounterMetrics.usage, gpuCounterMetrics.memoryUsed, gpuCounterMetrics.memoryTotal].some(Number.isFinite)) {
        gpuTelemetrySource = 'wmi-performance-counters';
      }
    }

    return {
      cpu: {
        name: resolveCpuName(cpuInfo, os.cpus().find(cpu => cpu.model)?.model),
        cores: cpuInfo.physicalCores || cpuInfo.cores || 0,
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
        name: gpuController.model || gpuController.name
          || gpuSmiController.name || selectPhysicalGpuName(gpuWmiAdapters)
          || 'Graphics device not detected',
        usage: firstFinite(gpuController.utilizationGpu, gpuSmiController.utilizationGpu, gpuCounterMetrics.usage) === null
          ? null
          : Math.round(firstFinite(gpuController.utilizationGpu, gpuSmiController.utilizationGpu, gpuCounterMetrics.usage)),
        temperature: firstFinite(gpuController.temperatureGpu, gpuSmiController.temperatureGpu) === null
          ? null
          : Math.round(firstFinite(gpuController.temperatureGpu, gpuSmiController.temperatureGpu)),
        memoryUsed: firstFinite(gpuController.memoryUsed, gpuSmiController.memoryUsed, gpuCounterMetrics.memoryUsed),
        memoryTotal: firstFinite(gpuController.memoryTotal, gpuSmiController.memoryTotal, gpuCounterMetrics.memoryTotal),
        clock: firstFinite(gpuController.clockCore, gpuSmiController.clockCore) === null
          ? null
          : Math.round(firstFinite(gpuController.clockCore, gpuSmiController.clockCore)),
        power: firstFinite(gpuController.powerDraw, gpuSmiController.powerDraw),
        telemetrySource: gpuTelemetrySource,
        detectedAdapters: [
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
          ...gpuWmiAdapters.map(name => ({ name, model: name, source: 'wmic', hasTelemetry: false })),
          ...(gpuSmiController.name
            ? [{ name: gpuSmiController.name, model: gpuSmiController.name, source: 'nvidia-smi', hasTelemetry: gpuTelemetrySource === 'nvidia-smi' }]
            : []),
        ],
      },
      sampledAt: now,
    };
  };
}

module.exports = {
  createStatsReader,
  parseNvidiaSmiOutput,
  parseWmiGpuAdapterMemoryOutput,
  parseWmiGpuEngineOutput,
  parseWmiGpuNames,
  resolveCpuName,
  selectGpuController,
  selectPhysicalGpuName,
};