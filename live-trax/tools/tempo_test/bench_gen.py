#!/usr/bin/env python3
"""Generate the scored benchmark set: synthetic loops whose TRUE tempo and TRUE
transient sample positions are both known exactly, written to bench/truth.json.

make_clicks.py makes easy material for eyeballing. This makes the material that
actually breaks things — octave-ambiguous grooves, weak onsets, syncopation,
fractional tempo — and records ground truth so bench.py can score instead of
print. Pure stdlib, no numpy.
"""
import math, os, struct, wave, random, json

SR = 48000
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bench")


def write_wav(path, x):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, "w") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(b"".join(
            struct.pack("<h", int(max(-1.0, min(1.0, s)) * 32767)) for s in x))


# ---- instruments. Each stamps a transient at sample `i`. --------------------
def kick(n, i, a=1.0):
    L = int(SR * 0.12)
    for j in range(min(L, max(0, len(n) - i))):
        f = 110 * math.exp(-14 * j / L) + 45
        n[i + j] += a * math.sin(2 * math.pi * f * j / SR) * math.exp(-9 * j / L)

def snare(n, i, a=0.8):
    L = int(SR * 0.10)
    for j in range(min(L, max(0, len(n) - i))):
        n[i + j] += a * (random.uniform(-1, 1) * 0.7
                         + math.sin(2 * math.pi * 200 * j / SR) * 0.3) * math.exp(-16 * j / L)

def hat(n, i, a=0.3):
    L = int(SR * 0.03)
    for j in range(min(L, max(0, len(n) - i))):
        n[i + j] += a * random.uniform(-1, 1) * math.exp(-30 * j / L)

def pluck(n, i, f=220, a=0.6):
    L = int(SR * 0.35)
    for j in range(min(L, max(0, len(n) - i))):
        n[i + j] += a * math.sin(2 * math.pi * f * j / SR) * min(1, j / (0.004 * SR)) * math.exp(-5 * j / L)

def pad(n, i, length, a=0.25):
    """Sustained chord, slow attack — the weak-onset case."""
    chord = [220.0, 277.18, 329.63]
    for j in range(min(length, max(0, len(n) - i))):
        atk = min(1.0, j / (0.08 * SR)); rel = min(1.0, (length - j) / (0.15 * SR))
        s = sum(math.sin(2 * math.pi * f * (i + j) / SR) for f in chord) / len(chord)
        n[i + j] += a * atk * rel * s


def build(bpm, beats, events):
    """events: [(beat_position, fn)] -> (samples, sorted true onset positions)"""
    n = [0.0] * int(round(beats * 60.0 / bpm * SR))
    spb = 60.0 / bpm * SR
    truth = set()
    for pos, fn in events:
        i = int(round(pos * spb))
        if i >= len(n): continue
        fn(n, i); truth.add(i)
    return n, sorted(truth)


def cases():
    """(name, bpm, beats, events, scores_onsets) — every case scores tempo;
    only those with genuinely impulsive transients score onset markers."""
    out = []

    def four(bpm, hats=True):
        ev = []
        for b in range(16):
            ev.append((b, kick))
            if b % 2 == 1: ev.append((b, snare))
            if hats: ev.append((b + 0.5, hat))
        return ev

    # straight 4/4 — the baseline that must never regress
    for bpm in (90, 120, 128, 174):
        out.append((f"four_{bpm}", bpm, 16, four(bpm), True))

    # kick on 1, snare on 3 — tactus is ambiguous against half tempo
    for bpm in (140, 174):
        ev = []
        for b in range(16):
            if b % 4 == 0: ev.append((b, kick))
            if b % 4 == 2: ev.append((b, snare))
            ev += [(b, lambda n, i: hat(n, i, 0.18)), (b + 0.5, lambda n, i: hat(n, i, 0.18))]
        out.append((f"halftime_{bpm}", bpm, 16, ev, True))

    # syncopated break — strong offbeat content, 16th-note pairs
    for bpm in (128, 170):
        ev = []
        for bar in range(4):
            for p in (0, 0.75, 1.5, 2, 2.5, 3.25): ev.append((bar * 4 + p, kick))
            ev += [(bar * 4 + 1, snare), (bar * 4 + 3, snare)]
        out.append((f"break_{bpm}", bpm, 16, ev, True))

    # triplet swing — competing faster pulse from the swung 8ths
    for bpm in (95, 120):
        ev = []
        for b in range(16):
            ev.append((b, kick)); ev.append((b + 0.66, lambda n, i: hat(n, i, 0.3)))
            if b % 2 == 1: ev.append((b, snare))
        out.append((f"swing_{bpm}", bpm, 16, ev, True))

    # sparse — two hits per bar, few onsets to lock onto
    for bpm in (85, 110):
        ev = []
        for bar in range(4):
            ev += [(bar * 4, kick), (bar * 4 + 2, snare)]
        out.append((f"sparse_{bpm}", bpm, 16, ev, True))

    # melodic only, no drums
    for bpm in (100, 145):
        ev = [(b, (lambda n, i, b=b: pluck(n, i, 220 * (1.0 if b % 2 == 0 else 1.5))))
              for b in range(16)]
        out.append((f"pluck_{bpm}", bpm, 16, ev, False))

    # sustained chords — weak onsets, tempo only
    for bpm in (100, 128):
        spb = int(60.0 / bpm * SR)
        ev = [(b, (lambda n, i, L=spb: pad(n, i, L))) for b in range(16)]
        out.append((f"pad_{bpm}", bpm, 16, ev, False))

    # 12-beat (3/4 or 6/8) — beat count is not a power of two
    for bpm in (120, 150):
        ev = [(b, kick) for b in range(12)] + [(b, snare) for b in range(12) if b % 3 == 1]
        out.append((f"odd12_{bpm}", bpm, 12, ev, True))

    # fractional tempo — must not get snapped to a neighbouring integer
    for bpm in (97.5, 131.3):
        out.append((f"frac_{bpm}", bpm, 16, four(bpm), True))

    return out


if __name__ == "__main__":
    random.seed(11)
    manifest = {}
    for name, bpm, beats, ev, score_onsets in cases():
        x, truth = build(bpm, beats, ev)
        write_wav(f"{OUT}/{name}.wav", x)
        manifest[name + ".wav"] = {
            "bpm": bpm, "beats": beats, "sr": SR, "frames": len(x),
            "onsets": truth, "score_onsets": score_onsets,
        }
    with open(f"{OUT}/truth.json", "w") as f:
        json.dump(manifest, f, indent=1)
    print(f"wrote {len(manifest)} files + truth.json -> {OUT}/")
