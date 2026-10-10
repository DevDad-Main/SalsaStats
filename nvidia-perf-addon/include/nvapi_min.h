// Minimal NVAPI definitions for performance counters
// Based on NVAPI SDK headers (NVIDIA/nvapi)

#ifndef NVAPI_MIN_H
#define NVAPI_MIN_H

#ifdef _WIN64
#define NVAPI_CALL __cdecl
#else
#define NVAPI_CALL __cdecl
#endif

typedef unsigned long NvU32;
typedef unsigned long long NvU64;
typedef int NvAPI_Status;
typedef void* NvPhysicalGpuHandle;
typedef void* NvLogicalGpuHandle;
typedef void* NvDisplayHandle;
typedef void* NvAPI_ShortString;

// NVAPI status codes
#define NVAPI_OK                            0
#define NVAPI_ERROR                         -1
#define NVAPI_LIBRARY_NOT_FOUND             -2
#define NVAPI_NO_IMPLEMENTATION             -3
#define NVAPI_API_NOT_INITIALIZED           -4
#define NVAPI_INVALID_ARGUMENT              -5
#define NVAPI_NVIDIA_DEVICE_NOT_FOUND       -6
#define NVAPI_END_ENUMERATION               -7
#define NVAPI_INVALID_HANDLE                -8
#define NVAPI_INCOMPATIBLE_STRUCT_VERSION   -9
#define NVAPI_HANDLE_INVALIDATED            -10
#define NVAPI_OPENGL_CONTEXT_NOT_CURRENT    -11
#define NVAPI_INVALID_POINTER               -14
#define NVAPI_NO_GL_EXPERT                  -12
#define NVAPI_INSTRUMENTATION_DISABLED      -13
#define NVAPI_EXPECTED_LOGICAL_GPU_HANDLE   -15
#define NVAPI_EXPECTED_PHYSICAL_GPU_HANDLE  -16
#define NVAPI_EXPECTED_DISPLAY_HANDLE       -17
#define NVAPI_INVALID_COMBINATION           -18
#define NVAPI_NOT_SUPPORTED                 -19
#define NVAPI_PORTID_NOT_FOUND              -20
#define NVAPI_EXPECTED_UNDEFINED_HANDLE     -21
#define NVAPI_INVALID_PERF_LEVEL            -22
#define NVAPI_DEVICE_BUSY                   -23
#define NVAPI_NV_PERSIST_FILE_NOT_FOUND     -24
#define NVAPI_PERSIST_DATA_NOT_FOUND        -25
#define NVAPI_EXPECTED_TV_DISPLAY           -26
#define NVAPI_EXPECTED_TV_DISPLAY_ON_DCONNECTOR -27
#define NVAPI_NO_ACTIVE_SLI_TOPOLOGY        -28
#define NVAPI_SLI_RENDERING_MODE_NOTALLOWED -29
#define NVAPI_EXPECTED_DIGITAL_FLAT_PANEL   -30
#define NVAPI_ARGUMENT_EXCEED_MAX_SIZE      -31
#define NVAPI_DEVICE_SWITCHING_NOT_ALLOWED  -32
#define NVAPI_TESTING_CLOCKS_NOT_SUPPORTED  -33
#define NVAPI_UNKNOWN_UNDERSCAN_CONFIG      -34
#define NVAPI_TIMEOUT_RECONFIGURING_GPU_TOPO -35
#define NVAPI_DATA_NOT_FOUND                -36
#define NVAPI_EXPECTED_ANALOG_DISPLAY       -37
#define NVAPI_NO_VIDLINK                    -38
#define NVAPI_REQUIRES_REBOOT               -39
#define NVAPI_INVALID_HYBRID_MODE           -40
#define NVAPI_MIXED_TARGET_TYPES            -44
#define NVAPI_SYSWOW64_NOT_SUPPORTED        -45
#define NVAPI_IMPLICIT_SET_GPU_TOPOLOGY_CHANGE_NOT_ALLOWED -46
#define NVAPI_REQUEST_USER_TO_DISABLE_NONSTANDARD_GPU_MODES -47
#define NVAPI_OUT_OF_MEMORY                 -48
#define NVAPI_WAS_STILL_DRAWING             -49
#define NVAPI_FILE_NOT_FOUND                -50
#define NVAPI_TOO_MANY_UNIQUE_STATE_OBJECTS -51
#define NVAPI_ID_NOT_FOUND                  -52
#define NVAPI_INVALID_OEM_DISPLAY_DEVICE    -53
#define NVAPI_RESOURCE_LEAK                 -54
#define NVAPI_RESOURCE_IN_USE               -55
#define NVAPI_TIMEOUT                       -56
#define NVAPI_GPU_IN_USE_BY_ANOTHER_PROCESS -57
#define NVAPI_INVALID_DATA                  -58
#define NVAPI_INSUFFICIENT_BUFFER           -59
#define NVAPI_ACCESS_DENIED                 -60
#define NVAPI_MOSAIC_NOT_ACTIVE             -61
#define NVAPI_SHARE_RESOURCE_RELOCATED      -62
#define NVAPI_REQUEST_USER_TO_ENABLE_GPU    -63
#define NVAPI_USER_DECLINED                 -64
#define NVAPI_D3D_DEVICE_LOST               -65
#define NVAPI_INSUFFICIENT_PRIVILEGES       -66
#define NVAPI_STEREO_NOT_SUPPORTED          -67
#define NVAPI_UNHANDLED_KERNEL_ERROR        -68
#define NVAPI_USER_CANCELLED                -69
#define NVAPI_EXCEEDS_MAX_DISPLAYS          -70
#define NVAPI_INVALID_DISPLAY_CONFIG        -71
#define NVAPI_STEREO_HARDWARE_NOT_SUPPORTED -72
#define NVAPI_STEREO_NOT_AVAILABLE          -73
#define NVAPI_STEREO_NOT_ENABLED            -74
#define NVAPI_STEREO_NOT_OWNER              -75
#define NVAPI_STEREO_EMITTER_NOT_BOUND      -76
#define NVAPI_STEREO_EMITTER_ALREADY_BOUND  -77
#define NVAPI_STEREO_EMITTER_BIND_FAILED    -78
#define NVAPI_STEREO_SWAP_CHAIN_NOT_BOUND   -79
#define NVAPI_STEREO_SWAP_CHAIN_ALREADY_BOUND -80
#define NVAPI_STEREO_SWAP_CHAIN_BIND_FAILED -81
#define NVAPI_STEREO_SWAP_CHAIN_NOT_OWNER   -82
#define NVAPI_STEREO_SWAP_CHAIN_NOT_FOUND   -83
#define NVAPI_STEREO_EMITTER_NOT_FOUND      -84
#define NVAPI_STEREO_EMITTER_BIND_FAILED_NO_HW -85
#define NVAPI_STEREO_SWAP_CHAIN_BIND_FAILED_NO_HW -86
#define NVAPI_STEREO_SWAP_CHAIN_BIND_FAILED_NO_SDK -87
#define NVAPI_STEREO_SWAP_CHAIN_BIND_FAILED_NO_APP -88

