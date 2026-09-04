// Transport — the master musical clock for Live Trax.
//
// This is what makes many loops play *together*: one clock, in samples, that
// knows the master tempo and time signature, and can answer two questions the
// rest of the engine needs:
//
//   1. "Where are we?"  -> bar, beat, and phase within the beat (for the grid,
//      the metronome, and pad lights).
//   2. "When is the next bar / beat boundary?"  -> the sample index to schedule a
//      quantized launch on, so a tapped loop drops in perfectly aligned.
//
// Key idea (see docs/TIME_STRETCH_PLAN.md §3): the master BPM is always in
// QUARTER notes. The signature denominator sets the beat unit:
//   /4  -> the beat is a quarter note
//   /8  -> the beat is an eighth note (half a quarter)
// and the numerator is how many of those beats are in a bar. So the stretch
// ratio never involves the signature — only the grid and boundaries do.
//
// Everything is double-precision samples internally to avoid tempo drift; call
// sites round to integer frames at the last moment.

#pragma once

#include <cstdint>
#include <vector>

namespace livetrax {

enum class Quantize { Off, Beat, HalfBar, Bar };

struct TimeSignature {
  int numerator = 4;    // beats per bar, counted in the beat unit
  int denominator = 4;  // 4 = quarter-note beats, 8 = eighth-note beats
};

class Transport {
public:
  void configure(double sampleRate);
  void setTempo(double bpm);               // quarter-note BPM
  void setSignature(int numerator, int denominator);

  // Transport position control (the audio thread advances it each callback).
  void reset();                            // position -> 0
  void setPosition(uint64_t frames);
  void advance(uint64_t frames);
  void setPlaying(bool playing) { playing_ = playing; }
  bool isPlaying() const { return playing_; }

  // --- Derived durations, in samples ---
  double quarterSamples() const;           // one quarter note
  double beatSamples() const;              // one beat (depends on denominator)
  double barSamples() const;               // one full bar
  int beatsPerBar() const { return sig_.numerator; }
  double bpm() const { return bpm_; }
  TimeSignature signature() const { return sig_; }

  // --- Queries at the current position ---
  uint64_t position() const { return pos_; }
  int64_t barIndex() const;                // 0-based bar number
  int beatInBar() const;                   // 0 .. beatsPerBar-1
  double beatPhase() const;                // [0,1) progress through current beat
  bool isDownbeat() const { return beatInBar() == 0; }

  // Is `beat` (0-based, within a bar) an accented beat? Beat 0 always is; for
  // grouped /8 signatures (6/8=3+3, 7/8=2+2+3, …) each group start is too.
  bool isAccent(int beat) const;

  // The accent/grouping pattern for the current signature, as group lengths
  // (e.g. 7/8 -> {2,2,3}). Empty means "accent the downbeat only".
  const std::vector<int>& grouping() const { return grouping_; }
  void setGrouping(const std::vector<int>& groups) { grouping_ = groups; }

  // --- Quantized launch ---
  // The next boundary at or after `fromPos` for the given grid, in absolute
  // samples. `Off` returns `fromPos` unchanged (launch immediately).
  uint64_t nextBoundaryAfter(uint64_t fromPos, Quantize grid) const;
  uint64_t nextBoundary(Quantize grid) const { return nextBoundaryAfter(pos_, grid); }

private:
  static std::vector<int> defaultGrouping(int numerator, int denominator);

  double sampleRate_ = 48000.0;
  double bpm_ = 120.0;
  TimeSignature sig_{4, 4};
  std::vector<int> grouping_;  // group lengths for accents; empty = downbeat only
  uint64_t pos_ = 0;
  bool playing_ = false;
};

}  // namespace livetrax
