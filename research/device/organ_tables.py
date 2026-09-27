"""The OP-XY organ's registrations, measured (docs/research/57-synth-engines.md §6).

From an `organ` capture (synth_capture.py): for every type and bass setting, the level of each
partial on the half-note grid (note × 0.5 = the 16', × 1 the 8', × 1.5 the 5⅓', …) and its phase
against the note's own partial, per octave; and the tremolo's rate and depth from the level over
time. Prints the tables and writes <folder>/organ.json for the engine to be fitted from.

Usage: uv run --with numpy --with scipy python research/device/organ_tables.py <capture folder>
"""

import json
import math
import pathlib
import re
import sys

import numpy as np
from scipy.io import wavfile

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from synth_analyze import load, onsets, peak_near_note  # noqa: E402

PARTIALS = 32  # half-note steps: up to 16 × the note


def partials(mid: np.ndarray, sr: int, note: int) -> tuple[list[float], list[float]]:
    """Amplitude (re the segment's RMS) and phase (re the 8' partial) on the half-note grid."""
    expected = 440 * 2 ** ((note - 69) / 12)
    f = peak_near_note(mid, sr, expected) / 2
    n = len(mid)
    w = np.hanning(n)
    t = np.arange(n)
    rms = float(np.sqrt((mid**2).mean())) + 1e-12
    amps, phases = [], []
    ref = None
    for k in range(1, PARTIALS + 1):
        hz = f * k
        if hz > sr / 2 * 0.95:
            amps.append(0.0)
            phases.append(0.0)
            continue
        z = (mid * w * np.exp(-2j * np.pi * hz * t / sr)).sum() * 2 / w.sum()
        amps.append(abs(z) / rms)
        phases.append(float(np.angle(z)))
        if k == 2:
            ref = float(np.angle(z))
    # phases relative to the 8' partial's, scaled per partial (a time shift moves partial k by k/2)
    rel = [(p - (k / 2) * (ref or 0.0)) % (2 * math.pi) for k, p in enumerate(phases, start=1)]
    return amps, rel


def main() -> None:
    folder = pathlib.Path(sys.argv[1])
    sheet = json.loads((folder / "cues.json").read_text())
    cues = sheet["cues"]
    sr, audio = load(folder / "audio.wav")
    at = onsets(audio, sr, cues, sheet.get("clock") == "recording frames")
    table: dict[str, dict[str, dict]] = {}
    tremolo = []
    for cue, onset in zip(cues, at):
        length = cue["off"] - cue["on"]
        seg = audio[onset + int(0.2 * sr) : onset + int((length - 0.05) * sr)]
        mid = seg.mean(axis=1)
        m = re.match(r"type=(\d+)\.bass=(\d+)", cue["take"])
        if m:
            amps, phases = partials(mid, sr, cue["note"])
            key = f"type={m.group(1)}.bass={m.group(2)}"
            table.setdefault(key, {})[str(cue["note"])] = {
                "amp": amps,
                "phase": phases,
                "rms_db": 20 * math.log10(float(np.sqrt((mid**2).mean())) + 1e-12),
            }
        elif cue["take"].startswith("tremolo"):
            env = np.sqrt(np.convolve(mid**2, np.ones(int(0.01 * sr)) / int(0.01 * sr), mode="same"))
            env = env[int(0.02 * sr) : -int(0.02 * sr)]
            spec = np.abs(np.fft.rfft((env - env.mean()) * np.hanning(len(env)), 1 << 18))
            freqs = np.fft.rfftfreq(1 << 18, 1 / sr)
            band = (freqs > 0.2) & (freqs < 30)
            rate = float(freqs[band][np.argmax(spec[band])])
            depth = float((env.max() - env.min()) / (env.max() + 1e-12))
            tremolo.append({"take": cue["take"], "rate_hz": rate, "depth": depth})

    notes = sorted({int(n) for v in table.values() for n in v})
    names = ["16'", "8'", "5⅓'", "4'", "3⅕'", "2⅔'", "22/7'", "2'", "1⁷⁄₉'", "1⅗'", "", "1⅓'", "", "1⅐'", "", "1'"]
    for key in sorted(table, key=lambda k: [int(x) for x in re.findall(r"\d+", k)]):
        print(f"\n{key}  (partial dB re note RMS; rows: notes)")
        print("       " + " ".join(f"{(names[k] if k < len(names) else ''):>5}" for k in range(16)))
        for note in notes:
            row = table[key].get(str(note))
            if not row:
                continue
            print(f"  {note:3d}  " + " ".join(f"{20 * math.log10(a + 1e-9):5.0f}" for a in row["amp"][:16]) + f"   rms {row['rms_db']:.1f}")
    for t in tremolo:
        print(f"{t['take']:24} rate {t['rate_hz']:5.2f} Hz  depth {t['depth']:.2f}")
    (folder / "organ.json").write_text(json.dumps({"table": table, "tremolo": tremolo}, indent=1))


if __name__ == "__main__":
    main()
