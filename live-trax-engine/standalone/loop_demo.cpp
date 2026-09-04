// loop_demo — play your audio sample and the metronome AT THE SAME TIME.
//
// This is the first time the two proven pieces meet: the master clock/signature
// (Transport) and the tempo time-stretch (Signalsmith). Your loop is stretched
// to the master tempo so it stays locked, then played looping while the
// metronome clicks the beats of the chosen signature over the top.
//
// Two ways to run it:
//   LIVE  (default): plays through your speakers in real time.
//   RENDER (--render out.wav): writes a WAV with the loop and clicks mixed
//          together — handy for sharing, and the exact thing that proves the
//          clicks land on the beat.
//
// Usage:
//   loop_demo IN.wav [--bpm 120] [--sig 4/4]
//             [--bars N | --orig BPM]   # how to tempo-lock the loop (see below)
//             [--seconds 8] [--no-metronome] [--render out.wav]
//
//   --bars N   the loop is N bars long -> stretch it to exactly N bars at the
//              master tempo. Most reliable lock for a clean loop.
//   --orig B   the loop was recorded at B BPM -> stretch by B/bpm.
//   (neither)  play the loop as-is (it may drift against the click if its
//              tempo doesn't match --bpm).

#include "miniaudio.h"
#include "Transport.h"
#include "signalsmith-stretch/signalsmith-stretch.h"

#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <string>
#include <thread>
#include <vector>

using namespace livetrax;

static void makeClick(std::vector<float>& buf, int sr, float freq, float ms) {
  int n = (int)(sr * ms / 1000.0f);
  buf.assign(n, 0.f);
  for (int i = 0; i < n; ++i) {
    float env = 1.0f - (float)i / n;
    buf[i] = 0.5f * env * std::sin(2.f * 3.14159265f * freq * i / sr);
  }
}

