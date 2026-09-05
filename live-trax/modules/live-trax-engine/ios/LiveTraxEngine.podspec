Pod::Spec.new do |s|
  s.name           = 'LiveTraxEngine'
  s.version        = '1.0.0'
  s.summary        = 'Live Trax native audio engine'
  s.description    = 'Live Trax native audio engine'
  s.author         = 'Live Trax'
  s.homepage       = 'https://github.com/Kalyan5252/DSP_LIVE'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
