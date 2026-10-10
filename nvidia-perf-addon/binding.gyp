{
  "targets": [
    {
      "target_name": "nvidia_perf",
      "sources": [ "nvidia_perf.cc" ],
      "include_dirs": [
        "<!(node -e \"require('node-addon-api').include\")",
        "include"
      ],
      "libraries": [
        "nvapi64.lib"
      ],
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ],
      "msvs_settings": {
        "VCCLCompilerTool": {
          "AdditionalOptions": [ "/std:c++17" ]
        }
      },
      "conditions": [
        [ "OS=="win", {
          "link_settings": {
            "libraries": [ "nvapi64.lib", "version.lib" ]
          }
        }]
      ]
    }
  ]
}
