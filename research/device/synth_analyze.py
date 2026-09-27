"""Compare the OP-XY's recordings with our engines (docs/research/57-synth-engines.md §6).

Reads a capture folder from synth_capture.py (audio.wav + cues.json) and, when present, our
engine's renders of the same cues (ours/NNN.wav, from `node evals/sound/render.mjs <folder>`).
Each take is found in the recording by its onset, and its sustain is measured on both sides:
pitch against the note (octave errors), harmonic levels relative to the note's own loudness
(timbre, independent of level), level, stereo width and what is not harmonic (noise). Prints a
table and writes plots into <folder>/plots/: per sweep, each harmonic against the parameter
(device solid, ours dashed), and per take asked for with --take, a few cycles of both waveforms.

Usage: uv run --with numpy --with scipy --with matplotlib python research/device/synth_analyze.py \
         <capture folder> [--take SUBSTRING ...] [--timeline SUBSTRING ...] [--harmonics 12]
         [--grid 0.5] [--json]
"""

import json
import math
import pathlib
import re
import sys

import numpy as np
from scipy.io import wavfile

HARMONICS = 40


def load(path: pathlib.Path) -> tuple[int, np.ndarray]:
    sr, x = wavfile.read(path)
    x = x.astype(np.float64) / (32768.0 if x.dtype == np.int16 else 1.0)
    if x.ndim == 1:
        x = np.stack([x, x], axis=1)
    return sr, x


def envelope(x: np.ndarray, sr: int, ms: float = 5.0) -> np.ndarray:
    n = max(1, int(sr * ms / 1000))
    power = (x**2).mean(axis=1)
    return np.sqrt(np.convolve(power, np.ones(n) / n, mode="same"))


def onsets(x: np.ndarray, sr: int, cues: list[dict], framed: bool) -> list[int]:
    """Each cue's onset in the recording. Cues stamped with recording frames are searched just after
    their stamp (USB and output latency); older wall-clock cues start from the first sound and follow
    the drift from cue to cue."""
    env = envelope(x, sr)
    floor = max(1e-4, np.percentile(env, 5) * 4)
    if framed:
        offset = 0.0
    else:
        first = int(np.argmax(env > max(floor, env.max() * 0.01)))
        offset = first / sr - cues[0]["on"]
    found = []
    for cue in cues:
        at = cue["on"] + offset
        lo = max(0, int((at - (0.01 if framed else 0.08)) * sr))
        hi = min(len(env), int((at + (0.25 if framed else 0.2)) * sr))
        window = env[lo:hi]
        if len(window) == 0:
            found.append(int(at * sr))
            continue
        # the rise: where the level first passes a tenth of the window's peak
        idx = int(np.argmax(window > max(floor, window.max() * 0.1)))
        found.append(lo + idx)
        if not framed:
            offset = (lo + idx) / sr - cue["on"]
    return found


def level_at(seg: np.ndarray, sr: int, hz: float) -> float:
    """Amplitude of a sinusoid at exactly `hz` (Hann-windowed)."""
    n = len(seg)
    w = np.hanning(n)
    t = np.arange(n)
    ph = 2 * np.pi * hz * t / sr
    re_ = (seg * w * np.cos(ph)).sum()
    im_ = (seg * w * np.sin(ph)).sum()
    return 2 * math.hypot(re_, im_) / w.sum()


def peak_near(spec: np.ndarray, freqs: np.ndarray, hz: float, width: float = 0.03) -> tuple[float, float, float]:
    """The strongest bin within ±width of `hz`: (refined frequency, its magnitude, its prominence
    over the median of a band an octave wide around it)."""
    band = np.where((freqs > hz * (1 - width)) & (freqs < hz * (1 + width)))[0]
    if len(band) < 3:
        return hz, 0.0, 0.0
    k = band[np.argmax(spec[band])]
    # parabolic interpolation on the log magnitude
    a, b, c = np.log(spec[k - 1 : k + 2] + 1e-20)
    delta = 0.5 * (a - c) / (a - 2 * b + c) if (a - 2 * b + c) != 0 else 0.0
    f = freqs[k] + delta * (freqs[1] - freqs[0])
    wide = np.where((freqs > hz / 1.41) & (freqs < hz * 1.41))[0]
    return float(f), float(spec[k]), float(spec[k] / (np.median(spec[wide]) + 1e-20))


