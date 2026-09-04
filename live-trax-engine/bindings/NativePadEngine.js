// NativePadEngine — drop-in replacement for the JS `engine` in the Live Trax app,
// but backed by the C++ PadEngine over JSI.
//
// It exposes the SAME interface the app already uses (configure, setListener,
// load, trigger, setLoop, stop, stopAll, unload, unloadAll, isLoaded), so
// switching over is a one-line import change in App.js:
//
//     // import engine from './src/audio/engine';
//     import engine from './src/audio/NativePadEngine';
//
// Two differences from the expo-audio version, both handled here:
//   1. The native side is index-based (pad 0..15); the app uses ids like
//      "pad-3". We translate between them.
//   2. The native engine doesn't push playback events. To keep the UI's lit
//      state accurate (especially for one-shots that end on their own), we poll
//      isPlaying a few times a second while anything is active and emit changes
//      through the same listener callback the app already wired up.

const NATIVE = global.__LiveTrax; // installed by the native module (see INTEGRATION.md)

function idToIndex(padId) {
  // "pad-7" -> 7
  const m = /(\d+)$/.exec(String(padId));
  return m ? parseInt(m[1], 10) : -1;
}

class NativePadEngine {
  constructor() {
    this.listener = null;
    this.idByIndex = new Map(); // index -> padId (to report back in original terms)
    this.lastPlaying = new Map(); // index -> bool
    this.poll = null;
  }

  available() {
    return !!NATIVE;
  }

  async configure() {
    // Native engine initializes itself when the host object is created.
    // Nothing to do here; kept for API parity with the expo-audio engine.
    return this.available();
  }

  setListener(fn) {
    this.listener = fn;
  }

  _emit(index, isPlaying) {
    this.lastPlaying.set(index, isPlaying);
    const padId = this.idByIndex.get(index);
    if (this.listener && padId != null) this.listener(padId, isPlaying);
  }

  _ensurePolling() {
    if (this.poll) return;
    this.poll = setInterval(() => {
      let anyActive = false;
      for (const [index] of this.idByIndex) {
        const playing = NATIVE ? NATIVE.isPlaying(index) : false;
        if (playing) anyActive = true;
        if (playing !== (this.lastPlaying.get(index) || false)) {
          this._emit(index, playing);
        }
      }
      if (!anyActive) {
        clearInterval(this.poll);
        this.poll = null;
      }
    }, 120);
  }

  async load(padId, uri, loop) {
    if (!NATIVE) return false;
    const index = idToIndex(padId);
    if (index < 0) return false;
    this.idByIndex.set(index, padId);
    // The native side wants a filesystem path. expo-file-system uris look like
    // file:///... — strip the scheme for the C++ side.
    const path = uri.startsWith('file://') ? decodeURI(uri.slice('file://'.length)) : uri;
    return NATIVE.loadPad(index, path, !!loop);
  }

  setLoop(padId, loop) {
    if (!NATIVE) return;
    NATIVE.setLoop(idToIndex(padId), !!loop);
  }

  isLoaded(padId) {
    return NATIVE ? NATIVE.isLoaded(idToIndex(padId)) : false;
  }

  trigger(padId) {
    if (!NATIVE) return;
    const index = idToIndex(padId);
    NATIVE.trigger(index);
    // Report immediately; the poller reconciles when it stops on its own.
    this._emit(index, NATIVE.isPlaying(index));
    this._ensurePolling();
  }

  stop(padId) {
    if (!NATIVE) return;
    const index = idToIndex(padId);
    NATIVE.stop(index);
    this._emit(index, false);
  }

  stopAll() {
    if (!NATIVE) return;
    NATIVE.stopAll();
    for (const [index] of this.idByIndex) this._emit(index, false);
  }

  unload(padId) {
    if (!NATIVE) return;
    const index = idToIndex(padId);
    NATIVE.clearPad(index);
    this.idByIndex.delete(index);
    this.lastPlaying.delete(index);
  }

  unloadAll() {
    if (!NATIVE) return;
    for (const [index] of this.idByIndex) NATIVE.clearPad(index);
    this.idByIndex.clear();
    this.lastPlaying.clear();
    if (this.poll) {
      clearInterval(this.poll);
      this.poll = null;
    }
  }
}

export default new NativePadEngine();
