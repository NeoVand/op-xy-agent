"""prism, measured (docs/research/57-synth-engines.md §3, prism): from a `prism` capture, the shape
curve (the saw → square blend k up to the square, then the pulse's width), the two oscillators'
levels at each ratio step, and the detune's beat rate.

Usage: uv run --with numpy --with scipy python research/device/prism_fit.py <capture folder>
"""

import json
import math
import pathlib
import sys

import numpy as np
from scipy.optimize import least_squares

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from harmonic_table import harmonics  # noqa: E402
from synth_analyze import load, onsets, peak_near_note  # noqa: E402

N = 30  # harmonics fitted


def take_audio(folder: pathlib.Path):
    sheet = json.loads((folder / "cues.json").read_text())
    cues = sheet["cues"]
    sr, audio = load(folder / "audio.wav")
    at = onsets(audio, sr, cues, sheet.get("clock") == "recording frames")
    for cue, onset in zip(cues, at):
        length = cue["off"] - cue["on"]
        seg = audio[onset + int(0.2 * sr) : onset + int((length - 0.05) * sr)]
        yield cue, seg, sr


def blend(n: np.ndarray, k: float) -> np.ndarray:
    """saw − k·(the saw half a cycle on): odd harmonics (1 + k)/n, even (1 − k)/n."""
    return np.where(n % 2 == 1, 1 + k, 1 - k) / n


def pulse(n: np.ndarray, w: float) -> np.ndarray:
    """A pulse of width w (DC removed): |sin(π n w)| / n, scaled so w = ½ is the square's 2/n."""
    return 2 * np.abs(np.sin(np.pi * n * w)) / n


def fit_shape(amp: np.ndarray) -> dict:
    """The blend k (square at 1) or, past it, the pulse width w, whichever fits the harmonics best."""
    n = np.arange(1, N + 1)
    ok = amp > 1e-6
    target = 20 * np.log10(amp[ok])

    def err_blend(p):
        return 20 * np.log10(np.abs(blend(n, p[0]))[ok] * math.exp(p[1]) + 1e-9) - target

    def err_pulse(p):
        return 20 * np.log10(pulse(n, p[0])[ok] * math.exp(p[1]) + 1e-5) - target

    b = least_squares(err_blend, [0.5, math.log(amp[0])], bounds=([0, -20], [1, 5]))
    best = None
    for w0 in np.linspace(0.05, 0.5, 19):
        r = least_squares(err_pulse, [w0, math.log(amp[0] / 0.6)], bounds=([0.02, -20], [0.5, 5]))
        if best is None or r.cost < best.cost:
            best = r
    eb = math.sqrt(2 * b.cost / ok.sum())
    ep = math.sqrt(2 * best.cost / ok.sum())
    return {"k": b.x[0], "k_err": eb, "w": best.x[0], "w_err": ep}


def main() -> None:
    folder = pathlib.Path(sys.argv[1])
    print("shape (1:1, the oscillators on top of each other):")
    print(f"  {'CC':>4} {'note':>4}  blend k  err dB | pulse w  err dB | dBFS")
    for cue, seg, sr in take_audio(folder):
        if not cue["take"].startswith("shape="):
            continue
        x = seg.mean(axis=1)
        x = x - x.mean()
        f0 = peak_near_note(x, sr, 440 * 2 ** ((cue["note"] - 69) / 12))
        amp = np.abs(harmonics(x, sr, f0, N))
        s = fit_shape(amp)
        rms = 20 * math.log10(np.sqrt((x**2).mean()))
        print(f"  {cue['cc']['12']:4d} {cue['note']:4d}  {s['k']:7.3f} {s['k_err']:6.2f}  | {s['w']:7.3f} {s['w_err']:6.2f}  | {rms:6.1f}")


if __name__ == "__main__":
    main()
