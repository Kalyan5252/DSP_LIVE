#include "PadEngine.h"

namespace livetrax {

PadEngine::PadEngine() = default;

PadEngine::~PadEngine() { shutdown(); }

bool PadEngine::init() {
  if (engineReady_) return true;

  // Default config: miniaudio chooses the platform backend, a sensible sample
  // rate, and a low-latency buffer size. This is where you'd later tune period
  // size if you needed even tighter latency.
  ma_result r = ma_engine_init(nullptr, &engine_);
  if (r != MA_SUCCESS) {
    return false;
  }
  engineReady_ = true;
  return true;
}

void PadEngine::shutdown() {
  if (!engineReady_) return;
  for (int i = 0; i < kMaxPads; ++i) {
    clearPad(i);
  }
  ma_engine_uninit(&engine_);
  engineReady_ = false;
}

bool PadEngine::loadPad(int index, const std::string& filePath, bool loop) {
  if (!engineReady_ || !validIndex(index)) return false;

  clearPad(index);

  // MA_SOUND_FLAG_DECODE: fully decode into memory now, so triggering later
  // never blocks on file IO — the key to reliable, click-free launches.
  const ma_uint32 flags = MA_SOUND_FLAG_DECODE;
  ma_result r = ma_sound_init_from_file(
      &engine_, filePath.c_str(), flags, nullptr, nullptr, &pads_[index].sound);
  if (r != MA_SUCCESS) {
    return false;
  }

  ma_sound_set_looping(&pads_[index].sound, loop ? MA_TRUE : MA_FALSE);
  pads_[index].loaded = true;
  pads_[index].loop = loop;
  return true;
}

void PadEngine::clearPad(int index) {
  if (!validIndex(index)) return;
  if (pads_[index].loaded) {
    ma_sound_uninit(&pads_[index].sound);
    pads_[index].loaded = false;
  }
}

void PadEngine::trigger(int index) {
  if (!validIndex(index) || !pads_[index].loaded) return;
  ma_sound& s = pads_[index].sound;

  if (ma_sound_is_playing(&s) == MA_TRUE) {
    ma_sound_stop(&s);
    ma_sound_seek_to_pcm_frame(&s, 0);
  } else {
    ma_sound_seek_to_pcm_frame(&s, 0);
    ma_sound_start(&s);
  }
}

void PadEngine::stop(int index) {
  if (!validIndex(index) || !pads_[index].loaded) return;
  ma_sound_stop(&pads_[index].sound);
  ma_sound_seek_to_pcm_frame(&pads_[index].sound, 0);
}

void PadEngine::setLoop(int index, bool loop) {
  if (!validIndex(index) || !pads_[index].loaded) return;
  pads_[index].loop = loop;
  ma_sound_set_looping(&pads_[index].sound, loop ? MA_TRUE : MA_FALSE);
}

void PadEngine::stopAll() {
  for (int i = 0; i < kMaxPads; ++i) {
    if (pads_[i].loaded) {
      ma_sound_stop(&pads_[i].sound);
      ma_sound_seek_to_pcm_frame(&pads_[i].sound, 0);
    }
  }
}

bool PadEngine::isPlaying(int index) {
  if (!validIndex(index) || !pads_[index].loaded) return false;
  return ma_sound_is_playing(&pads_[index].sound) == MA_TRUE;
}

bool PadEngine::isLoaded(int index) const {
  return validIndex(index) && pads_[index].loaded;
}

} // namespace livetrax
