# Integrating the C++ PadEngine into React Native

This is the hard part, and it's honest to say so: wiring native C++ into a React
Native app touches Xcode, the Android NDK, and platform build files. Do it in the
order below and test at each gate — don't wire everything and hope.

There are two routes. **Route A (Expo Modules API) is recommended** for your
Live Trax app because it's an Expo project — it's much less boilerplate and it owns
the native build config for you. Route B (bare TurboModule) is here if you ever
eject to bare React Native.

---

## Gate 0 — prove the engine with no React Native at all

Before any of this, build the standalone harness (see `README.md`):

```bash
bash fetch_deps.sh
cd standalone && bash build_and_run.sh ~/Music/loop120.wav ~/Music/bass.wav
```

If you hear the loops and can toggle them from the terminal, the engine is good.
Everything below is *only* about connecting it to JS.

---

## What "installing the JSI binding" means

`bindings/PadEngineJSI.cpp` defines `livetrax::installPadEngine(jsi::Runtime&)`,
which creates `global.__LiveTrax`. Something native has to call it **once, on
the JS thread, with the runtime pointer.** That "something" is the native module.
`bindings/NativePadEngine.js` then talks to `global.__LiveTrax` and presents the
same API your `App.js` already uses.

Files that must end up in the native build (all routes):

- `engine/PadEngine.h`, `engine/PadEngine.cpp`
- `engine/miniaudio.h`, `engine/miniaudio_impl.cpp`
- `bindings/PadEngineJSI.h`, `bindings/PadEngineJSI.cpp`

---

## Route A — Expo Modules API (recommended)

### 1. Prebuild native projects

Expo Go can't load custom native code, so you move to a dev build:

```bash
cd live-trax
npx expo install expo-dev-client
npx create-expo-module@latest --local PadEngineModule
```

This scaffolds `modules/pad-engine-module/` with iOS (Swift) and Android (Kotlin)
sides and the build files already wired into your app.

### 2. Drop in the C++

Copy the six files above into `modules/pad-engine-module/ios/` and
`modules/pad-engine-module/android/src/main/cpp/` (or a shared `cpp/` folder you
reference from both — see the module's `*.podspec` and `CMakeLists.txt`).

### 3. Call the installer once

In the module's iOS `*.swift`, in `OnCreate` / the view-less module's init, get
the JSI runtime from the React bridge and call `livetrax::installPadEngine(runtime)`
through a tiny Objective-C++ (`.mm`) shim. On Android, do the same from JNI in
`JNI_OnLoad` or the module's `onCreate`, obtaining the runtime via
`ReactApplicationContext`'s `JavaScriptContextHolder`.

> The exact runtime-access snippet changes across React Native versions, so
> follow the current Expo "Native C++" / "Third-party JSI" doc for your SDK:
> https://docs.expo.dev/modules/  — search "C++" and "JSI". Paste the runtime
> pointer into `installPadEngine(...)` and you're done.

### 4. Build and run

```bash
npx expo run:ios      # or: npx expo run:android
```

### 5. Switch the app over

In `App.js`, change one import:

```js
// import engine from './src/audio/engine';         // expo-audio version
import engine from './src/audio/NativePadEngine';    // C++ version
```

Copy `bindings/NativePadEngine.js` to `live-trax/src/audio/NativePadEngine.js`.
Because it mirrors the old API, nothing else in the app changes.

---

## Route B — bare React Native C++ TurboModule

If you `npx expo prebuild` and work in the bare projects (or use bare RN):

1. Add a TurboModule (New Architecture). Define a spec and let codegen generate
   the interface, OR skip the spec and just ship a JSI install like above from a
   plain native module's `installTurboModule`/`getBindings` hook.
2. **iOS:** add the `.cpp`/`.h` and a `.mm` that calls `installPadEngine` in
   `RCTBridge`'s `setBridge:` / the New Arch `RCTHost` install callback. Add the
   files to a `.podspec` (`source_files`) and link the audio frameworks:
   `CoreAudio`, `AudioToolbox`, `AudioUnit`, `CoreFoundation`.
3. **Android:** put the files under `android/src/main/cpp/`, add a
   `CMakeLists.txt` compiling PadEngine + miniaudio + the JSI binding into a
   shared lib, reference it from `build.gradle` (`externalNativeBuild`), and call
   `installPadEngine` from JNI once the JS runtime exists.

The C++ is identical to Route A — only the "where do I get the runtime and call
the installer" glue differs.

---

## iOS/Android native audio notes

- **iOS:** to play when the ringer switch is on silent, set the app's
  `AVAudioSession` category to `playback` once at startup (Expo's audio config or
  a few lines of Swift). miniaudio uses whatever session you configure.
- **Android:** miniaudio uses AAudio (or OpenSL ES on old devices). No extra
  permission is needed for output. For lowest latency, AAudio is automatic on
  Android 8.1+.
- **Latency tuning:** if you ever need tighter timing, set a smaller period size
  in `ma_engine_config` / the device config in `PadEngine::init()`.

---

## What this buys you vs. the expo-audio version

| | expo-audio (JS) | C++ PadEngine |
|---|---|---|
| Mixing/timing | OS media players | native real-time audio thread |
| Sample launch | good | tighter, glitch-free (pre-decoded) |
| Custom DSP/FX | not really | yes — it's your callback to extend |
| Time-stretch / tempo lock | no | you can add it in C++ |
| Effort | trivial | real native build work |

Start on expo-audio, ship, and move the engine to this C++ core when timing
becomes the thing you're fighting.
