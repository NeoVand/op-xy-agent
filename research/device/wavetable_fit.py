"""wavetable, measured (docs/research/57-synth-engines.md §3): the rule behind each table's frames,
the crossfade between frames, the output's rolloff, and warp and drift.

Every take's harmonics are fitted from the capture itself (complex amplitudes in sine phase, the
fundamental's phase taken off, the device's rolloff undone), so nothing of the device's tables is
stored: the fits recover our formulas' constants. The table takes sweep position in steps of 5 %
(CC 0, 6, 13 … 127) on A1 (note 33) and A4 (69); a position reads frames f and f + 1 of the
table's 32 (crush 16), crossfaded.

Modes:
- `--rolloff`: zap at 0 (a plain saw) against 1/h on both notes: a one-pole's cutoff.
- `--crush`: each position as a crossfade of two rounding quantisers round(g·sin θ); the gains
  found, and g_k = (a + b·k/15)^−2 fitted to all positions at once.
- `--geometric`: partials at f_j = max(f_{j−1} + 1, round(ρ^j)), the jth at (j + 1)^−p, with
  ρ = 1 + r1·x + r2·x² and p = p0 + p1·x, fitted to all positions at once.
- `--basic`: a power-shaped triangle, a power-shaped falling saw, then saw → 1/h² → sine, the
  boundaries at the thirds: the shaping power and the blend's two powers.
- `--zap`: the phase step Δ(h) between neighbouring frames, from the depth of the crossfade's dips
  and the last frame's phases, and its formula 31·Δ = a·h − b·h²/(1 + c·h)^d.
- `--drawbars`: each position as nine in-phase bars with odd overtones c·n^−q: c, q and the
  registration (dB re the loudest bar).
- `--buzz`: the saw's share and the noise's level per harmonic at each position.
- `--warp`: the warp takes (crush at 64) as 1:1 frequency modulation of the read by a sine at a
  free phase: the swing per take.
- `--drift`: the warp's sine's rate over the note's, from the first sideband (triangle, warp 64).

Usage: uv run --with numpy --with scipy python research/device/wavetable_fit.py <capture folder>
       --rolloff | --crush | --geometric | --basic | --zap | --drawbars | --buzz | --warp | --drift
"""

import json
import pathlib
import sys

import numpy as np
from scipy.optimize import least_squares, minimize

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from harmonic_table import harmonics  # noqa: E402
from synth_analyze import load, onsets  # noqa: E402

SR = 44100
ROLLOFF_HZ = 8316
POS = list(range(0, 101, 5))
N = 8192
PHASE = (np.arange(N) + 0.5) / N


def hz_of(note: int) -> float:
    return 440 * 2 ** ((note - 69) / 12)


def rolloff(hz: np.ndarray, fc: float = ROLLOFF_HZ) -> np.ndarray:
    """A bilinear one-pole's gain at `hz` (the device's top, measured by --rolloff)."""
    r = np.tan(np.pi * hz / SR) / np.tan(np.pi * fc / SR)
    return 1 / np.sqrt(1 + r * r)


class Capture:
    def __init__(self, folder: pathlib.Path):
        sheet = json.loads((folder / "cues.json").read_text())
        self.cues = sheet["cues"]
        self.sr, self.audio = load(folder / "audio.wav")
        self.at = onsets(self.audio, self.sr, self.cues, sheet.get("clock") == "recording frames")

    def segment(self, take: str, note: int, start: float = 0.1) -> np.ndarray:
        for cue, onset in zip(self.cues, self.at):
            if cue["take"] == take and cue["note"] == note:
                length = cue["off"] - cue["on"]
                x = self.audio[onset + int(start * self.sr) : onset + int((length - 0.02) * self.sr)]
                x = x.mean(axis=1)
                return x - x.mean()
        raise KeyError(f"{take} n{note}")

    def spectrum(self, take: str, note: int, count: int, relative: bool = True) -> np.ndarray:
        """Harmonics 1…count, complex in sine phase, the fundamental's phase taken off, the rolloff
        undone; relative to the fundamental, or as recorded."""
        f0 = hz_of(note)
        z = harmonics(self.segment(take, note), self.sr, f0, count)
        h = np.arange(1, count + 1)
        z = z * np.exp(-1j * h * (np.angle(z[0]) + np.pi / 2)) / rolloff(f0 * h)
        return z * 1j / (abs(z[0]) if relative else 1)

    def table(self, t: int, p: int, note: int = 33, count: int = 200) -> np.ndarray:
        return self.spectrum(f"table={t}.pos={p}", note, count)


