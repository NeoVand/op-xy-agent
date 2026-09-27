"""How an engine's stereo moves (docs/research/57-synth-engines.md §6): for every take of a capture,
the phase of the note's fundamental in the left channel against the right, over time, fitted with a
slow sinusoid — its depth (degrees, and as a time offset) and rate — and the left/right correlation;
the same for our render when there is one (ours/NNN.wav).

Usage: uv run --with numpy --with scipy python research/device/stereo_motion.py <capture folder>
"""

import json
import math
import pathlib
import sys

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from synth_analyze import load, onsets  # noqa: E402


def motion(seg: np.ndarray, sr: int, f0: float) -> dict:
    """The left−right phase of the fundamental in 40 ms windows, and a sinusoid fitted to it."""
    win = int(0.04 * sr)
    hop = int(0.01 * sr)
    t = np.arange(win)
    w = np.hanning(win)
    diffs, times = [], []
    for s in range(0, len(seg) - win, hop):
        e = np.exp(-2j * np.pi * f0 * (s + t) / sr) * w
        zl = (seg[s : s + win, 0] * e).sum()
        zr = (seg[s : s + win, 1] * e).sum()
        diffs.append(np.angle(zl * np.conj(zr)))
        times.append((s + win / 2) / sr)
    d = np.unwrap(np.array(diffs))
    times = np.array(times)
    d = d - d.mean()
    # the dominant slow rate (0.1–10 Hz) and the amplitude of a sinusoid at it
    n = 1 << 14
    spec = np.abs(np.fft.rfft(d * np.hanning(len(d)), n))
    freqs = np.fft.rfftfreq(n, 1 / 100)  # windows every 10 ms
    band = (freqs > 0.1) & (freqs < 10)
    rate = float(freqs[band][np.argmax(spec[band])]) if band.any() else 0.0
    if rate > 0:
        basis = np.stack([np.sin(2 * np.pi * rate * times), np.cos(2 * np.pi * rate * times)], axis=1)
        coef, *_ = np.linalg.lstsq(basis, d, rcond=None)
        amp = float(math.hypot(*coef))
    else:
        amp = 0.0
    corr = float(np.corrcoef(seg[:, 0], seg[:, 1])[0, 1]) if seg[:, 0].std() > 1e-9 else 1.0
    return {
        "depth_deg": math.degrees(amp),
        "depth_ms": 1000 * amp / (2 * math.pi * f0),
        "rate_hz": rate,
        "range_deg": math.degrees(float(np.ptp(d))),
        "corr": corr,
    }


def main() -> None:
    folder = pathlib.Path(sys.argv[1])
    sheet = json.loads((folder / "cues.json").read_text())
    sr, audio = load(folder / "audio.wav")
    at = onsets(audio, sr, sheet["cues"], sheet.get("clock") == "recording frames")
    print(f"{'take':16} {'note':>4}  device: depth °/ms   rate Hz  corr   |  ours: depth °/ms   rate Hz  corr")
    for i, (cue, onset) in enumerate(zip(sheet["cues"], at)):
        f0 = 440 * 2 ** ((cue["note"] - 69) / 12)
        length = cue["off"] - cue["on"]
        dev = motion(audio[onset + int(0.15 * sr) : onset + int((length - 0.05) * sr)], sr, f0)
        line = f"{cue['take'][:16]:16} {cue['note']:4d}  {dev['depth_deg']:6.1f} {dev['depth_ms']:6.3f}  {dev['rate_hz']:6.2f}  {dev['corr']:5.2f}"
        path = folder / "ours" / f"{i:03d}.wav"
        if path.exists():
            osr, o = load(path)
            ours = motion(o[int(0.15 * osr) : int((length - 0.05) * osr)], osr, f0)
            line += f"   |  {ours['depth_deg']:6.1f} {ours['depth_ms']:6.3f}  {ours['rate_hz']:6.2f}  {ours['corr']:5.2f}"
        print(line)


if __name__ == "__main__":
    main()
