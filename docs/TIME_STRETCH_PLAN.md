# Live Trax — Time-Stretch, Tempo & Time-Signature Plan

A design plan for the biggest DSP feature in Live Trax: making every imported
loop lock to a master tempo (with pitch preserved), tagging each sample with its
own tempo and time signature, and stretching each file independently.

Status: **plan / research complete, no code written yet.** This document is the
blueprint we build from.

---

## 1. What we're actually building

Three connected capabilities:

1. **Per-sample tempo awareness.** Each imported file carries its own *original
   BPM* and *time signature*. A 120 BPM drum loop and a 90 BPM bassline can sit
   on adjacent pads and still know what they are.

2. **Master tempo lock via time-stretching.** The app has one *master BPM*.
   Every loop is time-stretched — tempo changed, **pitch preserved** — so it
   plays at the master tempo. Drop the master to 100 BPM and both the 120 and 90
   loops play at 100, in tune. This is the core of the Remixlive-style workflow.

3. **Time signatures (2/4, 4/4, 3/4, 6/8, 7/8).** Each sample and the master
   transport carry a signature. Signatures drive the **bar grid, quantized
   launch, and the metronome** — *not* the stretch ratio (see §3).

---

## 2. The one library decision: Signalsmith Stretch

The whole feature rests on a time-stretch engine. This is the decision to get
right, mostly because of **licensing** — some of the best libraries can't ship
in your app without either open-sourcing everything or paying per-product fees.

| Library | Quality | Independent time/pitch | License | Fit for Live Trax |
|---|---|---|---|---|
| **Signalsmith Stretch** | Excellent | Yes | **MIT** | **Recommended** — matches your MIT repo, free, modern, real-time-minded (`splitComputation`) |
| Rubber Band | Best-in-class | Yes | GPL **or** paid commercial | Would force your app to GPL, or cost per-product license fees |
| SoundTouch | Good | Yes | LGPL 2.1 | Static linking on iOS makes LGPL compliance awkward |
| Superpowered | Good (mobile-tuned) | Yes | Commercial SDK (has a free OSS stretch piece) | Vendor lock-in; heavier than we need |

