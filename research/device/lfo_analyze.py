"""Measure the LFOs in a sound_capture.py `lfo` recording (docs/QUESTIONS.md 5).

- tremolo (T3, a saw at A3): the level's modulation (rate from the envelope's spectrum, depth as
  the ratio of its swings) and the pitch's (cents, from the fundamental's period);
- value and random (T4, T5: noise through a resonant filter): the resonant peak's frequency over
  the note, its rate, depth in octaves and whether it steps;
- duck (T6, a saw at A4, T1 struck at known times): the dip below the held level, how long it
  holds and how fast it recovers;
- element (T7: noise through the z hipass, a 1.4 s attack): the peak's frequency against the level.

Usage: uv run --with numpy --with scipy python research/device/lfo_analyze.py <folder>
"""

import json
import pathlib
import sys

import numpy as np
from scipy.signal import butter, sosfiltfilt

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import sound_analyze as sa  # noqa: E402


def follower(m: np.ndarray, sr: int, a: int, b: int, hz: float, hop_ms: float = 1.0) -> np.ndarray:
    """RMS over two periods of `hz`, one value per `hop_ms`."""
    seg = m[a:b]
    n = max(4, int(round(2 * sr / hz)))
    hop = int(sr * hop_ms / 1000)
    c = np.concatenate([[0.0], np.cumsum(seg**2)])
    idx = np.arange(0, len(seg) - n, hop)
    return np.sqrt((c[idx + n] - c[idx]) / n)


def rate_of(sig: np.ndarray, fs: float, lo: float = 0.03, hi: float = 60.0) -> float:
    """The strongest periodicity of a slow signal (Hz), from its spectrum, refined parabolically."""
    x = sig - sig.mean()
    if len(x) < 16 or np.allclose(x, 0):
        return float("nan")
    nfft = 1 << (int(np.ceil(np.log2(len(x)))) + 3)
    spec = np.abs(np.fft.rfft(x * np.hanning(len(x)), nfft))
    f = np.fft.rfftfreq(nfft, 1 / fs)
    sel = (f >= lo) & (f <= hi)
    if not sel.any():
        return float("nan")
    i = int(np.flatnonzero(sel)[np.argmax(spec[sel])])
    if 0 < i < len(spec) - 1:
        y0, y1, y2 = np.log(spec[i - 1] + 1e-12), np.log(spec[i] + 1e-12), np.log(spec[i + 1] + 1e-12)
        d = 0.5 * (y0 - y2) / (y0 - 2 * y1 + y2) if (y0 - 2 * y1 + y2) != 0 else 0.0
        return float((i + d) * fs / nfft)
    return float(f[i])


def pitch_track(m: np.ndarray, sr: int, a: int, b: int, f0: float, hop_ms: float = 2.0) -> np.ndarray:
    """The fundamental's frequency over time (Hz): zero crossings of the band-passed signal."""
    sos = butter(4, [f0 / 1.6, f0 * 1.6], btype="band", fs=sr, output="sos")
    y = sosfiltfilt(sos, m[a:b])
    s = np.signbit(y)
    zc = np.flatnonzero(s[:-1] & ~s[1:]).astype(float)
    # sub-sample crossing times
    frac = y[zc.astype(int)] / (y[zc.astype(int)] - y[zc.astype(int) + 1])
    t = (zc + frac) / sr
    if len(t) < 4:
        return np.array([])
    periods = np.diff(t)
    return 1 / periods


