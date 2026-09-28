"""What each punch-in key does, measured from sound_capture.py's punch-in recordings (research 60 §6).

  grid  KEYS    the device's tempo and sixteenth grid, fitted to the plain playback's onsets
  steps KEYS [LO HI]
                per key, over its hold, in a band (default 150–1000 Hz, where the melodic parts
                lead; 1000–4000 Hz shows the drums better): how alike each sixteenth is to the one
                L before, and how much more alike at multiples of 2 or 3 (p2, p3: a repeat looping
                that many steps); the best transposition against the playback just before; the
                stereo balance and how it moves; how much of each sixteenth is gated (15 dB under
                its loudest part, which a stutter's gate shows but a drum's decay does too)
  fold  KEYS K  key K's level per 1/24 of a sixteenth, held against the playback before it, by band
                (the stutter's restarts and gate, the drums' chop)
  mix   MIX     the computer-played loop: per key, the hats the computer sent (the side channel)
                against the same loop 8 s later: length, level, balance; effects on the sequencer's
                own notes leave them alone. Only the lower octave's rows speak for the drums: the
                upper octave's pan puts the loop's mono synths into the side channel too

KEYS is a `punchin-keys` capture (the owner's project on the device, each key held 6 s), MIX a
`punchin-mix` capture (a 120 BPM loop sent from the computer, each key held 2 s).

Usage: uv run --with numpy --with scipy python research/device/punchin_effects.py grid <folder>
"""

import itertools
import json
import pathlib
import sys

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfiltfilt, stft, welch

# the keys capture's project: 123 BPM, its first sixteenth at B0 (seconds; `grid` fits both)
BPM = 123.0
B0 = 0.2185
SIX = 60 / BPM / 4


def load(folder: pathlib.Path):
    sr, x = wavfile.read(folder / "audio.wav")
    x = x.astype(np.float64) / 32768.0
    return sr, x, json.loads((folder / "cues.json").read_text())


def plain_segments(info: dict, total: float) -> list[tuple[float, float]]:
    """Stretches of plain playback: before the first key, between keys (after 0.3 s), after the last."""
    presses = info["presses"]
    segs = [(0.3, presses[0]["on"] - 0.1)]
    segs += [(a["off"] + 0.3, b["on"] - 0.1) for a, b in itertools.pairwise(presses)]
    segs.append((presses[-1]["off"] + 0.3, total - 0.1))
    return segs


def band(sr: int, sig: np.ndarray, lo: float, hi: float) -> np.ndarray:
    return sosfiltfilt(butter(4, [lo, hi], "bandpass", fs=sr, output="sos"), sig, axis=0)


def grid(folder: pathlib.Path) -> None:
    sr, x, info = load(folder)
    m = x.mean(axis=1)
    hop = 256
    _, t, Z = stft(m, sr, nperseg=1024, noverlap=1024 - hop, boundary=None, padded=False)
    S = np.log1p(100 * np.abs(Z))
    flux = np.maximum(0, np.diff(S, axis=1)).sum(axis=0)
    ft = t[1:]
    fr = sr / hop
    mask = np.zeros_like(ft, dtype=bool)
    for a, b in plain_segments(info, len(m) / sr):
        mask |= (ft >= a) & (ft < b)
    env = np.where(mask, flux, 0)
    best = (0.0, 0.0, 0.0)
    for bpm in np.arange(100, 140, 0.01):
        period = 60 / bpm / 4
        for ph in np.linspace(0, period, 24, endpoint=False):
            idx = np.clip(np.round(np.arange(ph, ft[-1], period) * fr).astype(int) - 1, 0, len(ft) - 1)
            s = env[idx].sum() / max(1, mask[idx].sum())
            if s > best[0]:
                best = (s, bpm, ph)
    print(f"sixteenths at {best[1]:.2f} BPM, phase {best[2] * 1000:.1f} ms (onset strength {best[0]:.1f})")


def steps_in(p: dict, t0: float, t1: float) -> range:
    """The sixteenths (indices from B0) that start inside the hold, from t0 to t1 after the press."""
    return range(int(np.ceil((p["on"] + t0 - B0) / SIX)), int((p["on"] + t1 - B0) / SIX))


