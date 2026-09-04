# Live Trax C++ Engine

A small, reliable **C++ DSP/playback engine** for the Live Trax pad app, plus the
JSI binding that connects it to React Native. This is the "real software" core:
timing and mixing happen in native code, below JavaScript, using the
public-domain [miniaudio](https://miniaud.io/) library.

## Why this exists

The Expo/JS version of Live Trax is great for getting going, but it leans on the
OS media players. When you want rock-solid, glitch-free launches, many voices at
once, and room to add real DSP (effects, time-stretch, tempo-lock), you want a
native audio engine. That's this.

## What's here

```
live-trax-engine/
├── engine/                     # the portable C++ engine (iOS/Android/desktop)
│   ├── PadEngine.h / .cpp      # load / trigger / loop / stop / stopAll
│   ├── miniaudio_impl.cpp      # compiles miniaudio once
│   └── miniaudio.h             # (you fetch this — see below)
├── standalone/                 # build & HEAR the engine with zero RN
│   ├── test_main.cpp           # tiny terminal REPL
│   ├── CMakeLists.txt
│   └── build_and_run.sh
├── bindings/                   # connect the engine to React Native
│   ├── PadEngineJSI.h / .cpp   # installs global.__LiveTrax via JSI
│   └── NativePadEngine.js      # drop-in replacement for the app's JS engine
├── fetch_deps.sh               # downloads miniaudio.h
└── INTEGRATION.md              # step-by-step RN wiring (start here for the app)
```

## Quick start — prove it works in ~2 minutes (on your Mac)

You need CMake and a compiler (`xcode-select --install` gives you both on macOS).

```bash
cd live-trax-engine
bash fetch_deps.sh                       # gets miniaudio.h

cd standalone
bash build_and_run.sh ~/path/loop.wav    # pass one or more WAV/MP3/FLAC files
```

You'll get a prompt:

```
Commands:  [0-N] toggle pad   s = stop all   q = quit
>
```

Type `0` to start the first loop, `0` again to stop it, `s` to stop everything,
`q` to quit. If you hear it, the engine is solid — and any later trouble is
integration, not the engine.

## Then: put it in the app

See **INTEGRATION.md**. Short version: build the six C++ files into an Expo
native module, call `livetrax::installPadEngine(runtime)` once, copy
`bindings/NativePadEngine.js` into `live-trax/src/audio/`, and change one import in
`App.js`. The JS API is identical, so the rest of the app is untouched.

## The engine API (C++)

```cpp
livetrax::PadEngine engine;
engine.init();                              // start audio
engine.loadPad(0, "/path/to/loop.wav", true);  // index, file, loop?
engine.trigger(0);                          // play (or stop if already playing)
engine.setLoop(0, false);                   // switch to one-shot
engine.stop(0);
engine.stopAll();
engine.isPlaying(0);                        // -> bool
engine.clearPad(0);
engine.shutdown();
```

## License

Your code is yours. miniaudio is public domain (MIT-0) and fine to ship
commercially. No other dependencies.

---

## Phase 0 — Time-stretch proof (`stretch_demo`)

The first step of the tempo/time-stretch feature (see `docs/TIME_STRETCH_PLAN.md`).
It stretches one file's tempo **while preserving pitch** using
[Signalsmith Stretch](https://github.com/Signalsmith-Audio/signalsmith-stretch)
(MIT), independent of the pad engine — prove it sounds good before we wire
stretching into the pads.

```bash
cd live-trax-engine
bash fetch_deps.sh          # now also clones Signalsmith into third_party/
cd standalone
# stretch a 120-BPM loop down to 100 BPM (pitch unchanged), and play it:
bash run_stretch.sh ~/Music/loops/pattern1.wav --orig 120 --target 100 --play
```

Options: `--ratio R` (output/input length), `--orig B --target B` (tempo → ratio),
`--semitones S` (independent pitch shift), `--out FILE.wav`, `--play`.

Verified behavior: ratio 1.2 → 20% longer, pitch identical; `--semitones 12` →
one octave up, duration identical. Tempo and pitch are fully independent.

---

## Phase 1 (in progress) — master clock & time signatures (`transport_demo`)

`engine/Transport.{h,cpp}` is the master musical clock: it holds the master BPM
and time signature and computes bar/beat boundaries in samples, the accent
pattern, and the next quantized-launch boundary. It supports **2/4, 3/4, 4/4,
6/8, 7/8** (master BPM is always quarter-note; `/8` signatures beat in eighths,
grouped 6/8=3+3, 7/8=2+2+3).

`transport_demo` lets you watch and hear it before it drives the UI:

```bash
cd live-trax-engine/standalone
cmake -S . -B build && cmake --build build --target transport_demo

# print the exact beat grid for a signature (deterministic, checkable):
./build/transport_demo --bpm 120 --sig 7/8 --bars 2 --grid

# hear it as a metronome (accents higher-pitched):
./build/transport_demo --bpm 120 --sig 6/8 --bars 4 --metronome
```

Verified: 4/4 bar = 2.0 s @120; 3/4 = 1.5 s; 6/8 = 1.5 s (accents 1 & 4);
7/8 = 1.75 s (accents 1, 3, 5); quantized-launch boundaries land on the grid.

Next in Phase 1: fold this clock into the pad engine so tapped loops start on the
next boundary, and pre-render each loop to the master tempo (the offline path).

---

## Play a loop + metronome together (`loop_demo`)

Plays your audio sample **and** the metronome at the same time — the loop is
tempo-locked to the master BPM (pitch preserved) so it stays with the click.

```bash
cd live-trax-engine
bash fetch_deps.sh                 # needs miniaudio + Signalsmith
cd standalone
cmake -S . -B build && cmake --build build --target loop_demo

# live: play your 1-bar loop with a 4/4 click at 120 BPM
./build/loop_demo ~/Music/loops/pattern1.wav --bpm 120 --sig 4/4 --bars 1

# a 7/8 groove at 140, loop is 2 bars long:
./build/loop_demo ~/Music/loops/odd.wav --bpm 140 --sig 7/8 --bars 2

# render loop+click to a WAV instead of live playback:
./build/loop_demo ~/Music/loops/pattern1.wav --bpm 120 --sig 4/4 --bars 1 \
    --seconds 8 --render mix.wav
```

Tempo-lock options: `--bars N` (loop is N bars — most reliable) or `--orig BPM`
(loop was recorded at that tempo). Omit both to play as-is (may drift against the
click). Other flags: `--seconds T`, `--no-metronome`, `--render OUT.wav`.

Verified: clicks land exactly on the beat grid; an off-length loop is stretched
to fill its bars (e.g. a 1.6 s loop → 2.0 s for one 4/4 bar at 120).
