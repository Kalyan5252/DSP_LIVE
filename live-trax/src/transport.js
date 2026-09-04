// Transport — the JavaScript master clock for the app UI.
//
// It mirrors the C++ engine's Transport (docs/TIME_STRETCH_PLAN.md): master BPM
// is in quarter notes, the signature denominator sets the beat unit (/4 = quarter,
// /8 = eighth), and it exposes the bar/beat position plus quantized-launch timing.
//
// In this UI it does two jobs:
//   1. Drives the beat indicator in the transport bar.
//   2. Quantizes pad launches to the next bar, so switching a column's loop
//      happens musically (the Remixlive feel), instead of the instant you tap.
//
// Precise, glitch-free tempo-lock of the audio itself is the native C++ engine's
// job; here we schedule with a JS timer, which is right for a prototype UI.

export default class Transport {
  constructor() {
    this.bpm = 120;
    this.num = 4;
    this.den = 4;
    this.quantize = 'bar'; // 'bar' | 'off'
    this.playing = false;
    this.startAt = 0;
    this._subs = new Set();
    this._barSubs = new Set();
    this._timer = null;
    this._lastBar = -1;
  }

  configure({ bpm, num, den } = {}) {
    if (bpm) this.bpm = bpm;
    if (num) this.num = num;
    if (den) this.den = den;
    this._emit();
  }

  setQuantize(q) { this.quantize = q; }

  // Durations in seconds.
  beatSec() { return (60 / this.bpm) * (4 / this.den); }
  barSec() { return this.beatSec() * this.num; }

  _now() {
    return (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  }

  positionSec() { return this.playing ? this._now() - this.startAt : 0; }

  // How long until the next bar boundary (seconds). 0 when stopped.
  timeToNextBar() {
    if (!this.playing) return 0;
    const p = this.positionSec();
    const bar = this.barSec();
    return Math.ceil((p + 1e-4) / bar) * bar - p;
  }

  state() {
    const p = this.positionSec();
    const bs = this.beatSec();
    const barS = this.barSec();
    const barIndex = barS > 0 ? Math.floor(p / barS) : 0;
    const inBar = p - barIndex * barS;
    const beat = bs > 0 ? Math.floor(inBar / bs) : 0;
    const phase = bs > 0 ? (inBar - beat * bs) / bs : 0;
    return {
      playing: this.playing,
      bpm: this.bpm,
      num: this.num,
      den: this.den,
      quantize: this.quantize,
      barIndex,
      beatInBar: Math.min(Math.max(beat, 0), this.num - 1),
      beatsPerBar: this.num,
      phase,
    };
  }

  start() {
    if (this.playing) return;
    this.playing = true;
    this.startAt = this._now();
    this._lastBar = -1;
    if (!this._timer) this._timer = setInterval(() => this._tick(), 25);
    this._tick();
  }

  stop() {
    this.playing = false;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    this._emit();
  }

  toggle() { this.playing ? this.stop() : this.start(); }

  // Subscribe to every tick (~40/s) for the beat indicator.
  subscribe(fn) { this._subs.add(fn); return () => this._subs.delete(fn); }

  // Subscribe to bar boundaries (for flushing quantized launches).
  onBar(fn) { this._barSubs.add(fn); return () => this._barSubs.delete(fn); }

  _tick() {
    const s = this.state();
    if (this.playing && s.barIndex !== this._lastBar) {
      this._lastBar = s.barIndex;
      this._barSubs.forEach((f) => f(s));
    }
    this._subs.forEach((f) => f(s));
  }

  _emit() { const s = this.state(); this._subs.forEach((f) => f(s)); }

  dispose() { if (this._timer) clearInterval(this._timer); this._timer = null; }
}