def periodicity(sr: int, mid: np.ndarray, p: dict) -> tuple[float, float, list[float]]:
    """How alike each sixteenth is to the one L before (best alignment within 12 ms), L = 1…8, and
    how much more alike 2 and 6 steps apart (p2), or 3 and 6 (p3), than at the other lags: a repeat
    looping that many steps."""
    w = int(SIX * sr)
    d = int(0.012 * sr)
    rs = []
    js = steps_in(p, 0.4, p["off"] - p["on"])
    for L in range(1, 9):
        vals = []
        for j in js:
            if j - L < js.start:
                continue
            a = int((B0 + j * SIX) * sr)
            b = int((B0 + (j - L) * SIX) * sr)
            cur = mid[a : a + w]
            best = -1.0
            for s in range(-d, d + 1, int(0.0005 * sr)):
                prev = mid[b + s : b + s + w]
                best = max(best, float(cur @ prev / np.sqrt((cur @ cur) * (prev @ prev) + 1e-20)))
            vals.append(best)
        rs.append(float(np.mean(vals)) if vals else float("nan"))

    r = dict(enumerate(rs, 1))
    # the beat (4 and 8 steps) repeats in any groove: leave it out of both
    p2 = (r[2] + r[6]) / 2 - (r[1] + r[3] + r[5] + r[7]) / 4
    p3 = (r[3] + r[6]) / 2 - (r[1] + r[2] + r[5] + r[7]) / 4
    return p2, p3, rs


def semitone_spectrum(sr: int, sig: np.ndarray) -> np.ndarray:
    f, pw = welch(sig, sr, nperseg=16384)
    out = []
    for n in range(12, 121):
        fc = 440 * 2 ** ((n - 69) / 12)
        sel = (f >= fc * 2 ** (-1 / 24)) & (f < fc * 2 ** (1 / 24))
        out.append(pw[sel].max() if sel.any() else 1e-20)
    return 10 * np.log10(np.array(out) + 1e-20)


def transposition(held: np.ndarray, before: np.ndarray) -> tuple[int, float]:
    """The shift s (semitones, −24…24) that best maps the playback before onto the hold."""
    core = slice(36, 36 + 48)  # MIDI notes 48–95
    h = held[core] - held[core].mean()
    best = (-2.0, 0)
    for s in range(-24, 25):
        r = before[36 - s : 36 - s + 48]
        c = float(np.corrcoef(h, r - r.mean())[0, 1])
        best = max(best, (c, s))
    return best[1], best[0]


def balance(sr: int, seg: np.ndarray) -> np.ndarray:
    """L/R level ratio (dB) every 20 ms."""
    hop = int(0.02 * sr)
    n = len(seg) // hop
    L = (seg[: n * hop, 0].reshape(n, hop) ** 2).mean(axis=1)
    R = (seg[: n * hop, 1].reshape(n, hop) ** 2).mean(axis=1)
    return 10 * np.log10((L + 1e-12) / (R + 1e-12))


