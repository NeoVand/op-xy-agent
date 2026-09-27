"""axis, measured (docs/research/57-synth-engines.md §3): its oscillators, their shared waveform, the
feedback, shape and levels that make it, and the tremolo.

The voice is four feedback operators of one waveform: three at the note, detuned −9, −4 and +8
cents (`COPIES`), and op2 at the ratio's multiple of it, +4 cents (`ratio`), summed through a
one-pole highpass at 180 Hz. Notes that glide in from the previous note (the capture's track 7 had
portamento on) are read after the glide; the others from 0.1 s.

Modes:
- default: take by take, every oscillator's partials fitted jointly at their known frequencies,
  the highpass undone; each oscillator's level and its feedback β as the ideal operator
  y = sin(θ + β·y) would have it.
- `--copies TAKE NOTE`: refines the copies' detunes against the joint fit's residual.
- `--waveform`: the voice's harmonics (band powers within ±40 cents of each harmonic, which the
  copies' beating barely disturbs) fitted to y = sin(θ + β·((1 − s)·y + s·y²)) for β and s (shape).
- `--loop`: the ideal β measured for the tone sweep and the band limit, as the β of a loop that
  feeds back its last sample at 48 kHz (our engine's rate; the capture ran at 44.1 kHz), each
  found by simulating that loop. Past β ≈ 1.25 such a loop rings at half the sample rate, as the
  device does from tone ≈ 110.
- `--tremolo`: each tremolo take's gain against the tremolo=0 take on the same note, 10 ms at a
  time (the voice is deterministic, so they differ by the tremolo alone).

Usage: uv run --with numpy --with scipy python research/device/axis_fit.py <capture folder>
       [--take PREFIX] [--note MIDI] [--copies TAKE NOTE | --waveform | --loop | --tremolo]
"""

import argparse
import json
import math
import pathlib
import sys

import numpy as np
from scipy.optimize import brentq, least_squares, minimize

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from synth_analyze import load, onsets  # noqa: E402

COPIES = (-9.0, -4.0, 8.0)
UP = 2 ** (4 / 1200)
STEPS = (1, 2, 3, 4, 6, 8, 12, 16, 24, 32)
HIGHPASS = 180.0
N = 10
CYCLE = 2048
SR = 48000
# the glide from the previous note is over by ~0.3 s
AFTER_GLIDE = 0.45


def ratio(cc: int) -> float:
    """op2's frequency over the note's for the ratio CC: 0.5–1 straight below the middle, then steps."""
    x = cc / 127
    if x <= 0.5:
        return (0.5 + x) * UP
    return STEPS[min(len(STEPS) - 1, int((x - 0.5) / 0.05))] * UP


def highpass(f: np.ndarray | float) -> np.ndarray | float:
    return f / np.sqrt(f * f + HIGHPASS * HIGHPASS)


def segment(audio: np.ndarray, sr: int, onset: int, cue: dict, start: float) -> np.ndarray:
    length = cue["off"] - cue["on"]
    x = audio[onset + int(start * sr) : onset + int((length - 0.02) * sr)].mean(axis=1)
    return x - x.mean()


def band_levels(x: np.ndarray, sr: int, f0: float, skip: set[int]) -> np.ndarray:
    """Amplitude per harmonic k of f0 from the power within ±40 cents of it (the copies' sum)."""
    w = np.hanning(len(x))
    spec = np.abs(np.fft.rfft(x * w)) ** 2
    freqs = np.fft.rfftfreq(len(x), 1 / sr)
    scale = 2 / (w**2).sum()
    out = np.zeros(N)
    for k in range(1, N + 1):
        if k in skip or k * f0 > 0.45 * sr:
            continue
        band = (freqs > k * f0 * 2 ** (-40 / 1200)) & (freqs < k * f0 * 2 ** (40 / 1200))
        out[k - 1] = math.sqrt(spec[band].sum() * scale)
    return out


def operator(beta: float, s: float = 0.0) -> np.ndarray:
    """|harmonics 1…N| of y = sin(θ + β·F(y)), F(y) = (1 − s)·y + s·y², iterated to its fixed point."""
    theta = 2 * np.pi * np.arange(CYCLE) / CYCLE
    y = np.sin(theta)
    for _ in range(300):
        y = 0.7 * y + 0.3 * np.sin(theta + beta * ((1 - s) * y + s * y * y))
    y = y - y.mean()
    return np.abs(np.fft.rfft(y)[1 : N + 1]) * 2 / CYCLE


def fit_beta(levels: np.ndarray) -> float:
    """The ideal operator's β for harmonic amplitudes `levels` (dB shape, harmonics above −60 dB)."""
    ok = levels > levels[0] * 1e-3
    if ok.sum() < 2:
        return 0.0
    target = 20 * np.log10(levels[ok] / levels[0])
    h = lambda b: operator(b)[: len(levels)][ok]  # noqa: E731
    r = least_squares(lambda p: 20 * np.log10(h(p[0]) / operator(p[0])[0] + 1e-12) - target, [0.5], bounds=([0], [1.6]))
    return float(r.x[0])


