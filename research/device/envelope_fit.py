"""Fit the amp envelope's laws to the `filters` and `envtop` recordings (docs/QUESTIONS.md 5).

The level is followed over two periods of the saw (A3) every millisecond. Attack: the times to
10/25/50/75/90/98 % of the held level, fitted with an RC charge toward `overshoot` times the peak
(cut at the peak), which gives the stage's length. Decay (sustain 0) and release: the half-life of
the exponential fall (from the times to 50/25/10/3 %) and where the voice cuts to silence.

Usage: uv run --with numpy --with scipy python research/device/envelope_fit.py <folder> [<folder> …]
"""

import json
import math
import pathlib
import sys

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import sound_analyze as sa  # noqa: E402


def follow(m, sr, a, b, hz=220.0):
    seg = m[a:b]
    n = int(round(2 * sr / hz))
    hop = int(sr / 1000)
    c = np.concatenate([[0.0], np.cumsum(seg**2)])
    idx = np.arange(0, len(seg) - n, hop)
    return np.sqrt((c[idx + n] - c[idx]) / n)


out = {"attack": [], "decay": [], "release": []}
for folder in map(pathlib.Path, sys.argv[1:]):
    sr, x, sheet = sa.load(folder)
    m = x.mean(axis=1)
    for c in sheet["cues"]:
        t = c["take"]
        if not t.startswith("env."):
            continue
        v = int(t.split("=")[1].split(".")[0])
        a = sa.onset(m, sr, c["on"])
        off = int(c["off"] * sr)
        e = follow(m, sr, a, off + int(27 * sr))
        k = (off - a) // int(sr / 1000)
        if t.startswith("env.attack"):
            held = float(np.median(e[k - 300 : k - 20]))
            times = [int(np.argmax(e >= f * held)) for f in (0.1, 0.25, 0.5, 0.75, 0.9, 0.98)]
            out["attack"].append({"cc": v, "ms": times})
        elif t.startswith("env.decay"):
            pk = float(e[:30].max())
            times = [int(np.argmax(e <= f * pk)) for f in (0.5, 0.25, 0.1, 0.03)]
            silent = np.flatnonzero(e < 1e-6)
            out["decay"].append({"cc": v, "ms": times, "cut_ms": int(silent[0]) if len(silent) else None})
        elif t.startswith("env.release"):
            held = float(np.median(e[k - 400 : k - 50]))
            j = k - 100 + int(np.argmax(e[k - 100 :] < 0.97 * held))
            times = [int(np.argmax(e[j:] <= f * held)) for f in (0.5, 0.25, 0.1, 0.03)]
            silent = np.flatnonzero(e[j:] < 1e-6)
            out["release"].append({"cc": v, "ms": times, "cut_ms": int(silent[0]) if len(silent) else None})

# attack: T from the 50 % time under an RC charge toward twice the peak (T = t50 · ln2 / ln(4/3))
for r in sorted(out["attack"], key=lambda r: r["cc"]):
    t50 = r["ms"][2]
    r["length_ms"] = round(t50 * math.log(2) / math.log(4 / 3), 1)
    print(f"attack cc {r['cc']:3d}: ms to 10/25/50/75/90/98 % {r['ms']} -> length {r['length_ms']} ms")
for kind in ("decay", "release"):
    for r in sorted(out[kind], key=lambda r: r["cc"]):
        ms = r["ms"]
        # half-life: the mean of t50, t25/2, t10/log2(10), t3/log2(33.3)
        est = [ms[0], ms[1] / 2, ms[2] / math.log2(10), ms[3] / math.log2(1 / 0.03)]
        r["half_ms"] = round(float(np.median([e for e in est if e > 0])) if any(e > 0 for e in est) else 0.0, 1)
        print(f"{kind:7s} cc {r['cc']:3d}: ms to 50/25/10/3 % {ms} -> half-life {r['half_ms']} ms, silent after {r['cut_ms']} ms")
pathlib.Path(sys.argv[1], "envelope-fit.json").write_text(json.dumps(out, indent=1))
