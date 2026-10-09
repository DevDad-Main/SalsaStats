const os = require('node:os');
const systeminformation = require('systeminformation');

const SENSOR_REFRESH_MS = 5000;
const GPU_REFRESH_MS = 15000;
const VIRTUAL_GPU_PATTERN = /microsoft basic display adapter|vnc mirror driver|virtual|remote display|indirect display/i;

function resolveCpuName(cpuInfo, systemCpuModel) {
  return cpuInfo.brand || systemCpuModel || cpuInfo.manufacturer || 'Processor';
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
  let lastGpuRefresh = 0;

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
        name: gpuController.model || gpuController.name || 'Graphics device not detected',
        usage: Number.isFinite(gpuController.utilizationGpu)
          ? Math.round(gpuController.utilizationGpu)
          : null,
        temperature: Number.isFinite(gpuController.temperatureGpu)
          ? Math.round(gpuController.temperatureGpu)
          : null,
        memoryUsed: gpuController.memoryUsed || null,
        memoryTotal: gpuController.memoryTotal || null,
        clock: Number.isFinite(gpuController.clockCore) ? Math.round(gpuController.clockCore) : null,
        power: Number.isFinite(gpuController.powerDraw) ? gpuController.powerDraw : null,
        detectedAdapters: gpuControllers.map(controller => ({
          vendor: controller.vendor || null,
          model: controller.model || null,
          name: controller.name || null,
          hasTelemetry: [
            controller.utilizationGpu,
            controller.temperatureGpu,
            controller.memoryTotal,
            controller.memoryUsed,
            controller.clockCore,
            controller.powerDraw,
          ].some(Number.isFinite),
        })),
      },
      sampledAt: now,
    };
  };
}

module.exports = { createStatsReader, resolveCpuName, selectGpuController };