// PadEngine — a small, reliable pad-trigger audio engine in C++.
//
// Design goals, in order:
//   1. Reliability: audio never glitches or blocks. We lean on miniaudio's
//      ma_engine, which owns a high-priority audio thread and a real-time-safe
//      mixing graph. Samples are decoded fully into memory at load time, so the
//      audio thread never touches the disk.
//   2. Simplicity: one class, no external framework, plain C++17. You own it.
//   3. Portability: identical code on iOS, Android, macOS, Windows, Linux.
//      miniaudio picks the right native backend (Core Audio, AAudio/OpenSL,
//      WASAPI, ALSA) automatically.
//
// This is the piece that makes the app "reliable software": the timing and
// mixing live here in native code, below the JavaScript layer.
//
// Threading contract: the public methods below are meant to be called from your
// app/UI thread. They forward to miniaudio, whose start/stop/seek/looping calls
// are safe to invoke while the audio thread is running.

#pragma once

#include "miniaudio.h"
#include <string>

namespace livetrax {

// The board is a fixed grid. Bump this if you want more pads; memory cost is
// only the sample data you load.
static constexpr int kMaxPads = 16;

class PadEngine {
public:
  PadEngine();
  ~PadEngine();

  PadEngine(const PadEngine&) = delete;
  PadEngine& operator=(const PadEngine&) = delete;

  // Start the audio device and mixing engine. Call once. Returns false if the
  // system has no usable audio output.
  bool init();

  // Stop everything and release the device. Safe to call more than once.
  void shutdown();

  // Load an audio file onto a pad. Decodes the whole file into RAM so playback
  // is glitch-free. Replaces whatever was on that pad. Returns false if the file
  // can't be opened/decoded or the index is out of range.
  bool loadPad(int index, const std::string& filePath, bool loop);

  // Free a pad's sample.
  void clearPad(int index);

  // Tap behavior: if the pad is playing, stop it and rewind; otherwise rewind
  // and play from the top. Many pads can sound at once.
  void trigger(int index);

  // Stop a single pad and rewind it.
  void stop(int index);

  // Switch a loaded pad between loop (repeats until stopped) and one-shot.
  void setLoop(int index, bool loop);

  // Stop every pad — the performer's panic button.
  void stopAll();

  bool isPlaying(int index);
  bool isLoaded(int index) const;

private:
  struct Pad {
    ma_sound sound;
    bool loaded = false;
    bool loop = true;
  };

  bool validIndex(int index) const { return index >= 0 && index < kMaxPads; }

  ma_engine engine_{};
  bool engineReady_ = false;
  Pad pads_[kMaxPads];
};

} // namespace livetrax
