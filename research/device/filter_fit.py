"""Fit filter models to the noise takes of a sound_capture.py `filters` run (docs/QUESTIONS.md 5).

Each noise take's response (its spectrum over T3's unfiltered noise, on sixth-octave bands) is
fitted with three analog prototypes under the bilinear transform: a one-pole, a two-pole with Q
(the state-variable filter) and a four-pole ladder with feedback k; highpass types by mirroring.
Prints, per take, the best model's cutoff and resonance and the fit's rms error, and per type the
cutoff law (log2 of the cutoff against the CC) and the resonance law.

Usage: uv run --with numpy --with scipy python research/device/filter_fit.py <folder> [--fs 44100]
"""

import json
import pathlib
import sys

import numpy as np
from scipy.optimize import least_squares

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import sound_analyze as sa  # noqa: E402

BANDS = 25.0 * 2 ** (np.arange(0, 60) / 6)  # 25 Hz … ~25 kHz
BANDS = BANDS[BANDS < 20500]


def band_db(f: np.ndarray, p: np.ndarray) -> np.ndarray:
    out = []
    for fc in BANDS:
        sel = (f >= fc * 2 ** (-1 / 12)) & (f < fc * 2 ** (1 / 12))
        out.append(10 * np.log10(p[sel].mean() + 1e-20) if sel.any() else np.nan)
    return np.array(out)


def warp(f: np.ndarray, fs: float) -> np.ndarray:
    """The analog frequency a digital one maps to under the bilinear transform."""
    return fs / np.pi * np.tan(np.pi * np.minimum(f, fs * 0.499) / fs)


def model_db(kind: str, params, f: np.ndarray, fs: float, highpass: bool) -> np.ndarray:
    fc, res, gain = params
    fa, fca = warp(f, fs), warp(np.array([fc]), fs)[0]
    w = fa / fca
    if highpass:
        w = 1 / np.maximum(w, 1e-9)
    s = 1j * w
    if kind == "1p":
        h = 1 / (1 + s)
    elif kind == "2p":
        h = 1 / (1 + s / max(res, 0.05) + s * s)
    elif kind == "2x2p":  # two identical two-pole sections in series
        h = (1 / (1 + s / max(res, 0.05) + s * s)) ** 2
    else:  # ladder: four one-poles in a loop with gain k (0 ... 4 = self-oscillation)
        g = 1 / (1 + s)
        h = g**4 / (1 + max(res, 0.0) * g**4) * (1 + max(res, 0.0))
    return 20 * np.log10(np.abs(h) + 1e-12) + gain


def fit(kind: str, f: np.ndarray, r: np.ndarray, fs: float, highpass: bool):
    ok = np.isfinite(r) & (r > -45)
    if ok.sum() < 5:
        return None
    best = None
    for fc0 in (60, 250, 1000, 4000, 12000):
        two = kind in ("2p", "2x2p")
        res0 = 0.707 if two else 0.5
        x0 = [fc0, res0, 0.0]
        lo = [15, 0.05 if two else 0.0, -12]
        hi = [21000, 40 if two else 4.5, 12]
        if kind == "1p":
            lo[1], hi[1], x0[1] = 0.0, 1e-6, 0.0
        try:
            sol = least_squares(
                lambda p: model_db(kind, p, f[ok], fs, highpass) - r[ok],
                x0, bounds=(lo, hi), x_scale=[1000, 1, 1], loss="soft_l1", f_scale=2.0,
            )
        except ValueError:
            continue
        err = float(np.sqrt(np.mean((model_db(kind, sol.x, f[ok], fs, highpass) - r[ok]) ** 2)))
        if best is None or err < best[1]:
            best = (sol.x, err)
    return best


def main() -> None:
    folder = pathlib.Path(sys.argv[1])
    fs = float(sys.argv[sys.argv.index("--fs") + 1]) if "--fs" in sys.argv else 44100.0
    sr, x, sheet = sa.load(folder)
    m = x.mean(axis=1)
    cues = sheet["cues"]

    def spectrum(c):
        a = sa.onset(m, sr, c["on"])
        s, b = a + int(0.15 * sr), int((c["off"] - 0.06) * sr)
        return sa.psd(m[s:b], sr)

    ref = next(c for c in cues if c["take"] == "ref.noise" and c["note"] == 57)
    ref_db = band_db(*spectrum(ref))
    rows = []
    for c in cues:
        name = c["take"]
        cc = {int(k): v for k, v in c["cc"].items()}
        if c["track"] == 3 or cc.get(14) != 127 or any(k in name for k in ("keytrack", "envamount", "envdecay")):
            continue
        highpass = c["track"] == 7
        r = band_db(*spectrum(c)) - ref_db
        fits = {k: fit(k, BANDS, r, fs, highpass) for k in ("1p", "2p", "2x2p", "4p")}
        fits = {k: v for k, v in fits.items() if v}
        if not fits:
            rows.append({"take": name, "track": c["track"], "cutoff_cc": cc[32], "res_cc": cc[33], "fit": None})
            continue
        kind = min(fits, key=lambda k: fits[k][1])
        rows.append({
            "take": name, "track": c["track"], "cutoff_cc": cc[32], "res_cc": cc[33],
            "errors": {k: round(v[1], 2) for k, v in fits.items()},
            "fits": {k: [round(float(v[0][0]), 1), round(float(v[0][1]), 3), round(float(v[0][2]), 2)] for k, v in fits.items()},
            "best": kind,
            "response": [None if not np.isfinite(v) else round(float(v), 2) for v in r],
        })
    out = {"fs": fs, "bands": [round(float(b), 1) for b in BANDS], "takes": rows}
    (folder / "filter-fit.json").write_text(json.dumps(out, indent=1))
    for row in rows:
        if not row.get("fits"):
            print(f"{row['take']:34s} (no fit)")
            continue
        parts = " ".join(f"{k}: fc {v[0]:8.1f} res {v[1]:6.3f} g {v[2]:5.1f} err {row['errors'][k]:4.1f}" for k, v in row["fits"].items())
        print(f"{row['take']:34s} best {row['best']}  {parts}")


if __name__ == "__main__":
    main()
