// ---------------------------------------------------------------------------
// Standalone time-stretch harness: CPU cost AND quality, scored, on a laptop.
//
//   make                                  # build ./stretch_test
//   ./stretch_test loop.wav               # all backends, default ratios
//   ./stretch_test --ratio 1.15 loop.wav
//   ./stretch_test --backend cheap --write out/ loop.wav
//
// Why this exists: the audio thread spends ~97% of its time inside the
// stretcher, so that is the thing to replace — but a cheaper stretcher is only
// a win if the artifacts stay acceptable. This measures both in one run, the
// same way tools/tempo_test made the tempo work provable.
//
// CPU is measured the way the engine actually calls it: pull 256 output frames
// at a time (a typical iOS callback), streaming, from a looping source.
//
// Quality is scored three ways, none of which replaces listening:
//
//   transients  Run the SHIPPING onset detector (analysis_core.h) on the input
//               and on the stretched output. Stretching is uniform, so an onset
//               at loop fraction f must still sit at fraction f afterwards.
//               Onsets that move (smearing) or vanish (softened attacks) show
//               up here directly. This is the artifact time-domain stretchers
//               risk most, so it is the metric that matters most.
//   spectral    Mean log-magnitude STFT distance from a reference render
//               (Signalsmith presetDefault). NOTE: this measures agreement with
//               that reference, not absolute quality — a genuinely better
//               stretcher would also score a nonzero distance here.
//   seam        Loops wrap. Discontinuity at the wrap point relative to the
//               signal's own typical sample-to-sample delta; >1 means the join
//               is sharper than the material, i.e. an audible click.
// ---------------------------------------------------------------------------
#define MA_NO_DEVICE_IO
#define MA_NO_ENGINE
#define MA_NO_GENERATION
#define MINIAUDIO_IMPLEMENTATION
#include "vendor/miniaudio.h"
#include "vendor/signalsmith-stretch.h"
#include "analysis_core.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <memory>
#include <string>
#include <vector>

using Clock = std::chrono::steady_clock;

static const int kCallback = 256;    // output frames per pull (typical iOS)

// ---------------------------------------------------------------------------
// backends
// ---------------------------------------------------------------------------
struct Backend {
  virtual ~Backend() {}
  virtual const char* name() const = 0;
  virtual void init(int ch, int sr) = 0;
  virtual void reset() = 0;
  virtual void process(float* const* in, int inN, float* const* out, int outN) = 0;
  // Output frames of delay through the stretcher. Every metric here compares
  // the output against the input, so this has to be removed first or the whole
  // comparison is measuring latency instead of quality.
  virtual int outputLatency() const = 0;
};

struct SignalsmithBackend : Backend {
  bool cheap;
  signalsmith::stretch::SignalsmithStretch<float> st;
  explicit SignalsmithBackend(bool c) : cheap(c) {}
  const char* name() const override { return cheap ? "signalsmith-cheap" : "signalsmith-default"; }
  void init(int ch, int sr) override {
    if (cheap) st.presetCheaper(ch, (float)sr); else st.presetDefault(ch, (float)sr);
  }
  void reset() override { st.reset(); }
  void process(float* const* in, int inN, float* const* out, int outN) override {
    st.process(in, inN, out, outN);
  }
  int outputLatency() const override { return st.outputLatency(); }
};

// Varispeed: resample instead of stretching. It changes pitch, so it is not a
// shippable option -- but it is the two reference corners at once. Its CPU is
// the floor any stretcher could hope for (a read and a lerp, no analysis), and
// its `struct` score is the ceiling, because resampling preserves rhythm
// exactly. Read it as: how close is a real stretcher to free, and how close is
// the structure metric to perfect.
struct VarispeedBackend : Backend {
  int chans_ = 1;
  const char* name() const override { return "varispeed (reference)"; }
  void init(int ch, int) override { chans_ = ch; }
  void reset() override {}
  int outputLatency() const override { return 0; }
  void process(float* const* in, int inN, float* const* out, int outN) override {
    if (outN <= 0 || inN <= 0) return;
    const double step = (double)inN / (double)outN;
    for (int c = 0; c < chans_; ++c) {
      for (int j = 0; j < outN; ++j) {
        double p = j * step;
        int a = std::min(inN - 1, (int)p);
        int b = std::min(inN - 1, a + 1);
        float fr = (float)(p - (int)p);
        out[c][j] = in[c][a] * (1.f - fr) + in[c][b] * fr;
      }
    }
  }
};

