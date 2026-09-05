#include "LiveTraxCore.hpp"
#include "miniaudio.h"
#include "signalsmith-stretch.h"

#include <unordered_map>
#include <vector>
#include <memory>
#include <atomic>
#include <cmath>
#include <algorithm>
#include <string>

namespace livetrax {

static const int kMaxBlock = 1024;   // max output frames processed per chunk
static const double kMinRatio = 0.5; // masterBpm/baseBpm bounds (buffer + quality)
static const double kMaxRatio = 2.0;
static const ma_uint64 kNoStop = ~(ma_uint64)0; // "no scheduled stop" sentinel

// A pad voice: a custom ma_data_source that time-stretches its loop on the audio
// thread through a persistent Signalsmith stretcher. Tempo = a live atomic ratio,
// so changing it never stops or restarts playback.
struct StretchVoice {
  ma_data_source_base base;    // MUST be first member

  // source audio (immutable after load)
  std::vector<float> orig;     // interleaved f32
  int channels = 2;
  int sampleRate = 48000;
  ma_uint64 origFrames = 0;
  double baseBpm = 120.0;
  bool loop = true;

  // live control
  std::atomic<double> ratio{1.0}; // input/output = masterBpm / baseBpm

  // audio-thread state
  ma_uint64 inPos = 0;
  bool ended = false;
  signalsmith::stretch::SignalsmithStretch<float> stretch;
  std::vector<std::vector<float>> inCh, outCh; // scratch (pre-allocated)
  std::vector<float*> inPtr, outPtr;

  ma_sound sound{};
  bool hasSound = false;

  // scheduling / UI state (engine-frame absolutes)
  ma_uint64 startFrame = 0;      // frame the voice (will) start playing
  ma_uint64 stopFrame = kNoStop; // frame the voice is scheduled to stop

  void allocScratch() {
    int cap = kMaxBlock * (int)std::ceil(kMaxRatio) + 8;
    inCh.assign(channels, std::vector<float>(cap, 0.f));
    outCh.assign(channels, std::vector<float>(kMaxBlock, 0.f));
    inPtr.resize(channels);
    outPtr.resize(channels);
    for (int c = 0; c < channels; ++c) { inPtr[c] = inCh[c].data(); outPtr[c] = outCh[c].data(); }
  }

  void resetPlayback() { inPos = 0; ended = false; stretch.reset(); }
};

// ---- custom ma_data_source callbacks (run on the audio thread) ----
static ma_result voice_read(ma_data_source* ds, void* pOut, ma_uint64 frameCount, ma_uint64* pRead) {
  StretchVoice* v = (StretchVoice*)ds;
  float* out = (float*)pOut;
  const int ch = v->channels;

  if (v->ended) { if (pRead) *pRead = 0; return MA_AT_END; }

  ma_uint64 done = 0;
  const double r = std::min(kMaxRatio, std::max(kMinRatio, v->ratio.load()));

  while (done < frameCount) {
    int block = (int)std::min<ma_uint64>(frameCount - done, kMaxBlock);
    int inNeed = std::max(1, (int)std::llround(block * r));

    // gather inNeed input frames (looping / one-shot) into per-channel scratch
    for (int i = 0; i < inNeed; ++i) {
      if (v->inPos >= v->origFrames) {
        if (v->loop) v->inPos = 0;
        else { for (int c = 0; c < ch; ++c) v->inCh[c][i] = 0.f; continue; }
      }
      const float* src = &v->orig[(size_t)v->inPos * ch];
      for (int c = 0; c < ch; ++c) v->inCh[c][i] = src[c];
      v->inPos++;
    }

    v->stretch.process(v->inPtr, inNeed, v->outPtr, block);

    for (int i = 0; i < block; ++i)
      for (int c = 0; c < ch; ++c) out[(size_t)(done + i) * ch + c] = v->outCh[c][i];

    done += block;

    if (!v->loop && v->inPos >= v->origFrames) { /* keep draining tail this call */ }
  }

  if (pRead) *pRead = frameCount;
  return MA_SUCCESS;
}

static ma_result voice_seek(ma_data_source* ds, ma_uint64 frameIndex) {
  StretchVoice* v = (StretchVoice*)ds;
  (void)frameIndex;
  v->resetPlayback();
  return MA_SUCCESS;
}

static ma_result voice_get_data_format(ma_data_source* ds, ma_format* fmt, ma_uint32* ch,
                                       ma_uint32* sr, ma_channel* map, size_t mapCap) {
  StretchVoice* v = (StretchVoice*)ds;
  if (fmt) *fmt = ma_format_f32;
  if (ch) *ch = (ma_uint32)v->channels;
  if (sr) *sr = (ma_uint32)v->sampleRate;
  if (map && mapCap > 0) ma_channel_map_init_standard(ma_standard_channel_map_default, map, mapCap, v->channels);
  return MA_SUCCESS;
}

static ma_result voice_get_cursor(ma_data_source* ds, ma_uint64* cursor) {
  StretchVoice* v = (StretchVoice*)ds;
  if (cursor) *cursor = v->inPos;
  return MA_SUCCESS;
}

static ma_data_source_vtable g_vtable = {
  voice_read, voice_seek, voice_get_data_format, voice_get_cursor, nullptr, nullptr, 0
};

// ---------------------------------------------------------------------------

struct LiveTraxCore::Impl {
  ma_engine engine{};
  bool ready = false;
  float masterVolume = 1.0f;
  double masterBpm = 120.0;
  std::unordered_map<std::string, std::unique_ptr<StretchVoice>> pads;

