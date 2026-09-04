// stretch_demo — Phase 0 proof: stretch one audio file's tempo while preserving
// pitch, using Signalsmith Stretch, and write (and optionally play) the result.
//
// This is intentionally standalone — it does NOT touch PadEngine. Its only job
// is to prove the library produces good-sounding tempo changes on your Mac
// before we wire stretching into the pad voices (Phase 1/2).
//
// Usage:
//   stretch_demo IN.wav [--ratio R] [--orig BPM --target BPM] [--semitones S]
//                        [--out OUT.wav] [--play]
//
//   --ratio R      output length / input length. R>1 = slower/longer, pitch kept.
//   --orig/--target  set R = orig/target (a 120-BPM loop at 100 -> R=1.2).
//   --semitones S  pitch shift in semitones (0 = keep pitch; independent of tempo).
//   --out          output file (default: stretched.wav next to the input).
//   --play         play the result after writing (miniaudio device).

#include "miniaudio.h"
#include "signalsmith-stretch/signalsmith-stretch.h"

#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <string>
#include <thread>
#include <vector>

int main(int argc, char** argv) {
  if (argc < 2) {
    std::printf(
        "Usage: %s IN.wav [--ratio R] [--orig BPM --target BPM] "
        "[--semitones S] [--out OUT.wav] [--play]\n",
        argv[0]);
    return 1;
  }

  std::string inPath = argv[1];
  std::string outPath;
  double ratio = 1.0, orig = 0, target = 0, semitones = 0;
  bool play = false;

  for (int i = 2; i < argc; ++i) {
    std::string a = argv[i];
    auto next = [&]() -> double { return (i + 1 < argc) ? std::atof(argv[++i]) : 0.0; };
    if (a == "--ratio") ratio = next();
    else if (a == "--orig") orig = next();
    else if (a == "--target") target = next();
    else if (a == "--semitones") semitones = next();
    else if (a == "--out") { if (i + 1 < argc) outPath = argv[++i]; }
    else if (a == "--play") play = true;
  }
  if (orig > 0 && target > 0) ratio = orig / target; // tempo -> stretch ratio
  if (ratio <= 0) ratio = 1.0;
  if (outPath.empty()) {
    auto slash = inPath.find_last_of("/\\");
    std::string dir = (slash == std::string::npos) ? "" : inPath.substr(0, slash + 1);
    outPath = dir + "stretched.wav";
  }

  // --- 1. Decode the input fully to interleaved float32 ---
  ma_decoder_config dcfg = ma_decoder_config_init(ma_format_f32, 0, 0);
  ma_decoder decoder;
  if (ma_decoder_init_file(inPath.c_str(), &dcfg, &decoder) != MA_SUCCESS) {
    std::fprintf(stderr, "Could not open/decode: %s\n", inPath.c_str());
    return 1;
  }
  const int channels = (int)decoder.outputChannels;
  const int sampleRate = (int)decoder.outputSampleRate;

  ma_uint64 totalFrames = 0;
  ma_decoder_get_length_in_pcm_frames(&decoder, &totalFrames);

  std::vector<float> interleaved;
  interleaved.resize((size_t)totalFrames * channels);
  ma_uint64 framesRead = 0;
  ma_decoder_read_pcm_frames(&decoder, interleaved.data(), totalFrames, &framesRead);
  ma_decoder_uninit(&decoder);
  const int inFrames = (int)framesRead;
  if (inFrames <= 0) { std::fprintf(stderr, "Empty audio.\n"); return 1; }

  // --- 2. De-interleave into per-channel buffers (what Signalsmith wants) ---
  std::vector<std::vector<float>> inCh(channels, std::vector<float>(inFrames));
  for (int f = 0; f < inFrames; ++f)
    for (int c = 0; c < channels; ++c)
      inCh[c][f] = interleaved[(size_t)f * channels + c];

  const int outFrames = (int)std::llround((double)inFrames * ratio);
  std::vector<std::vector<float>> outCh(channels, std::vector<float>(outFrames, 0.f));

  std::vector<float*> inPtrs(channels), outPtrs(channels);
  for (int c = 0; c < channels; ++c) { inPtrs[c] = inCh[c].data(); outPtrs[c] = outCh[c].data(); }

  // --- 3. Stretch (pitch preserved; optional independent pitch shift) ---
  signalsmith::stretch::SignalsmithStretch<float> stretch;
  stretch.presetDefault(channels, (float)sampleRate);
  if (semitones != 0.0) stretch.setTransposeSemitones((float)semitones);
  bool ok = stretch.exact(inPtrs, inFrames, outPtrs, outFrames);
  if (!ok) std::fprintf(stderr, "warning: input too short for a clean stretch\n");

  // --- 4. Re-interleave and write a WAV ---
  std::vector<float> outInter((size_t)outFrames * channels);
  for (int f = 0; f < outFrames; ++f)
    for (int c = 0; c < channels; ++c)
      outInter[(size_t)f * channels + c] = outCh[c][f];

  ma_encoder_config ecfg =
      ma_encoder_config_init(ma_encoding_format_wav, ma_format_f32, channels, sampleRate);
  ma_encoder encoder;
  if (ma_encoder_init_file(outPath.c_str(), &ecfg, &encoder) != MA_SUCCESS) {
    std::fprintf(stderr, "Could not open output: %s\n", outPath.c_str());
    return 1;
  }
  ma_uint64 written = 0;
  ma_encoder_write_pcm_frames(&encoder, outInter.data(), outFrames, &written);
  ma_encoder_uninit(&encoder);

  std::printf("in:  %d frames @ %d Hz, %d ch  (%.2fs)\n", inFrames, sampleRate,
              channels, inFrames / (double)sampleRate);
  std::printf("out: %lld frames  (%.2fs)   ratio=%.4f  semitones=%.2f\n",
              (long long)written, written / (double)sampleRate, ratio, semitones);
  std::printf("wrote: %s\n", outPath.c_str());

  // --- 5. Optionally play it ---
  if (play) {
    ma_engine engine;
    if (ma_engine_init(nullptr, &engine) == MA_SUCCESS) {
      std::printf("playing... (Ctrl-C to stop)\n");
      ma_engine_play_sound(&engine, outPath.c_str(), nullptr);
      ma_uint64 ms = (ma_uint64)(written * 1000.0 / sampleRate) + 300;
      std::this_thread::sleep_for(std::chrono::milliseconds(ms));
      ma_engine_uninit(&engine);
    }
  }
  return 0;
}
