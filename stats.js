const systeminformation = require('systeminformation');

const SENSOR_REFRESH_MS = 5000;
const GPU_REFRESH_MS = 15000;

function createStatsReader() {
  let cpuInfo;
  let cpuSensors = { temperature: null, clock: null };
  let lastCpuSensorRefresh = 0;
  let gpuController = {};
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
        gpuController = graphics.controllers?.[0] || {};
      } catch (error) {
        console.warn('GPU stats are unavailable:', error.message);
        gpuController = {};
      }
    }

    return {
      cpu: {
        name: cpuInfo.brand || cpuInfo.manufacturer || 'Processor',
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
      },
      sampledAt: now,
    };
  };
}

module.exports = { createStatsReader };