static std::unique_ptr<Backend> makeBackend(const std::string& n) {
  if (n == "cheap")   return std::unique_ptr<Backend>(new SignalsmithBackend(true));
  if (n == "default") return std::unique_ptr<Backend>(new SignalsmithBackend(false));
  if (n == "varispeed") return std::unique_ptr<Backend>(new VarispeedBackend());
  return nullptr;   // "ours" lands here once stretch_core.h exists
}
static const char* kBackends[] = { "varispeed", "cheap", "default" };

// ---------------------------------------------------------------------------
// audio io
// ---------------------------------------------------------------------------
struct Audio {
  std::vector<float> data;   // interleaved
  int channels = 2, sampleRate = 48000;
  size_t frames() const { return channels ? data.size() / channels : 0; }
};

static bool decode(const char* path, Audio& a) {
  ma_decoder_config dc = ma_decoder_config_init(ma_format_f32, 0, 0);
  ma_decoder dec;
  if (ma_decoder_init_file(path, &dc, &dec) != MA_SUCCESS) return false;
  a.channels = (int)dec.outputChannels;
  a.sampleRate = (int)dec.outputSampleRate;
  ma_uint64 total = 0;
  ma_decoder_get_length_in_pcm_frames(&dec, &total);
  a.data.assign((size_t)total * a.channels, 0.f);
  ma_uint64 read = 0;
  ma_decoder_read_pcm_frames(&dec, a.data.data(), total, &read);
  a.data.resize((size_t)read * a.channels);
  ma_decoder_uninit(&dec);
  return read > 0;
}

static bool writeWav(const std::string& path, const Audio& a) {
  ma_encoder_config cfg = ma_encoder_config_init(ma_encoding_format_wav, ma_format_f32,
                                                 (ma_uint32)a.channels, (ma_uint32)a.sampleRate);
  ma_encoder enc;
  if (ma_encoder_init_file(path.c_str(), &cfg, &enc) != MA_SUCCESS) return false;
  ma_uint64 w = 0;
  ma_encoder_write_pcm_frames(&enc, a.data.data(), a.frames(), &w);
  ma_encoder_uninit(&enc);
  return true;
}

static std::vector<float> toMono(const Audio& a) {
  std::vector<float> m(a.frames(), 0.f);
  for (size_t f = 0; f < a.frames(); ++f) {
    float s = 0.f;
    for (int c = 0; c < a.channels; ++c) s += a.data[f * a.channels + c];
    m[f] = s / (float)a.channels;
  }
  return m;
}

// ---------------------------------------------------------------------------
// the run: stream `outFrames` out of a looping source, timing every callback
// ---------------------------------------------------------------------------
struct RunResult {
  Audio out;
  // Signalsmith (and any block-based stretcher) does its work on hop
  // boundaries, so most callbacks cost ~nothing and every Nth does everything.
  // A median would read 0.001 ms and mean nothing. `corePct` -- total time over
  // total audio -- is what decides how many voices fit; p95/p99 show the burst
  // that actually causes a dropout.
  double corePct = 0;                 // sustained cost, % of one core, ONE voice
  double p95 = 0, p99 = 0, pmax = 0;  // ms in a single 256-frame callback
};

// Count audible discontinuities: sample deltas far outside the signal's own
// distribution. This is the "blocky" sound -- a click, not a CPU problem, and
// invisible to every constant-ratio quality metric.
static int clickCount(const Audio& a) {
  size_t n = a.frames();
  if (n < 64) return 0;
  std::vector<double> d; d.reserve(n - 1);
  for (size_t f = 1; f < n; ++f) {
    double s = 0.0;
    for (int c = 0; c < a.channels; ++c)
      s += std::fabs(a.data[f*a.channels+c] - a.data[(f-1)*a.channels+c]);
    d.push_back(s / a.channels);
  }
  std::vector<double> srt = d;
  std::sort(srt.begin(), srt.end());
  double p99 = srt[(size_t)(srt.size() * 0.99)];
  if (p99 <= 1e-9) return 0;
  int n_ = 0;
  for (double x : d) if (x > 8.0 * p99) ++n_;
  return n_;
}

