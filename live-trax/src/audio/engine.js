// Audio core for Live Trax — the single seam the app talks to.
// Backed by expo-audio (JS) today; the C++ engine will forward through this same
// interface later. Owns audio playback AND the master clock (Transport).

import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import Transport from '../transport';

class AudioEngine {
  constructor() {
    this.entries = new Map(); // padId -> { player, sub, baseBpm, loaded, wantPlay }
    this.listener = null;
    this.configured = false;
    this.masterVolume = 1;
    this.masterBpm = 120;
    this.transport = new Transport();
  }

  setMasterVolume(v) {
    this.masterVolume = Math.max(0, Math.min(1, v));
    for (const [, e] of this.entries) {
      try { e.player.volume = this.masterVolume; } catch (err) { /* released */ }
    }
  }

  setMasterTempo(bpm) { if (bpm > 0) this.masterBpm = bpm; this.transport.configure({ bpm }); }
  setMasterSignature(num, den) { this.transport.configure({ num, den }); }
  setQuantize(q) { this.transport.setQuantize(q); }

  startClock() { this.transport.start(); }
  stopClock() { this.transport.stop(); }
  toggleClock() { this.transport.toggle(); }
  isClockPlaying() { return this.transport.playing; }
  subscribeBeat(fn) { return this.transport.subscribe(fn); }
  onBar(fn) { return this.transport.onBar(fn); }
  disposeClock() { this.transport.dispose(); }

  schedule(fn) {
    if (this.transport.playing && this.transport.quantize === 'bar') {
      const off = this.transport.onBar(() => { off(); fn(); });
    } else { fn(); }
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
      console.log('[engine] audio session configured');
    } catch (e) { console.warn('[engine] configure FAILED', e && e.message); }
  }

  setListener(fn) { this.listener = fn; }
  _emit(padId, isPlaying) { if (this.listener) this.listener(padId, isPlaying); }

  async load(padId, uri, opts = {}) {
    this.unload(padId);
    const { bpm, loop } = opts;
    console.log('[engine] load', padId, 'uri=', uri);
    const player = createAudioPlayer({ uri });
    player.loop = !!loop;
    try { player.volume = this.masterVolume; } catch (err) { /* ignore */ }

    const entry = { player, sub: null, baseBpm: bpm > 0 ? bpm : this.masterBpm, loaded: false, wantPlay: false };

    entry.sub = player.addListener('playbackStatusUpdate', (status) => {
      if (!status) return;
      // Fire the play as soon as the file finishes loading (fixes tap-before-ready).
      if (status.isLoaded && !entry.loaded) {
        entry.loaded = true;
        console.log('[engine] loaded', padId, 'dur=', status.duration);
        if (entry.wantPlay) {
          entry.wantPlay = false;
          player.seekTo(0);
          player.play();
          this._emit(padId, true);
        }
      }
      if (status.didJustFinish && !player.loop) this._emit(padId, false);
    });

    this.entries.set(padId, entry);
  }

  getBaseBpm(padId) { const e = this.entries.get(padId); return e ? e.baseBpm : this.masterBpm; }
  setLoop(padId, loop) { const e = this.entries.get(padId); if (e) e.player.loop = !!loop; }
  isLoaded(padId) { return this.entries.has(padId); }

  trigger(padId) {
    const e = this.entries.get(padId);
    if (!e) return;
    const { player } = e;
    if (player.playing) {
      player.pause();
      player.seekTo(0);
      this._emit(padId, false);
    } else if (e.loaded || player.isLoaded) {
      player.seekTo(0);
      player.play();
      console.log('[engine] play', padId, 'playing=', player.playing);
      this._emit(padId, true);
    } else {
      // Not loaded yet — remember the intent and play when loading finishes.
      e.wantPlay = true;
      console.log('[engine] waiting for load', padId);
      this._emit(padId, true);
    }
  }

  stop(padId) {
    const e = this.entries.get(padId);
    if (!e) return;
    e.wantPlay = false;
    e.player.pause();
    e.player.seekTo(0);
    this._emit(padId, false);
  }

  stopAll() {
    for (const [padId, e] of this.entries) {
      e.wantPlay = false;
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
