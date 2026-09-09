#pragma once
// ---------------------------------------------------------------------------
// Live Trax — tempo / onset analysis core (pure DSP, no engine or miniaudio
// dependency). Self-contained header shared by the audio engine
// (LiveTraxCore.mm) and the standalone laptop harness (tools/tempo_test) so
// both run IDENTICAL code.
//
// Pipeline (DSP-first, per the tempo-detection plan):
//   mono -> DC removal
//        -> Hann STFT (2048/512), log-magnitude
//        -> spectral-flux onset-strength envelope + adaptive conditioning
//        -> autocorrelation periodicity
//        -> tempo candidate generation
//        -> candidate scoring: harmonic comb + onset alignment
//                              + power-of-two/loop plausibility + range prior
//        -> explicit octave & 3:2 metric resolution   (fixes 88 vs 132, 87 vs 174)
//        -> beat phase, beat count, confidence
//        -> transient onset markers
// ---------------------------------------------------------------------------
#include <vector>
#include <string>
#include <cmath>
#include <algorithm>
#include <cstddef>
#include <cstdio>
#include <utility>

namespace livetrax {

struct TempoAnalysis {
  double bpm = 0.0;          // detected tempo (0 = unknown)
  long   beats = 0;          // whole-beat count that best fits the loop length
  int    sampleRate = 0;
  double durationSec = 0.0;
  double beatOffset = 0.0;   // loop fraction of the first beat (grid phase)
  double confidence = 0.0;   // 0..1
  std::vector<double> onsets; // transient positions as loop fractions (0..1)
  std::vector<std::pair<double,double>> candidates; // (bpm,total) top scored, debug
};

struct AnalyzeConfig {
  int    fftSize = 2048;
  int    hop     = 512;
  double bpmMin  = 55.0;     // candidate search range
  double bpmMax  = 210.0;
  // scoring weights
  double wComb   = 1.0;      // harmonic-comb periodicity
  double wAlign  = 1.0;      // onset alignment (beat grid fit)
  double wPlaus  = 1.2;      // loop = clean (power-of-two) beat count
  double wRange  = 0.25;     // gentle prior toward mid tempos
};

// ---- small iterative radix-2 FFT (in place, complex) ----------------------
namespace detail {
inline void fftRadix2(std::vector<float>& re, std::vector<float>& im) {
  const size_t n = re.size();
  // bit-reversal permutation
  for (size_t i = 1, j = 0; i < n; ++i) {
    size_t bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { std::swap(re[i], re[j]); std::swap(im[i], im[j]); }
  }
  for (size_t len = 2; len <= n; len <<= 1) {
    double ang = -2.0 * M_PI / (double)len;
    float wlr = (float)std::cos(ang), wli = (float)std::sin(ang);
    for (size_t i = 0; i < n; i += len) {
      float wr = 1.f, wi = 0.f;
      for (size_t k = 0; k < len / 2; ++k) {
        float ur = re[i + k],            ui = im[i + k];
        float vr = re[i + k + len/2] * wr - im[i + k + len/2] * wi;
        float vi = re[i + k + len/2] * wi + im[i + k + len/2] * wr;
        re[i + k]         = ur + vr; im[i + k]         = ui + vi;
        re[i + k + len/2] = ur - vr; im[i + k + len/2] = ui - vi;
        float nwr = wr * wlr - wi * wli;
        wi = wr * wli + wi * wlr; wr = nwr;
      }
    }
  }
}

// adaptive-threshold conditioning of one envelope: subtract moving mean, rectify
inline void conditionEnv(std::vector<float>& env, double frameRate) {
  int nF = (int)env.size();
  if (nF < 2) return;
  int w = std::max(4, (int)std::round(frameRate * 0.20)); // ~200 ms
  std::vector<double> pref(nF + 1, 0.0);
  for (int i = 0; i < nF; ++i) pref[i+1] = pref[i] + env[i];
  for (int i = 0; i < nF; ++i) {
    int a = std::max(0, i - w), b = std::min(nF - 1, i + w);
    double mean = (pref[b+1] - pref[a]) / (double)(b - a + 1);
    double v = (double)env[i] - mean;
    env[i] = v > 0 ? (float)v : 0.f;
  }
  // normalize to unit peak so bands combine fairly
  float mx = 0.f; for (float x : env) if (x > mx) mx = x;
  if (mx > 0) for (auto& x : env) x /= mx;
}

// Multi-band spectral-flux onset-strength envelope. The beat is carried mostly
// by kick/snare, so low/low-mid bands are weighted up — this is what resolves
// 3:2 (triplet) ambiguity where busy hats create a competing faster pulse.
inline std::vector<float> onsetEnvelope(const std::vector<float>& mono, int sr,
                                        const AnalyzeConfig& cfg, double& frameRateOut) {
  const int N = cfg.fftSize, H = cfg.hop;
  const size_t read = mono.size();
  int nFrames = (read >= (size_t)N) ? (int)((read - N) / H) + 1 : 0;
  frameRateOut = (double)sr / (double)H;
  std::vector<float> env;
  if (nFrames < 4) return env;

  std::vector<float> win(N);
  for (int i = 0; i < N; ++i) win[i] = 0.5f * (1.f - (float)std::cos(2.0 * M_PI * i / (N - 1)));

  const int bins = N / 2;
  // 5 analysis bands (Hz) with tactus-oriented weights (low/mid emphasized)
  const double edges[6] = { 20, 150, 500, 2000, 5000, 24000 };
  const float  bw[5]    = { 2.8f, 1.6f, 0.7f, 0.2f, 0.12f };
  int bandLo[5], bandHi[5];
  for (int k = 0; k < 5; ++k) {
    bandLo[k] = std::max(1, (int)std::floor(edges[k]   * N / sr));
    bandHi[k] = std::min(bins, (int)std::ceil (edges[k+1] * N / sr));
  }
  std::vector<std::vector<float>> band(5, std::vector<float>(nFrames, 0.f));
  std::vector<float> re(N), im(N), prev(bins, 0.f);

  for (int f = 0; f < nFrames; ++f) {
    size_t base = (size_t)f * H;
    for (int i = 0; i < N; ++i) {
      float s = (base + i < read) ? mono[base + i] : 0.f;
      re[i] = s * win[i]; im[i] = 0.f;
    }
    fftRadix2(re, im);
    std::vector<float> mag(bins);
    for (int b = 1; b < bins; ++b) {
      float m = std::sqrt(re[b]*re[b] + im[b]*im[b]);
      mag[b] = std::log(1.f + 1000.f * m); // log compression
    }
    for (int k = 0; k < 5; ++k) {
      double flux = 0.0;
      for (int b = bandLo[k]; b < bandHi[k]; ++b) {
        float d = mag[b] - prev[b];
        if (d > 0) flux += d;
      }
      band[k][f] = (float)flux;
    }
    prev.swap(mag);
  }

  for (int k = 0; k < 5; ++k) conditionEnv(band[k], frameRateOut); // per-band normalize
  env.assign(nFrames, 0.f);
  for (int f = 0; f < nFrames; ++f) {
    float s = 0.f; for (int k = 0; k < 5; ++k) s += bw[k] * band[k][f];
    env[f] = s;
  }
  return env;
}

// Snap a flux-frame index to a sample-accurate attack position.
//
// A Hann-windowed spectral flux fires EARLY: the window's steepest rise is at
// its 3/4 point, so frame f peaks while the attack is still ~3N/4 samples past
// the window start. Reporting f*H therefore places every marker ~32 ms before
// the transient at 2048/512 — audible as a flam when the markers drive slicing.
// The attack is somewhere in [f*H, f*H+N), so look there for the steepest
// short-term energy rise. This also handles a transient at sample 0, where the
// blind lead correction would push the marker the wrong way.
inline size_t refineOnset(const std::vector<float>& mono, size_t from, size_t to) {
  const int B = 64;                  // ~1.3 ms blocks at 48 kHz
  if (to > mono.size()) to = mono.size();
  if (to <= from) return from;
  int nb = (int)((to - from) / B);
  if (nb < 3) return from;
  std::vector<double> e(nb, 0.0);
  for (int b = 0; b < nb; ++b) {
    double s = 0.0; size_t o = from + (size_t)b * B;
    for (int j = 0; j < B; ++j) { double v = mono[o + j]; s += v * v; }
    e[b] = std::sqrt(s / B);
  }
  int best = 0; double bestRise = -1.0;
  for (int b = 1; b < nb; ++b) {
    double rise = e[b] - e[b - 1];
    if (rise > bestRise) { bestRise = rise; best = b; }
  }
  return from + (size_t)best * B;    // attack starts at the top of that block
}

} // namespace detail

// Pure DSP pipeline. `mono` = single-channel f32, `frames` samples at `sr` Hz.
inline TempoAnalysis analyzeMono(const float* monoPtr, size_t frames, int sr,
                                 const AnalyzeConfig& cfg = AnalyzeConfig()) {
  TempoAnalysis A;
  A.sampleRate = sr;
  if (!monoPtr || sr <= 0 || frames < (size_t)(sr / 2)) return A; // < 0.5s
  A.durationSec = (double)frames / (double)sr;

  // copy + DC removal
  std::vector<float> mono(monoPtr, monoPtr + frames);
  double dc = 0.0; for (float v : mono) dc += v; dc /= (double)frames;
  for (auto& v : mono) v -= (float)dc;

  // onset-strength envelope
  double frameRate = 0.0;
  std::vector<float> O = detail::onsetEnvelope(mono, sr, cfg, frameRate);
  int nF = (int)O.size();
  if (nF < 8) return A;

  // ---- autocorrelation over the candidate lag range ----
  int lagMin = std::max(1, (int)std::floor(frameRate * 60.0 / cfg.bpmMax));
  int lagMax = std::min(nF - 1, (int)std::ceil(frameRate * 60.0 / cfg.bpmMin));
  std::vector<double> acf(lagMax + 1, 0.0);
  double acf0 = 0.0; for (int i = 0; i < nF; ++i) acf0 += (double)O[i] * O[i];
  if (acf0 <= 0) return A;
  for (int lag = lagMin; lag <= lagMax; ++lag) {
    double s = 0.0;
    for (int i = lag; i < nF; ++i) s += (double)O[i] * O[i - lag];
    acf[lag] = s / acf0; // 0..~1
  }

  // ---- candidate generation: local maxima of the ACF ----
  struct Cand { double bpm; double acf; };
  std::vector<Cand> peaks;
  for (int lag = lagMin + 1; lag < lagMax; ++lag)
    if (acf[lag] > acf[lag-1] && acf[lag] >= acf[lag+1] && acf[lag] > 0)
      peaks.push_back({ 60.0 * frameRate / (double)lag, acf[lag] });
  if (peaks.empty()) return A;
  std::sort(peaks.begin(), peaks.end(), [](const Cand&a,const Cand&b){return a.acf>b.acf;});
  if (peaks.size() > 10) peaks.resize(10);

  // Expand each peak with octave + 3:2 metric relatives (the ambiguities).
  const double rels[] = {1.0, 2.0, 0.5, 3.0, 1.0/3.0, 1.5, 2.0/3.0, 4.0/3.0, 3.0/4.0};
  std::vector<double> bpms;
  for (auto& p : peaks)
    for (double r : rels) {
      double b = p.bpm * r;
      if (b >= cfg.bpmMin && b <= cfg.bpmMax) bpms.push_back(b);
    }
  std::sort(bpms.begin(), bpms.end());
  bpms.erase(std::unique(bpms.begin(), bpms.end(),
             [](double a,double b){return std::fabs(a-b) < 0.3;}), bpms.end());

  auto acfAt = [&](double lagf)->double{
    int l = (int)std::lround(lagf);
    if (l < lagMin || l > lagMax) return 0.0;
    return acf[l];
  };
  // harmonic comb: reward periods whose multiples/half also show periodicity
  auto combScore = [&](double bpm)->double{
    double lag = frameRate * 60.0 / bpm;
    double s = acfAt(lag) + 0.5*acfAt(lag*2) + 0.33*acfAt(lag*3) + 0.5*acfAt(lag*0.5);
    return s;
  };
  // onset alignment: best phase comb over the onset envelope at this period
  auto alignScore = [&](double bpm, double& phaseFrac)->double{
    double p = frameRate * 60.0 / bpm; // frames per beat
    if (p < 2) { phaseFrac = 0; return 0; }
    int nBeats = std::max(2, (int)std::floor((double)nF / p));
    int steps = 24; double best = 0.0, bestPhi = 0.0;
    for (int st = 0; st < steps; ++st) {
      double phi = p * st / steps;
      double sum = 0.0;
      for (int k = 0; k < nBeats; ++k) {
        double pos = phi + k * p;
        int i = (int)std::floor(pos); double fr = pos - i;
        if (i < 0 || i + 1 >= nF) continue;
        sum += O[i]*(1-fr) + O[i+1]*fr;    // linear interp
      }
      sum /= nBeats;
      if (sum > best) { best = sum; bestPhi = phi; }
    }
    phaseFrac = (frameRate>0) ? (bestPhi / frameRate) / A.durationSec : 0.0; // as loop fraction
    return best;
  };
  auto pow2Score = [](long n)->double{
    if (n==2||n==4||n==8||n==16||n==32||n==64) return 1.0;
    if (n==1||n==12||n==24||n==48) return 0.6;   // 3/4- or 6/8-ish bar counts
    if (n % 4 == 0) return 0.6;
    if (n % 2 == 0) return 0.45;
    return 0.25;
  };

  // score all candidate bpms
  struct Scored { double bpm, total, comb, align, phaseFrac; long beats; };
  std::vector<Scored> scored;
  double maxComb = 1e-9, maxAlign = 1e-9;
  std::vector<double> combV(bpms.size()), alignV(bpms.size()), phaseV(bpms.size());
  for (size_t i = 0; i < bpms.size(); ++i) {
    combV[i] = combScore(bpms[i]);
    double ph = 0; alignV[i] = alignScore(bpms[i], ph); phaseV[i] = ph;
    maxComb = std::max(maxComb, combV[i]);
    maxAlign = std::max(maxAlign, alignV[i]);
  }
  for (size_t i = 0; i < bpms.size(); ++i) {
    double bpm = bpms[i];
    double beatsF = A.durationSec * bpm / 60.0;
    long nb = std::lround(beatsF);
    if (nb < 1) nb = 1;
    double snapErr = std::fabs(beatsF - nb) / (double)nb;
    double plaus = std::max(0.0, 1.0 - std::min(1.0, snapErr * 8.0)) * pow2Score(nb);
    // perceptual log-normal prior (octaves), centered ~ preferred tapping tempo.
    // This is the primary octave resolver: it multiplies the periodicity score
    // so half/double candidates are demoted unless strongly supported.
    double lg = std::log2(bpm / 122.0);
    double prior = std::exp(-0.5 * std::pow(lg / 0.80, 2.0));
    double range = 0.5 + 0.5 * prior; // soft floor so a good off-center tempo still competes
    double base = cfg.wComb  * (combV[i]  / maxComb)
                + cfg.wAlign * (alignV[i] / maxAlign)
                + cfg.wPlaus * plaus;
    double total = base * range;
    scored.push_back({ bpm, total, combV[i], alignV[i], phaseV[i], nb });
  }
  std::sort(scored.begin(), scored.end(), [](const Scored&a,const Scored&b){return a.total>b.total;});
  Scored win = scored.front();
  for (size_t i = 0; i < scored.size() && i < 6; ++i) A.candidates.push_back({scored[i].bpm, scored[i].total});

  // ---- final tempo: loop-snap to a clean integer-beat BPM within tolerance ----
  double bpm = win.bpm;
  double beatsF = A.durationSec * bpm / 60.0;
  long nb = std::lround(beatsF);
  if (nb < 1) nb = 1;
  if (std::fabs(beatsF - nb) / (double)nb < 0.06) {
    bpm = (double)nb * 60.0 / A.durationSec; // exact
  }
  A.bpm = std::round(bpm * 100.0) / 100.0;
  A.beats = std::lround(A.durationSec * A.bpm / 60.0);
  // The grid phase comes off the same early-firing envelope, so it inherits the
  // same ~3N/4-sample lead. Correct it and re-wrap into the first beat.
  if (A.bpm > 0 && frameRate > 0) {
    double beatSec  = 60.0 / A.bpm;
    double phaseSec = win.phaseFrac * A.durationSec + 0.75 * (double)cfg.fftSize / (double)sr;
    phaseSec = std::fmod(phaseSec, beatSec);
    if (phaseSec < 0) phaseSec += beatSec;
    A.beatOffset = (A.durationSec > 0) ? phaseSec / A.durationSec : 0.0;
  } else {
    A.beatOffset = win.phaseFrac;
  }

  // confidence: separation from the runner-up + absolute alignment
  double sep = 1.0;
  if (scored.size() > 1 && scored[0].total > 0)
    sep = (scored[0].total - scored[1].total) / scored[0].total;
  double alignAbs = std::min(1.0, win.align / (maxAlign > 0 ? maxAlign : 1.0));
  A.confidence = std::max(0.0, std::min(1.0, 0.5 * sep + 0.5 * alignAbs));

  // ---- transient onset markers: peak-pick the onset envelope ----
  double gmax = 0.0; for (float x : O) if (x > gmax) gmax = x;
  if (gmax <= 0) gmax = 1.0;
  int win2 = std::max(2, (int)std::round(frameRate * 0.10));
  int minSpace = 2;
  if (A.bpm > 0) { double spb = frameRate * 60.0 / A.bpm; int m=(int)std::floor(spb*0.375); if(m>minSpace)minSpace=m; }
  int lastPeak = -minSpace * 4;
  std::vector<double> pref(nF + 1, 0.0);
  for (int i = 0; i < nF; ++i) pref[i+1] = pref[i] + O[i];
  // i starts at 0 so a transient in the very first frame — the downbeat of a
  // tightly trimmed loop, the single most useful marker — can still win.
  for (int i = 0; i < nF - 1; ++i) {
    float x = O[i];
    float lft = (i > 0) ? O[i-1] : 0.f;
    if (x <= lft || x < O[i+1]) continue;
    // Centered local mean. A backward-only window degenerates at i == 0 (the
    // mean becomes the sample itself, so the test can never pass) — which is
    // exactly why a transient on the very first frame was never marked.
    int a = std::max(0, i - win2), b = std::min(nF - 1, i + win2);
    double lm = (pref[b+1] - pref[a]) / (double)(b - a + 1);
    if ((double)x < lm + 0.10 * gmax) continue;
    if (i - lastPeak < minSpace) continue;
    size_t from = (size_t)i * cfg.hop;
    size_t pos  = detail::refineOnset(mono, from, from + (size_t)cfg.fftSize);
    // Refinement moves a marker forward by up to fftSize, so with the shipped
    // config (minSpace >= 10 frames vs a 4-frame search) order is preserved —
    // but guard it, or a retuned bpmMax/fftSize would silently emit unsorted
    // markers and scramble every slice downstream.
    if (pos >= frames) { lastPeak = i; continue; }
    if (!A.onsets.empty() && (double)pos / (double)frames <= A.onsets.back()) { lastPeak = i; continue; }
    A.onsets.push_back((double)pos / (double)frames);
    lastPeak = i;
    if (A.onsets.size() >= 512) break;
  }
  return A;
}

// Serialize to the JSON the JS layer consumes.
inline std::string toJson(const TempoAnalysis& A) {
  char tmp[64]; std::string out = "{";
  snprintf(tmp, sizeof(tmp), "\"bpm\":%.2f,", A.bpm); out += tmp;
  snprintf(tmp, sizeof(tmp), "\"beats\":%ld,", A.beats); out += tmp;
  snprintf(tmp, sizeof(tmp), "\"sampleRate\":%d,", A.sampleRate); out += tmp;
  snprintf(tmp, sizeof(tmp), "\"durationSec\":%.3f,", A.durationSec); out += tmp;
  snprintf(tmp, sizeof(tmp), "\"beatOffset\":%.4f,", A.beatOffset); out += tmp;
  snprintf(tmp, sizeof(tmp), "\"confidence\":%.3f,", A.confidence); out += tmp;
  out += "\"onsets\":[";
  for (size_t k = 0; k < A.onsets.size(); ++k) {
    snprintf(tmp, sizeof(tmp), "%.4f%s", A.onsets[k], (k + 1 < A.onsets.size()) ? "," : "");
    out += tmp;
  }
  out += "]}";
  return out;
}

} // namespace livetrax