// A real tempo drag is a ratio that MOVES. Constant-ratio numbers say nothing
// about it, so the harness can sweep, and can reproduce the engine's habit of
// reset()ing the stretcher mid-stream to show what that costs.
struct RunOpts {
  double ratioA = 1.0, ratioB = 1.0;   // ramped across the run
  int resetEvery = 0;                  // callbacks between reset() (0 = never)
};

static RunResult run(Backend& be, const Audio& in, const RunOpts& o, size_t outFrames);

static RunResult run(Backend& be, const Audio& in, double ratio, size_t outFrames) {
  RunOpts o; o.ratioA = o.ratioB = ratio;
  return run(be, in, o, outFrames);
}

static RunResult run(Backend& be, const Audio& in, const RunOpts& o, size_t outFrames) {
  const int ch = in.channels;
  RunResult r;
  r.out.channels = ch; r.out.sampleRate = in.sampleRate;

  be.init(ch, in.sampleRate);
  be.reset();
  // Render the latency as extra lead-in and drop it, so out[0] corresponds to
  // in[0] and the transient / spectral / seam metrics compare like with like.
  const size_t lead = (size_t)std::max(0, be.outputLatency());
  const size_t renderFrames = outFrames + lead;
  r.out.data.assign(renderFrames * ch, 0.f);

  const int cap = kCallback * 4 + 8;
  std::vector<std::vector<float>> ib(ch, std::vector<float>(cap, 0.f));
  std::vector<std::vector<float>> ob(ch, std::vector<float>(kCallback, 0.f));
  std::vector<float*> ip(ch), op(ch);
  for (int c = 0; c < ch; ++c) { ip[c] = ib[c].data(); op[c] = ob[c].data(); }

  size_t inPos = 0, done = 0;
  std::vector<double> times;
  times.reserve(outFrames / kCallback + 1);

  // Prime: the stretcher needs its window filled before the output is valid,
  // and the loop must be fed circularly or the seam is measuring a fade-in.
  for (int w = 0; w < 8; ++w) {
    int need = std::max(1, (int)std::llround(kCallback * o.ratioA));
    for (int i = 0; i < need; ++i) {
      for (int c = 0; c < ch; ++c) ib[c][i] = in.data[(inPos % in.frames()) * ch + c];
      ++inPos;
    }
    be.process(ip.data(), need, op.data(), kCallback);
  }
  inPos = 0;

  long callbackIdx = 0;
  while (done < renderFrames) {
    int block = (int)std::min<size_t>(kCallback, renderFrames - done);
    double t = renderFrames ? (double)done / (double)renderFrames : 0.0;
    double ratio = o.ratioA + (o.ratioB - o.ratioA) * t;
    int need = std::max(1, (int)std::llround(block * ratio));
    if (o.resetEvery > 0 && callbackIdx > 0 && (callbackIdx % o.resetEvery) == 0)
      be.reset();
    ++callbackIdx;
    for (int i = 0; i < need; ++i) {
      for (int c = 0; c < ch; ++c) ib[c][i] = in.data[(inPos % in.frames()) * ch + c];
      ++inPos;
    }
    auto t0 = Clock::now();
    be.process(ip.data(), need, op.data(), block);
    times.push_back(std::chrono::duration<double, std::milli>(Clock::now() - t0).count());
    for (int i = 0; i < block; ++i)
      for (int c = 0; c < ch; ++c) r.out.data[(done + i) * ch + c] = ob[c][i];
    done += block;
  }

  // drop the lead-in now that timing is captured
  if (lead > 0) {
    r.out.data.erase(r.out.data.begin(), r.out.data.begin() + (long)(lead * ch));
  }

  double totalMs = 0.0;
  for (double t : times) totalMs += t;
  std::sort(times.begin(), times.end());
  auto pick = [&](double q) { return times.empty() ? 0.0 : times[std::min(times.size() - 1,
                                (size_t)(times.size() * q))]; };
  r.p95 = pick(0.95); r.p99 = pick(0.99); r.pmax = times.empty() ? 0.0 : times.back();
  double audioMs = 1000.0 * (double)outFrames / in.sampleRate;
  r.corePct = audioMs > 0 ? 100.0 * totalMs / audioMs : 0.0;
  return r;
}