#define NVAPI_MAX_PHYSICAL_GPUS             64
#define NVAPI_MAX_LOGICAL_GPUS              64
#define NVAPI_MAX_GPU_TOPOLOGIES            128
#define NVAPI_MAX_GPU_PERF_PSTATES          16
#define NVAPI_MAX_GPU_PERF_CLOCKS           32
#define NVAPI_MAX_GPU_PUBLIC_CLOCKS         32
#define NVAPI_MAX_GPU_PERF_VOLTAGES         16

// GPU Perf Counter IDs (from nvapi.h)
#define NV_GPU_PERF_COUNTER_GPU_UTILIZATION          0x00000001
#define NV_GPU_PERF_COUNTER_MEMORY_CONTROLLER_UTIL   0x00000002
#define NV_GPU_PERF_COUNTER_VIDEO_ENGINE_UTIL        0x00000003
#define NV_GPU_PERF_COUNTER_FRAME_RATE               0x00000004
#define NV_GPU_PERF_COUNTER_GPU_TEMPERATURE          0x00000005
#define NV_GPU_PERF_COUNTER_GPU_POWER                0x00000006
#define NV_GPU_PERF_COUNTER_GPU_CLOCK_GRAPHICS       0x00000007
#define NV_GPU_PERF_COUNTER_GPU_CLOCK_MEMORY         0x00000008
#define NV_GPU_PERF_COUNTER_GPU_CLOCK_PROCESSOR      0x00000009
#define NV_GPU_PERF_COUNTER_GPU_CLOCK_VIDEO          0x0000000A
#define NV_GPU_PERF_COUNTER_FAN_SPEED                0x0000000B
#define NV_GPU_PERF_COUNTER_FAN_SPEED_RPM            0x0000000C
#define NV_GPU_PERF_COUNTER_PCIE_TX_THROUGHPUT       0x0000000D
#define NV_GPU_PERF_COUNTER_PCIE_RX_THROUGHPUT       0x0000000E
#define NV_GPU_PERF_COUNTER_PCIE_TX_UTILIZATION      0x0000000F
#define NV_GPU_PERF_COUNTER_PCIE_RX_UTILIZATION      0x00000010