int main(int argc, char** argv) {
  if (argc < 2) {
    std::printf("Usage: %s IN.wav [--bpm 120] [--sig 4/4] [--bars N | --orig BPM]"
                " [--seconds 8] [--no-metronome] [--render out.wav]\n", argv[0]);
    return 1;
  }
  std::string inPath = argv[1], renderPath;
  double bpm = 120, orig = 0, seconds = 8;
  int num = 4, den = 4, bars = 0;
  bool metro = true;

  for (int i = 2; i < argc; ++i) {
    std::string a = argv[i];
    auto nf = [&]() { return (i + 1 < argc) ? std::atof(argv[++i]) : 0.0; };
    if (a == "--bpm") bpm = nf();
    else if (a == "--orig") orig = nf();
    else if (a == "--bars") bars = (int)nf();
    else if (a == "--seconds") seconds = nf();
    else if (a == "--no-metronome") metro = false;
    else if (a == "--render" && i + 1 < argc) renderPath = argv[++i];
    else if (a == "--sig" && i + 1 < argc) std::sscanf(argv[++i], "%d/%d", &num, &den);
  }

  // --- decode the sample to interleaved f32 ---
  ma_decoder_config dcfg = ma_decoder_config_init(ma_format_f32, 0, 0);
  ma_decoder dec;
  if (ma_decoder_init_file(inPath.c_str(), &dcfg, &dec) != MA_SUCCESS) {
    std::fprintf(stderr, "Could not open: %s\n", inPath.c_str());
    return 1;
  }
  const int ch = (int)dec.outputChannels;
  const int sr = (int)dec.outputSampleRate;
  ma_uint64 total = 0;
  ma_decoder_get_length_in_pcm_frames(&dec, &total);
  std::vector<float> inBuf((size_t)total * ch);
  ma_uint64 got = 0;
  ma_decoder_read_pcm_frames(&dec, inBuf.data(), total, &got);
  ma_decoder_uninit(&dec);
  const int inFrames = (int)got;

  Transport t;
  t.configure(sr);
  t.setTempo(bpm);
  t.setSignature(num, den);
  const double beatS = t.beatSamples();
  const double barS = t.barSamples();

  // --- decide the tempo-lock ratio ---
  int loopFrames = inFrames;
  double ratio = 1.0;
  if (bars > 0) {
    loopFrames = (int)std::llround(bars * barS);
    ratio = (double)loopFrames / inFrames;
  } else if (orig > 0) {
    ratio = orig / bpm;
    loopFrames = (int)std::llround(inFrames * ratio);
  }

  // --- stretch the loop to the master tempo (pitch preserved) ---
  std::vector<float> loop;  // interleaved, length loopFrames*ch
  if (std::fabs(ratio - 1.0) > 1e-4) {
    std::vector<std::vector<float>> inCh(ch, std::vector<float>(inFrames));
    for (int f = 0; f < inFrames; ++f)
      for (int c = 0; c < ch; ++c) inCh[c][f] = inBuf[(size_t)f * ch + c];
    std::vector<std::vector<float>> outCh(ch, std::vector<float>(loopFrames, 0.f));
    std::vector<float*> ip(ch), op(ch);
    for (int c = 0; c < ch; ++c) { ip[c] = inCh[c].data(); op[c] = outCh[c].data(); }
    signalsmith::stretch::SignalsmithStretch<float> st;
    st.presetDefault(ch, (float)sr);
    st.exact(ip, inFrames, op, loopFrames);
    loop.resize((size_t)loopFrames * ch);
    for (int f = 0; f < loopFrames; ++f)
      for (int c = 0; c < ch; ++c) loop[(size_t)f * ch + c] = outCh[c][f];
  } else {
    loop = inBuf;
    loopFrames = inFrames;
  }

  std::printf("sample : %s  (%d ch @ %d Hz)\n", inPath.c_str(), ch, sr);
  std::printf("master : %.1f BPM  %d/%d   bar=%.0f samples\n", bpm, num, den, barS);
  if (bars > 0) std::printf("lock   : %d bars -> ratio %.4f\n", bars, ratio);
  else if (orig > 0) std::printf("lock   : orig %.1f BPM -> ratio %.4f\n", orig, ratio);
  else std::printf("lock   : none (playing as-is; may drift against the click)\n");
  std::printf("loop   : %d frames (%.3fs)\n", loopFrames, loopFrames / (double)sr);

  // Build click buffers once.
  std::vector<float> accClick, normClick;
  makeClick(accClick, sr, 1500.f, 40.f);
  makeClick(normClick, sr, 1000.f, 40.f);
  const int beatsPerBar = t.beatsPerBar();

  // ================= RENDER MODE: mix loop + clicks into a WAV =================
  if (!renderPath.empty()) {
    const int outFrames = (int)std::llround(seconds * sr);
    std::vector<float> out((size_t)outFrames * ch, 0.f);
    // tile the loop
    for (int i = 0; i < outFrames; ++i) {
      int li = (loopFrames > 0) ? (i % loopFrames) : 0;
      for (int c = 0; c < ch; ++c) out[(size_t)i * ch + c] = loop[(size_t)li * ch + c];
    }
    // mix clicks on every beat
    if (metro) {
      for (int b = 0;; ++b) {
        long pos = (long)std::llround(b * beatS);
        if (pos >= outFrames) break;
        bool acc = t.isAccent(b % beatsPerBar);
        const std::vector<float>& clk = acc ? accClick : normClick;
        for (int i = 0; i < (int)clk.size() && pos + i < outFrames; ++i)
          for (int c = 0; c < ch; ++c) {
            float v = out[(size_t)(pos + i) * ch + c] + clk[i];
            out[(size_t)(pos + i) * ch + c] = v > 1 ? 1 : (v < -1 ? -1 : v);
          }
      }
    }
    ma_encoder_config ecfg =
        ma_encoder_config_init(ma_encoding_format_wav, ma_format_f32, ch, sr);
    ma_encoder enc;
    if (ma_encoder_init_file(renderPath.c_str(), &ecfg, &enc) != MA_SUCCESS) {
      std::fprintf(stderr, "Could not write: %s\n", renderPath.c_str());
      return 1;
    }
    ma_uint64 w = 0;
    ma_encoder_write_pcm_frames(&enc, out.data(), outFrames, &w);
    ma_encoder_uninit(&enc);
    std::printf("rendered %.1fs (loop + %s) -> %s\n", seconds,
                metro ? "metronome" : "no click", renderPath.c_str());
    return 0;
  }

  // ================= LIVE MODE: play loop + click together =================
  ma_engine engine;
  if (ma_engine_init(nullptr, &engine) != MA_SUCCESS) {
    std::fprintf(stderr, "No audio device. Try --render out.wav instead.\n");
    return 1;
  }
  ma_audio_buffer_config lcfg =
      ma_audio_buffer_config_init(ma_format_f32, ch, loopFrames, loop.data(), nullptr);
  ma_audio_buffer loopAb;
  ma_audio_buffer_init(&lcfg, &loopAb);
  ma_sound loopSnd;
  ma_sound_init_from_data_source(&engine, &loopAb, 0, nullptr, &loopSnd);
  ma_sound_set_looping(&loopSnd, MA_TRUE);

  ma_audio_buffer accAb, normAb;
  ma_sound accSnd, normSnd;
  if (metro) {
    ma_audio_buffer_config ac =
        ma_audio_buffer_config_init(ma_format_f32, 1, (ma_uint64)accClick.size(), accClick.data(), nullptr);
    ma_audio_buffer_init(&ac, &accAb);
    ma_audio_buffer_config nc =
        ma_audio_buffer_config_init(ma_format_f32, 1, (ma_uint64)normClick.size(), normClick.data(), nullptr);
    ma_audio_buffer_init(&nc, &normAb);
    ma_sound_init_from_data_source(&engine, &accAb, 0, nullptr, &accSnd);
    ma_sound_init_from_data_source(&engine, &normAb, 0, nullptr, &normSnd);
  }

  std::printf("\nplaying loop + metronome for %.0fs (Ctrl-C to stop)...\n", seconds);
  // Start both at the same instant so bar 1 of the loop == beat 1 of the click.
  ma_sound_start(&loopSnd);
  auto t0 = std::chrono::steady_clock::now();
  int b = 0;
  while (true) {
    double el = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
    if (el >= seconds) break;
    double beatTime = (b * beatS) / sr;
    if (el >= beatTime) {
      if (metro) {
        ma_sound* s = t.isAccent(b % beatsPerBar) ? &accSnd : &normSnd;
        ma_sound_seek_to_pcm_frame(s, 0);
        ma_sound_start(s);
      }
      ++b;
    } else {
      std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }
  }

  ma_sound_uninit(&loopSnd);
  ma_audio_buffer_uninit(&loopAb);
  if (metro) {
    ma_sound_uninit(&accSnd); ma_sound_uninit(&normSnd);
    ma_audio_buffer_uninit(&accAb); ma_audio_buffer_uninit(&normAb);
  }
  ma_engine_uninit(&engine);
  return 0;
}
