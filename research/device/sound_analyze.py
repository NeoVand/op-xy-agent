"""Measure the filters, envelopes and LFOs in a sound_capture.py recording (docs/QUESTIONS.md 5).

Reads <folder>/audio.wav and cues.json. The OP-XY outputs digital silence between notes, so each
note is found in the recording from its stamp. Measures, per take:
- filters (noise through the filter against T3's unfiltered noise): the response in dB per
  frequency, its passband level, cutoff (-3 dB point), slope past the cutoff and resonant peak;
- the saw takes: harmonic levels against T3's plain saw;
- key tracking and the filter envelope: the resonant peak's frequency over the note;
- amp envelopes: times to 10/50/90 % of the peak (attack), to 50/10/1 % (decay, release), and the
  sustain level;
- LFOs: rate and depth of the level (tremolo, duck) or of the resonant peak's frequency (value,
  random, element), and the pitch wobble (vibrato).
Writes <folder>/results.json and prints tables.

Usage: uv run --with numpy --with scipy python research/device/sound_analyze.py <folder> [--plots]
"""

import json
import math
import pathlib
import sys

import numpy as np
from scipy.io import wavfile
from scipy.signal import welch, stft

A3_HZ = 220.0


def load(folder: pathlib.Path):
    sr, x = wavfile.read(folder / "audio.wav")
    x = x.astype(np.float64) / 32768.0
    sheet = json.loads((folder / "cues.json").read_text())
    return sr, x, sheet


def onset(m: np.ndarray, sr: int, at: float) -> int:
    """First non-silent sample from just before the stamp (the device is digitally silent between
    notes; the stamp is late by up to one recorder block)."""
    lo = max(0, int((at - 0.12) * sr))
    hi = min(len(m), int((at + 0.4) * sr))
    idx = np.flatnonzero(np.abs(m[lo:hi]) > 3e-5)
    return lo + int(idx[0]) if len(idx) else int(at * sr)


def level(m: np.ndarray, sr: int, ms: float = 2.0) -> np.ndarray:
    """RMS level in `ms` frames (one value per frame)."""
    n = max(1, int(sr * ms / 1000))
    k = len(m) // n
    return np.sqrt((m[: k * n].reshape(k, n) ** 2).mean(axis=1))


def psd(seg: np.ndarray, sr: int):
    f, p = welch(seg, sr, nperseg=8192, noverlap=6144)
    return f, p


def smooth_db(f: np.ndarray, p: np.ndarray, width_oct: float = 1 / 12):
    """Power spectrum in dB smoothed over `width_oct` octaves (noise takes are rough)."""
    out = np.empty_like(p)
    for i, fi in enumerate(f):
        if fi <= 0:
            out[i] = p[i]
            continue
        lo, hi = fi * 2 ** (-width_oct / 2), fi * 2 ** (width_oct / 2)
        sel = (f >= lo) & (f <= hi)
        out[i] = p[sel].mean()
    return 10 * np.log10(out + 1e-20)


def response_stats(f: np.ndarray, r: np.ndarray, highpass: bool):
    """Passband level, -3 dB cutoff, slope (dB/oct) past it and the peak above the passband."""
    band = (f >= 30) & (f <= 18000)
    f, r = f[band], r[band]
    if highpass:
        pass_level = float(np.median(r[f >= 12000])) if (f >= 12000).any() else float(r[-1])
    else:
        pass_level = float(np.median(r[(f >= 40) & (f <= 80)]))
    peak_i = int(np.argmax(r))
    peak = float(r[peak_i] - pass_level)
    # the -3 dB point, searched away from the passband
    rel = r - pass_level
    if highpass:
        below = np.flatnonzero(rel[::-1] < -3)
        cut = float(f[::-1][below[0]]) if len(below) else float("nan")
    else:
        idx = np.flatnonzero((rel < -3) & (f > (f[peak_i] if peak > 1 else 0)))
        cut = float(f[idx[0]]) if len(idx) else float("nan")
    # the slope: a straight line in log frequency between -12 and -36 dB
    if highpass:
        sel = (rel < -12) & (rel > -36) & (f < (cut if cut == cut else 1e9))
    else:
        sel = (rel < -12) & (rel > -36) & (f > (cut if cut == cut else 0))
    slope = float("nan")
    if sel.sum() >= 4:
        slope = float(np.polyfit(np.log2(f[sel]), rel[sel], 1)[0])
    return {
        "pass_db": round(pass_level, 2),
        "cutoff_hz": round(cut, 1) if cut == cut else None,
        "slope_db_oct": round(slope, 1) if slope == slope else None,
        "peak_db": round(peak, 2),
        "peak_hz": round(float(f[peak_i]), 1),
    }


def peak_track(m: np.ndarray, sr: int, a: int, b: int, lo_hz=40.0, hi_hz=16000.0, frame=0.02):
    """The resonant peak's frequency over [a, b), one value per `frame` seconds (noise input)."""
    seg = m[a:b]
    n = int(sr * frame)
    nfft = 8192
    f = np.fft.rfftfreq(nfft, 1 / sr)
    sel = (f >= lo_hz) & (f <= hi_hz)
    win = np.hanning(n * 2)
    out = []
    for s in range(0, len(seg) - 2 * n, n):
        spec = np.abs(np.fft.rfft(seg[s : s + 2 * n] * win, nfft)) ** 2
        # a light smoothing, then the strongest bin
        sm = np.convolve(spec, np.ones(9) / 9, mode="same")
        i = int(np.argmax(sm[sel]))
        out.append(float(f[sel][i]))
    return np.array(out)


