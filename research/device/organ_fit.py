"""The OP-XY organ's registrations, fitted from an `organ` capture for the engine to play
(docs/research/57-synth-engines.md §6, organ).

The device's organ is not a set of drawbar sines on one harmonic series: some ranks sit a few cents
off (a flat or sharp sub, a sharp 2′ pair), and on type 1 the bass knob moves two partials' pitch.
So for every type this finds every partial, at any ratio to the note:

1. the peaks of every take of the type (all bass settings and notes), as ratios to the note,
   clustered across takes, with the higher notes (where near neighbours are resolved) setting each
   cluster's ratio;
2. every take's complex amplitude at every ratio, fitted jointly by least squares, so partials a few
   hertz apart at low notes still come apart;
3. the engine's output high-pass (one pole, fitted on the types whose partials sit on the harmonic
   grid) divided out, leaving what the engine makes before it.

Writes <folder>/organ-fit.json: the high-pass corner, and per type its ratios and per bass (0, 64,
127) and note (A1–A5) each partial's level (dBFS, before the high-pass) and phase.

Usage: uv run --with numpy --with scipy python research/device/organ_fit.py <capture folder>
"""

import json
import math
import pathlib
import re
import sys

import numpy as np
from scipy.optimize import least_squares
from scipy.signal import find_peaks
from scipy.signal.windows import blackmanharris

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from synth_analyze import load, onsets  # noqa: E402

FLOOR_DB = 55  # peaks this far under the take's strongest are not partials
LONE_DB = 42  # a partial seen in one take only must be at most this far under its strongest
TOLERANCE = 6e-4  # ratios this close (relative, about a cent) are one partial
NYQUIST_SHARE = 0.45  # partials above this share of the sample rate are left out
APART = 1.6  # partials closer than this many 1/length hertz cannot be told apart in a take


def segment(audio: np.ndarray, sr: int, onset: int, cue: dict) -> np.ndarray:
    length = cue["off"] - cue["on"]
    mid = audio[onset + int(0.2 * sr) : onset + int((length - 0.05) * sr)].mean(axis=1)
    return mid - mid.mean()


def peaks(x: np.ndarray, sr: int, f0: float) -> list[tuple[float, float]]:
    """(ratio to the note, dB re the strongest) of the take's spectral peaks."""
    n = 1 << 20
    w = blackmanharris(len(x))  # sidelobes under −92 dB: no false peaks beside strong ones
    a = np.abs(np.fft.rfft(x * w, n)) * 2 / w.sum()
    freqs = np.fft.rfftfreq(n, 1 / sr)
    dist = max(1, int(3 / (sr / n)))
    idx, _ = find_peaks(a, distance=dist)
    top = a.max()
    out = []
    for i in idx:
        if a[i] < top * 10 ** (-FLOOR_DB / 20) or freqs[i] < 12 or freqs[i] > NYQUIST_SHARE * sr:
            continue
        la, lb, lg = np.log(a[i - 1] + 1e-20), np.log(a[i] + 1e-20), np.log(a[i + 1] + 1e-20)
        p = 0.5 * (la - lg) / (la - 2 * lb + lg)
        out.append(((freqs[i] + p * sr / n) / f0, 20 * math.log10(a[i] / top)))
    return out


def cluster(found: list[tuple[float, float, int]]) -> list[tuple[float, float]]:
    """(ratio, loudest dB) of partials that recur or stand out, each ratio set by its highest-note
    sightings (best resolved)."""
    found = sorted(found)
    groups: list[list[tuple[float, float, int]]] = []
    for r, db, note in found:
        if groups and abs(r - groups[-1][-1][0]) <= TOLERANCE * r:
            groups[-1].append((r, db, note))
        else:
            groups.append([(r, db, note)])
    out = []
    for g in groups:
        loudest = max(db for _, db, _ in g)
        if len(g) < 2 and loudest < -LONE_DB:
            continue
        top = max(note for _, _, note in g)
        best = [r for r, _, note in g if note >= top - 12]
        out.append((float(np.median(best)), loudest))
    return out


def fit_amplitudes(x: np.ndarray, sr: int, freqs: list[float]) -> np.ndarray:
    """Complex amplitudes (peak, cosine phase) of sinusoids at `freqs`, fitted jointly."""
    t = np.arange(len(x)) / sr
    w = np.sqrt(np.hanning(len(x)))
    basis = np.empty((len(x), 2 * len(freqs)))
    for k, f in enumerate(freqs):
        basis[:, 2 * k] = np.cos(2 * np.pi * f * t)
        basis[:, 2 * k + 1] = -np.sin(2 * np.pi * f * t)
    coef, *_ = np.linalg.lstsq(basis * w[:, None], x * w, rcond=None)
    return coef[0::2] + 1j * coef[1::2]


def highpass_db(hz: np.ndarray, corner: float) -> np.ndarray:
    return -10 * np.log10(1 + (corner / hz) ** 2)


