// Sync store — a tiny pub/sub that mirrors the NATIVE transport for the UI.
//
// Native (miniaudio) owns the sample-accurate clock and pad scheduling. This
// store polls it ~30x/s and pushes changes to the individual components that care
// (each Pad subscribes to its own id; the transport bar subscribes to the beat).
// Doing it this way means only the pads that actually changed re-render each
// frame — the whole grid does NOT re-render 30x/s, which keeps loops glitch-free.

import engine from './engine';

class SyncStore {
  constructor() {
    this.padState = {};   // id -> { s: 1(armed)|2(playing), p: 0..1 }
    this.transport = { playing: false, barIndex: 0, beatInBar: 0, phase: 0, beatsPerBar: 4 };
    this.columnActive = {}; // instKey -> { row, s }  (read by App for toggle logic)
    this.padSubs = new Map();
    this.transportSubs = new Set();
    this._timer = null;
  }

  start() {
    if (this._timer || !engine.hasNativeTransport()) return;
    this._timer = setInterval(() => this._tick(), 33);
  }
  stop() { if (this._timer) { clearInterval(this._timer); this._timer = null; } }

  subscribePad(id, fn) {
    let s = this.padSubs.get(id);
    if (!s) { s = new Set(); this.padSubs.set(id, s); }
    s.add(fn);
    return () => { const set = this.padSubs.get(id); if (set) set.delete(fn); };
  }
  getPad(id) { return this.padState[id] || null; }

  subscribeTransport(fn) { this.transportSubs.add(fn); return () => this.transportSubs.delete(fn); }
  getTransport() { return this.transport; }
  getColumnActive() { return this.columnActive; }

  // Optimistic: light a pad as "armed" the instant it's tapped, before the poll
  // confirms it (keeps the UI snappy).
  markArmed(id) {
    const a = { s: 1, p: 0 };
    this.padState[id] = a;
    const subs = this.padSubs.get(id);
    if (subs) subs.forEach((f) => f(a));
  }
  markStopped(id) {
    if (!this.padState[id]) return;
    delete this.padState[id];
    const subs = this.padSubs.get(id);
    if (subs) subs.forEach((f) => f(null));
  }

  _colOf(id) {
    const i = id.lastIndexOf('-');
    if (i <= 0) return null;
    return { col: id.slice(0, i), row: parseInt(id.slice(i + 1), 10) };
  }

  _tick() {
    // ---- transport ----
    const t = engine.getTransport();
    if (t) {
      const p = this.transport;
      if (t.playing !== p.playing || t.barIndex !== p.barIndex ||
          t.beatInBar !== p.beatInBar || t.beatsPerBar !== p.beatsPerBar) {
        this.transport = t;
        this.transportSubs.forEach((f) => f(t));
      } else {
        this.transport = t; // keep phase fresh without notifying
      }
    }

    // ---- pads ----
    const active = engine.getActivePads(); // { id: { s, p } }
    const prev = this.padState;
    const next = {};
    const colActive = {};

    for (const id in active) {
      const a = active[id];
      next[id] = a;
      // Always notify while a pad is active. The pad itself only re-renders when
      // its highlighted bar (or play state) changes, so this is cheap — and it
      // avoids a stale-highlight bug where a long loop's tiny per-tick phase delta
      // never crossed a threshold and the ring froze.
      const subs = this.padSubs.get(id);
      if (subs) subs.forEach((f) => f(a));
      const c = this._colOf(id);
      if (c && !Number.isNaN(c.row)) {
        const cur = colActive[c.col];
        if (!cur || a.s > cur.s) colActive[c.col] = { row: c.row, s: a.s };
      }
    }
    // pads that dropped off -> stopped
    for (const id in prev) {
      if (!(id in next)) {
        const subs = this.padSubs.get(id);
        if (subs) subs.forEach((f) => f(null));
      }
    }

    this.padState = next;
    this.columnActive = colActive;
  }
}

export default new SyncStore();
