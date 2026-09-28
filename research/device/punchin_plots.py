"""Spectrograms of each punch-in key in a sound_capture.py `punchin-keys` recording: the 2 s of plain
playback before the key, the 6 s it is held and 1.5 s after, with the level (20 ms RMS) over it;
six keys to an image in <folder>/plots/punchin-<n>.png.

Usage: uv run --with numpy --with scipy --with matplotlib python research/device/punchin_plots.py <folder>
"""

import json
import pathlib
import sys

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from scipy.io import wavfile  # noqa: E402
from scipy.signal import spectrogram  # noqa: E402

folder = pathlib.Path(sys.argv[1])
sr, x = wavfile.read(folder / "audio.wav")
x = x.astype(np.float64) / 32768.0
m = x.mean(axis=1)
info = json.loads((folder / "cues.json").read_text())
out = folder / "plots"
out.mkdir(exist_ok=True)
presses = info["presses"]
for page in range(0, len(presses), 6):
    fig, axes = plt.subplots(6, 1, figsize=(12, 16), constrained_layout=True)
    for ax, p in zip(axes, presses[page : page + 6]):
        a = int((p["on"] - 2.0) * sr)
        b = int((p["off"] + 1.5) * sr)
        seg = m[a:b]
        f, t, s = spectrogram(seg, sr, nperseg=2048, noverlap=1536)
        ax.pcolormesh(t - 2.0, f, 10 * np.log10(s + 1e-12), vmin=-110, vmax=-30, shading="auto", cmap="magma")
        ax.set_yscale("symlog", linthresh=200)
        ax.set_ylim(40, 20000)
        ax.axvline(0, color="cyan", lw=1)
        ax.axvline(p["off"] - p["on"], color="cyan", lw=1)
        n = int(0.02 * sr)
        k = len(seg) // n
        lv = 20 * np.log10(np.sqrt((seg[: k * n].reshape(k, n) ** 2).mean(axis=1)) + 1e-9)
        ax2 = ax.twinx()
        ax2.plot(np.arange(k) * 0.02 - 2.0, lv, color="white", lw=0.7)
        ax2.set_ylim(-60, 0)
        ax.set_title(f"key {p['index'] + 1} (note {p['key']})", loc="left", fontsize=10)
        ax.set_ylabel("Hz")
    fig.savefig(out / f"punchin-{page // 6 + 1}.png", dpi=70)
    plt.close(fig)
print("wrote", sorted(str(pp.name) for pp in out.glob("punchin-*.png")))
