# tempo_test — standalone tempo / onset harness

Runs the **exact** DSP the app uses (`modules/live-trax-engine/ios/cpp/analysis_core.h`)
on real audio files, on your laptop — no Xcode, no device, no app rebuild.
This is how we make tempo detection reliable: iterate here with instant feedback,
then the same header ships in the app.

## Build & run

```bash
cd tools/tempo_test
make            # builds ./tempo_test (needs clang++ or g++, C++17)
./tempo_test /path/to/loop1.wav /path/to/loop2.mp3
```

Decoding is miniaudio (WAV / MP3 / FLAC built in). The harness defines
`MA_NO_DEVICE_IO`, so it links with no OS frameworks and builds the same on
macOS and Linux.

## Score it against known-BPM signals

```bash
make clicks     # writes synthetic WAVs into ./samples (filename = TRUE bpm)
make test       # build + run over ./samples/*.wav
```

`click_<bpm>.wav` are clean percussive loops (easy). `pad_<bpm>.wav` are
sustained chords with soft attacks (hard — weak onsets), the case that exposes
detector weaknesses.

## Output per file

```
BPM        : detected tempo   (beats = whole-beat count fit to the loop length)
beatOffset : loop fraction of the first downbeat (grid phase)
onsets(N)  : transient positions as loop fractions 0..1
```

Compare `BPM` to the true value in the filename. A detected value that is half
or double the truth is an *octave error*; an odd `beats` count (15, 17, …) on a
loop that should be a power of two is a sign the beat grid locked wrong.
