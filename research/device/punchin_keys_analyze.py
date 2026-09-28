"""First look at a sound_capture.py `punchin-keys` recording: per key, the held segment against
the plain playback just before it (the gap): level, brightness (spectral centroid), low and high
band levels, stereo width, and how much the level moves (a gate or stutter shows as a large
spread of 20 ms levels).

Usage: uv run --with numpy --with scipy python research/device/punchin_keys_analyze.py <folder>
"""

import json
import pathlib
import sys

import numpy as np
from scipy.io import wavfile
from scipy.signal import welch

folder = pathlib.Path(sys.argv[1])
sr, x = wavfile.read(folder / "audio.wav")
x = x.astype(np.float64) / 32768.0
info = json.loads((folder / "cues.json").read_text())


def stats(a: int, b: int) -> dict:
    seg = x[a:b]
    m = seg.mean(axis=1)
    side = (seg[:, 0] - seg[:, 1]) / 2
    f, p = welch(m, sr, nperseg=4096)
    cen = float((f * p).sum() / p.sum())
    low = 10 * np.log10(p[(f > 30) & (f < 200)].sum() + 1e-20)
    high = 10 * np.log10(p[(f > 4000) & (f < 16000)].sum() + 1e-20)
    n = int(0.02 * sr)
    k = len(m) // n
    lv = 20 * np.log10(np.sqrt((m[: k * n].reshape(k, n) ** 2).mean(axis=1)) + 1e-9)
    return {
        "rms": 20 * np.log10(np.sqrt((m**2).mean()) + 1e-9),
        "centroid": cen,
        "low": low,
        "high": high,
        "width": 20 * np.log10(np.sqrt((side**2).mean()) / (np.sqrt((m**2).mean()) + 1e-9) + 1e-9),
        "spread": float(np.percentile(lv, 90) - np.percentile(lv, 10)),
    }


rows = []
for p in info["presses"]:
    on, off = int(p["on"] * sr), int(p["off"] * sr)
    pre = stats(on - int(1.8 * sr), on - int(0.05 * sr))
    held = stats(on + int(0.3 * sr), off)
    rows.append((p["index"] + 1, pre, held))
print(" key   level   bright(Hz)       low     high    width   spread(dB)")
for k, pre, h in rows:
    print(
        f"{k:4d} {h['rms'] - pre['rms']:+6.1f}  {pre['centroid']:6.0f}→{h['centroid']:6.0f}"
        f"  {h['low'] - pre['low']:+6.1f}  {h['high'] - pre['high']:+6.1f}  {h['width'] - pre['width']:+6.1f}"
        f"   {pre['spread']:4.1f}→{h['spread']:4.1f}"
    )
