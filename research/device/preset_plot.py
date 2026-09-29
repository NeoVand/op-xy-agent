"""One track of a preset_capture.py take against the replica's render, in detail: the level over
the whole phrase (10 ms RMS, dB) overlaid, and for each held note the first harmonics' levels at a
few moments (dB against the fundamental at the first moment), so a model can be fitted to them.

Usage: uv run --with numpy --with scipy --with matplotlib python research/device/preset_plot.py TAG TRACK
Writes captures/presets/<tag>-T<n>-envelope.png and prints the harmonic tables.
"""

import json
import pathlib
import sys

import numpy as np
from scipy.io import wavfile

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from take_timing import note_ons, placed  # noqa: E402

CAPTURES = pathlib.Path(__file__).parent / "captures" / "presets"
MOMENTS = [0.02, 0.1, 0.3, 0.8, 1.3]


def load(path: pathlib.Path) -> np.ndarray:
    _, data = wavfile.read(path)
    return data.astype(np.float64) / 32768.0


def envelope(x: np.ndarray, rate: int, win: float = 0.01) -> np.ndarray:
    n = int(rate * win)
    frames = len(x) // n
    mono = x[: frames * n].mean(axis=1) if x.ndim > 1 else x[: frames * n]
    return 10 * np.log10(np.maximum((mono.reshape(frames, n) ** 2).mean(axis=1), 1e-14))


def harmonics(x: np.ndarray, rate: int, at: float, f0: float, count: int = 12) -> list[float]:
    """Levels (dB) of the first harmonics in a 4096-sample window starting `at` seconds in."""
    n = 4096
    a = int(at * rate)
    seg = x[a : a + n]
    if seg.ndim > 1:
        seg = seg.mean(axis=1)
    if len(seg) < n:
        return [float("nan")] * count
    spec = np.abs(np.fft.rfft(seg * np.hanning(n))) / (n / 4)
    freqs = np.fft.rfftfreq(n, 1 / rate)
    out = []
    for k in range(1, count + 1):
        f = f0 * k
        if f > rate / 2 - 200:
            out.append(float("nan"))
            continue
        sel = (freqs > f * 0.97 - 3) & (freqs < f * 1.03 + 3)
        out.append(20 * np.log10(max(spec[sel].max(), 1e-9)))
    return out


def main() -> None:
    tag, track = sys.argv[1], int(sys.argv[2])
    take = json.loads((CAPTURES / f"{tag}.json").read_text())
    summary = take["summary"]
    rate = 44100
    unit = load(CAPTURES / f"{tag}.wav")
    replica = load(CAPTURES / f"{tag}-replica-T{track}.wav")
    stamps, _ = placed(take, unit, rate)
    ons = [s["at"] for s in note_ons(stamps, track)]
    offset = int(round(ons[0])) - rate  # the replica's phrase starts one second in
    unit = unit[max(0, offset) : max(0, offset) + len(replica)]
    root, hold, gap = summary.get("root", 36), summary.get("hold", 1.4), summary.get("gap", 1.2)
    held = [(root + 12 * i, i * (hold + gap)) for i in range(3)]
    for note, start in held:
        f0 = 440 * 2 ** ((note - 69) / 12)
        print(f"\nnote {note} ({f0:.1f} Hz): harmonic levels, dB against the unit's fundamental at {MOMENTS[0]} s")
        ref = harmonics(unit, rate, 1 + start + MOMENTS[0], f0)[0]
        for moment in MOMENTS:
            if moment > hold:
                continue
            u = np.array(harmonics(unit, rate, 1 + start + moment, f0)) - ref
            p = np.array(harmonics(replica, rate, 1 + start + moment, f0)) - ref
            print(f"  {moment:4.2f}s unit    " + " ".join(f"{v:6.1f}" for v in u))
            print(f"        replica " + " ".join(f"{v:6.1f}" for v in p))
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    eu, ep = envelope(unit, rate), envelope(replica, rate)
    t = np.arange(len(eu)) * 0.01
    fig, ax = plt.subplots(figsize=(14, 4))
    ax.plot(t, eu, label="unit", lw=0.8)
    ax.plot(np.arange(len(ep)) * 0.01, ep, label="replica", lw=0.8, alpha=0.85)
    ax.set_ylim(-90, 0)
    ax.set_xlabel("s")
    ax.set_ylabel("dB")
    ax.grid(alpha=0.3)
    ax.legend()
    ax.set_title(f"{tag} T{track}")
    fig.tight_layout()
    out = CAPTURES / f"{tag}-T{track}-envelope.png"
    fig.savefig(out, dpi=80)
    print(f"\nwrote {out}")


if __name__ == "__main__":
    main()
