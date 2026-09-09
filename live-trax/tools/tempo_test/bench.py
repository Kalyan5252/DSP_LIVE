#!/usr/bin/env python3
"""Score ./tempo_test against bench/truth.json and print pass/fail numbers.

    make bench                # generate + build + score
    python3 bench.py [BINARY] # score an already-built binary

Three things get scored:
  tempo   — detected BPM vs truth, with octave/metric errors named (2x, 1/2x,
            3:2 ...) instead of lumped into "wrong", because those are the
            failures that actually happen.
  onsets  — precision/recall/F1 against true transient positions, plus the
            timing error of matched markers. Timing is the number that matters
            for slicing: a marker 30 ms early is a flam.
  phase   — beatOffset vs the true grid, wrapped into one beat.

Compare two builds:
    python3 bench.py ./tempo_test --vs /tmp/old_tempo_test
"""
import json, os, re, subprocess, sys, statistics

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bench")
MATCH_MS = 50.0          # onset match window
TEMPO_TOL = 0.02         # 2% = correct


def analyze(binary, truth):
    files = [os.path.join(D, k) for k in sorted(truth)]
    out = subprocess.run([binary] + files, capture_output=True, text=True).stdout
    res = {}
    for blk in out.split("---- ")[1:]:
        name = os.path.basename(blk.split("\n")[0].strip())
        def grab(pat, cast=float, default=0):
            m = re.search(pat, blk)
            return cast(m.group(1)) if m else default
        m = re.search(r"onsets\((\d+)\) : ([0-9.\- ]*)", blk)
        ons = [float(x) for x in m.group(2).split()] if m and m.group(2).strip() else []
        res[name] = {
            "bpm": grab(r"BPM        : ([0-9.]+)"),
            "beats": grab(r"beats = (-?\d+)", int),
            "dur": grab(r"duration   : ([0-9.]+)"),
            "off": grab(r"beatOffset : ([0-9.\-]+)"),
            "onsets": ons,
        }
    return res


def tempo_verdict(det, true):
    if true and abs(det - true) / true < TEMPO_TOL: return "OK"
    for mult, tag in ((2, "2x"), (0.5, "1/2x"), (1.5, "3:2"),
                      (2 / 3, "2:3"), (4 / 3, "4:3"), (3 / 4, "3:4")):
        if true and abs(det - true * mult) / true < 0.04: return tag
    return "WRONG"


def score(binary, truth):
    r = analyze(binary, truth)
    tempo_ok = tempo_n = 0
    TP = FP = FN = 0
    errs, phases = [], []
    rows = []
    for name in sorted(truth):
        t, d = truth[name], r.get(name)
        if not d: continue
        v = tempo_verdict(d["bpm"], t["bpm"])
        tempo_n += 1; tempo_ok += (v == "OK")

        line = {"name": name, "true": t["bpm"], "det": d["bpm"], "verdict": v,
                "f1": None, "med": None}

        if t["score_onsets"]:
            sr, frames = t["sr"], t["frames"]
            det = [o * frames for o in d["onsets"]]
            tol = MATCH_MS / 1000.0 * sr
            used, e = set(), []
            for gt in t["onsets"]:
                best = None
                for k, x in enumerate(det):
                    if k in used or abs(x - gt) >= tol: continue
                    if best is None or abs(x - gt) < abs(det[best] - gt): best = k
                if best is not None:
                    used.add(best); e.append((det[best] - gt) / sr * 1000.0)
            tp, fn, fp = len(used), len(t["onsets"]) - len(used), len(det) - len(used)
            TP += tp; FP += fp; FN += fn; errs += e
            p = tp / (tp + fp) if tp + fp else 0.0
            rc = tp / (tp + fn) if tp + fn else 0.0
            line["f1"] = 2 * p * rc / (p + rc) if p + rc else 0.0
            line["med"] = statistics.median(e) if e else None

        # beat phase, wrapped into one beat and signed
        if d["bpm"] > 0:
            beat = 60.0 / d["bpm"]
            ph = (d["off"] * d["dur"]) % beat
            err = (ph - beat) * 1000 if ph > beat / 2 else ph * 1000
            if abs(err) <= beat * 1000 * 0.25:   # a half-beat lock is a phase
                phases.append(abs(err))          # ambiguity, not a timing bias
        rows.append(line)

    P = TP / (TP + FP) if TP + FP else 0.0
    R = TP / (TP + FN) if TP + FN else 0.0
    return {
        "rows": rows,
        "tempo": (tempo_ok, tempo_n),
        "precision": P, "recall": R,
        "f1": 2 * P * R / (P + R) if P + R else 0.0,
        "med_ms": statistics.median(errs) if errs else float("nan"),
        "off20": 100.0 * sum(1 for e in errs if abs(e) > 20) / len(errs) if errs else float("nan"),
        "phase_ms": statistics.mean(phases) if phases else float("nan"),
    }


def main():
    args = [a for a in sys.argv[1:]]
    vs = None
    if "--vs" in args:
        i = args.index("--vs"); vs = args[i + 1]; del args[i:i + 2]
    binary = args[0] if args else "./tempo_test"
    if not os.path.exists(os.path.join(D, "truth.json")):
        sys.exit("bench/truth.json missing — run: python3 bench_gen.py")
    truth = json.load(open(os.path.join(D, "truth.json")))

    s = score(binary, truth)
    w = max(len(x["name"]) for x in s["rows"])
    print(f"{'file':<{w}} {'true':>8} {'det':>8}  {'tempo':<6} {'onsetF1':>8} {'medErr':>8}")
    for x in s["rows"]:
        f1 = f"{x['f1']:.3f}" if x["f1"] is not None else "     -"
        md = f"{x['med']:+.1f}ms" if x["med"] is not None else "       -"
        flag = "" if x["verdict"] == "OK" else "  <-"
        print(f"{x['name']:<{w}} {x['true']:>8.2f} {x['det']:>8.2f}  {x['verdict']:<6} {f1:>8} {md:>8}{flag}")

    ok, n = s["tempo"]
    print(f"\ntempo   {ok}/{n} = {100*ok/n:.0f}%")
    print(f"onsets  precision {s['precision']:.3f}  recall {s['recall']:.3f}  F1 {s['f1']:.3f}")
    print(f"timing  median {s['med_ms']:+.1f} ms   markers >20ms off: {s['off20']:.0f}%")
    print(f"phase   mean |beatOffset error| {s['phase_ms']:.1f} ms")

    if vs:
        b = score(vs, truth)
        bok, bn = b["tempo"]
        print(f"\nvs {vs}")
        print(f"{'metric':<22}{'baseline':>12}{'this':>12}{'delta':>12}")
        def row(lbl, a, c, fmt="{:+.3f}", better_up=True):
            d = c - a
            mark = "" if abs(d) < 1e-9 else ("  better" if (d > 0) == better_up else "  WORSE")
            print(f"{lbl:<22}{a:>12.3f}{c:>12.3f}{fmt.format(d):>12}{mark}")
        row("tempo accuracy", bok / bn, ok / n)
        row("onset F1", b["f1"], s["f1"])
        row("timing |median| ms", abs(b["med_ms"]), abs(s["med_ms"]), "{:+.1f}", False)
        row("markers >20ms off %", b["off20"], s["off20"], "{:+.0f}", False)
        row("phase err ms", b["phase_ms"], s["phase_ms"], "{:+.1f}", False)


if __name__ == "__main__":
    main()
