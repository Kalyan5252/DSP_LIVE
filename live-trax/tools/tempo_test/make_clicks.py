#!/usr/bin/env python3
"""Generate synthetic test loops with KNOWN tempo, so tempo detection can be
scored without hunting for real files. Pure stdlib (no numpy) -> runs on any
laptop python3. Writes 16-bit WAVs into ./samples/.

Files:
  click_<bpm>.wav   clean percussive click track (easy case)
  pad_<bpm>.wav     sustained chord, soft attacks (hard case: weak onsets)
"""
import math, os, struct, wave

SR = 48000
OUT = "samples"

def write_wav(path, samples):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, "w") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        frames = bytearray()
        for s in samples:
            v = int(max(-1.0, min(1.0, s)) * 32767)
            frames += struct.pack("<h", v)
        w.writeframes(bytes(frames))

def click_loop(bpm, bars=4, sig=4):
    beats = bars * sig
    dur = beats * 60.0 / bpm
    n = int(round(dur * SR))
    x = [0.0] * n
    spb = 60.0 / bpm
    clk = int(SR * 0.008)  # 8ms click
    for b in range(beats):
        start = int(round(b * spb * SR))
        amp = 1.0 if b % sig == 0 else 0.6
        for j in range(clk):
            if start + j < n:
                x[start + j] += amp * math.sin(2*math.pi*1000*j/SR) * math.exp(-6*j/clk)
    return x

def pad_loop(bpm, bars=4, sig=4):
    """Sustained chord that changes each beat with a soft attack — the case
    energy-novelty detection struggles with (no sharp transients)."""
    beats = bars * sig
    dur = beats * 60.0 / bpm
    n = int(round(dur * SR))
    x = [0.0] * n
    spb = 60.0 / bpm
    chord = [220.0, 277.18, 329.63]  # A minor-ish
    for b in range(beats):
        start = int(round(b * spb * SR))
        end = int(round((b + 1) * spb * SR))
        length = end - start
        for j in range(length):
            idx = start + j
            if idx >= n:
                break
            # slow attack + slow release => weak onset energy
            atk = min(1.0, j / (0.08 * SR))
            rel = min(1.0, (length - j) / (0.15 * SR))
            g = 0.25 * atk * rel
            s = sum(math.sin(2*math.pi*f*idx/SR) for f in chord) / len(chord)
            x[idx] += g * s
    return x

if __name__ == "__main__":
    for bpm in [90, 100, 120, 128, 140, 150, 174]:
        write_wav(f"{OUT}/click_{bpm}.wav", click_loop(bpm))
    for bpm in [100, 128, 140]:
        write_wav(f"{OUT}/pad_{bpm}.wav", pad_loop(bpm))
    print(f"wrote test WAVs into ./{OUT}/  (filename encodes the TRUE bpm)")