**Recommendation: [Signalsmith Stretch](https://github.com/Signalsmith-Audio/signalsmith-stretch).**
MIT-licensed (ships cleanly in your MIT project, commercial-friendly), high
quality, independently controls stretch ratio and pitch, actively maintained by
a respected DSP author, and designed with real-time use in mind (it can split
its FFT work across calls to smooth out CPU spikes). It depends on
*Signalsmith Linear* for FFTs — a small companion header library we vendor
alongside it, exactly like we vendor miniaudio.

> Fallback: if we ever hit a wall, SoundTouch has a dead-simple API
> (`setTempo(ratio)`, `setPitch`, `setRate`) and is a drop-in for the same seam
> in our engine — but we'd take on the LGPL obligation.

---

## 3. The tempo & time-signature math (getting this right up front)

This is where most implementations get confused, so we pin it down now.

**Stretch ratio depends only on tempo, never on the signature.**
A beat is a beat. To play a loop recorded at `originalBPM` so it lines up with
`masterBPM`:

```
stretchRatio = originalBPM / masterBPM
```

(A 120 BPM loop at 100 BPM master → ratio 1.2 → it plays 20% longer, pitch
unchanged.) The time signature does **not** enter this equation.

**So what are signatures for?** Three things:

1. **Bar length** — how long one bar is, which sets loop boundaries and the grid.
2. **Quantized launch** — starting loops on a bar/beat boundary so they stay
   locked (see §5).
3. **The metronome / visual grid** — click and pad-grid subdivisions.

**Beat unit convention.** The signature denominator says which note is "the
beat": `/4` = quarter note, `/8` = eighth note. We adopt the standard DAW
convention that **master BPM is expressed in quarter notes**, and derive bar
length from the signature:

```
quarterDurationSec = 60 / masterBPM

# x/4 signatures (2/4, 3/4, 4/4): numerator = quarter-note beats per bar
barSec = numerator * quarterDurationSec

# x/8 signatures (6/8, 7/8): numerator = eighth-note beats per bar
barSec = numerator * (quarterDurationSec / 2)
```

Example at 120 BPM (quarter = 0.5 s): 4/4 bar = 2.0 s; 3/4 = 1.5 s;
6/8 = 6 × 0.25 = 1.5 s; 7/8 = 7 × 0.25 = 1.75 s. For the *feel* of 6/8 (two
dotted-quarter pulses) we group the eighths 3+3 in the metronome; for 7/8 we let
the user pick a grouping (2+2+3 default) — display only, it doesn't affect
playback timing.

**Where does `originalBPM` come from on import?** Three tiers, cheapest first:

- **A. User enters BPM** — one number field. Always available, always correct.
- **B. Derive from loop length** (recommended default for loops): the user says
  "this is *N* bars of *this signature*", and we compute it from the file's
  duration:
  ```
  beatsInLoop = bars * beatsPerBar(signature)   # in the beat unit
  originalBPM = (quarterBeatsInLoop * 60) / durationSec
  ```
  This is reliable because loops are usually an exact number of bars.
- **C. Auto-detect BPM** (Phase 3 nice-to-have): onset/beat tracking (e.g. an
  aubio-style analyzer) to guess BPM, which the user confirms. Never trust it
  blindly — always show the number for the user to correct.

---

## 4. The engine change (this is the "major feature")

Today `PadEngine` uses miniaudio's high-level `ma_sound`, which reads, loops, and
mixes for us. A time-stretcher has to sit **inside each voice**, between "read
PCM" and "mix", so `ma_sound` alone can't do it. The change:

**Replace each pad's `ma_sound` with a custom stretched voice.**

```
[ decoded PCM in RAM ]  ->  [ Signalsmith stretch @ ratio ]  ->  [ miniaudio mix -> device ]
        per pad                    per pad, live                     shared, unchanged
```

Concretely, we implement a **custom `ma_data_source`** (miniaudio's official
extension point — `ma_data_source_vtable` with our own `read`/`seek`) called
`StretchVoice`:

- Holds the pad's fully-decoded sample (we already decode to RAM — no disk I/O on
  the audio thread, which is what keeps it glitch-free).
- Owns one `SignalsmithStretch` instance, configured at load time (all allocation
  happens off the audio thread).
- On each `read` from the audio callback: pulls input frames from the RAM buffer
  (wrapping at loop end for looping pads), runs them through the stretcher at the
  current ratio, returns stretched output frames.
- Exposes `setStretchRatio(double)` and `setSemitones(double)` (pitch is a free
  bonus once the stretcher is in place).

`ma_engine` keeps doing the mixing and device management via its node graph — we
attach each `StretchVoice` as a source node. **This is the smallest change that
gets real-time stretch while keeping miniaudio's reliable mixing.**

**CPU reality (important on phones).** Real-time stretching N voices at once is
the cost of this feature. Mitigations, all in the plan:

- **Bypass at ratio 1.0** — if a pad's original BPM equals the master (within a
  cent), skip the stretcher entirely and pass PCM straight through.
- **`splitComputation`** — spread each stretcher's FFT work across callbacks to
  avoid spikes.
- **Cap simultaneous stretched voices** and expose a per-pad "tempo lock" toggle
  (one-shot FX and non-musical samples opt out of stretching).
- **Per-voice quality setting** — cheaper mode for many voices, best mode for a
  featured loop.

---

## 5. Keeping loops locked: the master clock + quantized launch

Stretching alone makes loops the *same tempo*; it doesn't make them *start
together*. For that we add a **master transport**:

- A sample-accurate frame counter that is the single source of musical time.
- Holds `masterBPM` and `masterSignature`; computes bar/beat boundaries in frames.
- **Quantized launch:** when a pad is tapped, we don't start it instantly — we
  schedule its `StretchVoice` to begin at the next bar (or beat, user-selectable
  quantize grid: bar / ½ bar / beat / off). Tap anytime, and every loop still
  drops in on the grid, perfectly aligned. This is the single biggest thing that
  makes it *feel* like a real loop performance instrument.