  // transport / sync
  int sigNum = 4, sigDen = 4;
  double quantizeBeats = 4.0;      // one bar in 4/4
  bool transportPlaying = false;
  ma_uint64 transportStart = 0;    // engine frame of the grid origin
  std::string jsonBuf;

  void destroy(StretchVoice* v) {
    if (v->hasSound) { ma_sound_uninit(&v->sound); v->hasSound = false; }
    ma_data_source_uninit(&v->base);
  }

  double ratioFor(StretchVoice* v) {
    double base = v->baseBpm > 0 ? v->baseBpm : masterBpm;
    double t = masterBpm > 0 ? masterBpm : base;
    return base > 0 ? (t / base) : 1.0;
  }

  // ---- clock math ----
  double sr() { return (double)ma_engine_get_sample_rate(&engine); }
  ma_uint64 now() { return ma_engine_get_time_in_pcm_frames(&engine); }
  double framesPerBeat() {
    double b = masterBpm > 0 ? masterBpm : 120.0;
    return sr() * 60.0 / b * (4.0 / (double)(sigDen > 0 ? sigDen : 4));
  }
  double framesPerBar() { return framesPerBeat() * (sigNum > 0 ? sigNum : 4); }
  ma_uint64 quantumFrames() {
    return quantizeBeats > 0 ? (ma_uint64)std::llround(quantizeBeats * framesPerBeat()) : 0;
  }

  // Next grid boundary at/after now()+safety. If the transport is stopped or
  // quantize is off, returns a near-immediate frame.
  ma_uint64 nextBoundary() {
    ma_uint64 n = now();
    ma_uint64 safety = (ma_uint64)std::llround(sr() * 0.020); // 20ms headroom
    if (!transportPlaying) return n + safety;
    ma_uint64 q = quantumFrames();
    if (q == 0) return n + safety;
    ma_uint64 origin = transportStart;
    ma_uint64 t = n + safety;
    if (t < origin) return origin;
    ma_uint64 rel = t - origin;
    ma_uint64 k = (rel + q - 1) / q; // ceil
    if (k == 0) k = 1;
    return origin + k * q;
  }

