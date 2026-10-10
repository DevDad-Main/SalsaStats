{
  "targets": [
    {
      "target_name": "nvidia_perf",
      "sources": [ "nvidia_perf.cc" ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "include"
      ],
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ],
      "msvs_settings": {
        "VCCLCompilerTool": {
          "AdditionalOptions": [ "/std:c++17" ]
        }
      }
    }
  ]
}
