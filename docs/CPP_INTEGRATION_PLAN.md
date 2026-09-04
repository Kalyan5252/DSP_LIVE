# Live Trax — Integrating the C++ Audio Engine (the real tempo/DSP core)

Decision: the app's audio core will be the **C++ Signalsmith time-stretch engine**
we already built and verified (`live-trax-engine/`), not the OS playback-rate
trick. This is the professional path — best-quality tempo-lock (pitch preserved),
a sample-accurate master clock, quantized launch, and room for warp/FX later.

This document is the map: what runs where, what you do on the Mac vs. what I
write, and the order to do it in.

---

## The one hard gate

Expo Go **cannot** load custom native code. To ship the C++ engine the app must
move to a **development build** (`expo-dev-client` + `npx expo run:ios` /
`run:android`). After that you install "Live Trax (dev)" on your phone instead of
Expo Go, and it hot-reloads JS exactly like now. This is a one-time setup, and
it's the gate for everything below.

Nothing here can be tested from the cloud session — the native engine only exists
once compiled on your Mac. I write the code; you run the builds; we iterate on
what the build reports.

---

## What already exists (done, verified)

- `live-trax-engine/engine/PadEngine.{h,cpp}` — miniaudio pad playback engine.
- `live-trax-engine/engine/Transport.{h,cpp}` — master clock + all 5 signatures
  (verified: bar/beat math + quantized-launch boundaries).
- Signalsmith time-stretch — verified via `stretch_demo` (tempo change, pitch
  preserved) and `loop_demo` (loop + metronome, tempo-locked).
- `live-trax-engine/bindings/PadEngineJSI.{h,cpp}` — a JSI host object skeleton.

The pieces are proven in isolation. Integration is joining them and bridging to JS.

---

## Engine-agnostic groundwork (pure JS, do this first — testable in Expo Go)

Exact tempo-lock needs each loop's **original BPM** — the same requirement for the
C++ engine or any other. This is real product work with no native dependency:

1. **Per-loop BPM metadata.** Add a `bpm` field to each library file (and pad).
   Set it in the library editor (a number field next to name/tags). Optionally a
   "detect" helper later.
2. **Board carries bpm per pad.** When a loop is assigned to a pad, its bpm rides
   along, so the engine can compute `rate = masterBpm / loopBpm`.
3. **A stable JS engine interface.** Define the calls the app makes —
   `load(padId, uri, {bpm, loop})`, `setMasterTempo(bpm)`,
   `setMasterSignature(n, d)`, `trigger(padId)`, `stop`, `stopAll`,
   `setQuantize`, `setMasterVolume`. Today these hit `expo-audio`; after
   integration the *same* interface forwards to the C++ engine via JSI. The app
   above the interface doesn't change.

Doing this now means the day the native engine lands, we swap one module and the
whole UI already speaks its language.

---

## Native integration milestone (Mac + my bridge code)

### Step 0 — Dev build
`npx expo install expo-dev-client`, then `npx expo run:ios` (and/or
`run:android`). Confirm the app launches from the dev build on your phone.

### Step 1 — Vendor the engine into the app
Bring `PadEngine`, `Transport`, the Signalsmith stretch + its FFT dep, and
`miniaudio` into a local native module (Expo Modules API is the least-friction
path for an Expo app; the C++ is identical to a bare TurboModule).

### Step 2 — Build a StretchVoice
Replace each pad's plain `ma_sound` with a `ma_data_source` that reads the
decoded loop and runs it through Signalsmith at `rate = masterBpm / loopBpm`,
pitch preserved. `Transport` drives quantized launch so loops start on the bar.
(This is the `docs/TIME_STRETCH_PLAN.md` architecture, now inside the app.)

### Step 3 — JSI bridge
Finish `installPadEngine(runtime)` so `global.__LiveTrax` exposes the engine, and
wire the JS `NativePadEngine` wrapper to it. Change one import in the app
(`engine` → the native engine) — the interface from the groundwork matches, so
nothing else moves.

### Step 4 — Prove it on device
Load two loops at different BPMs, tag their BPMs, drag the master tempo: both
lock and stay in pitch. Toggle signatures; confirm quantized launch on the bar.

---

## Order of work

1. **Now (me, testable):** per-loop BPM metadata + the stable JS engine interface.
2. **You:** dev build (Step 0) when ready to leave Expo Go.
3. **Me + you, iterating:** Steps 1–4, native, on your Mac.

Groundwork first means we never block on the native build to keep improving the
product, and the integration becomes a swap rather than a rewrite.

---

## What we are explicitly NOT doing

Shipping the `expo-audio` playback-rate hack as the real tempo feature. It's the
OS stretcher, it degrades on musical material, and it would be torn out. If you
ever want an interim internal build with *some* audible tempo response, it's a
2-line fallback inside the same JS interface — but it is not the product.