// ---------------------------------------------------------------------------
// quality metrics
// ---------------------------------------------------------------------------
struct Quality {
  double structure = 0;   // onset-envelope correlation with the input (1 = intact)
  double sharpness = 0;   // attack crest vs the input's (1 = as sharp, <1 = smeared)
  double spectral = 0;    // log-magnitude distance from the reference render
  double seam = 0;        // wrap discontinuity vs the material's own deltas
};

// Rhythmic structure and attack sharpness, measured threshold-free.
//
// Peak-picking onsets on the output and matching them to the input turned out
// to be useless for comparing backends: the picker's threshold is relative, so
// a slightly softened attack drops below it and reads as a total loss, and the
// score swings wildly for tiny quality differences. Compare the onset-strength
// ENVELOPES instead -- no peak-picking, no threshold.
//
// A uniform stretch leaves every event at the same loop fraction, so both
// envelopes are resampled onto a common normalized axis and compared directly:
//   structure  correlation of the two envelopes. 1.0 = rhythm intact; falling
//              means events moved, merged, or appeared.
//   sharpness  crest factor (peak/RMS) of the output envelope over the input's.
//              1.0 = attacks as sharp as the source; below 1.0 = smeared, which
//              is precisely the artifact a time-domain stretcher risks.
static void scoreTransients(const Audio& in, const Audio& out, Quality& q) {
  std::vector<float> mi = toMono(in), mo = toMono(out);
  livetrax::AnalyzeConfig cfg;
  double frIn = 0, frOut = 0;
  std::vector<float> ei = livetrax::detail::onsetEnvelope(mi, in.sampleRate, cfg, frIn);
  std::vector<float> eo = livetrax::detail::onsetEnvelope(mo, out.sampleRate, cfg, frOut);
  if (ei.size() < 8 || eo.size() < 8) return;

  const int L = 2048;
  auto resample = [&](const std::vector<float>& e) {
    std::vector<double> r(L, 0.0);
    for (int i = 0; i < L; ++i) {
      double pos = (double)i * (double)(e.size() - 1) / (double)(L - 1);
      int a = (int)pos; double fr = pos - a;
      int b = std::min((int)e.size() - 1, a + 1);
      r[i] = e[a] * (1.0 - fr) + e[b] * fr;
    }
    return r;
  };
  auto crest = [](const std::vector<double>& v) {
    double pk = 0.0, ss = 0.0;
    for (double x : v) { pk = std::max(pk, std::fabs(x)); ss += x * x; }
    double rms = std::sqrt(ss / (double)v.size());
    return rms > 1e-12 ? pk / rms : 0.0;
  };
  std::vector<double> a = resample(ei), b = resample(eo);

  // Correlate CIRCULARLY over every lag and keep the best. Each stretcher
  // reports latency differently and a loop has no privileged start, so pinning
  // the comparison to sample 0 measures bookkeeping, not quality -- at ratio 1.0
  // that read -0.06 for output that was audibly identical to the input. What
  // matters is whether the rhythm survives, not where it starts.
  double ma = 0, mb = 0;
  for (int i = 0; i < L; ++i) { ma += a[i]; mb += b[i]; }
  ma /= L; mb /= L;
  double da = 0, db = 0;
  for (int i = 0; i < L; ++i) {
    double x = a[i] - ma, y = b[i] - mb;
    da += x * x; db += y * y;
  }
  if (da <= 1e-12 || db <= 1e-12) { q.structure = 0.0; return; }
  double best = -1.0;
  for (int k = 0; k < L; ++k) {
    double num = 0;
    for (int i = 0; i < L; ++i)
      num += (a[i] - ma) * (b[(i + k) & (L - 1)] - mb);
    best = std::max(best, num / std::sqrt(da * db));
  }
  q.structure = best;
  double ca = crest(a);
  q.sharpness = ca > 1e-12 ? crest(b) / ca : 0.0;
}