def fit_operator(levels: np.ndarray) -> tuple[float, float, float]:
    # both floored at −60 dB, so harmonics that are absent count as absent
    ok = levels > 0
    target = np.maximum(-60, 20 * np.log10(levels[ok] / levels[0]))

    def residual(p: np.ndarray) -> np.ndarray:
        h = operator(p[0], p[1])
        return np.maximum(-60, 20 * np.log10(h[ok] / h[0] + 1e-9)) - target

    best = None
    for b0 in (0.2, 0.6, 1.0):
        for s0 in (0.0, 0.5, 1.0):
            r = least_squares(residual, [b0, s0], bounds=([0, 0], [1.5, 1]))
            if best is None or r.cost < best.cost:
                best = r
    return best.x[0], best.x[1], math.sqrt(2 * best.cost / ok.sum())


def joint(x: np.ndarray, sr: int, f0: float, r: float, start: float, cents=COPIES, k_max: int = N):
    """Complex amplitudes of the copies' harmonics 1…k_max and op2's partials to 20 kHz, fitted
    jointly at their frequencies; also the partials' frequencies, which are op2's, and the residual."""
    t = np.arange(len(x)) / sr + start
    freqs = [k * f0 * 2 ** (c / 1200) for c in cents for k in range(1, k_max + 1)]
    op2 = []
    m = 1
    while m * r * f0 < 20000:
        f = m * r * f0
        if all(abs(f - g) > 0.3 for g in freqs):
            op2.append(len(freqs))
            freqs.append(f)
        else:
            op2.append(None)
        m += 1
    w = np.sqrt(np.hanning(len(x)))
    basis = np.empty((len(x), 2 * len(freqs)))
    for i, f in enumerate(freqs):
        basis[:, 2 * i] = np.cos(2 * np.pi * f * t)
        basis[:, 2 * i + 1] = -np.sin(2 * np.pi * f * t)
    coef, *_ = np.linalg.lstsq(basis * w[:, None], x * w, rcond=None)
    amp = np.abs(coef[0::2] + 1j * coef[1::2])
    return amp, np.array(freqs), op2, x - basis @ coef


def refine_copies(x: np.ndarray, sr: int, f0: float, r: float, start: float) -> None:
    def residual(p: np.ndarray) -> float:
        _, _, _, e = joint(x, sr, f0, r, start, tuple(p))
        return float((e**2).sum() / (x**2).sum())

    p0 = np.array([-8.0, -4.0, 4.0, 9.0])
    print(f"copies at {p0} cents: residual {10 * math.log10(residual(p0)):.1f} dB")
    best = minimize(residual, p0, method="Nelder-Mead", options={"xatol": 0.005, "fatol": 1e-8, "maxiter": 800})
    print(f"refined to {np.round(best.x, 2)} cents: residual {10 * math.log10(best.fun):.1f} dB")


def oscillators(x: np.ndarray, sr: int, f0: float, r: float, start: float, cue: dict) -> None:
    amp, freqs, op2, res = joint(x, sr, f0, r, start)
    amp = amp / highpass(freqs)
    cells = []
    for j, c in enumerate(COPIES):
        lv = amp[j * N : (j + 1) * N]
        cells.append(f"{c:+.0f}c {20 * math.log10(lv[0]):6.1f} dBFS β {fit_beta(lv):.3f}")
    line = " | ".join(cells)
    if op2 and op2[0] is not None:
        lv = np.array([amp[i] if i is not None else 0 for i in op2[:8]])
        known = lv[lv > 0][:6]
        beta = fit_beta(known) if len(known) >= 2 else 0.0
        line += f" | op2 @{r * f0:5.0f} Hz {20 * math.log10(lv[0]):6.1f} dBFS β {beta:.3f}"
    residual = 20 * math.log10(np.sqrt((res**2).mean()) / np.sqrt((x**2).mean()))
    print(f"{cue['take']:15} n{cue['note']} residual {residual:6.1f} dB | {line}")