def analyze(folder: pathlib.Path) -> dict:
    sr, x, sheet = sa.load(folder)
    m = x.mean(axis=1)
    rows = []
    for c in sheet["cues"]:
        name, track, note = c["take"], c["track"], c["note"]
        cc = {int(k): v for k, v in c["cc"].items()}
        a = sa.onset(m, sr, c["on"])
        b = int((c["off"] - 0.05) * sr)
        row: dict = {"take": name, "note": note}
        hz = 440.0 * 2 ** ((note - 69) / 12)
        if name.startswith("tremolo"):
            s = a + int(0.3 * sr)
            env = follower(m, sr, s, b, hz)
            row["rate_hz"] = round(rate_of(env, 1000.0), 3)
            lo, hi = np.percentile(env, 3), np.percentile(env, 97)
            row["level_swing_db"] = round(float(20 * np.log10(hi / max(lo, 1e-6))), 2)
            row["level_min_rel"] = round(float(lo / hi), 3)
            p = pitch_track(m, sr, s, b, hz)
            if len(p) > 8:
                cents = 1200 * np.log2(p / np.median(p))
                row["vib_cents_pp"] = round(float(np.percentile(cents, 97) - np.percentile(cents, 3)), 1)
                row["vib_rate_hz"] = round(rate_of(cents, hz), 3)
            # the env: level swing in the first and last second
            first, last = env[: min(len(env), 1000)], env[-min(len(env), 1000) :]
            row["swing_first_last_db"] = [
                round(float(20 * np.log10(np.percentile(first, 97) / max(np.percentile(first, 3), 1e-6))), 1),
                round(float(20 * np.log10(np.percentile(last, 97) / max(np.percentile(last, 3), 1e-6))), 1),
            ]
        elif name.startswith(("value", "random", "element")):
            s = a + int(0.05 * sr)
            track_hz = sa.peak_track(m, sr, s, b, lo_hz=30, hi_hz=18000, frame=0.01)
            if len(track_hz) > 4:
                octs = np.log2(track_hz / np.median(track_hz))
                row["peak_median_hz"] = round(float(np.median(track_hz)), 1)
                row["depth_oct_pp"] = round(float(np.percentile(octs, 97) - np.percentile(octs, 3)), 2)
                row["rate_hz"] = round(rate_of(octs, 100.0, lo=0.05, hi=45.0), 3)
                # steps: the share of frame-to-frame moves above a sixth of an octave
                d = np.abs(np.diff(octs))
                row["jumpy"] = round(float((d > 1 / 6).mean()), 3)
                row["track_oct"] = [round(float(v), 2) for v in octs[:: max(1, len(octs) // 60)]]
        elif name.startswith("duck"):
            env = follower(m, sr, a, int(c["off"] * sr), hz)
            # T1 (its kick) only matters in the audible take: follow the saw's harmonics above 300 Hz
            if "audible" in name:
                sos = butter(4, 300, btype="high", fs=sr, output="sos")
                env = follower(sosfiltfilt(sos, m[a : int(c["off"] * sr) + 1]), sr, 0, int(c["off"] * sr) - a, hz)
            held = float(np.percentile(env, 90))
            dips = []
            for t in c.get("strikes", []):
                k = int((t - a / sr) * 1000)
                w = env[max(0, k - 20) : k + 1400]
                if len(w) < 50:
                    continue
                i_min = int(np.argmin(w))
                depth = float(w[i_min] / held)
                # hold: frames within 3 dB of the minimum; recovery: to 90 % of the held level
                near = np.flatnonzero(w[i_min:] > w[i_min] * 1.41)
                hold_ms = int(near[0]) if len(near) else None
                rec = np.flatnonzero(w[i_min:] > 0.9 * held)
                rec_ms = int(rec[0]) if len(rec) else None
                fall = int(i_min - np.flatnonzero(w[: i_min + 1] > 0.9 * held)[-1]) if (w[: i_min + 1] > 0.9 * held).any() else None
                dips.append({"depth_rel": round(depth, 3), "fall_ms": fall, "hold_ms": hold_ms, "recover_ms": rec_ms})
            row["dips"] = dips
        rows.append(row)
    out = {"folder": folder.name, "takes": rows}
    (folder / "lfo-results.json").write_text(json.dumps(out, indent=1))
    return out


if __name__ == "__main__":
    res = analyze(pathlib.Path(sys.argv[1]))
    for r in res["takes"]:
        keys = [k for k in r if k not in ("take", "note", "track_oct")]
        print(f"{r['take']:24s}", " ".join(f"{k}={r[k]}" for k in keys))
