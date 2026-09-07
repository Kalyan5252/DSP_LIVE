import ExpoModulesCore
import AVFAudio

// Bind the C bridge symbols by name (link-time), avoiding any Obj-C/Swift
// header-visibility issues.
@_silgen_name("ltx_init") func ltx_init()
@_silgen_name("ltx_loadPad") func ltx_loadPad(_ id: UnsafePointer<CChar>, _ path: UnsafePointer<CChar>, _ bpm: Double, _ loop: Bool)
@_silgen_name("ltx_unloadPad") func ltx_unloadPad(_ id: UnsafePointer<CChar>)
@_silgen_name("ltx_trigger") func ltx_trigger(_ id: UnsafePointer<CChar>)
@_silgen_name("ltx_stop") func ltx_stop(_ id: UnsafePointer<CChar>)
@_silgen_name("ltx_stopAll") func ltx_stopAll()
@_silgen_name("ltx_triggerSync") func ltx_triggerSync(_ id: UnsafePointer<CChar>)
@_silgen_name("ltx_stopSync") func ltx_stopSync(_ id: UnsafePointer<CChar>)
@_silgen_name("ltx_setMasterVolume") func ltx_setMasterVolume(_ v: Double)
@_silgen_name("ltx_setMasterTempo") func ltx_setMasterTempo(_ bpm: Double)
@_silgen_name("ltx_setPadBpm") func ltx_setPadBpm(_ id: UnsafePointer<CChar>, _ bpm: Double)
@_silgen_name("ltx_applyTempo") func ltx_applyTempo()
@_silgen_name("ltx_startTransport") func ltx_startTransport()
@_silgen_name("ltx_stopTransport") func ltx_stopTransport()
@_silgen_name("ltx_setMasterSignature") func ltx_setMasterSignature(_ num: Int32, _ den: Int32)
@_silgen_name("ltx_setQuantize") func ltx_setQuantize(_ beats: Double)
@_silgen_name("ltx_transportInfo") func ltx_transportInfo(_ which: Int32) -> Double
@_silgen_name("ltx_padDuration") func ltx_padDuration(_ id: UnsafePointer<CChar>) -> Double
@_silgen_name("ltx_estimateBpm") func ltx_estimateBpm(_ path: UnsafePointer<CChar>) -> Double
@_silgen_name("ltx_analyzeSample") func ltx_analyzeSample(_ path: UnsafePointer<CChar>) -> UnsafePointer<CChar>?
@_silgen_name("ltx_setRegion") func ltx_setRegion(_ id: UnsafePointer<CChar>, _ s: Double, _ e: Double)
@_silgen_name("ltx_setPadGain") func ltx_setPadGain(_ id: UnsafePointer<CChar>, _ g: Double)
@_silgen_name("ltx_setPadChannelGain") func ltx_setPadChannelGain(_ id: UnsafePointer<CChar>, _ g: Double)
@_silgen_name("ltx_setPadFades") func ltx_setPadFades(_ id: UnsafePointer<CChar>, _ inMs: Double, _ outMs: Double)
@_silgen_name("ltx_setPadPlayMode") func ltx_setPadPlayMode(_ id: UnsafePointer<CChar>, _ mode: Int32)
@_silgen_name("ltx_waveform") func ltx_waveform(_ id: UnsafePointer<CChar>, _ buckets: Int32) -> UnsafePointer<CChar>?
@_silgen_name("ltx_activePadsJSON") func ltx_activePadsJSON() -> UnsafePointer<CChar>?

public class LiveTraxEngineModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LiveTraxEngine")

    OnCreate {
      do {
        try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.mixWithOthers])
        try AVAudioSession.sharedInstance().setActive(true)
      } catch {}
      ltx_init()
    }

    Function("hello") { () -> String in "LiveTraxEngine native OK" }

    Function("loadPad") { (padId: String, path: String, bpm: Double, loop: Bool) in
      padId.withCString { pid in path.withCString { pp in ltx_loadPad(pid, pp, bpm, loop) } }
    }
    Function("unloadPad") { (padId: String) in padId.withCString { ltx_unloadPad($0) } }

    Function("trigger") { (padId: String) in padId.withCString { ltx_trigger($0) } }
    Function("stopPad") { (padId: String) in padId.withCString { ltx_stop($0) } }
    Function("stopAll") { ltx_stopAll() }

    Function("triggerSync") { (padId: String) in padId.withCString { ltx_triggerSync($0) } }
    Function("stopSync") { (padId: String) in padId.withCString { ltx_stopSync($0) } }

    Function("setMasterVolume") { (v: Double) in ltx_setMasterVolume(v) }
    Function("setMasterTempo") { (bpm: Double) in ltx_setMasterTempo(bpm) }
    Function("setPadBpm") { (padId: String, bpm: Double) in padId.withCString { ltx_setPadBpm($0, bpm) } }
    Function("applyTempo") { ltx_applyTempo() }

    Function("startTransport") { ltx_startTransport() }
    Function("stopTransport") { ltx_stopTransport() }
    Function("setMasterSignature") { (num: Int, den: Int) in ltx_setMasterSignature(Int32(num), Int32(den)) }
    Function("setQuantize") { (beats: Double) in ltx_setQuantize(beats) }
    Function("padDuration") { (padId: String) -> Double in padId.withCString { ltx_padDuration($0) } }
    Function("estimateBpm") { (path: String) -> Double in path.withCString { ltx_estimateBpm($0) } }
    Function("analyzeSample") { (path: String) -> String in
      var out = "{}"
      path.withCString { if let p = ltx_analyzeSample($0) { out = String(cString: p) } }
      return out
    }
    Function("setRegion") { (id: String, s: Double, e: Double) in id.withCString { ltx_setRegion($0, s, e) } }
    Function("setPadGain") { (id: String, g: Double) in id.withCString { ltx_setPadGain($0, g) } }
    Function("setPadChannelGain") { (id: String, g: Double) in id.withCString { ltx_setPadChannelGain($0, g) } }
    Function("setPadFades") { (id: String, inMs: Double, outMs: Double) in id.withCString { ltx_setPadFades($0, inMs, outMs) } }
    Function("setPadPlayMode") { (id: String, mode: Int) in id.withCString { ltx_setPadPlayMode($0, Int32(mode)) } }
    Function("getWaveform") { (id: String, buckets: Int) -> String in
      var out = ""
      id.withCString { if let p = ltx_waveform($0, Int32(buckets)) { out = String(cString: p) } }
      return out
    }

    // Transport readout: [playing, barIndex, beatInBar, phase, beatsPerBar]
    Function("getTransport") { () -> [Double] in
      var a = [Double]()
      a.reserveCapacity(5)
      for i in 0..<5 { a.append(ltx_transportInfo(Int32(i))) }
      return a
    }

    // Active pads as JSON: {"id":{"s":state,"p":phase}}
    Function("getActivePads") { () -> String in
      if let p = ltx_activePadsJSON() { return String(cString: p) }
      return "{}"
    }
  }
}
