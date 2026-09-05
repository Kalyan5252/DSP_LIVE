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
@_silgen_name("ltx_applyTempo") func ltx_applyTempo()
@_silgen_name("ltx_startTransport") func ltx_startTransport()
@_silgen_name("ltx_stopTransport") func ltx_stopTransport()
@_silgen_name("ltx_setMasterSignature") func ltx_setMasterSignature(_ num: Int32, _ den: Int32)
@_silgen_name("ltx_setQuantize") func ltx_setQuantize(_ beats: Double)
@_silgen_name("ltx_transportInfo") func ltx_transportInfo(_ which: Int32) -> Double
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
    Function("applyTempo") { ltx_applyTempo() }

    Function("startTransport") { ltx_startTransport() }
    Function("stopTransport") { ltx_stopTransport() }
    Function("setMasterSignature") { (num: Int, den: Int) in ltx_setMasterSignature(Int32(num), Int32(den)) }
    Function("setQuantize") { (beats: Double) in ltx_setQuantize(beats) }

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
