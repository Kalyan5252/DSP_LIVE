// transport_demo — Phase 1 proof: watch (and hear) the master clock in each
// time signature, and confirm the bar/beat math before any of it drives the
// pad engine or the UI.
//
// Usage:
//   transport_demo --bpm 120 --sig 7/8 [--bars 2] [--grid] [--metronome] [--sr 48000]
//
//   --grid        print every beat boundary's sample index for --bars bars and
//                 exit (deterministic — this is the math you can check by hand).
//   --metronome   real-time: click through --bars bars (accents higher-pitched).
//   (default with neither flag: real-time count, printed, no audio.)

#include "miniaudio.h"
#include "Transport.h"

#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <string>
#include <thread>
#include <vector>

using namespace livetrax;

// Build a short sine "click" as a mono f32 buffer wrapped in a ma_audio_buffer.
static void makeClick(std::vector<float>& buf, ma_audio_buffer& ab, int sr,
                      float freq, float ms) {
  int n = (int)(sr * ms / 1000.0f);
  buf.assign(n, 0.f);
  for (int i = 0; i < n; ++i) {
    float env = 1.0f - (float)i / n;               // quick decay
    buf[i] = 0.4f * env * std::sin(2.f * 3.14159265f * freq * i / sr);
  }
  ma_audio_buffer_config cfg =
      ma_audio_buffer_config_init(ma_format_f32, 1, n, buf.data(), nullptr);
  ma_audio_buffer_init(&cfg, &ab);
}

int main(int argc, char** argv) {
  double bpm = 120, sr = 48000;
  int num = 4, den = 4, bars = 2;
  bool gridMode = false, metronome = false;

  for (int i = 1; i < argc; ++i) {
    std::string a = argv[i];
    auto nextf = [&]() { return (i + 1 < argc) ? std::atof(argv[++i]) : 0.0; };
    if (a == "--bpm") bpm = nextf();
    else if (a == "--sr") sr = nextf();
    else if (a == "--bars") bars = (int)nextf();
    else if (a == "--grid") gridMode = true;
    else if (a == "--metronome") metronome = true;
    else if (a == "--sig" && i + 1 < argc) {
      std::sscanf(argv[++i], "%d/%d", &num, &den);
    }
  }

  Transport t;
  t.configure(sr);
  t.setTempo(bpm);
  t.setSignature(num, den);

  const double q = t.quarterSamples(), beat = t.beatSamples(), bar = t.barSamples();
  std::printf("Live Trax transport\n");
  std::printf("  tempo      : %.2f BPM (quarter-note)\n", bpm);
  std::printf("  signature  : %d/%d   (%d beats/bar)\n", num, den, t.beatsPerBar());
  std::printf("  sample rate: %.0f Hz\n", sr);
  std::printf("  quarter    : %.1f ms  (%.1f samples)\n", q * 1000 / sr, q);
  std::printf("  beat       : %.1f ms  (%.1f samples)\n", beat * 1000 / sr, beat);
  std::printf("  bar        : %.1f ms  (%.1f samples)\n", bar * 1000 / sr, bar);
  std::printf("  accents on : ");
  for (int b = 0; b < t.beatsPerBar(); ++b)
    if (t.isAccent(b)) std::printf("%d ", b + 1);
  std::printf("\n\n");

  const int beatsPerBar = t.beatsPerBar();

  // Deterministic grid: print the sample index of every beat boundary.
  if (gridMode) {
    std::printf("beat grid (%d bars):\n", bars);
    for (int b = 0; b <= bars * beatsPerBar; ++b) {
      uint64_t s = (uint64_t)std::llround(b * beat);
      int inBar = b % beatsPerBar;
      const char* mark = (inBar == 0) ? "|BAR " : (t.isAccent(inBar) ? " >   " : "     ");
      std::printf("  %sbeat %2d  bar %d.%d  @ %8llu samples  (%.3fs)\n",
                  mark, b, b / beatsPerBar, inBar, (unsigned long long)s, s / sr);
    }
    return 0;
  }

  // Real-time: advance the clock in wall time; fire on each beat boundary.
  ma_engine engine;
  std::vector<float> accBuf, normBuf;
  ma_audio_buffer accAb, normAb;
  ma_sound accSnd, normSnd;
  bool audio = metronome && ma_engine_init(nullptr, &engine) == MA_SUCCESS;
  if (audio) {
    makeClick(accBuf, accAb, (int)sr, 1500.f, 40.f);
    makeClick(normBuf, normAb, (int)sr, 1000.f, 40.f);
    ma_sound_init_from_data_source(&engine, &accAb, 0, nullptr, &accSnd);
    ma_sound_init_from_data_source(&engine, &normAb, 0, nullptr, &normSnd);
  }

  std::printf("counting %d bars%s...\n", bars, audio ? " (with clicks)" : "");
  t.setPlaying(true);
  const int totalBeats = bars * beatsPerBar;
  auto t0 = std::chrono::steady_clock::now();
  for (int b = 0; b < totalBeats; ++b) {
    double targetSec = (b * beat) / sr;
    while (true) {
      double el = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
      if (el >= targetSec) break;
      std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }
    t.setPosition((uint64_t)std::llround(b * beat));
    int inBar = t.beatInBar();
    bool accent = t.isAccent(inBar);
    std::printf("  bar %d  beat %d%s\n", (int)(t.barIndex() + 1), inBar + 1,
                accent ? "  *" : "");
    std::fflush(stdout);
    if (audio) {
      ma_sound* s = accent ? &accSnd : &normSnd;
      ma_sound_seek_to_pcm_frame(s, 0);
      ma_sound_start(s);
    }
  }
  // let the last click ring
  std::this_thread::sleep_for(std::chrono::milliseconds(200));

  if (audio) {
    ma_sound_uninit(&accSnd);
    ma_sound_uninit(&normSnd);
    ma_audio_buffer_uninit(&accAb);
    ma_audio_buffer_uninit(&normAb);
    ma_engine_uninit(&engine);
  }
  return 0;
}