def between(p: int, frames: int) -> tuple[int, float]:
    """The frame a position sits after, and how far towards the next."""
    x = round(p * 1.27) / 127 * (frames - 1)
    f = min(frames - 2, int(x))
    return f, x - f


def sine_harmonics(y: np.ndarray, count: int) -> np.ndarray:
    return np.fft.rfft(y)[1 : count + 1] * 2 / len(y) * 1j


def unit(c: np.ndarray) -> np.ndarray:
    return c / np.sqrt(np.sum(np.abs(c) ** 2) / 2)


def rolloff_fit(cap: Capture) -> None:
    f, r = [], []
    for note in (33, 69):
        count = int(0.42 * SR / hz_of(note))
        a = np.abs(harmonics(cap.segment("table=8.pos=0", note), cap.sr, hz_of(note), count))
        h = np.arange(1, count + 1)
        f += list(hz_of(note) * h)
        r += list(20 * np.log10(a / a[0] * h))
    f, r = np.array(f), np.array(r)
    ok = f < 18000

    def model(fc: float) -> np.ndarray:
        return 20 * np.log10(rolloff(f, fc) / rolloff(np.array(f.min()), fc))

    fit = minimize(lambda v: np.mean((model(v[0]) - r)[ok] ** 2), [9000], method="Nelder-Mead")
    e = model(fit.x[0]) - r
    print(f"one-pole at {fit.x[0]:.0f} Hz: rms {np.sqrt(np.mean(e[ok] ** 2)):.2f} dB to 18 kHz")


def quantiser(g: float, count: int = 150) -> np.ndarray:
    y = np.round(g * np.sin(2 * np.pi * PHASE))
    return unit(sine_harmonics(y, count)).real


def crush_fit(cap: Capture) -> None:
    m = {p: cap.table(2, p)[:150].real for p in POS}

    def mix(gains, p):
        f, w = between(p, 16)
        y = (1 - w) * quantiser(gains[f]) + w * quantiser(gains[f + 1])
        return y / y[0]

    def cost(gains):
        return sum(np.mean((mix(gains, p) - m[p]) ** 2) for p in POS)

    def formula(a, b):
        return [1 / (a + b * k / 15) ** 2 for k in range(16)]

    best = min(
        (cost(formula(a, b)), a, b)
        for a in np.linspace(0.195, 0.205, 21)
        for b in np.linspace(1.12, 1.14, 41)
    )
    print(f"crush: g_k = ({best[1]:.4f} + {best[2]:.4f}·k/15)^-2  rms {np.sqrt(best[0] / len(POS)):.5f}")
    print("  gains: " + " ".join(f"{g:.3f}" for g in formula(best[1], best[2])))


def geometric_frame(x: float, v, count: int = 200) -> np.ndarray:
    r1, r2, p0, p1 = v
    rho, p = 1 + r1 * x + r2 * x * x, p0 + p1 * x
    out, f, j = np.zeros(count), 0, 0
    while True:
        f = max(f + 1, int(np.floor(rho**j + 0.5)))
        if f > count:
            return out
        out[f - 1] = (j + 1) ** -p
        j += 1


def geometric_fit(cap: Capture) -> None:
    m = {p: cap.table(6, p).real for p in POS}
    level = [-17.4, -17.8, -17.9, -18.1, -18.1, -19.1, -19.8, -21.8, -23.6, -26.4, -28.8]

    def at(x, v):
        return unit(geometric_frame(x, v)) * 10 ** (np.interp(x, np.linspace(0, 1, 11), level) / 20)

    def cost(v):
        total = 0
        for p in POS:
            f, w = between(p, 32)
            y = (1 - w) * at(f / 31, v) + w * at((f + 1) / 31, v)
            total += np.mean((y / y[0] - m[p]) ** 2)
        return total

    fit = minimize(cost, [2.0, 3.0, 2.0, -1.0], method="Nelder-Mead", options={"xatol": 1e-5})
    r1, r2, p0, p1 = fit.x
    print(f"geometric: rho = 1 + {r1:.3f}x + {r2:.3f}x², p = {p0:.3f} + {p1:.3f}x  rms {np.sqrt(fit.fun / len(POS)):.5f}")