def folded(sr: int, sig: np.ndarray, js, bins=24) -> np.ndarray:
    """Mean level (dB) at each 1/bins of the sixteenth over the steps `js`."""
    w = int(0.004 * sr)
    e = np.convolve(sig**2, np.ones(w) / w, "same")
    acc = np.zeros(bins)
    n = 0
    for j in js:
        a = int((B0 + j * SIX) * sr)
        seg = e[a : a + int(SIX * sr)]
        acc += seg[: (len(seg) // bins) * bins].reshape(bins, -1).mean(axis=1)
        n += 1
    return 10 * np.log10(acc / max(1, n) + 1e-12)


def steps(folder: pathlib.Path, lo: float = 150, hi: float = 1000) -> None:
    sr, x, info = load(folder)
    mid = band(sr, x.mean(axis=1), lo, hi)
    print(
        "key   p2    p3   r(L=1..8)                                shift(corr)  balance dB (sd, before)  gated"
    )
    for p in info["presses"]:
        k = p["index"] + 1
        on, off = int((p["on"] + 0.4) * sr), int(p["off"] * sr)
        pre = slice(int((p["on"] - 1.8) * sr), int((p["on"] - 0.05) * sr))
        p2, p3, rs = periodicity(sr, mid, p)
        s, c = transposition(
            semitone_spectrum(sr, x[on:off].mean(axis=1)), semitone_spectrum(sr, x[pre].mean(axis=1))
        )
        bh, bb = balance(sr, x[on:off]), balance(sr, x[pre])
        prof = folded(sr, mid, steps_in(p, 0.4, p["off"] - p["on"]))
        gated = float((prof < prof.max() - 15).mean())
        print(
            f"{k:3d}  {p2:+.2f} {p3:+.2f}  {' '.join(f'{r:.2f}' for r in rs)}  {s:+3d} ({c:.2f})"
            f"   {bh.mean():+5.1f} ({bh.std():4.1f}, {bb.mean():+5.1f})        {gated:4.0%}"
        )


def fold(folder: pathlib.Path, k: int) -> None:
    sr, x, info = load(folder)
    p = info["presses"][k - 1]
    m = x.mean(axis=1)
    held = steps_in(p, 0.4, p["off"] - p["on"])
    before = range(held.start - 15, held.start - 1)
    print(f"key {k}: level (dB) per 1/24 of a sixteenth ({SIX * 1000 / 24:.1f} ms), held / before")
    for lo, hi in [(40, 150), (150, 400), (400, 1000), (1000, 3000), (3000, 8000), (8000, 16000)]:
        y = band(sr, m, lo, hi)
        print(f"{lo:5d}-{hi:<5d} held  ", " ".join(f"{v:4.0f}" for v in folded(sr, y, held)))
        print(f"{'':11s} before", " ".join(f"{v:4.0f}" for v in folded(sr, y, before)))


def hat(sr: int, side: np.ndarray, t: float) -> tuple[float, float]:
    """The hat nearest `t`: its length above −20 dB of its peak (ms), and its peak (dB)."""
    w = int(0.002 * sr)
    starts = [t + d for d in np.arange(-0.05, 0.05, 0.0005)]
    bt = max(starts, key=lambda s: float((side[int(s * sr) : int(s * sr) + w] ** 2).sum()))
    s = side[int((bt - 0.01) * sr) : int((bt + 0.14) * sr)]
    n = int(0.001 * sr)
    db = 20 * np.log10(np.sqrt(np.convolve(s**2, np.ones(n) / n, "same")) + 1e-9)
    above = np.where(db > db.max() - 20)[0]
    return (above[-1] - above[0]) / sr * 1000, float(db.max())


def mix(folder: pathlib.Path) -> None:
    sr, x, info = load(folder)
    total = len(x) / sr
    # the loop's synths are mono: the side channel is the drums' (hats') stereo part
    side = sosfiltfilt(butter(4, 2000, "highpass", fs=sr, output="sos"), (x[:, 0] - x[:, 1]) / 2)
    hp = sosfiltfilt(butter(4, 2000, "highpass", fs=sr, output="sos"), x, axis=0)
    print("key  hats held/ref: length ms, level dB    balance held/ref dB   drums changed")
    for p in info["presses"]:
        k = p["index"] + 1
        # the first three eighths of the hold, against the loop 8 s on (a gap), or 1 s back
        ref = 8.0 if p["on"] + 9.0 < total else -1.0
        first = np.ceil(p["on"] / 0.25) * 0.25
        rows = [(hat(sr, side, t), hat(sr, side, t + ref)) for t in first + 0.25 * np.arange(3)]
        hl = np.mean([h[0] for h, _ in rows])
        rl = np.mean([r[0] for _, r in rows])
        dl = np.mean([h[1] - r[1] for h, r in rows])
        a, b = int(first * sr), int((first + 0.75) * sr)
        bh = float(np.mean(balance(sr, hp[a:b])))
        br = float(np.mean(balance(sr, hp[a + int(ref * sr) : b + int(ref * sr)])))
        changed = abs(hl - rl) > 0.3 * rl or abs(dl) > 3 or abs(bh - br) > 3
        print(
            f"{k:3d}  {hl:5.0f} / {rl:5.0f}  {dl:+6.1f}            {bh:+5.1f} / {br:+5.1f}"
            f"          {'yes' if changed else 'no'}"
        )


if __name__ == "__main__":
    if len(sys.argv) < 3 or sys.argv[1] not in ("grid", "steps", "fold", "mix"):
        raise SystemExit(__doc__)
    where = pathlib.Path(sys.argv[2])
    if sys.argv[1] == "grid":
        grid(where)
    elif sys.argv[1] == "steps":
        steps(where, *(float(v) for v in sys.argv[3:5]))
    elif sys.argv[1] == "fold":
        fold(where, int(sys.argv[3]))
    else:
        mix(where)
