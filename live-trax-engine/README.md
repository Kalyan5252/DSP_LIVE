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