// Performance counter structure
typedef struct _NV_GPU_PERF_COUNTER_V1 {
    NvU32   version;
    NvU32   counterId;
    NvU32   counterValue;
    NvU32   counterValue2;
} NV_GPU_PERF_COUNTER_V1;

#define NV_GPU_PERF_COUNTER_VER1  MAKE_NVAPI_VERSION(NV_GPU_PERF_COUNTER_V1, 1)
#define NV_GPU_PERF_COUNTER_VER   NV_GPU_PERF_COUNTER_VER1

// GPU Performance Counters
typedef struct _NV_GPU_PERF_COUNTERS_V1 {
    NvU32   version;
    NvU32   numCounters;
    NV_GPU_PERF_COUNTER_V1 counters[64];
} NV_GPU_PERF_COUNTERS_V1;

#define NV_GPU_PERF_COUNTERS_VER1  MAKE_NVAPI_VERSION(NV_GPU_PERF_COUNTERS_V1, 1)
#define NV_GPU_PERF_COUNTERS_VER   NV_GPU_PERF_COUNTERS_VER1

// GPU Dynamic PStates Info
typedef struct _NV_GPU_DYNAMIC_PSTATES_INFO_EX_V1 {
    NvU32 version;
    NvU32 flags;
    NvU32 numPStates;
    NvU32 numClocks;
    NvU32 numVoltages;
    NvU32 utilPercent;
    NvU32 reserved[16];
} NV_GPU_DYNAMIC_PSTATES_INFO_EX_V1;

#define NV_GPU_DYNAMIC_PSTATES_INFO_EX_VER1  MAKE_NVAPI_VERSION(NV_GPU_DYNAMIC_PSTATES_INFO_EX_V1, 1)
#define NV_GPU_DYNAMIC_PSTATES_INFO_EX_VER   NV_GPU_DYNAMIC_PSTATES_INFO_EX_VER1

// Thermal settings
typedef struct _NV_GPU_THERMAL_SETTINGS_V1 {
    NvU32 version;
    NvU32 count;
    struct {
        NvU32 sensorIndex;
        NvU32 currentTemp;
        NvU32 targetTemp;
        NvU32 minTemp;
        NvU32 maxTemp;
    } sensor[16];
} NV_GPU_THERMAL_SETTINGS_V1;

#define NV_GPU_THERMAL_SETTINGS_VER1  MAKE_NVAPI_VERSION(NV_GPU_THERMAL_SETTINGS_V1, 1)
#define NV_GPU_THERMAL_SETTINGS_VER   NV_GPU_THERMAL_SETTINGS_VER1

// Cooler settings
typedef struct _NV_GPU_COOLER_SETTINGS_V1 {
    NvU32 version;
    NvU32 count;
    struct {
        NvU32 coolerIndex;
        NvU32 defaultMinLevel;
        NvU32 defaultMaxLevel;
        NvU32 currentLevel;
        NvU32 defaultPolicy;
        NvU32 currentPolicy;
        NvU32 target;
        NvU32 controlType;
        NvU32 active;
        NvU32 minLevel;
        NvU32 maxLevel;
    } cooler[16];
} NV_GPU_COOLER_SETTINGS_V1;