- Optional **metronome/count-in** driven by the same clock.

The transport lives in the engine and is read on the audio thread; the UI just
sets `masterBPM`, `masterSignature`, and `quantizeGrid`.

---

## 6. What changes in the app (JS/UI)

- **Import sheet gains a tempo section:** BPM field (or "N bars @ signature"
  helper that derives it), a signature picker (2/4, 3/4, 4/4, 6/8, 7/8), and a
  "tempo lock" toggle per pad.
- **A master transport bar:** master BPM (tap-tempo + fine control), master
  signature, quantize grid, play/stop metronome.
- **Pad tiles** show each sample's original BPM/signature and light up on the
  grid on the beat.
- The engine API grows by a handful of calls, all mirrored in
  `NativePadEngine.js`:
  `setMasterTempo(bpm)`, `setMasterSignature(num, den)`, `setQuantize(grid)`,
  `setPadTempo(index, originalBpm)`, `setPadSignature(index, num, den)`,
  `setPadStretchEnabled(index, bool)`, `setPadSemitones(index, n)`.

---

## 7. Phased delivery (ship reliably, not all at once)

**Phase 0 — Vendoring & spike (½–1 day).**
Add Signalsmith Stretch + Signalsmith Linear next to miniaudio. Extend the
standalone `padtest` harness with a `stretch <pad> <ratio>` command and prove one
loop stretches cleanly, pitch intact, on the Mac. *Gate: it sounds good offline
before any app work.*

**Phase 1 — Offline stretch to a fixed master (most reliable first win).**
When master BPM/signature is set, pre-render each loop to that tempo *once* into a
new RAM buffer and play the rendered buffer (no per-callback stretching → low
CPU, sample-accurate, dead simple). Add quantized launch + master clock. Changing
master tempo re-renders loops (a brief, visible "re-warping…" step). This alone
delivers the whole feature set for a loop app and is rock-solid.

**Phase 2 — Real-time stretch (live tempo).**
Swap the offline render for the live `StretchVoice` data source so master BPM can
be swept smoothly while playing, with the bypass/`splitComputation`/polyphony-cap
mitigations. This is the CPU-heavy, higher-risk step — worth it for live tempo
automation, but Phase 1 already ships the feature.

**Phase 3 — Niceties.**
BPM auto-detect on import, per-pad pitch shift (semitones), warp-marker editing
for loops that aren't perfectly trimmed, swing/groove.

---

## 8. Risks & honest caveats

- **CPU on older phones** is the real constraint for Phase 2. Phase 1 sidesteps
  it entirely, which is why we do it first.
- **Loops must be cleanly trimmed** to a whole number of bars, or they won't lock
  no matter how good the stretch is. The "N bars @ signature" import helper
  enforces this; warp markers (Phase 3) handle the messy cases.
- **Extreme stretch ratios** (say, <0.5× or >2×) always add artifacts in any
  library — we keep sane ranges and let pitch-shift, not extreme stretch, handle
  big musical moves.
- **Native build work grows:** Signalsmith + its FFT dep join miniaudio in the
  iOS Podspec and Android CMake — a bit more build surface, no new architecture.
- None of this can be validated in the cloud sandbox (no audio device, no phone);
  the standalone harness on your Mac is where each phase is proven first.

---

## 9. Immediate next step

If this plan looks right, **Phase 0** is the concrete start: I vendor Signalsmith
Stretch into `live-trax-engine`, add the `stretch` command to the standalone
harness, and you build it on your Mac and confirm a loop stretches cleanly. Once
that's proven, Phase 1 gives you master-tempo lock end to end.

**Libraries referenced:** [Signalsmith Stretch](https://github.com/Signalsmith-Audio/signalsmith-stretch)
(MIT) · [Rubber Band](https://breakfastquay.com/rubberband/) (GPL/commercial) ·
[SoundTouch](https://www.surina.net/soundtouch/) (LGPL) ·
[Superpowered](https://superpowered.com/free-open-source-time-stretching-pitch-shifting).
