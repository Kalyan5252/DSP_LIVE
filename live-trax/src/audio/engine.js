// Audio engine for the pad grid — the app's single audio interface.
//
// This is the seam the rest of the app talks to. Today it is backed by
// expo-audio (JS). When the C++ Signalsmith engine is integrated
// (docs/CPP_INTEGRATION_PLAN.md), this same interface forwards to it over JSI and
// nothing above the interface changes.
//
// Interface:
//   configure()                         one-time audio-session setup
//   load(padId, uri, { bpm, loop })     load a loop; bpm is its original tempo
//   trigger(padId) / stop / stopAll
//   setLoop(padId, loop)
//   setMasterTempo(bpm)                 master tempo (see note below)
//   setMasterVolume(0..1)
//   isLoaded / getBaseBpm / unload / unloadAll
//
// Tempo note: expo-audio does not time-stretch, so setMasterTempo here only
// records the tempo and each pad keeps its original bpm. Real, pitch-preserving
// tempo-lock (rate = masterBpm / loopBpm) is applied by the C++ engine once
// integrated — at which point this method becomes the live control.

import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

class AudioEngine {
  constructor() {
    this.entries = new Map(); // padId -> { player, sub, baseBpm }
    this.listener = null;
    this.configured = false;
    this.masterVolume = 1;
    this.masterBpm = 120;
  }

  setMasterVolume(v) {
    this.masterVolume = Math.max(0, Math.min(1, v));
    for (const [, e] of this.entries) {
      try { e.player.volume = this.masterVolume; } catch (err) { /* released */ }
    }
  }

  // Records the master tempo. No audio effect on the expo-audio backend; the C++
  // engine will apply it as real tempo-lock using each pad's baseBpm.
  setMasterTempo(bpm) {
    if (bpm > 0) this.masterBpm = bpm;
  }

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

  // Load a loop onto a pad. opts.bpm = the loop's own tempo (defaults to the
  // current master); opts.loop = whether it repeats.
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

  // The loop's original tempo, for the tempo-lock ratio (used by the C++ engine).
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
