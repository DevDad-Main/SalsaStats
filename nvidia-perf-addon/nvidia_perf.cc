#include <napi.h>
#include <windows.h>
#include "nvapi_min.h"

using namespace Napi;

class NvapiPerf {
public:
    NvapiPerf() : nvapiDll(nullptr), initialized(false) {}

    ~NvapiPerf() {
        if (nvapiDll) {
            if (fnUnload) fnUnload();
            FreeLibrary(nvapiDll);
        }
    }

    bool Initialize() {
        nvapiDll = LoadLibraryW(L"nvapi64.dll");
        if (!nvapiDll) return false;

        fnInitialize = (NvAPI_Initialize_t)GetProcAddress(nvapiDll, "nvapi_QueryInterface");
        if (!fnInitialize) return false;

        // QueryInterface returns function pointers by ID
        fnInitialize = (NvAPI_Initialize_t)GetProcAddressById(0x0150E828); // NvAPI_Initialize
        fnUnload = (NvAPI_Unload_t)GetProcAddressById(0xD22BDD7E); // NvAPI_Unload
        fnEnumPhysicalGPUs = (NvAPI_EnumPhysicalGPUs_t)GetProcAddressById(0xE5AC921F); // NvAPI_EnumPhysicalGPUs
        fnGetPerfCounter = (NvAPI_GPU_GetPerfCounter_t)GetProcAddressById(0xD52A5D5D); // NvAPI_GPU_GetPerfCounter
        fnGetAllPerfCounters = (NvAPI_GPU_GetAllPerformanceCounters_t)GetProcAddressById(0x2A5D5D5D); // NvAPI_GPU_GetAllPerformanceCounters
        fnGetDynamicPstatesInfoEx = (NvAPI_GPU_GetDynamicPstatesInfoEx_t)GetProcAddressById(0x6C2D1F78); // NvAPI_GPU_GetDynamicPstatesInfoEx
        fnGetThermalSettings = (NvAPI_GPU_GetThermalSettings_t)GetProcAddressById(0xE3640A56); // NvAPI_GPU_GetThermalSettings
        fnGetCoolerSettings = (NvAPI_GPU_GetCoolerSettings_t)GetProcAddressById(0xDA141340); // NvAPI_GPU_GetCoolerSettings
        fnGetPowerInfo = (NvAPI_GPU_GetPowerInfo_t)GetProcAddressById(0xA5D5D5D5); // NvAPI_GPU_GetPowerInfo
        fnGetAllClocks = (NvAPI_GPU_GetAllClocks_t)GetProcAddressById(0x1FEDD1F1); // NvAPI_GPU_GetAllClocks
        fnGetFullName = (NvAPI_GPU_GetFullName_t)GetProcAddressById(0xCEEE8E9F); // NvAPI_GPU_GetFullName
        fnGetBusId = (NvAPI_GPU_GetBusId_t)GetProcAddressById(0x1BE0B8E5); // NvAPI_GPU_GetBusId
        fnGetRamType = (NvAPI_GPU_GetRamType_t)GetProcAddressById(0x57F7CA76); // NvAPI_GPU_GetRamType

        if (!fnInitialize || !fnEnumPhysicalGPUs) return false;

        NvAPI_Status status = fnInitialize();
        if (status != NVAPI_OK) return false;

        initialized = true;
        return true;
    }