def peak_near_note(seg: np.ndarray, sr: int, expected: float) -> float:
    """The note's own partial, refined (no octave search)."""
    n = 1 << 20
    spec = np.abs(np.fft.rfft(seg * np.hanning(len(seg)), n))
    return peak_near(spec, np.fft.rfftfreq(n, 1 / sr), expected)[0]


def pitch(seg: np.ndarray, sr: int, expected: float) -> float:
    """The pitch near the note's, to a fraction of a hertz (zero-padded FFT, parabolic peak); an
    octave or two lower only when a clear peak sits there (an engine sounding low)."""
    n = 1 << 20
    spec = np.abs(np.fft.rfft(seg * np.hanning(len(seg)), n))
    freqs = np.fft.rfftfreq(n, 1 / sr)
    f, mag, _ = peak_near(spec, freqs, expected)
    for ratio in (0.5, 0.25):
        g, m, prominence = peak_near(spec, freqs, expected * ratio)
        if m > mag * 0.1 and prominence > 30:
            f = g
    return f


def features(x: np.ndarray, sr: int, note: int, start: float, end: float, grid: float = 0.0) -> dict:
    seg = x[int(start * sr) : int(end * sr)]
    mid = seg.mean(axis=1)
    side = (seg[:, 0] - seg[:, 1]) / 2
    rms = float(np.sqrt((mid**2).mean())) + 1e-12
    expected = 440 * 2 ** ((note - 69) / 12)
    # with a grid, partials sit at multiples of note × grid (the organ's 16′ is note × 0.5)
    f0 = pitch(mid, sr, expected) if not grid else peak_near_note(mid, sr, expected) * grid
    harm = []
    for k in range(1, HARMONICS + 1):
        hz = f0 * k
        harm.append(level_at(mid, sr, hz) if hz < sr / 2 * 0.95 else 0.0)
    harm = np.array(harm)
    # what the harmonics do not explain (noise, inharmonic partials, aliasing)
    explained = (harm**2).sum() / 2
    noise = max(1e-12, rms**2 - explained) / rms**2
    corr = float(np.corrcoef(seg[:, 0], seg[:, 1])[0, 1]) if seg[:, 0].std() > 1e-9 and seg[:, 1].std() > 1e-9 else 1.0
    return {
        "rms_db": 20 * math.log10(rms),
        "f0": f0,
        "f0_ratio": f0 / expected,
        "harm_db": [20 * math.log10(h / rms + 1e-9) for h in harm],
        "noise_db": 10 * math.log10(noise),
        "corr": corr,
        "side_db": 20 * math.log10(float(np.sqrt((side**2).mean())) / rms + 1e-9),
        "mid": mid,
    }


def timeline(x: np.ndarray, sr: int, note: int, start: float, end: float, win: float = 0.04, count: int = 8) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Harmonics 1…`count` of the note in windows of `win` seconds from `start` to `end`, in dB
    re full scale; with each window's time and level."""
    mid = x[int(start * sr) : int(end * sr)].mean(axis=1)
    f0 = 440 * 2 ** ((note - 69) / 12)
    n = int(win * sr)
    hop = n // 2
    times, levels, harm = [], [], []
    for s0 in range(0, len(mid) - n, hop):
        seg = mid[s0 : s0 + n]
        times.append(start + (s0 + n / 2) / sr)
        levels.append(20 * math.log10(float(np.sqrt((seg**2).mean())) + 1e-9))
        harm.append([20 * math.log10(level_at(seg, sr, f0 * k) + 1e-9) if f0 * k < sr / 2 * 0.95 else -120 for k in range(1, count + 1)])
    return np.array(times), np.array(levels), np.array(harm)


def compare(dev: dict, ours: dict, count: int = 20) -> float:
    """Mean absolute harmonic difference (dB) over the first `count`, where either is above −60 dB."""
    a = np.array(dev["harm_db"][:count])
    b = np.array(ours["harm_db"][:count])
    mask = (a > -60) | (b > -60)
    return float(np.abs(np.clip(a, -70, None) - np.clip(b, -70, None))[mask].mean()) if mask.any() else 0.0


def sweep_groups(names: list[str]) -> dict[str, list[tuple[float, int]]]:
    """Takes named like 'shape=64' or 'shape=0.pw=50' grouped by everything but their last value."""
    groups: dict[str, list[tuple[float, int]]] = {}
    for i, name in enumerate(names):
        m = re.match(r"(.*?)([a-z.@0-9-]*?)=(\d+)$", name)
        if not m:
            continue
        key = m.group(1) + m.group(2)
        groups.setdefault(key, []).append((float(m.group(3)), i))
    return {k: v for k, v in groups.items() if len(v) >= 3}