static double logSpecDistance(const Audio& a, const Audio& b) {
  const int N = 1024, H = 512;
  std::vector<float> x = toMono(a), y = toMono(b);
  size_t n = std::min(x.size(), y.size());
  if (n < (size_t)N) return 0.0;
  std::vector<float> win(N);
  for (int i = 0; i < N; ++i) win[i] = 0.5f * (1.f - (float)std::cos(2.0 * M_PI * i / (N - 1)));
  double acc = 0.0; long cnt = 0;
  std::vector<float> ar(N), ai(N), br(N), bi(N);
  for (size_t base = 0; base + N <= n; base += H) {
    for (int i = 0; i < N; ++i) {
      ar[i] = x[base + i] * win[i]; ai[i] = 0.f;
      br[i] = y[base + i] * win[i]; bi[i] = 0.f;
    }
    livetrax::detail::fftRadix2(ar, ai);
    livetrax::detail::fftRadix2(br, bi);
    for (int k = 1; k < N / 2; ++k) {
      double ma = std::log(1.0 + 1000.0 * std::sqrt(ar[k]*ar[k] + ai[k]*ai[k]));
      double mb = std::log(1.0 + 1000.0 * std::sqrt(br[k]*br[k] + bi[k]*bi[k]));
      acc += std::fabs(ma - mb); ++cnt;
    }
  }
  return cnt ? acc / cnt : 0.0;
}

// A loop wraps, so out[last] -> out[0] must be no sharper than the material.
// Comparing the seam delta to the MEAN delta was hopeless on sparse material --
// a loop that is mostly silence has a near-zero mean, so any seam at all scores
// enormous. Clicks are outliers, so compare against the distribution: the seam
// delta over the 95th percentile of every other delta. > 1 means the join is
// sharper than 95% of the signal, i.e. audible.
static double seamScore(const Audio& a) {
  size_t n = a.frames();
  if (n < 64) return 0.0;
  std::vector<double> d;
  d.reserve(n - 1);
  for (size_t f = 1; f < n; ++f) {
    double s = 0.0;
    for (int c = 0; c < a.channels; ++c)
      s += std::fabs(a.data[f*a.channels+c] - a.data[(f-1)*a.channels+c]);
    d.push_back(s / a.channels);
  }
  std::sort(d.begin(), d.end());
  double p95 = d[(size_t)(d.size() * 0.95)];
  if (p95 <= 1e-9) return 0.0;
  double seam = 0.0;
  for (int c = 0; c < a.channels; ++c)
    seam += std::fabs(a.data[0*a.channels+c] - a.data[(n-1)*a.channels+c]);
  seam /= a.channels;
  return seam / p95;
}

