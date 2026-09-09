#include "LiveTraxCore.hpp"
#include <string>
#include <cstring>
#include <cstdlib>

using namespace livetrax;

static LiveTraxCore& core() {
  static LiveTraxCore instance;
  return instance;
}

extern "C" {

void ltx_init() { core().init(); }

void ltx_loadPad(const char* id, const char* path, double bpm, bool loop) {
  core().loadPad(id ? std::string(id) : std::string(),
                 path ? std::string(path) : std::string(), bpm, loop);
}
void ltx_unloadPad(const char* id) { core().unloadPad(id ? std::string(id) : std::string()); }

void ltx_trigger(const char* id) { core().trigger(id ? std::string(id) : std::string()); }
void ltx_stop(const char* id) { core().stop(id ? std::string(id) : std::string()); }
void ltx_stopAll() { core().stopAll(); }

void ltx_triggerSync(const char* id) { core().triggerSync(id ? std::string(id) : std::string()); }
void ltx_stopSync(const char* id) { core().stopSync(id ? std::string(id) : std::string()); }

void ltx_setMasterVolume(double v) { core().setMasterVolume((float)v); }
void ltx_setMasterTempo(double bpm) { core().setMasterTempo(bpm); }
void ltx_setPadBpm(const char* id, double bpm) { core().setPadBpm(id ? std::string(id) : std::string(), bpm); }
void ltx_applyTempo() { core().applyTempo(); }

void ltx_startTransport() { core().startTransport(); }
void ltx_stopTransport() { core().stopTransport(); }
void ltx_setMasterSignature(int num, int den) { core().setMasterSignature(num, den); }
void ltx_setQuantize(double beats) { core().setQuantize(beats); }

double ltx_transportInfo(int which) { return core().transportInfo(which); }
double ltx_padDuration(const char* id) { return core().padDuration(id ? std::string(id) : std::string()); }
double ltx_estimateBpm(const char* path) { return core().estimateBpm(path ? std::string(path) : std::string()); }
// Caller owns the result and must hand it back to ltx_freeString. Unlike the
// other string getters (which return engine-owned buffers read synchronously on
// the JS thread), this one runs on a background queue, so it cannot share one.
const char* ltx_analyzeSample(const char* path) {
  std::string json = core().analyzeSample(path ? std::string(path) : std::string());
  return strdup(json.c_str());
}
void ltx_freeString(const char* p) { if (p) free((void*)p); }
void ltx_setRegion(const char* id, double s, double e) { core().setRegion(id ? std::string(id) : std::string(), s, e); }
void ltx_setPadGain(const char* id, double g) { core().setPadGain(id ? std::string(id) : std::string(), g); }
void ltx_setPadChannelGain(const char* id, double g) { core().setPadChannelGain(id ? std::string(id) : std::string(), g); }
void ltx_setPadFades(const char* id, double inMs, double outMs) { core().setPadFades(id ? std::string(id) : std::string(), inMs, outMs); }
void ltx_setPadPlayMode(const char* id, int mode) { core().setPadPlayMode(id ? std::string(id) : std::string(), mode); }
const char* ltx_waveform(const char* id, int buckets) { return core().waveform(id ? std::string(id) : std::string(), buckets); }
const char* ltx_activePadsJSON() { return core().activePadsJSON(); }

}