def main() -> None:
    args = sys.argv[1:]
    folder = pathlib.Path(args[0])
    takes_wanted = [args[i + 1] for i, a in enumerate(args) if a == "--take"]
    show = int(args[args.index("--harmonics") + 1]) if "--harmonics" in args else 12
    grid = float(args[args.index("--grid") + 1]) if "--grid" in args else 0.0
    sheet = json.loads((folder / "cues.json").read_text())
    cues = sheet["cues"]
    hold = sheet.get("hold", 2.0)
    sr, audio = load(folder / "audio.wav")
    at = onsets(audio, sr, cues, sheet.get("clock") == "recording frames")
    ours_dir = folder / "ours"
    rows = []
    for i, (cue, onset) in enumerate(zip(cues, at)):
        length = cue["off"] - cue["on"]
        dev = features(audio, sr, cue["note"], onset / sr + 0.2, onset / sr + max(0.3, length - 0.05), grid)
        row = {"i": i, "take": cue["take"], "note": cue["note"], "dev": dev}
        path = ours_dir / f"{i:03d}.wav"
        if path.exists():
            osr, o = load(path)
            row["ours"] = features(o, osr, cue["note"], 0.2, max(0.3, length - 0.05), grid)
            row["dist"] = compare(dev, row["ours"])
        rows.append(row)

    # levels: device against ours after removing the median offset (absolute gains differ)
    if all("ours" in r for r in rows):
        offset = float(np.median([r["dev"]["rms_db"] - r["ours"]["rms_db"] for r in rows]))
    else:
        offset = 0.0
    print(f"{folder.name}: {len(rows)} takes; level offset device − ours {offset:+.1f} dB")
    print(f"{'take':28} {'note':>4} {'f0×':>5} {'lvl':>6} {'Δlvl':>5} {'dist':>5} {'noise':>6} {'corr':>5}  harmonics 1–{show} (device | ours, dB re RMS)")
    for r in rows:
        d = r["dev"]
        o = r.get("ours")
        harm = " ".join(f"{v:4.0f}" for v in d["harm_db"][:show])
        line = f"{r['take'][:28]:28} {r['note']:4d} {d['f0_ratio']:5.2f} {d['rms_db']:6.1f}"
        if o:
            line += f" {d['rms_db'] - o['rms_db'] - offset:5.1f} {r['dist']:5.1f}"
        else:
            line += "     -     -"
        line += f" {d['noise_db']:6.1f} {d['corr']:5.2f}  {harm}"
        print(line)
        if o:
            print(f"{'  ours':28} {'':4} {o['f0_ratio']:5.2f} {o['rms_db']:6.1f} {'':5} {'':5} {o['noise_db']:6.1f} {o['corr']:5.2f}  " + " ".join(f"{v:4.0f}" for v in o["harm_db"][:show]))
    if all("dist" in r for r in rows):
        print(f"mean harmonic distance {np.mean([r['dist'] for r in rows]):.1f} dB")

    if "--json" in args:
        out = [{k: v for k, v in r.items() if k not in ("dev", "ours")} | {
            "dev": {k: v for k, v in r["dev"].items() if k != "mid"},
            **({"ours": {k: v for k, v in r["ours"].items() if k != "mid"}} if "ours" in r else {}),
        } for r in rows]
        (folder / "analysis.json").write_text(json.dumps(out, indent=1))

    plot(folder, rows, sr, takes_wanted)
    timelines = [args[i + 1] for i, a in enumerate(args) if a == "--timeline"]
    if timelines:
        plot_timelines(folder, sheet, audio, sr, at, ours_dir, timelines)


