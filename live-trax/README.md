# Live Trax

A pad-grid beat & loop performance app for iOS and Android — the Remixlive-style
workflow, built with React Native (Expo). Tap pads to trigger your own samples,
stack loops in sync, and build a track live on a 4×4 grid.

This is a complete, real app project. You run it on your phone and turn it into
an installable build using the steps below.

---

## What it does

- **4×4 pad grid.** Sixteen pads, each holding one sound.
- **Load your own samples.** Tap an empty pad to import any audio file from your
  phone (WAV, MP3, M4A, AIFF, etc.). Files are copied into the app so they
  survive restarts.
- **Loop or one-shot per pad.** Loop pads repeat until you tap them again — stack
  a drum loop, a bassline and a melody and they play together. One-shot pads fire
  once.
- **Live performance.** Tap to start/stop each pad. Multiple pads sound at once.
  A **STOP ALL** button cuts everything instantly.
- **Edit any pad.** Long-press to rename, switch loop/one-shot, recolor, replace
  the sound, or clear the pad.
- **Remembers your board.** Your layout and samples are saved between sessions.

> **On "beat sync":** loop pads loop seamlessly, so samples that are the same
> length (or clean musical loops at the same tempo) stay locked together — the
> same way a launchpad works. There is no global tempo clock quantizing launches
> in this version; see *Ideas to extend* below.

---

## Requirements

- A computer (your Mac works well) with **Node.js 18+** installed.
- The **Expo Go** app on your phone (free, from the App Store / Play Store) for
  instant preview.
- For a real installable build: a free **Expo account** (for EAS Build). An
  **Apple Developer account** ($99/yr) is required to install on a physical
  iPhone or ship to the App Store; Android APKs need no paid account.

---

## Run it on your phone in 3 steps (preview)

```bash
cd live-trax
npm install
npx expo start
```

Then scan the QR code in the terminal with your phone:
- **iPhone:** open the Camera app and point it at the QR code → opens in Expo Go.
- **Android:** open the Expo Go app → "Scan QR code".

The app loads live on your phone. Edit the code and it reloads instantly.

---

## Make a real installable app (EAS Build)

Expo builds the native app in the cloud — you don't need Xcode or Android Studio.

```bash
npm install -g eas-cli
eas login                 # create a free Expo account if you don't have one
eas build:configure

# Android — produces an .apk/.aab you can install directly:
eas build --platform android --profile preview

# iOS — requires your Apple Developer account; Expo walks you through signing:
eas build --platform ios --profile preview
```

When the build finishes, EAS gives you a download link (Android) or an install
link (iOS). To publish to the stores later, use `eas submit`.

Full guide: https://docs.expo.dev/build/setup/

---

## Project layout

```
live-trax/
├── App.js                    # App shell: state, import flow, wiring
├── index.js                  # Entry point
├── app.json                  # Expo app config (name, icons, permissions)
├── package.json
├── assets/                   # App icon + splash
└── src/
    ├── theme.js              # Colors & pad palette (design tokens)
    ├── audio/
    │   └── engine.js         # Playback engine (expo-audio) — trigger/loop/stop
    ├── storage/
    │   └── store.js          # Saves the board + copies samples into app storage
    └── components/
        ├── Pad.js            # One pad (empty / loaded / playing states)
        ├── PadGrid.js        # Lays pads out in a grid
        ├── Toolbar.js        # Title + Stop All
        └── PadOptions.js     # Long-press edit sheet
```

Everything is plain JavaScript/JSX — no TypeScript, no hidden build tooling.

---

## Where things live in the code

- **Change the grid size:** `PAD_COUNT` and `COLUMNS` at the top of `App.js`.
- **Change the colors / look:** `src/theme.js`.
- **Change how pads behave (trigger, loop, stop):** `src/audio/engine.js`.
- **Change the import file types:** the `type: 'audio/*'` filter in `App.js`
  (`importOnto`).

---

## Ideas to extend (natural next steps)

- **Tempo clock + quantized launch** — start each loop on the next bar so pads of
  different lengths lock to a global BPM.
- **Step sequencer** — a second screen to program beats step by step.
- **Per-pad volume & FX** — filter, delay, reverb (expo-audio exposes volume;
  richer DSP would need a native audio module).
- **Record & export** — capture the master output to a shareable file.
- **Pad banks** — multiple 16-pad pages you swipe between.

---

## Built with

- [Expo SDK 54](https://docs.expo.dev/) / React Native 0.81
- [expo-audio](https://docs.expo.dev/versions/latest/sdk/audio/) — playback
- [expo-document-picker](https://docs.expo.dev/versions/latest/sdk/document-picker/) — sample import
- [expo-file-system](https://docs.expo.dev/versions/latest/sdk/filesystem/) — saving samples
- [@react-native-async-storage/async-storage](https://react-native-async-storage.github.io/async-storage/) — saving the board

Sample audio is **not** bundled — you load your own, so there are no licensing
constraints on what you make.