#define NV_GPU_COOLER_SETTINGS_VER1  MAKE_NVAPI_VERSION(NV_GPU_COOLER_SETTINGS_V1, 1)
#define NV_GPU_COOLER_SETTINGS_VER   NV_GPU_COOLER_SETTINGS_VER1

// Power information
typedef struct _NV_GPU_POWER_INFO_V1 {
    NvU32 version;
    NvU32 powerLimit;
    NvU32 defaultPowerLimit;
    NvU32 maxPowerLimit;
    NvU32 minPowerLimit;
    NvU32 currentPower;
    NvU32 reserved[16];
} NV_GPU_POWER_INFO_V1;

#define NV_GPU_POWER_INFO_VER1  MAKE_NVAPI_VERSION(NV_GPU_POWER_INFO_V1, 1)
#define NV_GPU_POWER_INFO_VER   NV_GPU_POWER_INFO_VER1

// Clock information
typedef struct _NV_GPU_CLOCKS_V1 {
    NvU32 version;
    NvU32 clockType;
    NvU32 numClocks;
    NvU32 clockFreq[32];
} NV_GPU_CLOCKS_V1;

#define NV_GPU_CLOCKS_VER1  MAKE_NVAPI_VERSION(NV_GPU_CLOCKS_V1, 1)
#define NV_GPU_CLOCKS_VER   NV_GPU_CLOCKS_VER1

// Version macro
#define MAKE_NVAPI_VERSION(typeName, version) (NvU32)(sizeof(typeName) | ((version) << 16))

// Function pointer types
typedef NvAPI_Status (NVAPI_CALL *NvAPI_Initialize_t)();
typedef NvAPI_Status (NVAPI_CALL *NvAPI_Unload_t)();
typedef NvAPI_Status (NVAPI_CALL *NvAPI_EnumPhysicalGPUs_t)(NvPhysicalGpuHandle*, NvU32*);
typedef NvAPI_Status (NVAPI_CALL *NvAPI_GPU_GetPerfCounter_t)(NvPhysicalGpuHandle, NV_GPU_PERF_COUNTER_V1*);
typedef NvAPI_Status (NVAPI_CALL *NvAPI_GPU_GetAllPerformanceCounters_t)(NvPhysicalGpuHandle, NV_GPU_PERF_COUNTERS_V1*);
typedef NvAPI_Status (NVAPI_CALL *NvAPI_GPU_GetDynamicPstatesInfoEx_t)(NvPhysicalGpuHandle, NV_GPU_DYNAMIC_PSTATES_INFO_EX_V1*);
typedef NvAPI_Status (NVAPI_CALL *NvAPI_GPU_GetThermalSettings_t)(NvPhysicalGpuHandle, NvU32, NV_GPU_THERMAL_SETTINGS_V1*);
typedef NvAPI_Status (NVAPI_CALL *NvAPI_GPU_GetCoolerSettings_t)(NvPhysicalGpuHandle, NvU32, NV_GPU_COOLER_SETTINGS_V1*);
typedef NvAPI_Status (NVAPI_CALL *NvAPI_GPU_GetPowerInfo_t)(NvPhysicalGpuHandle, NV_GPU_POWER_INFO_V1*);
typedef NvAPI_Status (NVAPI_CALL *NvAPI_GPU_GetAllClocks_t)(NvPhysicalGpuHandle, NV_GPU_CLOCKS_V1*);
typedef NvAPI_Status (NVAPI_CALL *NvAPI_GPU_GetFullName_t)(NvPhysicalGpuHandle, NvAPI_ShortString);
typedef NvAPI_Status (NVAPI_CALL *NvAPI_GPU_GetBusId_t)(NvPhysicalGpuHandle, NvU32*, NvU32*, NvU32*);
typedef NvAPI_Status (NVAPI_CALL *NvAPI_GPU_GetRamType_t)(NvPhysicalGpuHandle, NvU32*);

#endif // NVAPI_MIN_H