    Value GetGpuMetrics(const CallbackInfo& info) {
        Env env = info.Env();
        Object result = Object::New(env);
        Array gpus = Array::New(env);

        if (!initialized && !Initialize()) {
            result.Set("error", String::New(env, "NVAPI initialization failed"));
            return result;
        }

        NvPhysicalGpuHandle handles[NVAPI_MAX_PHYSICAL_GPUS];
        NvU32 gpuCount = 0;
        NvAPI_Status status = fnEnumPhysicalGPUs(handles, &gpuCount);
        if (status != NVAPI_OK || gpuCount == 0) {
            result.Set("error", String::New(env, "No NVIDIA GPUs found"));
            return result;
        }

        for (NvU32 i = 0; i < gpuCount; i++) {
            Object gpu = Object::New(env);

            // Get GPU name
            NvAPI_ShortString name = {0};
            if (fnGetFullName && fnGetFullName(handles[i], name) == NVAPI_OK) {
                gpu.Set("name", String::New(env, (char*)name));
            }

            // Get bus ID
            NvU32 domain, bus, device;
            if (fnGetBusId && fnGetBusId(handles[i], &domain, &bus, &device) == NVAPI_OK) {
                char busId[32];
                sprintf_s(busId, "%04X:%02X:%02X.0", domain, bus, device);
                gpu.Set("busId", String::New(env, busId));
            }

            // Get RAM type
            NvU32 ramType = 0;
            if (fnGetRamType && fnGetRamType(handles[i], &ramType) == NVAPI_OK) {
                gpu.Set("ramType", Number::New(env, ramType));
            }

            // Get all performance counters
            if (fnGetAllPerfCounters) {
                NV_GPU_PERF_COUNTERS_V1 counters = {0};
                counters.version = NV_GPU_PERF_COUNTERS_VER;
                counters.numCounters = 64;
                
                status = fnGetAllPerfCounters(handles[i], &counters);
                if (status == NVAPI_OK) {
                    for (NvU32 j = 0; j < counters.numCounters; j++) {
                        NV_GPU_PERF_COUNTER_V1 c = counters.counters[j];
                        if (c.counterId == 0) continue;
                        
                        const char* counterName = GetCounterName(c.counterId);
                        if (counterName) {
                            gpu.Set(counterName, Number::New(env, c.counterValue));
                        }
                    }
                }
            }

            // Get dynamic PStates (utilization)
            if (fnGetDynamicPstatesInfoEx) {
                NV_GPU_DYNAMIC_PSTATES_INFO_EX_V1 pstates = {0};
                pstates.version = NV_GPU_DYNAMIC_PSTATES_INFO_EX_VER;
                status = fnGetDynamicPstatesInfoEx(handles[i], &pstates);
                if (status == NVAPI_OK) {
                    gpu.Set("utilization", Number::New(env, pstates.utilPercent));
                }
            }

            // Get thermal settings
            if (fnGetThermalSettings) {
                NV_GPU_THERMAL_SETTINGS_V1 thermal = {0};
                thermal.version = NV_GPU_THERMAL_SETTINGS_VER;
                status = fnGetThermalSettings(handles[i], 0, &thermal);
                if (status == NVAPI_OK && thermal.count > 0) {
                    gpu.Set("temperature", Number::New(env, thermal.sensor[0].currentTemp));
                }
            }

            // Get cooler settings (fan speed)
            if (fnGetCoolerSettings) {
                NV_GPU_COOLER_SETTINGS_V1 cooler = {0};
                cooler.version = NV_GPU_COOLER_SETTINGS_VER;
                status = fnGetCoolerSettings(handles[i], 0, &cooler);
                if (status == NVAPI_OK && cooler.count > 0) {
                    gpu.Set("fanSpeed", Number::New(env, cooler.cooler[0].currentLevel));
                    gpu.Set("fanSpeedRpm", Number::New(env, cooler.cooler[0].currentLevel * 100)); // approximate
                }
            }

            // Get power info
            if (fnGetPowerInfo) {
                NV_GPU_POWER_INFO_V1 power = {0};
                power.version = NV_GPU_POWER_INFO_VER;
                status = fnGetPowerInfo(handles[i], &power);
                if (status == NVAPI_OK) {
                    gpu.Set("powerDraw", Number::New(env, power.currentPower / 1000.0)); // mW to W
                    gpu.Set("powerLimit", Number::New(env, power.powerLimit / 1000.0));
                }
            }

            // Get clocks
            if (fnGetAllClocks) {
                NV_GPU_CLOCKS_V1 clocks = {0};
                clocks.version = NV_GPU_CLOCKS_VER;
                clocks.clockType = 0; // current clocks
                status = fnGetAllClocks(handles[i], &clocks);
                if (status == NVAPI_OK && clocks.numClocks > 0) {
                    gpu.Set("clockGraphics", Number::New(env, clocks.clockFreq[0] / 1000.0)); // kHz to MHz
                    if (clocks.numClocks > 1) {
                        gpu.Set("clockMemory", Number::New(env, clocks.clockFreq[1] / 1000.0));
                    }
                }
            }

            gpus.Set(i, gpu);
        }

        result.Set("gpus", gpus);
        result.Set("count", Number::New(env, gpuCount));
        result.Set("source", String::New(env, "nvapi"));
        return result;
    }

    Value GetFrameRate(const CallbackInfo& info) {
        Env env = info.Env();
        Object result = Object::New(env);

        if (!initialized && !Initialize()) {
            result.Set("error", String::New(env, "NVAPI initialization failed"));
            return result;
        }

        NvPhysicalGpuHandle handles[NVAPI_MAX_PHYSICAL_GPUS];
        NvU32 gpuCount = 0;
        NvAPI_Status status = fnEnumPhysicalGPUs(handles, &gpuCount);
        if (status != NVAPI_OK || gpuCount == 0) {
            result.Set("error", String::New(env, "No NVIDIA GPUs found"));
            return result;
        }

        // Try to get frame rate counter specifically
        for (NvU32 i = 0; i < gpuCount; i++) {
            NV_GPU_PERF_COUNTER_V1 counter = {0};
            counter.version = NV_GPU_PERF_COUNTER_VER;
            counter.counterId = NV_GPU_PERF_COUNTER_FRAME_RATE;
            
            status = fnGetPerfCounter ? fnGetPerfCounter(handles[i], &counter) : NVAPI_ERROR;
            if (status == NVAPI_OK && counter.counterValue > 0) {
                result.Set("frameRate", Number::New(env, counter.counterValue / 1000.0)); // Convert if needed
                return result;
            }
        }

        result.Set("frameRate", Number::New(env, 0));
        result.Set("available", Boolean::New(env, false));
        return result;
    }

private:
    HMODULE nvapiDll;
    bool initialized;

