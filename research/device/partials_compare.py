"""Device against our render, take by take: every partial the device holds within 40 dB of its
loudest (found as spectral peaks, fitted jointly by least squares at the same frequencies in both),
the level offset (ours − device, dB) and the shape error around it (RMS dB); the worst partials.

Usage: uv run --with numpy --with scipy python research/device/partials_compare.py <capture folder>
       [--take PREFIX] [--channel mid|left|right]
"""

import argparse
import json
import math
import pathlib
import sys

import numpy as np
from scipy.signal import find_peaks
from scipy.signal.windows import blackmanharris

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from synth_analyze import load, onsets  # noqa: E402

FLOOR_DB = 40


def peaks(x: np.ndarray, sr: int) -> list[float]:
    n = 1 << 20
    w = blackmanharris(len(x))
    a = np.abs(np.fft.rfft(x * w, n)) * 2 / w.sum()
    freqs = np.fft.rfftfreq(n, 1 / sr)
    idx, _ = find_peaks(a, distance=max(1, int(3 / (sr / n))))
    top = a.max()
    out = []
    for i in idx:
        if a[i] < top * 10 ** (-FLOOR_DB / 20) or freqs[i] < 15 or freqs[i] > 0.45 * sr:
            continue
        la, lb, lg = np.log(a[i - 1] + 1e-20), np.log(a[i] + 1e-20), np.log(a[i + 1] + 1e-20)
        p = 0.5 * (la - lg) / (la - 2 * lb + lg)
        out.append(freqs[i] + p * sr / n)
    return out


def amplitudes(x: np.ndarray, sr: int, freqs: list[float]) -> np.ndarray:
    t = np.arange(len(x)) / sr
    w = np.sqrt(np.hanning(len(x)))
    basis = np.empty((len(x), 2 * len(freqs)))
    for k, f in enumerate(freqs):
        basis[:, 2 * k] = np.cos(2 * np.pi * f * t)
        basis[:, 2 * k + 1] = -np.sin(2 * np.pi * f * t)
    coef, *_ = np.linalg.lstsq(basis * w[:, None], x * w, rcond=None)
    return np.abs(coef[0::2] + 1j * coef[1::2])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    ap.add_argument("--take", default="")
    ap.add_argument("--channel", default="mid", choices=["mid", "left", "right"])
    args = ap.parse_args()
    folder = pathlib.Path(args.folder)
    sheet = json.loads((folder / "cues.json").read_text())
    cues = sheet["cues"]
    sr, audio = load(folder / "audio.wav")
    at = onsets(audio, sr, cues, sheet.get("clock") == "recording frames")
    pick = {"mid": lambda s: s.mean(axis=1), "left": lambda s: s[:, 0], "right": lambda s: s[:, 1]}[args.channel]
    for i, (cue, onset) in enumerate(zip(cues, at)):
        if not cue["take"].startswith(args.take):
            continue
        length = cue["off"] - cue["on"]
        dev = pick(audio[onset + int(0.2 * sr) : onset + int((length - 0.05) * sr)])
        osr, o = load(folder / "ours" / f"{i:03d}.wav")
        ours = pick(o[int(0.2 * osr) : int((length - 0.05) * osr)])
        dev, ours = dev - dev.mean(), ours - ours.mean()
        freqs = peaks(dev, sr)
        # keep partials apart from louder neighbours (1.6 bins of the take's length)
        a0 = amplitudes(dev, sr, freqs)
        keep: list[int] = []
        for k in np.argsort(-a0):
            if all(abs(freqs[k] - freqs[j]) > 1.6 * sr / len(dev) for j in keep):
                keep.append(k)
        freqs = [freqs[k] for k in sorted(keep)]
        a_dev = amplitudes(dev, sr, freqs)
        # ours at its own nearest peak (within 0.3 %): a partial a fraction of a cent off would
        # otherwise be missed at the device's frequency
        mine = np.array(peaks(ours, osr) or [0.0])
        near = [float(mine[np.argmin(np.abs(mine - f))]) for f in freqs]
        near = [m if abs(m - f) < 0.003 * f else f for m, f in zip(near, freqs)]
        a_our = amplitudes(ours, osr, near)
        d = 20 * np.log10((a_our + 1e-9) / (a_dev + 1e-9))
        lv = 20 * np.log10(a_dev / a_dev.max() + 1e-12)
        offset = float(np.median(d))
        err = d - offset
        worst = np.argsort(-np.abs(err))[:3]
        f0 = 440 * 2 ** ((cue["note"] - 69) / 12)
        print(
            f"{cue['take'][:22]:22} n{cue['note']:<3} partials {len(freqs):3d}  offset {offset:+5.1f}  shape err "
            f"{math.sqrt(float((err ** 2).mean())):4.1f} dB  worst "
            + ", ".join(f"{freqs[k] / f0:.3f}@{lv[k]:.0f}:{err[k]:+.1f}" for k in worst)
        )


if __name__ == "__main__":
    main()
