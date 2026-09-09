Pod::Spec.new do |s|
  s.name           = 'LiveTraxEngine'
  s.version        = '1.0.0'
  s.summary        = 'Live Trax native audio engine'
  s.description    = 'Live Trax native audio engine (miniaudio + Signalsmith)'
  s.author         = 'Live Trax'
  s.homepage       = 'https://github.com/Kalyan5252/DSP_LIVE'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17',
    'CLANG_CXX_LIBRARY' => 'libc++',
    'HEADER_SEARCH_PATHS' => '"$(PODS_TARGET_SRCROOT)/cpp" "$(PODS_TARGET_SRCROOT)/cpp/vendor"'
  }

  # Optimize the DSP even in Debug. Xcode's Debug config compiles C/C++ at -O0,
  # and this pod is a phase vocoder plus an FFT plus per-sample mixing loops:
  # measured 6.14% of one core per voice at -O0 vs 0.28% at -O2, a 22x penalty.
  # With 8 pads that is the difference between ~2% and ~50% of the audio
  # deadline -- i.e. the dev build throttles while the release build is idle.
  # compiler_flags is appended after the configuration's own -O0, and clang
  # honours the last -O flag it sees.
  s.compiler_flags = '-O2'

  s.frameworks = 'AudioToolbox', 'AVFoundation', 'CoreFoundation'
  s.private_header_files = 'cpp/**/*.{h,hpp}'
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