def basic_frame(x: float, v) -> np.ndarray:
    bend, saw, sine = v
    h = np.arange(1, 151)
    if x < 2 / 3:
        k = abs(1 - 3 * x) ** bend
        base = (
            np.where(PHASE < 0.25, 4 * PHASE, np.where(PHASE < 0.75, 2 - 4 * PHASE, 4 * PHASE - 4))
            if x < 1 / 3
            else 1 - 2 * PHASE
        )
        return unit(sine_harmonics(np.sign(base) * np.abs(base) ** k, 150).real)
    m = 3 * x - 2
    d, s = (1 - m) ** saw, m**sine
    return unit(d / h + max(0.0, 1 - d - s) / h**2 + s * (h == 1))


def basic_fit(cap: Capture) -> None:
    m = {p: cap.table(0, p)[:150].real for p in POS}

    def cost(v):
        total = 0
        for p in POS:
            f, w = between(p, 32)
            y = (1 - w) * basic_frame(f / 31, v) + w * basic_frame((f + 1) / 31, v)
            total += np.mean((y / y[0] - m[p]) ** 2)
        return total

    fit = minimize(cost, [1.2, 2.5, 1.75], method="Nelder-Mead", options={"xatol": 1e-4})
    print(
        "basic: shaping power {:.3f}, saw (1 − m)^{:.3f}, sine m^{:.3f}  rms {:.5f}".format(
            *fit.x, np.sqrt(fit.fun / len(POS))
        )
    )


def zap_fit(cap: Capture) -> None:
    h = np.arange(1, 201)
    g0, g1 = cap.table(8, 0) * h, cap.table(8, 100) * h
    # the last frame's phases, unwrapped by continuity (their second differences stay small)
    d = np.angle(g1 / g0)
    phi = np.zeros(200)
    phi[1] = d[1]
    for k in range(2, 200):
        pred = 2 * phi[k - 1] - phi[k - 2]
        phi[k] = d[k] + 2 * np.pi * np.round((pred - d[k]) / (2 * np.pi))
    # the dips' depth |(1 − w) + w·e^{iΔ}| between frames gives |Δ| folded; aligning each take on
    # its fundamental hid a slide in time per frame (δ·h), found here
    folded = []
    for p in (5, 40, 60, 95):
        _, w = between(p, 32)
        g = np.abs(cap.table(8, p) * h)
        c = np.clip((g**2 - (1 - w) ** 2 - w**2) / (2 * w * (1 - w)), -1, 1)
        folded.append(np.degrees(np.arccos(c)))
    target = np.mean(folded, axis=0)

    def fold(x):
        x = np.mod(x, 360)
        return np.where(x > 180, 360 - x, x)

    deg = np.degrees(phi)
    slide = min(np.arange(-5, 5, 0.005), key=lambda s: np.mean((fold(deg / 31 + s * h) - target) ** 2))
    total = deg + 31 * slide * h
    fit = least_squares(
        lambda v: v[0] * h - v[1] * h * h / (1 + v[2] * h) ** v[3] - total, [60, 3, 0.02, 0.5]
    )
    e = fit.fun
    print(f"zap: slide {slide:.3f}°/frame; 31·Δ = {fit.x[0]:.2f}h − {fit.x[1]:.3f}h²/(1 + {fit.x[2]:.4f}h)^{fit.x[3]:.3f}")
    print(f"  max error {np.abs(e).max():.1f}° over 200 harmonics ({np.abs(e).max() / 31:.2f}° a frame)")


