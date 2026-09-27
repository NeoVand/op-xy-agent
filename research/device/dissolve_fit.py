"""dissolve, measured (docs/research/57-synth-engines.md §3): for the `fm=` takes, the 1:1 FM index
and the modulator's phase (sine or cosine) that reproduce the harmonics, or (`--feedback`) the
carrier's own feedback β; for the `am=` takes (`--clip`), the hard clip's drive g, per note.

Usage: uv run --with numpy --with scipy python research/device/dissolve_fit.py <capture folder>
       [--feedback | --clip]
"""

import json
import math
import pathlib
import sys

import numpy as np
from scipy.optimize import least_squares

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from harmonic_table import harmonics  # noqa: E402
from synth_analyze import load, onsets  # noqa: E402

N = 12
CYCLE = 2048


def fm(index: float, offset: float, feedback: float = 0.0) -> np.ndarray:
    """|harmonics 1…N| of sin(θ + I·m), m = sin(θ + offset + β·m)."""
    theta = 2 * np.pi * np.arange(CYCLE) / CYCLE
    m = np.sin(theta + offset)
    for _ in range(60):
        m = 0.5 * m + 0.5 * np.sin(theta + offset + feedback * m)
    y = np.sin(theta + index * m)
    y = y - y.mean()
    return np.abs(np.fft.rfft(y)[1 : N + 1]) * 2 / CYCLE


def main() -> None:
    folder = pathlib.Path(sys.argv[1])
    sheet = json.loads((folder / "cues.json").read_text())
    cues = sheet["cues"]
    sr, audio = load(folder / "audio.wav")
    at = onsets(audio, sr, cues, sheet.get("clock") == "recording frames")
    print("fm: 1:1 index, modulator phase offset (deg), feedback")
    for cue, onset in zip(cues, at):
        if not cue["take"].startswith("fm="):
            continue
        length = cue["off"] - cue["on"]
        x = audio[onset + int(0.2 * sr) : onset + int((length - 0.05) * sr)].mean(axis=1)
        x = x - x.mean()
        f0 = 440 * 2 ** ((cue["note"] - 69) / 12)
        amp = np.abs(harmonics(x, sr, f0, N))
        t = 20 * np.log10(amp / amp.max() + 1e-6)
        ok = t > -60
        best = None
        for i0 in (0.3, 1, 2, 3):
            for o0 in (0.0, math.pi / 2):
                for b0 in (0.0, 0.5):
                    r = least_squares(
                        lambda p: (20 * np.log10(fm(p[0], p[1], p[2]) / fm(p[0], p[1], p[2]).max() + 1e-6) - t)[ok],
                        [i0, o0, b0],
                        bounds=([0, -math.pi, 0], [6, math.pi, 1.5]),
                    )
                    if best is None or r.cost < best.cost:
                        best = r
        i, o, b = best.x
        print(f"  CC {cue['cc']['14']:3d} n{cue['note']}: index {i:5.2f} offset {math.degrees(o):6.1f} feedback {b:4.2f}  err {math.sqrt(2 * best.cost / ok.sum()):4.1f} dB")


if __name__ == "__main__" and len(sys.argv) == 2:
    main()


def feedback(beta: float) -> np.ndarray:
    """|harmonics 1…N| of the self-feedback operator y = sin(θ + β·y) (β < 1: one solution)."""
    theta = 2 * np.pi * np.arange(CYCLE) / CYCLE
    y = np.sin(theta)
    for _ in range(200):
        y = np.sin(theta + beta * y)
    y = y - y.mean()
    return np.abs(np.fft.rfft(y)[1 : N + 1]) * 2 / CYCLE


def fit_feedback(folder: pathlib.Path) -> None:
    sheet = json.loads((folder / "cues.json").read_text())
    cues = sheet["cues"]
    sr, audio = load(folder / "audio.wav")
    at = onsets(audio, sr, cues, sheet.get("clock") == "recording frames")
    print("fm as the carrier's own feedback: y = sin(θ + β·y)")
    for cue, onset in zip(cues, at):
        if not cue["take"].startswith("fm="):
            continue
        length = cue["off"] - cue["on"]
        x = audio[onset + int(0.2 * sr) : onset + int((length - 0.05) * sr)].mean(axis=1)
        x = x - x.mean()
        f0 = 440 * 2 ** ((cue["note"] - 69) / 12)
        amp = np.abs(harmonics(x, sr, f0, N))
        t = 20 * np.log10(amp / amp.max() + 1e-6)
        ok = t > -60
        r = least_squares(
            lambda p: (20 * np.log10(feedback(p[0]) / feedback(p[0]).max() + 1e-6) - t)[ok], [0.5], bounds=([0], [0.99])
        )
        print(f"  CC {cue['cc']['14']:3d} n{cue['note']}: beta {r.x[0]:5.3f}  err {math.sqrt(2 * r.cost / ok.sum()):4.1f} dB")


if __name__ == "__main__" and len(sys.argv) > 2 and sys.argv[2] == "--feedback":
    fit_feedback(pathlib.Path(sys.argv[1]))


def clip(g: float) -> np.ndarray:
    """|harmonics 1…N| of a sine driven into a hard clip: clip(g·sin θ)."""
    theta = 2 * np.pi * np.arange(CYCLE) / CYCLE
    y = np.clip(g * np.sin(theta), -1, 1)
    return np.abs(np.fft.rfft(y)[1 : N + 1]) * 2 / CYCLE


def fit_clip(folder: pathlib.Path) -> None:
    sheet = json.loads((folder / "cues.json").read_text())
    cues = sheet["cues"]
    sr, audio = load(folder / "audio.wav")
    at = onsets(audio, sr, cues, sheet.get("clock") == "recording frames")
    grid = np.arange(1.0, 3.0, 0.001)
    shapes = [20 * np.log10(clip(g) / clip(g).max() + 1e-6) for g in grid]
    print("am as a hard clip: y = clip(g·sin θ), g per take and note (odd harmonics above -60 dB)")
    for cue, onset in zip(cues, at):
        if not cue["take"].startswith("am="):
            continue
        length = cue["off"] - cue["on"]
        x = audio[onset + int(0.2 * sr) : onset + int((length - 0.05) * sr)].mean(axis=1)
        x = x - x.mean()
        f0 = 440 * 2 ** ((cue["note"] - 69) / 12)
        amp = np.abs(harmonics(x, sr, f0, N))
        t = 20 * np.log10(amp / amp.max() + 1e-6)
        ok = (t > -60) & (np.arange(1, N + 1) % 2 == 1)
        if ok.sum() < 2:
            print(f"  CC {cue['cc']['13']:3d} n{cue['note']}: a sine (g 1)")
            continue
        errors = [np.sqrt(np.mean((shape - t)[ok] ** 2)) for shape in shapes]
        best = int(np.argmin(errors))
        print(f"  CC {cue['cc']['13']:3d} n{cue['note']}: g {grid[best]:5.3f}  err {errors[best]:4.1f} dB")


if __name__ == "__main__" and len(sys.argv) > 2 and sys.argv[2] == "--clip":
    fit_clip(pathlib.Path(sys.argv[1]))