def times_to(env: np.ndarray, frame_s: float, start: int, fractions, rising: bool, ref: float):
    """Seconds from frame `start` until the level crosses each fraction of `ref`."""
    out = []
    for fr in fractions:
        target = fr * ref
        seg = env[start:]
        idx = np.flatnonzero(seg >= target) if rising else np.flatnonzero(seg <= target)
        out.append(round(float(idx[0] * frame_s), 4) if len(idx) else None)
    return out


def analyze(folder: pathlib.Path, plots: bool = False) -> dict:
    sr, x, sheet = load(folder)
    m = x.mean(axis=1)
    cues = sheet["cues"]
    results: dict = {"folder": folder.name, "plan": sheet["plan"], "takes": []}
    frame_ms = 2.0
    env = level(m, sr, frame_ms)
    fs = frame_ms / 1000

    def seg_of(c, lead=0.15, tail=0.06):
        a = onset(m, sr, c["on"])
        b = int((c["off"] - tail) * sr)
        return a, max(a + int(0.2 * sr), b), a + int(lead * sr)

    # the unfiltered noise and saw on T3, by note
    refs: dict = {}
    for c in cues:
        if c["take"] in ("ref.noise", "check.noise.t3") and c["note"] == 57:
            a, b, s = seg_of(c)
            refs["noise"] = psd(m[s:b], sr)
        if c["take"] in ("ref.saw", "check.saw.t3"):
            a, b, s = seg_of(c)
            refs.setdefault("saw", {})[c["note"]] = psd(m[s:b], sr)

    for c in cues:
        name = c["take"]
        a, b, s = seg_of(c)
        row: dict = {"take": name, "track": c["track"], "note": c["note"]}
        cc = {int(k): v for k, v in c["cc"].items()}
        is_noise = cc.get(14) == 127
        highpass = "hipass" in name or c["track"] == 7
        if is_noise and "noise" in refs and not name.startswith(("ref.", "env.")) and "envamount" not in name and "envdecay" not in name and "keytrack" not in name and c["track"] != 3:
            f, p = psd(m[s:b], sr)
            fr, pr = refs["noise"]
            r = smooth_db(f, p) - smooth_db(fr, pr)
            row.update(response_stats(f, r, highpass))
            row["response"] = {str(int(round(fi))): round(float(ri), 2) for fi, ri in zip(f[::8], r[::8]) if 20 <= fi <= 20000}
        if "keytrack" in name:
            track = peak_track(m, sr, s, b)
            row["peak_hz"] = round(float(np.median(track)), 1)
        if "envamount" in name or "envdecay" in name:
            track = peak_track(m, sr, a, int(c["off"] * sr))
            row["peak_track"] = [round(v, 1) for v in track.tolist()]
            row["peak_max_hz"] = round(float(np.max(track[:10])) if len(track) else float("nan"), 1)
        if name.startswith("env."):
            i0 = a // int(sr * fs)
            i_off = int(c["off"] * sr) // int(sr * fs)
            seg = env[i0:]
            if "attack" in name:
                ref = float(np.median(env[max(i0, i_off - 60) : i_off - 5]))
                row["sustain_level"] = round(ref, 5)
                row["t10_50_90"] = times_to(env, fs, i0, (0.1, 0.5, 0.9), True, ref)
            elif "decay" in name:
                peak_i = i0 + int(np.argmax(env[i0 : i0 + int(0.5 / fs) + 1]))
                ref = float(env[peak_i])
                row["peak_level"] = round(ref, 5)
                row["t50_10_1"] = times_to(env, fs, peak_i, (0.5, 0.1, 0.01), False, ref)
            elif "release" in name:
                ref = float(np.median(env[i0 + 50 : i_off - 5]))
                # the release starts where the level first drops below 95 % after the stamp
                j = i_off - int(0.15 / fs)
                drop = np.flatnonzero(env[j:] < 0.95 * ref)
                start = j + int(drop[0]) if len(drop) else i_off
                row["held_level"] = round(ref, 5)
                row["t50_10_1"] = times_to(env, fs, start, (0.5, 0.1, 0.01), False, ref)
            elif "sustain" in name:
                row["level"] = round(float(np.median(env[i_off - 150 : i_off - 5])), 5)
        results["takes"].append(row)
    (folder / "results.json").write_text(json.dumps(results, indent=1))
    return results


def report(res: dict) -> None:
    for row in res["takes"]:
        keys = [k for k in row if k not in ("take", "track", "note", "response", "peak_track")]
        print(f"{row['take']:34s}", " ".join(f"{k}={row[k]}" for k in keys))


if __name__ == "__main__":
    folder = pathlib.Path(sys.argv[1])
    report(analyze(folder, "--plots" in sys.argv))