def plot_timelines(folder, sheet, audio, sr, at, ours_dir, wanted):
    """Per take asked for: harmonics 1–6 and the level over the note, device solid, ours dashed."""
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    out = folder / "plots"
    out.mkdir(exist_ok=True)
    for i, (cue, onset) in enumerate(zip(sheet["cues"], at)):
        if not any(w in cue["take"] for w in wanted):
            continue
        length = cue["off"] - cue["on"]
        t, lvl, h = timeline(audio, sr, cue["note"], onset / sr, onset / sr + length + 0.1)
        fig, ax = plt.subplots(figsize=(9, 4.8))
        t0 = onset / sr
        for k in range(6):
            ax.plot(t - t0, h[:, k], "-", color=f"C{k}", label=f"h{k + 1}")
        ax.plot(t - t0, lvl, "-", color="k", lw=1.5, label="level")
        path = ours_dir / f"{i:03d}.wav"
        if path.exists():
            osr, o = load(path)
            to, lo, ho = timeline(o, osr, cue["note"], 0.0, length + 0.1)
            # line ours up with the device's level at the note's middle
            shift = float(np.median(lvl[len(lvl) // 4 : len(lvl) // 2]) - np.median(lo[len(lo) // 4 : len(lo) // 2]))
            for k in range(6):
                ax.plot(to, ho[:, k] + shift, "--", color=f"C{k}", alpha=0.75)
            ax.plot(to, lo + shift, "--", color="k", lw=1.2, alpha=0.75)
        ax.set_title(f"{cue['take']} — note {cue['note']} (device solid, ours dashed, levels aligned)")
        ax.set_xlabel("seconds from the note")
        ax.set_ylabel("dBFS")
        ax.set_ylim(-90, 0)
        ax.legend(ncol=7, fontsize=7)
        fig.tight_layout()
        fig.savefig(out / f"time-{i:03d}-{re.sub(r'[^a-z0-9]+', '_', cue['take'])}-{cue['note']}.png", dpi=90)
        plt.close(fig)


def plot(folder: pathlib.Path, rows: list[dict], sr: int, wanted: list[str]) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    out = folder / "plots"
    out.mkdir(exist_ok=True)
    names = [r["take"] for r in rows]
    notes = sorted({r["note"] for r in rows})
    for key, members in sweep_groups(names).items():
        for note in notes:
            pts = [(v, rows[i]) for v, i in members if rows[i]["note"] == note]
            if len(pts) < 3:
                continue
            pts.sort(key=lambda p: p[0])
            xs = [p[0] for p in pts]
            fig, ax = plt.subplots(figsize=(8, 4.5))
            for k in range(6):
                color = f"C{k}"
                ax.plot(xs, [p[1]["dev"]["harm_db"][k] for p in pts], "-o", color=color, ms=3, label=f"h{k + 1}")
                if "ours" in pts[0][1]:
                    ax.plot(xs, [p[1]["ours"]["harm_db"][k] for p in pts], "--", color=color, alpha=0.7)
            ax.plot(xs, [p[1]["dev"]["noise_db"] for p in pts], "-", color="k", lw=0.8, label="noise")
            ax.set_title(f"{folder.name} — {key} — note {note} (device solid, ours dashed)")
            ax.set_xlabel("CC value")
            ax.set_ylabel("dB re note RMS")
            ax.set_ylim(-70, 5)
            ax.legend(ncol=7, fontsize=7)
            fig.tight_layout()
            fig.savefig(out / f"sweep-{re.sub(r'[^a-z0-9]+', '_', key)}-{note}.png", dpi=90)
            plt.close(fig)
    for r in rows:
        if not any(w in r["take"] for w in wanted):
            continue
        d = r["dev"]["mid"]
        f0 = r["dev"]["f0"]
        period = int(round(sr / f0))
        fig, axes = plt.subplots(2, 1, figsize=(8, 5.5))
        start = len(d) // 2
        axes[0].plot(d[start : start + 3 * period] / (np.abs(d).max() + 1e-9), label="device")
        if "ours" in r:
            o = r["ours"]["mid"]
            # align ours to the device by cross-correlation over one period
            seg = d[start : start + 3 * period]
            best, shift = -1e9, 0
            for s in range(period):
                c = float(np.dot(seg[: 2 * period], o[start + s : start + s + 2 * period]))
                if c > best:
                    best, shift = c, s
            axes[0].plot(o[start + shift : start + shift + 3 * period] / (np.abs(o).max() + 1e-9), "--", label="ours")
        axes[0].set_title(f"{r['take']} — note {r['note']}")
        axes[0].legend()
        k = np.arange(1, HARMONICS + 1)
        axes[1].bar(k - 0.2, r["dev"]["harm_db"], width=0.4, bottom=-80, label="device")
        if "ours" in r:
            axes[1].bar(k + 0.2, r["ours"]["harm_db"], width=0.4, bottom=-80, label="ours")
        axes[1].set_ylim(-80, 5)
        axes[1].set_xlabel("harmonic")
        axes[1].legend()
        fig.tight_layout()
        fig.savefig(out / f"take-{r['i']:03d}-{re.sub(r'[^a-z0-9]+', '_', r['take'])}-{r['note']}.png", dpi=90)
        plt.close(fig)


if __name__ == "__main__":
    main()