// ---------------------------------------------------------------------------
int main(int argc, char** argv) {
  std::vector<std::string> files;
  std::vector<double> ratios;
  std::string only, writeDir;
  double sweepA = 0, sweepB = 0; bool sweep = false;
  int resetEvery = 0;

  for (int i = 1; i < argc; ++i) {
    std::string a = argv[i];
    if (a == "--ratio" && i + 1 < argc) ratios.push_back(atof(argv[++i]));
    else if (a == "--backend" && i + 1 < argc) only = argv[++i];
    else if (a == "--write" && i + 1 < argc) writeDir = argv[++i];
    else if (a == "--sweep" && i + 1 < argc) {
      std::string v = argv[++i]; size_t c = v.find(':');
      if (c == std::string::npos) { printf("--sweep wants A:B, e.g. 1.0:1.25\n"); return 1; }
      sweepA = atof(v.substr(0, c).c_str()); sweepB = atof(v.substr(c + 1).c_str());
      sweep = true;
    }
    else if (a == "--reset-every" && i + 1 < argc) resetEvery = atoi(argv[++i]);
    else if (a.rfind("--", 0) == 0) { printf("unknown option %s\n", a.c_str()); return 1; }
    else files.push_back(a);
  }
  if (files.empty()) {
    printf("usage: %s [--ratio R]... [--backend cheap|default] [--write DIR] <audio>...\n", argv[0]);
    return 1;
  }
  if (ratios.empty()) ratios = { 0.80, 1.15, 1.50 };

  for (const auto& path : files) {
    Audio in;
    if (!decode(path.c_str(), in)) { printf("---- %s\n  DECODE FAILED\n\n", path.c_str()); continue; }
    printf("---- %s\n     %.2f s, %d ch, %d Hz   (CPU = ONE voice, %d-frame callback,"
           " deadline %.2f ms)\n\n",
           path.c_str(), (double)in.frames() / in.sampleRate, in.channels, in.sampleRate,
           kCallback, 1000.0 * kCallback / in.sampleRate);

    if (sweep) {
      // A tempo drag, reproduced: the ratio moves across the run. Constant-ratio
      // quality metrics are meaningless here, so report cost and CLICKS -- the
      // blocky sound is a discontinuity, not a CPU number.
      size_t outFrames = in.frames();
      printf("  tempo sweep %.3f -> %.3f%s\n", sweepA, sweepB,
             resetEvery ? "   (with periodic stretcher reset)" : "");
      printf("  %-22s %7s %8s %8s %8s | %7s\n",
             "backend", "core%", "p95", "p99", "max", "clicks");
      for (const char* bn : kBackends) {
        if (!only.empty() && only != bn) continue;
        auto be = makeBackend(bn);
        if (!be) continue;
        RunOpts o; o.ratioA = sweepA; o.ratioB = sweepB; o.resetEvery = resetEvery;
        RunResult rr = run(*be, in, o, outFrames);
        printf("  %-22s %6.2f%% %6.3fms %6.3fms %6.3fms | %7d\n",
               be->name(), rr.corePct, rr.p95, rr.p99, rr.pmax, clickCount(rr.out));
        if (!writeDir.empty()) {
          std::string base = path.substr(path.find_last_of("/\\") + 1);
          if (base.size() > 4) base = base.substr(0, base.size() - 4);
          char nm[512];
          snprintf(nm, sizeof(nm), "%s/%s_%s_sweep%s.wav", writeDir.c_str(), base.c_str(), bn,
                   resetEvery ? "_reset" : "");
          if (writeWav(nm, rr.out)) printf("  %-22s -> %s\n", "", nm);
        }
      }
      printf("\n");
      continue;
    }

    for (double ratio : ratios) {
      size_t outFrames = (size_t)(in.frames() / ratio);
      // reference for the spectral column: the best thing we have on hand
      SignalsmithBackend ref(false);
      RunResult refRun = run(ref, in, ratio, outFrames);

      printf("  ratio %.2f  (%.0f -> %.0f bpm equivalent)\n", ratio, 120.0, 120.0 * ratio);
      printf("  %-20s %7s %8s %8s %8s | %8s %8s %8s %6s\n",
             "backend", "core%", "p95", "p99", "max", "struct", "sharp", "spec", "seam");

      for (const char* bn : kBackends) {
        if (!only.empty() && only != bn) continue;
        auto be = makeBackend(bn);
        if (!be) continue;
        RunResult rr = run(*be, in, ratio, outFrames);
        Quality q;
        scoreTransients(in, rr.out, q);
        q.spectral = logSpecDistance(rr.out, refRun.out);
        q.seam = seamScore(rr.out);
        printf("  %-20s %6.2f%% %6.3fms %6.3fms %6.3fms | %8.3f %8.3f %8.3f %6.2f\n",
               be->name(), rr.corePct, rr.p95, rr.p99, rr.pmax,
               q.structure, q.sharpness, q.spectral, q.seam);

        if (!writeDir.empty()) {
          std::string base = path.substr(path.find_last_of("/\\") + 1);
          if (base.size() > 4) base = base.substr(0, base.size() - 4);
          char nm[512];
          snprintf(nm, sizeof(nm), "%s/%s_%s_r%.2f.wav", writeDir.c_str(), base.c_str(), bn, ratio);
          if (writeWav(nm, rr.out)) printf("  %-20s -> %s\n", "", nm);
        }
      }
      printf("\n");
    }
  }
  printf("clicks= sample discontinuities far outside the signal's own distribution\n"
         "core%% = sustained cost of ONE voice; multiply by your voice count\n"
         "struct= onset-envelope correlation with the input (1.0 = rhythm intact)\n"
         "sharp = attack sharpness vs the input (1.0 = as sharp, <1 = smeared)\n"
         "spec  = distance from the presetDefault reference (0 = identical to it)\n"
         "seam  = loop wrap discontinuity vs the material's own (>1 = audible click)\n");
  return 0;
}
