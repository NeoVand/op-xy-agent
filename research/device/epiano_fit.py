"""epiano, measured (docs/research/57-synth-engines.md §3): for each `tone@tine0` take, the 1:1 FM
index I and the modulator's self-feedback β that reproduce its harmonics (sin(θ + I·m), m the
feedback operator sin(θ + β·m)); for each `texture@tone0` take, the harmonics of the carrier's shape.

Usage: uv run --with numpy --with scipy python research/device/epiano_fit.py <capture folder>
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


def fm_harmonics(index: float, feedback: float) -> np.ndarray:
    """|harmonics 1…N| of sin(θ + I·m(θ)), m = sin(θ + β·m) (feedback settled by iteration)."""
    theta = 2 * np.pi * np.arange(CYCLE) / CYCLE
    m = np.sin(theta)
    for _ in range(60):
        m = 0.5 * m + 0.5 * np.sin(theta + feedback * m)
    y = np.sin(theta + index * m)
    spec = np.fft.rfft(y) * 2 / CYCLE
    return np.abs(spec[1 : N + 1])


def main() -> None:
    folder = pathlib.Path(sys.argv[1])
    sheet = json.loads((folder / "cues.json").read_text())
    cues = sheet["cues"]
    sr, audio = load(folder / "audio.wav")
    at = onsets(audio, sr, cues, sheet.get("clock") == "recording frames")
    print("tone (tine 0): 1:1 FM fit per take")
    for cue, onset in zip(cues, at):
        if not cue["take"].startswith("tone@tine0"):
            continue
        length = cue["off"] - cue["on"]
        x = audio[onset + int(0.3 * sr) : onset + int((length - 0.05) * sr)].mean(axis=1)
        x = x - x.mean()
        f0 = 440 * 2 ** ((cue["note"] - 69) / 12)
        amp = np.abs(harmonics(x, sr, f0, N))
        target = 20 * np.log10(amp / amp.max() + 1e-6)
        ok = target > -60
        best = None
        for i0 in np.linspace(0.2, 4, 12):
            for b0 in (0.0, 0.5, 1.0):
                def res(p):
                    h = fm_harmonics(p[0], p[1])
                    return (20 * np.log10(h / h.max() + 1e-6) - target)[ok]
                r = least_squares(res, [i0, b0], bounds=([0, 0], [6, 1.5]))
                if best is None or r.cost < best.cost:
                    best = r
        err = math.sqrt(2 * best.cost / ok.sum())
        rms = 20 * math.log10(np.sqrt((x**2).mean()))
        print(f"  CC {cue['cc']['12']:3d} n{cue['note']}: index {best.x[0]:5.2f} feedback {best.x[1]:4.2f}  err {err:4.1f} dB  ({rms:5.1f} dBFS)")


if __name__ == "__main__":
    main()
