// Audio engine for the pad grid.
//
// Built on expo-audio's imperative API (createAudioPlayer), which is the right
// fit for a grid: each pad owns one long-lived player that we trigger, loop, and
// stop independently, and many can sound at once. (The hook-based useAudioPlayer
// API is awkward here because the number of players is dynamic.)
//
// A pad in "loop" mode keeps repeating until tapped again — this is what lets you
// stack a drum loop, a bassline, and a melody and have them play together, the
// core Remixlive-style workflow. A pad in "one-shot" mode plays once and stops.

import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

class AudioEngine {
  constructor() {
    this.entries = new Map(); // padId -> { player, sub }
    this.listener = null; // (padId, isPlaying) => void
    this.configured = false;
    this.masterVolume = 1; // 0..1 applied to every pad
  }

  // Master volume: apply to all current players and remember it for new loads.
  setMasterVolume(v) {
    this.masterVolume = Math.max(0, Math.min(1, v));
    for (const [, e] of this.entries) {
      try { e.player.volume = this.masterVolume; } catch (err) { /* released */ }
    }
  }

  // Route audio so it plays even when the phone's ringer is on silent.
  async configure() {
    if (this.configured) return;
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        interruptionMode: 'mixWithOthers',
      });
      this.configured = true;
    } catch (e) {
      // Fall through; playback may still work with defaults.
    }
  }

  setListener(fn) {
    this.listener = fn;
  }

  _emit(padId, isPlaying) {
    if (this.listener) this.listener(padId, isPlaying);
  }

  // Create (or replace) the player behind a pad.
  async load(padId, uri, loop) {
    this.unload(padId);
    const player = createAudioPlayer({ uri });
    player.loop = !!loop;
    try { player.volume = this.masterVolume; } catch (err) { /* ignore */ }

    const sub = player.addListener('playbackStatusUpdate', (status) => {
      // When a one-shot reaches its end, report the pad as idle so the UI can
      // drop its lit state.
      if (status && status.didJustFinish && !player.loop) {
        this._emit(padId, false);
      }
    });

    this.entries.set(padId, { player, sub });
  }

  setLoop(padId, loop) {
    const e = this.entries.get(padId);
    if (e) e.player.loop = !!loop;
  }

  isLoaded(padId) {
    return this.entries.has(padId);
  }

  // Tap behavior: if it's playing, stop it; otherwise restart from the top.
  trigger(padId) {
    const e = this.entries.get(padId);
    if (!e) return;
    const { player } = e;
    if (player.playing) {
      player.pause();
      player.seekTo(0);
      this._emit(padId, false);
    } else {
      player.seekTo(0);
      player.play();
      this._emit(padId, true);
    }
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
    try {
      if (e.sub && e.sub.remove) e.sub.remove();
      e.player.remove();
    } catch (err) {
      // Player may already be released.
    }
    this.entries.delete(padId);
  }

  unloadAll() {
    for (const padId of Array.from(this.entries.keys())) {
      this.unload(padId);
    }
  }
}

// One shared engine for the whole app.
export default new AudioEngine();
