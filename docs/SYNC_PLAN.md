# Live Trax — Beat-Synced Launch & Signature Sync (analysis + plan)

Goal: pads no longer start/stop the instant you tap. They quantize to the master
grid (signature-aware), loops stay phase-locked to the bar, and the UI shows the
current bar with a per-pad playback ring — the Remixlive live-loop feel.

---

## 1. What Remixlive actually does (confirmed)

- A **global Quantize value**, in beats. Default `4` = one bar in 4/4. A tapped
  loop doesn't start now — it starts on the **next boundary** of that value.
- Loops inherit the global quantize; **one-shots default to `0`** (instant, for
  finger-drumming); any pad can override, including **None**.
- Launched loops are **phase-locked**: a loop's bar 1 lands on a master bar, and
  because it's already tempo-matched, its bars keep aligning — everything stays
  "in the grid" no matter when you tapped.
- Stopping is also quantized (the loop finishes to the boundary), so nothing
  clips mid-beat.
- The pad shows a **playhead ring** (progress through the loop) and the transport
  shows the current bar/beat.

Our current state: any pad starts/stops immediately, tempo-matched but **not
phase-aligned** to a shared grid, and the beat indicator runs off a JS timer.

---

## 2. The core problem with our current architecture

Sync has one hard requirement: the clock that schedules launches and the clock
that plays audio must be **the same sample-accurate clock**. Right now:

- Audio lives in the native engine (miniaudio audio thread) — sample-accurate.
- The master clock is `transport.js` — a `setInterval` in JavaScript, which
  jitters by milliseconds and is a different clock entirely.

So quantizing launches from JS can never be tight. **The transport must become
native**, and JS becomes a *view* of it (for the UI), not the source of truth.

---

## 3. The clean path: miniaudio already gives us the tools

We don't hand-roll a scheduler. miniaudio has exactly what's needed:

- **`ma_engine_get_time_in_pcm_frames(engine)`** — the global sample clock. This
  is our master transport position, sample-accurate and free.
- **`ma_sound_set_start_time_in_pcm_frames(sound, frame)`** and
  **`ma_sound_set_stop_time_in_pcm_frames(...)`** — schedule a voice to begin or
  end at an *exact* engine frame. This is quantized launch/stop, for free, on the
  audio thread.

So the whole feature is: compute the next boundary frame, schedule the sound's
start there. No custom mixer, no polling races in the audio path.

### The math (native)
```
framesPerBeat = sampleRate * 60 / masterBpm          // quarter-note beat
beatUnit      = 4 / denominator                        // /4=1, /8=0.5 (quarters)
framesPerBeat *= beatUnit
quantumFrames = quantizeBeats * framesPerBeat          // e.g. 4 beats = 1 bar
now           = ma_engine_get_time_in_pcm_frames(engine)
nextBoundary  = ceil((now + safety) / quantumFrames) * quantumFrames
ma_sound_set_start_time_in_pcm_frames(sound, nextBoundary)
ma_sound_start(sound)                                  // fires exactly then
```
`safety` is a few ms of headroom so we never schedule in the past.

### Phase-lock
Starting a loop from its beginning on a master-bar boundary aligns bar 1. Since
the loop is tempo-matched (Signalsmith), its subsequent bars stay aligned — as
long as the loop is a **whole number of bars**. That's the one piece of metadata
we still need per loop: **length in bars** (or derive it from duration + bpm +
signature). Loops that aren't an integer number of bars drift; Remixlive solves
this by warping to exact bars — our import "N bars @ signature" helper already
captures this, we just need to store and use it.

---

## 4. Feeding the UI (the highlight + ring)

Native is the source of truth; the UI polls it ~30 fps:

- **`getTransportPosition()`** → `{ bar, beat, phase }` from engine time + bpm +
  signature. Drives the current-bar highlight and the beat dots. Replaces the JS
  timer as the *display* (the JS transport can stay for pure-UI, but reads native
  time so it never drifts from the audio).
- **`getPadState()`** → for each playing pad, its phase through its own loop
  (from engine time − its scheduled start, wrapped by loop length). Drives the
  pad's **playhead ring** and lets the grid mark the **current bar/slice**.

Polling a couple of numbers 30×/s across the bridge is cheap; the audio thread is
untouched.

---

## 5. "Slicing per signature + current slice highlighted"

A loop of `bars` bars in signature `n/d` is a grid of `bars × n` beat-slices. The
ring/among-pads highlight is just the transport phase mapped onto that grid:
current slice = `floor(loopPhase * bars * beatsPerBar)`. No audio slicing is
needed for playback — the "slices" are a visual/positional overlay on the
phase-locked loop. (True per-slice re-triggering, if wanted later, is a separate
feature.)

---

## 6. Implementation phases

**P1 — Native transport readout.** Expose `getTransportPosition()` from the
engine (engine time → bar/beat/phase). Point the TransportBar beat indicator at
it instead of the JS timer. Proves the native clock drives the UI. *(No audio
change; low risk.)*

**P2 — Quantized launch/stop.** Add a global `quantize` (beats) + per-pad
override. On `trigger`, schedule the sound with
`ma_sound_set_start_time_in_pcm_frames` at the next boundary; on `stop`, schedule
the stop at the next boundary. Column-exclusive switch becomes: schedule the new
one and the old one's stop on the same boundary. Pads pulse while "armed."

**P3 — Phase-lock + bars metadata.** Store each loop's length in bars (import
helper), start loops from frame 0 on the boundary, confirm multi-loop alignment.

**P4 — UI ring + current bar.** `getPadState()` → per-pad playhead ring and the
grid's current-bar highlight.

**P5 (optional later).** Per-pad quantize values incl. "None" for one-shots;
count-in; a visible metronome.

---

## 7. Risks & honest caveats

- **Output latency offset**: `ma_engine_get_time_in_pcm_frames` is the engine
  clock; the actual speaker output trails it by the device buffer. For visual
  sync we may subtract a small constant so the highlight matches what's heard.
- **Non-integer-bar loops drift** — hence the bars metadata; without it, sync is
  only as good as the loop being cleanly trimmed.
- **Scheduling in the past**: if the JS→native call lands after the boundary, the
  `safety` margin (and rounding up) prevents a missed/instant launch.
- **Re-scheduling on tempo change while armed**: if tempo changes between arm and
  fire, recompute the boundary. Edge case, handled in P2.
- This is native-thread scheduling work; it can't be tested from the cloud — it's
  device build-and-listen, like the stretch was.

---

## 8. Recommendation

Do **P1 first** (native transport readout → UI). It's low-risk, proves the native
clock, and immediately makes the beat indicator sample-accurate. Then P2
(quantized launch) is the feature that actually makes it feel like Remixlive.