def loop(beta: float, f: float, s: float = 0.0) -> np.ndarray:
    """|harmonics 1…N| (over the first) of a loop feeding back its last sample at 48 kHz."""
    n = int(0.3 * SR)
    y = np.zeros(n)
    y1 = 0.0
    phase = 2 * np.pi * f / SR * np.arange(n)
    for i in range(n):
        y1 = math.sin(phase[i] + beta * ((1 - s) * y1 + s * y1 * y1))
        y[i] = y1
    x = y[n // 3 :]
    x = x - x.mean()
    t = np.arange(len(x)) / SR
    ks = [k for k in range(1, N + 1) if k * f < 0.45 * SR]
    basis = np.column_stack([fn(2 * np.pi * k * f * t) for k in ks for fn in (np.cos, np.sin)])
    c, *_ = np.linalg.lstsq(basis, x, rcond=None)
    h = np.zeros(N)
    h[: len(ks)] = np.hypot(c[0::2], c[1::2])
    return h / h[0]


def loop_beta(ideal: float, f: float) -> float:
    """The loop's β that shows the ideal operator's `ideal` at frequency `f`."""
    if ideal <= 1e-3:
        return 0.0
    return brentq(lambda b: fit_beta(loop(b, f)) - ideal, 0.5 * ideal, min(1.6, 2 * ideal + 0.05), xtol=1e-4)


def to_loop() -> None:
    # the ideal β fitted on A4 (tone 0, 13 … 127), each oscillator at its own frequency
    tone = {
        -9: [0.138, 0.240, 0.331, 0.427, 0.520, 0.608, 0.685, 0.761, 0.827, 0.880, 0.929],
        -4: [0.167, 0.286, 0.396, 0.508, 0.614, 0.712, 0.792, 0.865, 0.925, 0.973, 1.028],
        8: [0.153, 0.263, 0.363, 0.468, 0.567, 0.661, 0.740, 0.816, 0.879, 0.930, 0.974],
        4: [0.208, 0.332, 0.442, 0.560, 0.671, 0.772, 0.853, 0.928, 0.991, 1.047, 1.125],
    }
    for c, values in tone.items():
        f = 440 * 2 ** (c / 1200)
        name = "op2" if c == 4 else f"{c:+d}c"
        print(f"{name}: " + ", ".join(f"{loop_beta(v, f):.3f}" for v in values))
    # op2's ideal β at tone 64 by its frequency: the band limit
    band = [(99, 0.815), (221, 0.800), (441, 0.772), (882, 0.696), (1764, 0.411), (2646, 0.112)]
    print("band: " + ", ".join(f"{f} Hz {loop_beta(v, f):.3f}" for f, v in band))


def tremolo(folder: pathlib.Path, audio: np.ndarray, sr: int, cues: list, at: list) -> None:
    takes = {}
    for cue, onset in zip(cues, at):
        if cue["take"].startswith("tremolo="):
            takes[(int(cue["take"].split("=")[1]), cue["note"])] = audio[onset : onset + int(1.15 * sr)].mean(axis=1)
    win = int(0.01 * sr)
    for (cc, note), y in sorted(takes.items()):
        if cc == 0:
            continue
        y0 = takes[(0, note)]
        g = [np.dot(y[i : i + win], y0[i : i + win]) / max(np.dot(y0[i : i + win], y0[i : i + win]), 1e-12) for i in range(0, len(y0) - win, win)]
        print(f"tremolo={cc:<3d} n{note} gain every 10 ms: " + " ".join(f"{v:.2f}" for v in g))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    ap.add_argument("--take", default="")
    ap.add_argument("--note", type=int)
    ap.add_argument("--copies", nargs=2, metavar=("TAKE", "NOTE"))
    ap.add_argument("--waveform", action="store_true")
    ap.add_argument("--loop", action="store_true")
    ap.add_argument("--tremolo", action="store_true")
    args = ap.parse_args()
    if args.loop:
        to_loop()
        return
    folder = pathlib.Path(args.folder)
    sheet = json.loads((folder / "cues.json").read_text())
    cues = sheet["cues"]
    sr, audio = load(folder / "audio.wav")
    at = onsets(audio, sr, cues, sheet.get("clock") == "recording frames")
    if args.tremolo:
        tremolo(folder, audio, sr, cues, at)
        return
    previous = None
    for cue, onset in zip(cues, at):
        glided = previous is not None and previous != cue["note"]
        previous = cue["note"]
        start = AFTER_GLIDE if glided else 0.1
        f0 = 440 * 2 ** ((cue["note"] - 69) / 12)
        r = ratio(cue["cc"]["13"])
        if args.copies:
            if cue["take"] == args.copies[0] and cue["note"] == int(args.copies[1]):
                refine_copies(segment(audio, sr, onset, cue, start), sr, f0, r, start)
            continue
        if not cue["take"].startswith(args.take) or (args.note and cue["note"] != args.note):
            continue
        x = segment(audio, sr, onset, cue, start)
        if not args.waveform:
            oscillators(x, sr, f0, r, start, cue)
            continue
        # op2 off the note's harmonics would add its own lines: skip harmonics it lands near
        skip = set()
        if abs(r - round(r)) > 0.02:
            m = 1
            while m * r < N + 1:
                if abs(m * r - round(m * r)) < 0.02:
                    skip.add(round(m * r))
                m += 1
        levels = band_levels(x, sr, f0, skip)
        beta, s, err = fit_operator(levels)
        rms = 20 * math.log10(np.sqrt((x**2).mean()))
        rel = " ".join(f"{20 * math.log10(v / levels[0]):5.1f}" if v > 0 else "    ." for v in levels[1:8])
        print(f"{cue['take']:16} n{cue['note']} {rms:6.1f} dBFS  β {beta:5.3f} s {s:4.2f} (err {err:3.1f} dB) | h2… {rel}")


if __name__ == "__main__":
    main()
