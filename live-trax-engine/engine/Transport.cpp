#include "Transport.h"

#include <algorithm>
#include <cmath>

namespace livetrax {

void Transport::configure(double sampleRate) {
  if (sampleRate > 0) sampleRate_ = sampleRate;
}

void Transport::setTempo(double bpm) {
  if (bpm > 0) bpm_ = bpm;
}

void Transport::setSignature(int numerator, int denominator) {
  if (numerator < 1) numerator = 1;
  if (denominator != 4 && denominator != 8) denominator = 4;  // supported set
  sig_ = {numerator, denominator};
  grouping_ = defaultGrouping(numerator, denominator);
}

void Transport::reset() { pos_ = 0; }
void Transport::setPosition(uint64_t frames) { pos_ = frames; }
void Transport::advance(uint64_t frames) {
  if (playing_) pos_ += frames;
}

double Transport::quarterSamples() const {
  return sampleRate_ * 60.0 / bpm_;
}

double Transport::beatSamples() const {
  // /4: beat = quarter (factor 1). /8: beat = eighth (factor 0.5).
  return quarterSamples() * (4.0 / sig_.denominator);
}

double Transport::barSamples() const {
  return beatSamples() * sig_.numerator;
}

int64_t Transport::barIndex() const {
  const double bar = barSamples();
  return bar > 0 ? (int64_t)std::floor(pos_ / bar) : 0;
}

int Transport::beatInBar() const {
  const double bar = barSamples();
  const double beat = beatSamples();
  if (bar <= 0 || beat <= 0) return 0;
  double posInBar = pos_ - std::floor(pos_ / bar) * bar;
  int b = (int)std::floor(posInBar / beat);
  return std::min(std::max(b, 0), sig_.numerator - 1);
}

double Transport::beatPhase() const {
  const double beat = beatSamples();
  if (beat <= 0) return 0.0;
  double frac = pos_ / beat;
  return frac - std::floor(frac);
}

bool Transport::isAccent(int beat) const {
  if (beat <= 0) return true;  // downbeat
  if (grouping_.empty()) return false;
  int start = 0;
  for (int g : grouping_) {
    if (beat == start) return true;
    start += g;
  }
  return false;
}

uint64_t Transport::nextBoundaryAfter(uint64_t fromPos, Quantize grid) const {
  if (grid == Quantize::Off) return fromPos;

  double unit;
  switch (grid) {
    case Quantize::Beat:    unit = beatSamples();      break;
    case Quantize::HalfBar: unit = barSamples() / 2.0; break;
    case Quantize::Bar:     unit = barSamples();       break;
    default:                return fromPos;
  }
  if (unit <= 0) return fromPos;

  // Smallest multiple of `unit` that is >= fromPos (inclusive, so a tap landing
  // exactly on a boundary launches now rather than a full grid-step late).
  double idx = std::ceil((double)fromPos / unit - 1e-6);
  if (idx < 0) idx = 0;
  return (uint64_t)std::llround(idx * unit);
}

std::vector<int> Transport::defaultGrouping(int numerator, int denominator) {
  if (denominator == 8) {
    switch (numerator) {
      case 5:  return {2, 3};
      case 6:  return {3, 3};
      case 7:  return {2, 2, 3};
      case 9:  return {3, 3, 3};
      case 12: return {3, 3, 3, 3};
      default: break;
    }
  }
  // x/4 (and unlisted x/8): accent the downbeat only.
  return {};
}

}  // namespace livetrax