def highpass_phase(hz: np.ndarray, corner: float) -> np.ndarray:
    return np.arctan2(corner, hz)


def main() -> None:
    folder = pathlib.Path(sys.argv[1])
    sheet = json.loads((folder / "cues.json").read_text())
    cues = sheet["cues"]
    sr, audio = load(folder / "audio.wav")
    at = onsets(audio, sr, cues, sheet.get("clock") == "recording frames")

    takes: dict[int, list[tuple[int, int, float, np.ndarray]]] = {}
    for cue, onset in zip(cues, at):
        m = re.match(r"type=(\d+)\.bass=(\d+)", cue["take"])
        if not m:
            continue
        f0 = 440 * 2 ** ((cue["note"] - 69) / 12)
        takes.setdefault(int(m.group(1)), []).append(
            (int(m.group(2)), cue["note"], f0, segment(audio, sr, onset, cue))
        )

    # 1–2: every type's partials and every take's amplitudes at them
    fitted: dict[int, dict] = {}
    for t, rows in sorted(takes.items()):
        found = [(r, db, note) for bass, note, f0, x in rows for r, db in peaks(x, sr, f0)]
        partials = cluster(found)
        ratios = [r for r, _ in partials]
        # loudest first: a partial joins a take's fit only if it stands apart from the louder ones
        order = sorted(range(len(ratios)), key=lambda k: -partials[k][1])
        amps = {}
        for bass, note, f0, x in rows:
            apart = APART * sr / len(x)
            chosen: list[int] = []
            for k in order:
                hz = ratios[k] * f0
                if hz < NYQUIST_SHARE * sr and all(abs(hz - ratios[j] * f0) > apart for j in chosen):
                    chosen.append(k)
            z = fit_amplitudes(x, sr, [ratios[k] * f0 for k in chosen])
            full = np.full(len(ratios), np.nan, complex)
            full[chosen] = z
            amps[(bass, note)] = full
        fitted[t] = {"ratios": ratios, "amps": amps}
        print(f"type {t}: {len(ratios)} partials")

    # 3: the high-pass, from the partials on the harmonic grid of the types that keep one design
    # across notes (0, 1, 7 at their bass ends): level = design + high-pass(hz)
    obs = []
    for t, top in ((0, 4), (7, 3)):
        ratios = fitted[t]["ratios"]
        for (bass, note), z in fitted[t]["amps"].items():
            f0 = 440 * 2 ** ((note - 69) / 12)
            for k, r in enumerate(ratios):
                if r > top or not abs(z[k]) > 1e-3 or abs(r * 2 - round(r * 2)) > 1e-3:
                    continue
                obs.append((t, bass, round(r * 2), f0 * r, 20 * math.log10(abs(z[k]))))
    keys = sorted({(t, b, k) for t, b, k, _, _ in obs})
    index = {k: i for i, k in enumerate(keys)}

    def residual(p: np.ndarray) -> np.ndarray:
        corner = math.exp(p[0])
        return np.array(
            [p[1 + index[(t, b, k)]] + highpass_db(np.array([hz]), corner)[0] - db for t, b, k, hz, db in obs]
        )

    fit = least_squares(residual, np.concatenate([[math.log(50)], np.full(len(keys), -30.0)]))
    corner = math.exp(fit.x[0])
    print(f"high-pass corner {corner:.1f} Hz (one pole), rms residual {np.sqrt((fit.fun ** 2).mean()):.2f} dB")

    out = {"highpass_hz": corner, "bass": [0, 64, 127], "notes": [33, 45, 57, 69, 81], "types": []}
    for t in sorted(fitted):
        ratios = fitted[t]["ratios"]
        level = np.full((3, 5, len(ratios)), -120.0)
        phase = np.zeros((3, 5, len(ratios)))
        for (bass, note), z in fitted[t]["amps"].items():
            b = out["bass"].index(bass)
            n = out["notes"].index(note)
            f0 = 440 * 2 ** ((note - 69) / 12)
            hz = np.array(ratios) * f0
            with np.errstate(divide="ignore", invalid="ignore"):
                db = 20 * np.log10(np.abs(z) + 1e-12) - highpass_db(hz, corner)
            # NaN: not told apart from a louder neighbour in this take (filled from other notes)
            level[b, n] = np.where(np.isnan(db), np.nan, np.maximum(db, -120))
            phase[b, n] = np.angle(z) - highpass_phase(hz, corner)
        out["types"].append(
            {
                "ratios": ratios,
                "level_db": [[[None if math.isnan(v) else round(v, 2) for v in row] for row in b] for b in level],
                "phase": [[[None if math.isnan(v) else round(v, 4) for v in row] for row in b] for b in phase],
            }
        )
    (folder / "organ-fit.json").write_text(json.dumps(out))
    print(f"wrote {folder / 'organ-fit.json'}")


if __name__ == "__main__":
    main()