  bool decode(const std::string& path, StretchVoice* v) {
    ma_decoder_config dc = ma_decoder_config_init(ma_format_f32, 0, 0);
    ma_decoder dec;
    if (ma_decoder_init_file(path.c_str(), &dc, &dec) != MA_SUCCESS) return false;
    v->channels = (int)dec.outputChannels;
    v->sampleRate = (int)dec.outputSampleRate;
    ma_uint64 total = 0;
    ma_decoder_get_length_in_pcm_frames(&dec, &total);
    v->orig.assign((size_t)total * v->channels, 0.f);
    ma_uint64 read = 0;
    ma_decoder_read_pcm_frames(&dec, v->orig.data(), total, &read);
    v->origFrames = read;
    ma_decoder_uninit(&dec);
    return read > 0;
  }
};

LiveTraxCore::LiveTraxCore() : impl_(new Impl()) {}
LiveTraxCore::~LiveTraxCore() { shutdown(); delete impl_; }

bool LiveTraxCore::init() {
  if (impl_->ready) return true;
  if (ma_engine_init(nullptr, &impl_->engine) != MA_SUCCESS) return false;
  impl_->ready = true;
  return true;
}

void LiveTraxCore::shutdown() {
  if (!impl_->ready) return;
  for (auto& kv : impl_->pads) impl_->destroy(kv.second.get());
  impl_->pads.clear();
  ma_engine_uninit(&impl_->engine);
  impl_->ready = false;
}

bool LiveTraxCore::loadPad(const std::string& id, const std::string& path, double bpm, bool loop) {
  if (!impl_->ready) return false;
  unloadPad(id);
  auto v = std::make_unique<StretchVoice>();
  v->baseBpm = bpm > 0 ? bpm : impl_->masterBpm;
  v->loop = loop;
  if (!impl_->decode(path, v.get())) return false;
  v->allocScratch();
  v->stretch.presetDefault(v->channels, (float)v->sampleRate);
  v->ratio.store(impl_->ratioFor(v.get()));

  ma_data_source_config dsc = ma_data_source_config_init();
  dsc.vtable = &g_vtable;
  if (ma_data_source_init(&dsc, &v->base) != MA_SUCCESS) return false;

  if (ma_sound_init_from_data_source(&impl_->engine, &v->base, 0, nullptr, &v->sound) != MA_SUCCESS) {
    ma_data_source_uninit(&v->base);
    return false;
  }
  ma_sound_set_volume(&v->sound, impl_->masterVolume);
  v->hasSound = true;
  v->stopFrame = kNoStop;
  impl_->pads[id] = std::move(v);
  return true;
}

void LiveTraxCore::unloadPad(const std::string& id) {
  auto it = impl_->pads.find(id);
  if (it == impl_->pads.end()) return;
  impl_->destroy(it->second.get());
  impl_->pads.erase(it);
}

// ---- immediate controls ----
void LiveTraxCore::trigger(const std::string& id) {
  auto it = impl_->pads.find(id);
  if (it == impl_->pads.end() || !it->second->hasSound) return;
  StretchVoice* v = it->second.get();
  ma_sound_stop(&v->sound);
  ma_sound_seek_to_pcm_frame(&v->sound, 0);
  ma_sound_set_start_time_in_pcm_frames(&v->sound, 0);
  ma_sound_set_stop_time_in_pcm_frames(&v->sound, kNoStop);
  v->startFrame = impl_->now();
  v->stopFrame = kNoStop;
  ma_sound_start(&v->sound);
}

void LiveTraxCore::stop(const std::string& id) {
  auto it = impl_->pads.find(id);
  if (it == impl_->pads.end() || !it->second->hasSound) return;
  StretchVoice* v = it->second.get();
  ma_sound_stop(&v->sound);
  ma_sound_seek_to_pcm_frame(&v->sound, 0);
  v->stopFrame = 0; // already stopped
}

void LiveTraxCore::stopAll() {
  for (auto& kv : impl_->pads)
    if (kv.second->hasSound) {
      ma_sound_stop(&kv.second->sound);
      ma_sound_seek_to_pcm_frame(&kv.second->sound, 0);
      kv.second->stopFrame = 0;
    }
}

// ---- quantized controls ----
// Launch on the next grid boundary ONLY when we're actually quantizing
// (transport running + a non-zero quantum). Otherwise play immediately, exactly
// like the plain trigger — this is the proven path and keeps finger-drumming and
// "just tap to preview" instant.
void LiveTraxCore::triggerSync(const std::string& id) {
  auto it = impl_->pads.find(id);
  if (it == impl_->pads.end() || !it->second->hasSound) return;
  StretchVoice* v = it->second.get();

  bool quantized = impl_->transportPlaying && impl_->quantumFrames() > 0;
  ma_uint64 n = impl_->now();
  ma_uint64 startAt = quantized ? impl_->nextBoundary() : 0; // 0 => immediate (in the past)

  ma_sound_stop(&v->sound);
  ma_sound_seek_to_pcm_frame(&v->sound, 0);
  ma_sound_set_stop_time_in_pcm_frames(&v->sound, kNoStop);
  ma_sound_set_start_time_in_pcm_frames(&v->sound, startAt);
  v->startFrame = quantized ? startAt : n;
  v->stopFrame = kNoStop;
  ma_sound_start(&v->sound);
}

void LiveTraxCore::stopSync(const std::string& id) {
  auto it = impl_->pads.find(id);
  if (it == impl_->pads.end() || !it->second->hasSound) return;
  StretchVoice* v = it->second.get();

  bool quantized = impl_->transportPlaying && impl_->quantumFrames() > 0;
  if (!quantized) { stop(id); return; } // immediate

  ma_uint64 b = impl_->nextBoundary();
  ma_sound_set_stop_time_in_pcm_frames(&v->sound, b);
  v->stopFrame = b;
}

void LiveTraxCore::setMasterVolume(float vol) {
  impl_->masterVolume = vol < 0 ? 0 : (vol > 1 ? 1 : vol);
  for (auto& kv : impl_->pads)
    if (kv.second->hasSound) ma_sound_set_volume(&kv.second->sound, impl_->masterVolume);
}

// Live, seamless tempo: just update each voice's atomic ratio. No restart.
void LiveTraxCore::setMasterTempo(double bpm) {
  if (bpm > 0) impl_->masterBpm = bpm;
  for (auto& kv : impl_->pads) kv.second->ratio.store(impl_->ratioFor(kv.second.get()));
}

// Change one loop's own (base) tempo and re-lock its stretch ratio live, so the
// slice count (JS, from bpm+duration) and the tempo-match both update with no
// break in playback.
void LiveTraxCore::setPadBpm(const std::string& id, double bpm) {
  auto it = impl_->pads.find(id);
  if (it == impl_->pads.end()) return;
  StretchVoice* v = it->second.get();
  v->baseBpm = bpm > 0 ? bpm : impl_->masterBpm;
  v->ratio.store(impl_->ratioFor(v));
}

void LiveTraxCore::applyTempo() { setMasterTempo(impl_->masterBpm); }

double LiveTraxCore::padDuration(const std::string& id) {
  auto it = impl_->pads.find(id);
  if (it == impl_->pads.end()) return 0.0;
  StretchVoice* v = it->second.get();
  if (v->sampleRate <= 0) return 0.0;
  return (double)v->origFrames / (double)v->sampleRate;
}

// Automatic tempo (BPM) detection for an imported file.
//   1. decode -> mono
//   2. onset-energy novelty envelope (rectified energy difference per hop)
//   3. autocorrelation of the envelope -> dominant beat period (70..180 BPM)
//   4. loops are an exact number of beats, so snap to the BPM that makes the
//      loop length a whole number of beats (turns 87.6 into a clean 88), then
//      fold into a musical range.
double LiveTraxCore::estimateBpm(const std::string& path) {
  ma_decoder_config dc = ma_decoder_config_init(ma_format_f32, 1, 0); // force mono
  ma_decoder dec;
  if (ma_decoder_init_file(path.c_str(), &dc, &dec) != MA_SUCCESS) return 0.0;
  ma_uint32 sr = dec.outputSampleRate;
  ma_uint64 total = 0;
  ma_decoder_get_length_in_pcm_frames(&dec, &total);
  if (total == 0 || sr == 0) { ma_decoder_uninit(&dec); return 0.0; }
  std::vector<float> mono((size_t)total, 0.f);
  ma_uint64 read = 0;
  ma_decoder_read_pcm_frames(&dec, mono.data(), total, &read);
  ma_decoder_uninit(&dec);
  if (read < (ma_uint64)sr / 2) return 0.0; // < 0.5s, too short to analyze
  double durationSec = (double)read / (double)sr;

  // ---- onset-energy novelty envelope ----
  const int H = 256; // hop
  int nFrames = (int)(read / H);
  if (nFrames < 8) return 0.0;
  std::vector<float> env(nFrames, 0.f);
  double prev = 0.0;
  for (int i = 0; i < nFrames; ++i) {
    double e = 0.0;
    const float* p = &mono[(size_t)i * H];
    int nn = (int)std::min<ma_uint64>(H, read - (ma_uint64)i * H);
    for (int j = 0; j < nn; ++j) e += (double)p[j] * (double)p[j];
    double nov = e - prev; if (nov < 0) nov = 0;
    env[i] = (float)nov;
    prev = e;
  }
  double mean = 0.0; for (float x : env) mean += x; mean /= (double)nFrames;
  for (auto& x : env) x = (float)std::max(0.0, (double)x - mean); // subtract DC

  // ---- autocorrelation over the musical BPM range ----
  double frameRate = (double)sr / (double)H;
  int minLag = (int)std::floor(frameRate * 60.0 / 180.0);
  int maxLag = (int)std::ceil (frameRate * 60.0 / 70.0);
  if (minLag < 1) minLag = 1;
  if (maxLag > nFrames - 1) maxLag = nFrames - 1;
  double bestScore = -1.0, bestBpm = 0.0;
  for (int lag = minLag; lag <= maxLag; ++lag) {
    double s = 0.0;
    for (int i = lag; i < nFrames; ++i) s += (double)env[i] * (double)env[i - lag];
    if (s > bestScore) { bestScore = s; bestBpm = 60.0 * frameRate / (double)lag; }
  }
  if (bestBpm <= 0.0) return 0.0;

  // ---- loop-length snap: exact BPM from an integer beat count ----
  double beatPeriod = 60.0 / bestBpm;
  long beats = (long)std::lround(durationSec / beatPeriod);
  if (beats < 1) beats = 1;
  double bpm = (double)beats * 60.0 / durationSec;
  while (bpm < 70.0 && beats * 2 <= 1024) { beats *= 2; bpm = (double)beats * 60.0 / durationSec; }
  while (bpm > 170.0 && beats % 2 == 0)   { beats /= 2; bpm = (double)beats * 60.0 / durationSec; }
  bpm = std::round(bpm * 100.0) / 100.0; // 2 decimals
  return bpm;
}

// ---- transport / sync ----
void LiveTraxCore::startTransport() {
  impl_->transportStart = impl_->now();
  impl_->transportPlaying = true;
}

void LiveTraxCore::stopTransport() {
  impl_->transportPlaying = false;
}

void LiveTraxCore::setMasterSignature(int num, int den) {
  if (num > 0) impl_->sigNum = num;
  if (den > 0) impl_->sigDen = den;
}

void LiveTraxCore::setQuantize(double beats) {
  impl_->quantizeBeats = beats > 0 ? beats : 0.0;
}

double LiveTraxCore::transportInfo(int which) {
  double fpb = impl_->framesPerBeat();
  double fbar = impl_->framesPerBar();
  ma_uint64 n = impl_->now();
  double pos = 0.0;
  if (impl_->transportPlaying && n >= impl_->transportStart)
    pos = (double)(n - impl_->transportStart);
  long barIndex = fbar > 0 ? (long)std::floor(pos / fbar) : 0;
  double inBar = pos - (double)barIndex * fbar;
  long beatInBar = fpb > 0 ? (long)std::floor(inBar / fpb) : 0;
  double phase = fpb > 0 ? (inBar - (double)beatInBar * fpb) / fpb : 0.0;
  switch (which) {
    case 0: return impl_->transportPlaying ? 1.0 : 0.0;
    case 1: return (double)barIndex;
    case 2: return (double)beatInBar;
    case 3: return phase;
    case 4: return (double)impl_->sigNum;
    default: return 0.0;
  }
}

const char* LiveTraxCore::activePadsJSON() {
  std::string& buf = impl_->jsonBuf;
  buf = "{";
  ma_uint64 n = impl_->now();
  bool first = true;
  for (auto& kv : impl_->pads) {
    StretchVoice* v = kv.second.get();
    if (!v->hasSound) continue;

    int state;
    if (v->stopFrame != kNoStop && n >= v->stopFrame) state = 0;      // stopped
    else if (!ma_sound_is_playing(&v->sound) && n >= v->startFrame) state = 0; // idle
    else if (n < v->startFrame) state = 1;                            // armed (scheduled)
    else state = 2;                                                   // playing
    if (state == 0) continue;

    // Loop phase (0..1) straight from the audio playhead, so the UI highlight
    // wraps exactly when the loop repeats — locked to what is heard, not a
    // free-running counter. The slice COUNT is derived in JS from the loop's
    // own bpm + duration (see padDuration), so it never depends on the project
    // signature.
    double ph = 0.0;
    if (state == 2) {
      double r = std::min(kMaxRatio, std::max(kMinRatio, v->ratio.load()));
      double loopOut = r > 0 ? (double)v->origFrames / r : 0.0; // output frames per loop
      if (loopOut > 0) {
        double elapsed = (double)(n - v->startFrame);
        ph = std::fmod(elapsed, loopOut) / loopOut;
        if (ph < 0) ph += 1.0;
      }
    }

    if (!first) buf += ",";
    first = false;
    buf += "\"";
    buf += kv.first;
    buf += "\":{\"s\":";
    buf += std::to_string(state);
    buf += ",\"ph\":";
    buf += std::to_string(ph);
    buf += "}";
  }
  buf += "}";
  return buf.c_str();
}

} // namespace livetrax
