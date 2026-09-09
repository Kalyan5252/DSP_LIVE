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

## Score a change (`make bench`)

```bash
make bench      # generate ground truth, build, and SCORE
```

`bench_gen.py` writes loops whose true tempo **and** true transient sample
positions are both known (`bench/truth.json`), and `bench.py` scores against
them — so a DSP change can be proven better or worse instead of eyeballed:

```
tempo   17/20 = 85%
onsets  precision 1.000  recall 0.835  F1 0.910
timing  median +0.0 ms   markers >20ms off: 0%
phase   mean |beatOffset error| 10.4 ms
```

Tempo failures are named rather than lumped together (`2x`, `1/2x`, `3:2` …),
because octave errors are the failure that actually happens. To prove a change
is an improvement, keep a binary built from the old header and diff:

```bash
cp tempo_test /tmp/old_tempo_test        # before your change
python3 bench.py ./tempo_test --vs /tmp/old_tempo_test
```

`timing` is the number that matters for slicing — a marker 30 ms early is an
audible flam.

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
