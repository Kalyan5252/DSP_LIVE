// Audio core for Live Trax — the single seam the app talks to.
//
// Audio + timing run in the NATIVE C++ engine (miniaudio) via the LiveTraxEngine
// Expo module:
//   - Real-time streaming time-stretch (Signalsmith) locks every loop to the
//     master tempo with no audio break.
//   - A sample-accurate transport (ma_engine clock) schedules quantized
//     launch/stop on the audio thread, so pads fire on the grid boundary.
//
// JS is a *view* of the native clock: it reads getTransport() / getActivePads()
// to drive the UI (beat indicator, armed pulse, playhead ring). The JS Transport
// remains only as a graceful fallback when the native module isn't built yet.

import { requireNativeModule } from 'expo-modules-core';
import Transport from '../transport';

let Native = {};
try { Native = requireNativeModule('LiveTraxEngine'); } catch (e) { console.warn('[engine] native module missing', e && e.message); }
const hasNative = typeof Native.triggerSync === 'function';
console.log('[engine] native fns -> triggerSync:', typeof Native.triggerSync, ' getTransport:', typeof Native.getTransport);

function toPath(uri) {
  if (!uri) return uri;
  return uri.startsWith('file://') ? decodeURIComponent(uri.slice('file://'.length)) : uri;
}

class AudioEngine {
  constructor() {
    this.transport = new Transport();     // fallback clock / UI mirror
    this.masterVolume = 1;
    this.masterBpm = 120;
    this.sigNum = 4;
    this.sigDen = 4;
    this.quantizeMode = 'bar';            // 'bar' | 'off'
    this.loadedIds = new Set();
    this.listener = null;
  }

  async configure() { /* no-op; native handles the audio session */ }

  setListener(fn) { this.listener = fn; }
  _emit(id, playing) { if (this.listener) this.listener(id, playing); }

  // ---- master controls ----
  setMasterVolume(v) {
    this.masterVolume = Math.max(0, Math.min(1, v));
    try { Native.setMasterVolume(this.masterVolume); } catch (e) { /* not built */ }
  }

  setMasterTempo(bpm) {
    if (bpm > 0) this.masterBpm = bpm;
    this.transport.configure({ bpm });
    try { Native.setMasterTempo(bpm); } catch (e) { /* not built */ }
  }

  setMasterSignature(num, den) {
    if (num > 0) this.sigNum = num;
    if (den > 0) this.sigDen = den;
    this.transport.configure({ num, den });
    try { Native.setMasterSignature(this.sigNum, this.sigDen); } catch (e) { /* not built */ }
    this._pushQuantize(); // 'bar' quantum depends on the signature
  }

  applyTempo() { try { Native.applyTempo(); } catch (e) {} }

  // quantize is a UI mode ('bar' | 'off'); the native quantum is in beats.
  setQuantize(q) {
    this.quantizeMode = q;
    this.transport.setQuantize(q);
    this._pushQuantize();
  }
  _pushQuantize() {
    const beats = this.quantizeMode === 'bar' ? this.sigNum : 0;
    try { Native.setQuantize(beats); } catch (e) { /* not built */ }
  }

  // ---- clock ----
  startClock() {
    this.transport.start();
    try { Native.startTransport(); } catch (e) {}
  }
  stopClock() {
    this.transport.stop();
    try { Native.stopTransport(); } catch (e) {}
  }
  toggleClock() { this.isClockPlaying() ? this.stopClock() : this.startClock(); }
  isClockPlaying() { return this.transport.playing; }
  subscribeBeat(fn) { return this.transport.subscribe(fn); }
  onBar(fn) { return this.transport.onBar(fn); }
  disposeClock() { this.transport.dispose(); }

  // ---- native transport readout (for the UI poll) ----
  hasNativeTransport() { return hasNative && typeof Native.getTransport === 'function'; }

  // { playing, barIndex, beatInBar, phase, beatsPerBar } or null.
  getTransport() {
    try {
      const a = Native.getTransport();
      if (a && a.length >= 5) {
        return { playing: a[0] > 0.5, barIndex: a[1] | 0, beatInBar: a[2] | 0, phase: a[3], beatsPerBar: a[4] | 0 };
      }
    } catch (e) { /* fall through */ }
    return null;
  }

  // { padId: { s: 1|2, p: 0..1 } }  (s: 1=armed, 2=playing)
  getActivePads() {
    try {
      const raw = Native.getActivePads();
      if (raw) return JSON.parse(raw);
    } catch (e) { /* fall through */ }
    return {};
  }

  // ---- pads ----
  async load(padId, uri, opts = {}) {
    const { bpm, loop } = opts;
    const path = toPath(uri);
    try {
      Native.loadPad(padId, path, bpm > 0 ? bpm : this.masterBpm, loop === undefined ? true : !!loop);
      this.loadedIds.add(padId);
    } catch (e) {
      console.warn('[engine] loadPad failed', e && e.message);
    }
  }

  getBaseBpm(padId) { return this.masterBpm; }
  setLoop(padId, loop) { /* set at load time in native */ }
  isLoaded(padId) { return this.loadedIds.has(padId); }

  // Quantized by the native transport: fires on the next grid boundary while the
  // transport plays; near-immediate when stopped or quantize is off.
  trigger(padId) {
    try {
      if (hasNative) Native.triggerSync(padId);
      else Native.trigger(padId);
    } catch (e) { /* ignore */ }
  }

  stop(padId) {
    try {
      if (hasNative) Native.stopSync(padId);
      else Native.stopPad(padId);
    } catch (e) { /* ignore */ }
  }

  // Immediate, unquantized (used by Stop-All).
  hardStop(padId) { try { Native.stopPad(padId); } catch (e) {} }

  stopAll() { try { Native.stopAll(); } catch (e) {} }

  unload(padId) {
    try { Native.unloadPad(padId); } catch (e) {}
    this.loadedIds.delete(padId);
  }

  unloadAll() {
    for (const id of Array.from(this.loadedIds)) this.unload(id);
  }
}

export default new AudioEngine();
