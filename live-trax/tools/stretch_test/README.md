# stretch_test — time-stretch CPU + quality harness

Measures what a time-stretch backend **costs** and what it **damages**, on real
audio, on your laptop — no Xcode, no device, no app rebuild. Same idea as
`tools/tempo_test`: make the thing provable before touching the engine.

This exists because of one measurement. On the audio thread, the engine's
per-sample glue costs 0.006 ms per callback across 8 voices and the stretcher
costs 0.243 ms — **the stretcher is ~97% of audio-thread CPU**. So it is the
only thing worth replacing, but only if the artifacts stay acceptable.

## Build & run

```bash
cd tools/stretch_test
make                                    # builds ./stretch_test
make demo                               # run against the tempo_test bench loops
./stretch_test --ratio 1.15 loop.wav
./stretch_test --backend cheap --write out loop.wav
make listen                             # write stretched WAVs into ./out
```

Decoding is miniaudio (WAV / MP3 / FLAC). `--write` emits the stretched audio so
you can actually listen — no metric settles a stretcher.

## Reading the output

```
  backend                core%      p95      p99      max |   struct    sharp     spec   seam
  varispeed (reference)   0.01%  0.000ms  0.000ms  0.001ms |    0.790    1.016    1.271   0.00
  signalsmith-cheap       0.28%  0.030ms  0.031ms  0.046ms |    0.758    1.015    0.500  43.20
  signalsmith-default     0.41%  0.130ms  0.133ms  0.150ms |    0.734    1.330    0.000   1.37
```

**CPU** — `core%` is the *sustained* cost of ONE voice: total time over total
audio. Multiply by your voice count. It is deliberately not a median: a
block-based stretcher does its work on hop boundaries, so most callbacks cost
nothing and every Nth does everything — a median reads 0.001 ms and means
nothing. `p95`/`p99`/`max` are single-callback times, which is what actually
causes a dropout; compare them against the 5.33 ms deadline printed in the
header.

**Quality** — all three are relative measures, none is absolute:

| column | meaning | good |
|---|---|---|
| `struct` | onset-envelope correlation with the input, best over all circular lags | higher |
| `sharp` | attack crest factor vs the input's — the smearing a time-domain stretcher risks | ~1.0 |
| `spec` | log-magnitude STFT distance from the `presetDefault` render | lower = closer to that reference, **not** "better" |
| `seam` | loop-wrap discontinuity vs the 95th percentile of the signal's own deltas | <1 |

`struct` deliberately searches every circular lag. Each backend reports latency
differently and a loop has no privileged start, so pinning the comparison to
sample 0 measures bookkeeping rather than quality — that version scored −0.06
for output that was audibly identical to its input.

## The two reference rows

`varispeed` is not a shippable backend — it resamples, so it changes pitch. It
is here because it pins both axes at once:

- its `core%` is the **floor** any stretcher could hope for (a read and a lerp),
- its `struct` is the **ceiling** for that material, since resampling preserves
  rhythm exactly.

So on the table above, the target for a new backend is: get `core%` from 0.28
down toward 0.01 while keeping `struct` near 0.79 — and unlike varispeed, keep
the pitch.

`signalsmith-default` is the reference for the `spec` column, so it scores 0.000
against itself by construction. That is a self-check that latency alignment is
working, not a quality claim.

## Adding a backend

Implement `Backend` in `stretch_test.cpp` (`name` / `init` / `reset` /
`process` / `outputLatency`), register it in `makeBackend()`, and add its name
to `kBackends[]`. `outputLatency()` must be honest — every quality metric
compares output against input, and the harness removes that many frames of
lead-in before scoring.
