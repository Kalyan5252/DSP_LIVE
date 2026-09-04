// Audio core for Live Trax — the single seam the app talks to.
//
// It owns BOTH audio playback and the master clock (a Transport), so the app
// speaks to one object. Today it's backed by expo-audio (JS); when the C++
// Signalsmith engine is integrated (docs/CPP_INTEGRATION_PLAN.md), this same
// interface forwards to it over JSI — including sample-accurate quantized launch,
// which replaces the JS-timer scheduling below in ONE place.
//
// Interface:
//   configure()                          one-time audio-session setup
//   load(padId, uri, { bpm, loop })      load a loop; bpm is its original tempo
//   trigger(padId) / stop / stopAll      immediate transport-of-a-pad control
//   setLoop(padId, loop)
//   setMasterTempo(bpm)                  master tempo (real lock lands with C++)
//   setMasterSignature(num, den)         time signature (drives clock/quantize)
//   setMasterVolume(0..1)
//   setQuantize('bar'|'off')
//   startClock() / stopClock() / toggleClock() / isClockPlaying()
//   subscribeBeat(fn) / onBar(fn)        clock updates for the UI + scheduling
//   schedule(fn)                         run now, or on the next bar when quantized
//   isLoaded / getBaseBpm / unload / unloadAll / disposeClock

import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import Transport from '../transport';

class AudioEngine {
  constructor() {
    this.entries = new Map(); // padId -> { player, sub, baseBpm }
    this.listener = null;
    this.configured = false;
    this.masterVolume = 1;
    this.masterBpm = 120;
    this.transport = new Transport(); // the master clock lives inside the core
  }

  // ---- master controls ----
  setMasterVolume(v) {
    this.masterVolume = Math.max(0, Math.min(1, v));
    for (const [, e] of this.entries) {
      try { e.player.volume = this.masterVolume; } catch (err) { /* released */ }
    }
  }

  // Records the master tempo and drives the clock. No time-stretch on the
  // expo-audio backend; the C++ engine applies real tempo-lock via each baseBpm.
  setMasterTempo(bpm) {
    if (bpm > 0) this.masterBpm = bpm;
    this.transport.configure({ bpm });
  }

  setMasterSignature(num, den) { this.transport.configure({ num, den }); }
  setQuantize(q) { this.transport.setQuantize(q); }

  // ---- clock ----
  startClock() { this.transport.start(); }
  stopClock() { this.transport.stop(); }
  toggleClock() { this.transport.toggle(); }
  isClockPlaying() { return this.transport.playing; }
  subscribeBeat(fn) { return this.transport.subscribe(fn); }
  onBar(fn) { return this.transport.onBar(fn); }
  disposeClock() { this.transport.dispose(); }

  // Run `fn` now, or scheduled to the next bar when the clock is running and
  // quantize is on. This is the single launch-scheduling seam: the C++ engine
  // will make it sample-accurate without the app changing.
  schedule(fn) {
    if (this.transport.playing && this.transport.quantize === 'bar') {
      const off = this.transport.onBar(() => { off(); fn(); });
    } else {
      fn();
    }
  }

  // ---- audio session ----
  async configure() {
    if (this.configured) return;
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        interruptionMode: 'mixWithOthers',
      });
      this.configured = true;
    } catch (e) { /* defaults */ }
  }

  setListener(fn) { this.listener = fn; }
  _emit(padId, isPlaying) { if (this.listener) this.listener(padId, isPlaying); }

  // ---- pads ----
  async load(padId, uri, opts = {}) {
    this.unload(padId);
    const { bpm, loop } = opts;
    const player = createAudioPlayer({ uri });
    player.loop = !!loop;
    try { player.volume = this.masterVolume; } catch (err) { /* ignore */ }

    const sub = player.addListener('playbackStatusUpdate', (status) => {
      if (status && status.didJustFinish && !player.loop) this._emit(padId, false);
    });

    this.entries.set(padId, { player, sub, baseBpm: bpm > 0 ? bpm : this.masterBpm });
  }

  getBaseBpm(padId) {
    const e = this.entries.get(padId);
    return e ? e.baseBpm : this.masterBpm;
  }

  setLoop(padId, loop) {
    const e = this.entries.get(padId);
    if (e) e.player.loop = !!loop;
  }

  isLoaded(padId) { return this.entries.has(padId); }

  trigger(padId) {
    const e = this.entries.get(padId);
    if (!e) return;
    const { player } = e;
    if (player.playing) { player.pause(); player.seekTo(0); this._emit(padId, false); }
    else { player.seekTo(0); player.play(); this._emit(padId, true); }
  }

  stop(padId) {
    const e = this.entries.get(padId);
    if (!e) return;
    e.player.pause();
    e.player.seekTo(0);
    this._emit(padId, false);
  }

  stopAll() {
    for (const [padId, e] of this.entries) {
      e.player.pause();
      e.player.seekTo(0);
      this._emit(padId, false);
    }
  }

  unload(padId) {
    const e = this.entries.get(padId);
    if (!e) return;
    try { if (e.sub && e.sub.remove) e.sub.remove(); e.player.remove(); } catch (err) { /* released */ }
    this.entries.delete(padId);
  }

  unloadAll() {
    for (const padId of Array.from(this.entries.keys())) this.unload(padId);
  }
}

export default new AudioEngine();
