"""Harmonic levels of the takes of a capture, one row per take: dB re the take's RMS, for
harmonics 1…N of the note (fitted jointly by least squares at exact multiples of the measured
fundamental), with the share of the power they hold.

Usage: uv run --with numpy --with scipy python research/device/harmonic_table.py <capture folder>
       [--take PREFIX] [--note MIDI] [--count N] [--ours]
"""

import argparse
import json
import math
import pathlib
import sys

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from synth_analyze import load, onsets, peak_near_note  # noqa: E402


def harmonics(x: np.ndarray, sr: int, f0: float, count: int) -> np.ndarray:
    """Complex amplitudes of harmonics 1…count of f0 (those below 0.45·sr), fitted jointly."""
    t = np.arange(len(x)) / sr
    w = np.sqrt(np.hanning(len(x)))
    ks = [k for k in range(1, count + 1) if k * f0 < 0.45 * sr]
    basis = np.empty((len(x), 2 * len(ks)))
    for j, k in enumerate(ks):
        basis[:, 2 * j] = np.cos(2 * np.pi * k * f0 * t)
        basis[:, 2 * j + 1] = -np.sin(2 * np.pi * k * f0 * t)
    coef, *_ = np.linalg.lstsq(basis * w[:, None], x * w, rcond=None)
    out = np.zeros(count, complex)
    out[: len(ks)] = coef[0::2] + 1j * coef[1::2]
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    ap.add_argument("--take", default="")
    ap.add_argument("--note", type=int)
    ap.add_argument("--count", type=int, default=24)
    ap.add_argument("--ours", action="store_true", help="our render (ours/NNN.wav) instead")
    ap.add_argument("--start", type=float, default=0.2, help="seconds after the onset")
    args = ap.parse_args()
    folder = pathlib.Path(args.folder)
    sheet = json.loads((folder / "cues.json").read_text())
    cues = sheet["cues"]
    sr, audio = load(folder / "audio.wav")
    at = onsets(audio, sr, cues, sheet.get("clock") == "recording frames")
    print(f"{'take':24} {'note':>4} {'dBFS':>6} {'held':>5}  " + " ".join(f"{k:>4}" for k in range(1, args.count + 1)))
    for i, (cue, onset) in enumerate(zip(cues, at)):
        if not cue["take"].startswith(args.take) or (args.note and cue["note"] != args.note):
            continue
        length = cue["off"] - cue["on"]
        if args.ours:
            osr, o = load(folder / "ours" / f"{i:03d}.wav")
            x = o[int(args.start * osr) : int((length - 0.05) * osr)].mean(axis=1)
            rate = osr
        else:
            x = audio[onset + int(args.start * sr) : onset + int((length - 0.05) * sr)].mean(axis=1)
            rate = sr
        x = x - x.mean()
        f0 = peak_near_note(x, rate, 440 * 2 ** ((cue["note"] - 69) / 12))
        z = harmonics(x, rate, f0, args.count)
        rms = float(np.sqrt((x**2).mean())) + 1e-12
        held = float((np.abs(z) ** 2 / 2).sum() / rms**2)
        cells = " ".join(f"{max(-99, 20 * math.log10(abs(a) / rms + 1e-12)):4.0f}" for a in z)
        print(f"{cue['take'][:24]:24} {cue['note']:4d} {20 * math.log10(rms):6.1f} {100 * held:4.0f}%  {cells}")


if __name__ == "__main__":
    main()
