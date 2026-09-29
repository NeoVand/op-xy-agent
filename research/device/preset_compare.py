"""Compares each track's sound on the unit with the replica's: the unit's take from
preset_capture.py (captures/presets/<tag>.wav + .json) against the replica's renders of the same
phrase (captures/presets/<tag>-replica-T<n>.wav, from src/lib/sound/compare.svelte.spec.ts).

For every part of the phrase (the three held notes, the triad, the short notes) it measures level
(RMS dB), brightness (spectral centroid), the balance over octave bands, the attack (10 % to 90 %
of the part's peak) and the tail (level 150 ms after the note ends, against the held level), and
prints unit, replica and the difference. With --plot it writes one PNG per track: the two
spectra of each held note, overlaid.

Usage: uv run --with numpy --with scipy --with matplotlib python research/device/preset_compare.py TAG [--plot]
"""

import argparse
import json
import pathlib
import sys

import numpy as np
from scipy.io import wavfile

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from take_timing import note_ons, placed  # noqa: E402

CAPTURES = pathlib.Path(__file__).parent / "captures" / "presets"
BANDS = [63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def parts(summary: dict) -> list[tuple[str, float, float]]:
    """preset_capture.py's phrase as (name, start s, length s): the held notes, the triad, then
    every fourth short note, with the take's own root, hold and gap."""
    root, hold, gap = summary.get("root", 36), summary.get("hold", 1.4), summary.get("gap", 1.2)
    rows = []
    t = 0.0
    for octave in range(3):
        note = root + 12 * octave
        rows.append((f"{NAMES[note % 12]}{note // 12 - 1}", t, hold))
        t += hold + gap
    rows.append(("triad", t, 1.8))
    t += 1.8 + 1.4
    for i in range(8):
        if i % 4 == 0:
            rows.append((f"short {i + 1}", t, 0.1))
        t += 0.25
    return rows


def drum_parts() -> list[tuple[str, float, float]]:
    """The drum phrase: each key (53-76) once, 0.7 s apart, measured over 0.6 s."""
    return [(f"key {53 + i}", i * 0.7, 0.6) for i in range(24)]


def mono(path: pathlib.Path) -> tuple[int, np.ndarray]:
    rate, data = wavfile.read(path)
    x = data.astype(np.float64)
    if x.ndim > 1:
        x = x.mean(axis=1)
    return rate, x / 32768.0


def db(v: float) -> float:
    return 20 * np.log10(max(v, 1e-9))


def measure(x: np.ndarray, rate: int, start: float, length: float) -> dict:
    """What a part sounds like: from its note on to its note off, then its tail."""
    a, b = int(start * rate), int((start + length) * rate)
    held = x[a:b]
    if len(held) < rate // 20:
        return {}
    body = held[len(held) // 4 :]
    rms = np.sqrt(np.mean(body**2))
    spectrum = np.abs(np.fft.rfft(body * np.hanning(len(body))))
    freqs = np.fft.rfftfreq(len(body), 1 / rate)
    power = spectrum**2
    centroid = float(np.sum(freqs * power) / max(np.sum(power), 1e-20))
    bands = []
    for lo, hi in zip(BANDS[:-1], BANDS[1:]):
        sel = (freqs >= lo) & (freqs < hi)
        bands.append(10 * np.log10(max(power[sel].sum(), 1e-20)))
    total = 10 * np.log10(max(power.sum(), 1e-20))
    bands = [round(v - total, 1) for v in bands]
    envelope = np.abs(held)
    win = max(1, rate // 1000)
    smooth = np.convolve(envelope, np.ones(win) / win, mode="same")
    peak = smooth[: rate // 5].max() if len(smooth) >= rate // 5 else smooth.max()
    attack = None
    if peak > 0:
        above10 = np.argmax(smooth >= 0.1 * peak)
        above90 = np.argmax(smooth >= 0.9 * peak)
        attack = round((above90 - above10) / rate * 1000, 1)
    tail_at = b + int(0.15 * rate)
    tail = np.sqrt(np.mean(x[tail_at : tail_at + rate // 50] ** 2)) if tail_at + rate // 50 < len(x) else 0.0
    return {
        "rms": round(db(rms), 1),
        "centroid": round(centroid),
        "bands": bands,
        "attack_ms": attack,
        "tail_db": round(db(tail) - db(rms), 1),
        "spectrum": (freqs, spectrum),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("tag")
    parser.add_argument("--plot", action="store_true")
    args = parser.parse_args()
    take = json.loads((CAPTURES / f"{args.tag}.json").read_text())
    rate, unit = mono(CAPTURES / f"{args.tag}.wav")
    stamps, latency = placed(take, unit, rate)
    print(f"unit latency {latency / rate * 1000:.1f} ms after each message's send time")
    summary = take["summary"]
    drums = summary.get("drums", [])
    for channel in summary["channels"] + drums:
        replica_path = CAPTURES / f"{args.tag}-replica-T{channel}.wav"
        if not replica_path.exists():
            print(f"T{channel}: no replica render ({replica_path.name})")
            continue
        r_rate, replica = mono(replica_path)
        if r_rate != rate:
            sys.exit(f"rates differ: unit {rate}, replica {r_rate}")
        ons = [s["at"] for s in note_ons(stamps, channel)]
        if not ons:
            print(f"T{channel}: no notes in the take")
            continue
        # the unit's phrase starts where its first note sounds; the replica's one second in
        offset = ons[0] / rate - 1.0
        unit_track = unit[max(0, int(round(offset * rate))) :]
        print(f"\nT{channel}  (unit | replica | replica − unit)")
        rows = drum_parts() if channel in drums else parts(summary)
        spectra = []
        for name, start, length in rows:
            u = measure(unit_track, rate, 1.0 + start, length)
            p = measure(replica, rate, 1.0 + start, length)
            if not u or not p:
                continue
            print(
                f"  {name:8s} level {u['rms']:6.1f} | {p['rms']:6.1f} | {p['rms'] - u['rms']:+5.1f} dB"
                f"   centroid {u['centroid']:5d} | {p['centroid']:5d} Hz"
                f"   attack {u['attack_ms']} | {p['attack_ms']} ms"
                f"   tail {u['tail_db']:6.1f} | {p['tail_db']:6.1f} dB"
            )
            print(
                "           bands " + " ".join(f"{b:+5.1f}" for b in np.subtract(p["bands"], u["bands"]))
                + "  (replica − unit, 63 Hz … 8 kHz octaves)"
            )
            spectra.append((name, u["spectrum"], p["spectrum"]))
        if args.plot and spectra:
            import matplotlib

            matplotlib.use("Agg")
            import matplotlib.pyplot as plt

            fig, axes = plt.subplots(len(spectra), 1, figsize=(10, 2.6 * len(spectra)), sharex=True)
            for ax, (name, (fu, su), (fp, sp)) in zip(np.atleast_1d(axes), spectra):
                ax.semilogx(fu, 20 * np.log10(su / su.max() + 1e-9), label="unit", lw=0.8)
                ax.semilogx(fp, 20 * np.log10(sp / sp.max() + 1e-9), label="replica", lw=0.8, alpha=0.8)
                ax.set_xlim(30, 16000)
                ax.set_ylim(-90, 3)
                ax.set_title(f"T{channel} {name}")
                ax.legend(loc="upper right")
            fig.tight_layout()
            out = CAPTURES / f"{args.tag}-T{channel}-spectra.png"
            fig.savefig(out, dpi=90)
            print(f"  wrote {out}")


if __name__ == "__main__":
    main()
