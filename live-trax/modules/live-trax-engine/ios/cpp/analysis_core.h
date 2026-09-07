#pragma once
// ---------------------------------------------------------------------------
// Live Trax — tempo / onset analysis core (pure DSP, no engine or miniaudio
// dependency). Takes a mono float buffer and returns BPM + beat count +
// transient onset markers. Shared by the audio engine (LiveTraxCore.mm) and the
// standalone laptop test harness (tools/tempo_test) so both run IDENTICAL code.
// ---------------------------------------------------------------------------
#include <vector>
#include <string>
#include <cmath>
#include <algorithm>
#include <cstddef>
#include <cstdio>

namespace livetrax {

struct TempoAnalysis {
  double bpm = 0.0;          // detected tempo (0 = unknown)
  long   beats = 0;          // whole-beat count that best fits the loop length
  int    sampleRate = 0;
  double durationSec = 0.0;
  double beatOffset = 0.0;   // loop fraction of the first downbeat (grid phase)
  std::vector<double> onsets; // transient positions as loop fractions (0..1)
};

// Pure DSP pipeline. `mono` = single-channel f32, `frames` samples at `sr` Hz.
inline TempoAnalysis analyzeMono(const float* mono, size_t frames, int sr) {
  TempoAnalysis A;
  A.sampleRate = sr;
  if (!mono || sr <= 0 || frames < (size_t)(sr / 2)) return A; // < 0.5s
  const size_t read = frames;
  A.durationSec = (double)read / (double)sr;

  // ---- 1. onset-energy novelty envelope (rectified per-hop energy rise) ----
  const int H = 256; // hop
  int nFrames = (int)(read / H);
  if (nFrames < 8) return A;
  std::vector<float> env(nFrames, 0.f);
  double prev = 0.0;
  for (int i = 0; i < nFrames; ++i) {
    double e = 0.0;
    const float* p = &mono[(size_t)i * H];
    int nn = (int)std::min<size_t>((size_t)H, read - (size_t)i * H);
    for (int j = 0; j < nn; ++j) e += (double)p[j] * (double)p[j];
    double nov = e - prev; if (nov < 0) nov = 0;
    env[i] = (float)nov;
    prev = e;
  }
  double emean = 0.0; for (float x : env) emean += x; emean /= (double)nFrames;
  for (auto& x : env) x = (float)std::max(0.0, (double)x - emean); // subtract DC

  // ---- 2. autocorrelation over the musical range -> dominant beat period ----
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

  // ---- 3. loop-length snap: exact BPM from an integer beat count ----
  long beats = 0; double bpm = 0.0;
  if (bestBpm > 0.0) {
    double beatPeriod = 60.0 / bestBpm;
    beats = (long)std::lround(A.durationSec / beatPeriod);
    if (beats < 1) beats = 1;
    bpm = (double)beats * 60.0 / A.durationSec;
    while (bpm < 70.0  && beats * 2 <= 1024) { beats *= 2; bpm = (double)beats * 60.0 / A.durationSec; }
    while (bpm > 170.0 && beats % 2 == 0)    { beats /= 2; bpm = (double)beats * 60.0 / A.durationSec; }
    bpm = std::round(bpm * 100.0) / 100.0;
  }
  A.bpm = bpm; A.beats = beats;

  // ---- 4. transient peak-picking on the novelty envelope ----
  double gmax = 0.0; for (float x : env) if (x > gmax) gmax = x;
  if (gmax <= 0.0) gmax = 1.0;
  int win = (int)std::round(frameRate * 0.10); if (win < 2) win = 2; // ~100ms local mean
  int minSpace = 2;
  if (bpm > 0.0) { double spb = frameRate * 60.0 / bpm; int m = (int)std::floor(spb * 0.375); if (m > minSpace) minSpace = m; }
  int lastPeak = -minSpace * 4;
  for (int i = 1; i < nFrames - 1; ++i) {
    float x = env[i];
    if (x <= env[i - 1] || x < env[i + 1]) continue; // local maximum
    int a = i - win; if (a < 0) a = 0;
    double lm = 0.0; for (int k = a; k <= i; ++k) lm += env[k]; lm /= (double)(i - a + 1);
    if ((double)x < lm + 0.10 * gmax) continue;      // adaptive threshold
    if (i - lastPeak < minSpace) continue;           // min spacing
    A.onsets.push_back((double)((size_t)i * H) / (double)read);
    lastPeak = i;
    if (A.onsets.size() >= 512) break;
  }
  if (!A.onsets.empty() && bpm > 0.0) {
    double beatFrac = (60.0 / bpm) / A.durationSec;
    if (A.onsets.front() < beatFrac) A.beatOffset = A.onsets.front();
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
  out += "\"onsets\":[";
  for (size_t k = 0; k < A.onsets.size(); ++k) {
    snprintf(tmp, sizeof(tmp), "%.4f%s", A.onsets[k], (k + 1 < A.onsets.size()) ? "," : "");
    out += tmp;
  }
  out += "]}";
  return out;
}

} // namespace livetrax