def drawbars_fit(cap: Capture) -> None:
    ratios = [1, 2, 3, 4, 6, 8, 10, 12, 16]
    m = {p: cap.table(3, p).real for p in POS}

    def basis(c, q):
        b = np.zeros((200, len(ratios)))
        for i, r in enumerate(ratios):
            for n in range(1, 200 // r + 1, 2):
                b[r * n - 1, i] += 1.0 if n == 1 else c * n**-q
        return b

    def solve(v):
        b = basis(*v)
        return {p: np.linalg.lstsq(b, m[p], rcond=None) for p in POS}

    def cost(v):
        b = basis(*v)
        return sum(np.mean((m[p] - b @ fit[0]) ** 2) for p, fit in solve(v).items())

    fit = minimize(cost, [1.74, 2.55], method="Nelder-Mead", options={"xatol": 1e-5})
    print(f"drawbars: overtones {fit.x[0]:.3f}·n^-{fit.x[1]:.3f}, all in phase  rms {np.sqrt(fit.fun / len(POS)):.5f}")
    for p, (levels, *_) in solve(fit.x).items():
        if p % 10 == 0:
            top = np.abs(levels).max()
            print(f"  {p:3d}%: " + " ".join(f"{20 * np.log10(max(abs(v), 1e-9) / top):6.1f}" for v in levels))


def buzz_fit(cap: Capture) -> None:
    h = np.arange(1, 201)
    start = cap.spectrum("table=1.pos=0", 33, 200, relative=False)
    # the first frame's saw, as recorded: every take is measured against it
    saw = np.where(h % 2 == 1, 1, -1) / h * abs(start[0]) * np.sign(start[0].real)
    print("buzz: saw share, and the noise per harmonic (dB re the saw's fundamental), per frame")
    for p in POS:
        z = cap.spectrum(f"table=1.pos={p}", 33, 200, relative=False)
        s = np.real(np.vdot(saw, z) / np.vdot(saw, saw))
        noise = np.sqrt(np.mean(np.abs(z - s * saw)[1:] ** 2)) / abs(start[0])
        _, w = between(p, 32)
        # two independent noise frames crossfaded lose (1 − w)² + w² of their power
        frame = 20 * np.log10(noise) - 10 * np.log10((1 - w) ** 2 + w**2)
        print(f"  {p:3d}%: saw {s:5.3f}  noise {frame:6.1f} dB")


def warp_fit(cap: Capture) -> None:
    g7, g8 = (1 / (0.2004 + 1.1282 * k / 15) ** 2 for k in (7, 8))
    w = 64 / 127 * 15 - 7

    def steps(g, p):
        y = np.round(g * np.sin(2 * np.pi * p))
        return y / np.sqrt(np.mean(y * y))

    def crush(p):
        return (1 - w) * steps(g7, p) + w * steps(g8, p)

    def db(a):
        return np.maximum(-50, 20 * np.log10(a / a.max() + 1e-12))

    print("warp: the read swung by a·sin(2π(φ + φ0)): the swing a (cycles) per take, φ0 free")
    for note, count in ((45, 60), (69, 40)):
        f0 = hz_of(note)
        shapes = {}
        for a in np.linspace(0, 0.2, 81):
            for p0 in np.linspace(0, 1, 36, endpoint=False):
                y = crush((PHASE + a * np.sin(2 * np.pi * (PHASE + p0))) % 1)
                shapes[(a, p0)] = db(np.abs(np.fft.rfft(y - y.mean()))[1 : count + 1])
        for cc in (0, 13, 25, 38, 51, 64, 76, 89, 102, 114, 127):
            k = np.arange(1, count + 1)
            x = cap.segment(f"warp@basic={cc}", note, 0.15)
            m = db(np.abs(harmonics(x, cap.sr, f0, count)) / rolloff(f0 * k))
            e, a, _ = min(
                (np.sqrt(np.mean(((s - m)[(s > -40) | (m > -40)]) ** 2)), a, p0) for (a, p0), s in shapes.items()
            )
            per = f"a/warp {a / (cc / 127):.3f}" if cc else "no warp"
            print(f"  n{note} warp {cc / 127:.2f}: a {a:.3f} ({per})  err {e:.1f} dB")


def drift_fit(cap: Capture) -> None:
    print("drift: the warp's sine's rate over the note's (from the triangle's sideband at f0 + fw)")
    for note in (45, 69):
        f0 = hz_of(note)
        for cc in (13, 25, 38, 51, 64, 76, 89, 102, 114, 127):
            x = cap.segment(f"drift@warp50={cc}", note, 0.2)
            n = 1 << 18
            spec = np.abs(np.fft.rfft(x * np.hanning(len(x)), n))
            f = np.fft.rfftfreq(n, 1 / cap.sr)
            window = (f > 1.45 * f0) & (f < 1.998 * f0)
            fw = f[window][np.argmax(spec[window])] - f0
            s = 2 * (1 - fw / f0)
            x2 = 2 * cc / 127
            model = 0.5 * x2**2.6 if x2 < 1 else 1 - 0.5 * (2 - x2) ** 2.6
            print(f"  n{note} drift {cc / 127:.2f}: ratio {fw / f0:.4f}  s {s:.3f} (S-curve^2.6: {model:.3f})")


MODES = {
    "--rolloff": rolloff_fit,
    "--crush": crush_fit,
    "--geometric": geometric_fit,
    "--basic": basic_fit,
    "--zap": zap_fit,
    "--drawbars": drawbars_fit,
    "--buzz": buzz_fit,
    "--warp": warp_fit,
    "--drift": drift_fit,
}

if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[2] not in MODES:
        sys.exit(__doc__)
    MODES[sys.argv[2]](Capture(pathlib.Path(sys.argv[1])))