    // Function pointers
    NvAPI_Initialize_t fnInitialize = nullptr;
    NvAPI_Unload_t fnUnload = nullptr;
    NvAPI_EnumPhysicalGPUs_t fnEnumPhysicalGPUs = nullptr;
    NvAPI_GPU_GetPerfCounter_t fnGetPerfCounter = nullptr;
    NvAPI_GPU_GetAllPerformanceCounters_t fnGetAllPerfCounters = nullptr;
    NvAPI_GPU_GetDynamicPstatesInfoEx_t fnGetDynamicPstatesInfoEx = nullptr;
    NvAPI_GPU_GetThermalSettings_t fnGetThermalSettings = nullptr;
    NvAPI_GPU_GetCoolerSettings_t fnGetCoolerSettings = nullptr;
    NvAPI_GPU_GetPowerInfo_t fnGetPowerInfo = nullptr;
    NvAPI_GPU_GetAllClocks_t fnGetAllClocks = nullptr;
    NvAPI_GPU_GetFullName_t fnGetFullName = nullptr;
    NvAPI_GPU_GetBusId_t fnGetBusId = nullptr;
    NvAPI_GPU_GetRamType_t fnGetRamType = nullptr;

    void* GetProcAddressById(NvU32 id) {
        if (!nvapiDll) return nullptr;
        // NVAPI uses nvapi_QueryInterface to get function pointers by ID
        // But we can also try direct GetProcAddress for known decorated names
        // For simplicity, try the QueryInterface approach
        typedef void* (NVAPI_CALL *QueryInterface_t)(NvU32);
        static QueryInterface_t queryInterface = nullptr;
        if (!queryInterface) {
            queryInterface = (QueryInterface_t)GetProcAddress(nvapiDll, "nvapi_QueryInterface");
        }
        if (queryInterface) {
            return queryInterface(id);
        }
        return nullptr;
    }

    const char* GetCounterName(NvU32 id) {
        switch (id) {
            case NV_GPU_PERF_COUNTER_GPU_UTILIZATION: return "gpuUtilization";
            case NV_GPU_PERF_COUNTER_MEMORY_CONTROLLER_UTIL: return "memoryControllerUtilization";
            case NV_GPU_PERF_COUNTER_VIDEO_ENGINE_UTIL: return "videoEngineUtilization";
            case NV_GPU_PERF_COUNTER_FRAME_RATE: return "frameRate";
            case NV_GPU_PERF_COUNTER_GPU_TEMPERATURE: return "temperature";
            case NV_GPU_PERF_COUNTER_GPU_POWER: return "powerDraw";
            case NV_GPU_PERF_COUNTER_GPU_CLOCK_GRAPHICS: return "clockGraphics";
            case NV_GPU_PERF_COUNTER_GPU_CLOCK_MEMORY: return "clockMemory";
            case NV_GPU_PERF_COUNTER_GPU_CLOCK_PROCESSOR: return "clockProcessor";
            case NV_GPU_PERF_COUNTER_GPU_CLOCK_VIDEO: return "clockVideo";
            case NV_GPU_PERF_COUNTER_FAN_SPEED: return "fanSpeed";
            case NV_GPU_PERF_COUNTER_FAN_SPEED_RPM: return "fanSpeedRpm";
            case NV_GPU_PERF_COUNTER_PCIE_TX_THROUGHPUT: return "pcieTxThroughput";
            case NV_GPU_PERF_COUNTER_PCIE_RX_THROUGHPUT: return "pcieRxThroughput";
            case NV_GPU_PERF_COUNTER_PCIE_TX_UTILIZATION: return "pcieTxUtilization";
            case NV_GPU_PERF_COUNTER_PCIE_RX_UTILIZATION: return "pcieRxUtilization";
            default: return nullptr;
        }
    }
};

static NvapiPerf g_nvapiPerf;

Value GetGpuMetrics(const CallbackInfo& info) {
    return g_nvapiPerf.GetGpuMetrics(info);
}

Value GetFrameRate(const CallbackInfo& info) {
    return g_nvapiPerf.GetFrameRate(info);
}

Object Init(Env env, Object exports) {
    exports.Set("getGpuMetrics", Function::New(env, GetGpuMetrics));
    exports.Set("getFrameRate", Function::New(env, GetFrameRate));
    return exports;
}

NODE_API_MODULE(nvidia_perf, Init)