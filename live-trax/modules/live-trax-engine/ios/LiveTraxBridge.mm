#include "LiveTraxCore.hpp"
#include <string>

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
const char* ltx_activePadsJSON() { return core().activePadsJSON(); }

}
