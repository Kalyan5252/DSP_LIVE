#pragma once
#include <string>

namespace livetrax {

// Multi-pad audio engine with real-time streaming time-stretch (Signalsmith) and
// a sample-accurate transport for beat-synced, quantized launch/stop.
//
// The transport is driven by miniaudio's global engine clock
// (ma_engine_get_time_in_pcm_frames). Pads are launched/stopped on the next grid
// boundary via ma_sound_set_start_time_in_pcm_frames / _stop_time_..., so timing
// is sample-accurate on the audio thread. The JS layer only *reads* this clock
// (transportInfo / activePadsJSON) to drive the UI — it is never the source of
// truth for timing.
class LiveTraxCore {
public:
  LiveTraxCore();
  ~LiveTraxCore();

  bool init();
  void shutdown();

  bool loadPad(const std::string& id, const std::string& path, double bpm, bool loop);
  void unloadPad(const std::string& id);

  // Immediate (unquantized) controls — kept for one-shots / fallback.
  void trigger(const std::string& id);
  void stop(const std::string& id);
  void stopAll();

  // Quantized controls — launch/stop on the next grid boundary.
  void triggerSync(const std::string& id);
  void stopSync(const std::string& id);

  void setMasterVolume(float v);
  void setMasterTempo(double bpm); // live streaming ratio; no restart
  void setPadBpm(const std::string& id, double bpm); // change one loop's base tempo (live re-stretch)
  void applyTempo();

  // ---- transport / sync ----
  void startTransport();                     // begin the grid clock (grid origin = now)
  void stopTransport();                      // freeze the grid clock
  void setMasterSignature(int num, int den); // e.g. 7/8
  void setQuantize(double beats);            // launch quantum in beats (0 = instant)

  // Readouts for the UI (polled from JS).
  //   which: 0=playing(0/1) 1=barIndex 2=beatInBar 3=phaseInBeat(0..1) 4=beatsPerBar
  double transportInfo(int which);
  double audioLoad(int which);   // audio-thread load meter (0=avg 1=peak 2=overruns 3=callbacks)
  double padDuration(const std::string& id); // loop length in seconds (0 if none)
  double estimateBpm(const std::string& path);   // analyze a file, return detected BPM (0 if unknown)
  std::string analyzeSample(const std::string& path); // offline: BPM + transient markers (JSON)

  // ---- sample-edit params ----
  void setRegion(const std::string& id, double startFrac, double endFrac); // trim (0..1)
  void setPadGain(const std::string& id, double linear);
  void setPadChannelGain(const std::string& id, double linear); // mixer channel volume
  void setPadFades(const std::string& id, double inMs, double outMs);
  void setPadPlayMode(const std::string& id, int mode); // 0 loop | 1 one-shot | 2 gate
  const char* waveform(const std::string& id, int buckets); // CSV peaks (0..1)
  // JSON of non-stopped pads: {"id":{"s":state,"p":phase}} state 1=armed 2=playing
  const char* activePadsJSON();

private:
  struct Impl;
  Impl* impl_;
};

} // namespace livetrax
