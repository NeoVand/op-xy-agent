"""How simple's and prism's stereo works (docs/research/57-synth-engines.md §3): each channel is the
dry sound plus a copy through a delay swept by a slow triangle, so the copy sits a few cents off the
note, up in one channel while down in the other, flipping every half cycle; the copy is high-passed.

From a long-note `--plan stereo` capture this fits, per stereo setting: the copy's pitch offset
(cents) and the triangle's half period (from the flips), and the copy's level and high-pass corner
(from copy/main at harmonics 1–8, separated by least squares in 0.4 s windows).

Usage: uv run --with numpy --with scipy python research/device/stereo_fit.py <capture folder>
"""

import json
import math
import pathlib
import sys

import numpy as np
from scipy.optimize import least_squares

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from synth_analyze import load, onsets  # noqa: E402

OFFSETS = [4.0, 5.0, 6.0, 6.9, 7.8, 8.7, 9.7, 10.7, 11.8, 12.9, 14.0, 15.2, 16.4]
HARMONICS = 8


def separate(x: np.ndarray, sr: int, f0: float, cents: float) -> tuple[list[complex], float]:
    """Copy/main at harmonics 1…HARMONICS for a copy `cents` off, and the fit's residual."""
    win = len(x)
    tt = (np.arange(win) - win / 2) / sr
    w = np.hanning(win)
    ratios, resid = [], 0.0
    for n in range(1, HARMONICS + 1):
        fm, fc = n * f0, n * f0 * 2 ** (cents / 1200)
        if fc > 0.45 * sr:
            break
        basis = np.stack(
            [np.cos(2 * np.pi * fm * tt), -np.sin(2 * np.pi * fm * tt), np.cos(2 * np.pi * fc * tt), -np.sin(2 * np.pi * fc * tt)],
            axis=1,
        )
        coef, *_ = np.linalg.lstsq(basis * w[:, None], x * w, rcond=None)
        ratios.append((coef[2] + 1j * coef[3]) / (coef[0] + 1j * coef[1]))
        resid += float((((x - basis @ coef) * w) ** 2).sum())
    return ratios, resid


def main() -> None:
    folder = pathlib.Path(sys.argv[1])
    sheet = json.loads((folder / "cues.json").read_text())
    cues = sheet["cues"]
    sr, audio = load(folder / "audio.wav")
    at = onsets(audio, sr, cues, sheet.get("clock") == "recording frames")
    by_take: dict[str, dict] = {}
    for cue, onset in zip(cues, at):
        if cue["take"] == "stereo=0":
            continue
        length = cue["off"] - cue["on"]
        start = onset + int(0.05 * sr)
        seg = audio[start : onset + int((length - 0.02) * sr)]
        f0 = 440 * 2 ** ((cue["note"] - 69) / 12)
        win, step = int(0.4 * sr), int(0.1 * sr)
        signs, points = [], []
        for s in range(0, len(seg) - win, step):
            best = None
            for c in OFFSETS:
                for sign in (1, -1):
                    ratios, resid = separate(seg[s : s + win, 0], sr, f0, sign * c)
                    if best is None or resid < best[0]:
                        best = (resid, sign * c, ratios)
            _, cents, ratios = best
            signs.append((start + s + win / 2) / sr * (1 if cents > 0 else -1))
            for n, r in enumerate(ratios, start=1):
                points.append((n * f0, abs(r)))
            by_take.setdefault(cue["take"], {"cents": [], "points": [], "flips": []})["cents"].append(abs(cents))
        flips = [abs(signs[i]) for i in range(1, len(signs)) if (signs[i] > 0) != (signs[i - 1] > 0)]
        by_take[cue["take"]]["flips"].append(flips)
        by_take[cue["take"]]["points"].extend(points)

    print(f"{'take':12} {'offset':>7} {'half period':>12} {'copy level':>11} {'corner Hz':>10} {'fit dB':>7}")
    for take, d in by_take.items():
        halves = [b - a for flips in d["flips"] for a, b in zip(flips, flips[1:])]
        pts = np.array(d["points"])
        hz, mag = pts[:, 0], pts[:, 1]

        def resid(p):
            g, fc = math.exp(p[0]), math.exp(p[1])
            return 20 * np.log10(g * hz / np.hypot(hz, fc)) - 20 * np.log10(mag + 1e-6)

        fit = least_squares(resid, [math.log(0.8), math.log(700)])
        g, fc = math.exp(fit.x[0]), math.exp(fit.x[1])
        err = math.sqrt(2 * fit.cost / len(hz))
        half = f"{np.median(halves):.2f} s" if halves else "–"
        print(f"{take:12} {np.median(d['cents']):6.1f}c {half:>12} {g:11.3f} {fc:10.0f} {err:7.2f}")


if __name__ == "__main__":
    main()
