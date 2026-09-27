"""Synth calibration capture (docs/research/57-synth-engines.md §6). NEEDS THE OWNER'S GO-AHEAD.

Plays parameter sweeps into one track of a throwaway project over MIDI while ffmpeg records the
OP-XY's USB audio, and writes a cue sheet so each take can be cut out and compared with our
engines. Only control changes 12-15 (engine) and 20-35 (envelopes, play mode, filter), notes and
all-notes-off are ever sent; anything else is refused. Dry run by default: prints the plan (every
message and when) and sends nothing.

Before --send, on the device: a NEW project (nothing saved, loaded or deleted), the track's engine
chosen by hand, filter type svf with the filter open, LFO amount 0, sends 0, preset width and high
pass 0, master EQ/saturator/compressor neutral. Log the session in docs/research/90-device-probe.md.

Usage (uv run --with python-rtmidi python research/device/synth_capture.py …):
  ENGINE --track N [--notes 33,57,69] [--hold 2] [--gap 0.6] [--send] [--no-record]
  ENGINE is one of: prism axis dissolve wavetable epiano organ hardsync simple envelopes
"""

import argparse
import datetime
import json
import math
import pathlib
import subprocess
import sys
import time

CAPTURES = pathlib.Path(__file__).parent / "captures" / "synth"
# what may be sent: engine params, envelopes, play mode, filter; all notes off to finish
ALLOWED_CC = set(range(12, 16)) | set(range(20, 36)) | {123}

A1, A2, A3, A4, A5, A6 = 33, 45, 57, 69, 81, 93


def pct(value: float) -> int:
    """A screen value 0-100 as a CC value (assumes a linear map; the session checks it first)."""
    return max(0, min(127, round(value * 127 / 100)))


def step(k: int, steps: int) -> int:
    """The CC value in the middle of zone k of a stepped parameter with `steps` zones."""
    return max(0, min(127, round((k + 0.5) * 128 / steps)))


SWEEP = [pct(v) for v in range(0, 101, 10)]

# the voice every take starts from: sharp attack, full sustain, short release, filter open
NEUTRAL = {20: 0, 21: 64, 22: 127, 23: 10, 32: 127, 33: 0, 34: 64, 35: 0}


def expected(cc_value: int) -> float:
    """Seconds an envelope stage should take at a CC value (the community's attack law)."""
    return 0.0111 * (math.exp(10.386 * cc_value / 127) - 1) + 0.002


def timed(seconds: float) -> float:
    """Time to leave for a stage expected to take `seconds`, with room to see it settle."""
    return max(2.0, min(25.0, 1.3 * seconds + 0.5))


# a take: id, CCs on top of NEUTRAL, notes (None: the default ones), and hold/gap overrides
Take = tuple[str, dict[int, int], list[int] | None, float | None, float | None]


def takes(engine: str) -> list[Take]:
    out: list[Take] = []

    def sweep(name: str, cc: int, base: dict[int, int], values=SWEEP, notes=None):
        for v in values:
            add(f"{name}={v}", {**base, cc: v}, notes)

    def add(name, ccs, notes=None, hold=None, gap=None):
        out.append((name, ccs, notes, hold, gap))

    if engine == "prism":
        base = {12: 0, 13: step(1, 9), 14: 0, 15: 0}
        sweep("shape", 12, base)
        for k in range(9):
            add(f"ratio.step={k}", {**base, 13: step(k, 9)}, None)
        sweep("ratio.ramp", 13, base, values=list(range(0, 128, 4)), notes=[A3])
        sweep("detune", 14, base, notes=[A2, A4])
        for d in (0, pct(50)):
            sweep(f"stereo@detune{d}", 15, {**base, 14: d}, values=[pct(v) for v in (0, 25, 50, 75, 100)])
    elif engine == "axis":
        base = {12: pct(50), 13: pct(50), 14: 0, 15: 0}
        sweep("tone", 12, base)
        sweep("ratio.low", 13, base, values=[pct(v) for v in range(0, 51, 5)])
        sweep("ratio.high", 13, base, values=list(range(pct(51), 128, 3)), notes=[A3])
        sweep("shape", 14, base)
        sweep("tremolo", 15, base)
        add("hidden-vibrato", base, [A3])
    elif engine == "dissolve":
        base = {12: 0, 13: 0, 14: 0, 15: 0}
        add("all-zero", base, None)
        for name, cc in (("swarm", 12), ("am", 13), ("fm", 14), ("detune", 15)):
            sweep(name, cc, base, notes=[A2, A4])
        add("fm100+detune60", {**base, 14: 127, 15: pct(60)}, None)
        add("am50+fm50", {**base, 13: pct(50), 14: pct(50)}, None)
    elif engine == "wavetable":
        base = {12: 0, 13: 0, 14: 0, 15: 0}
        for t in range(9):
            for p in range(0, 101, 5):
                add(f"table={t}.pos={p}", {**base, 12: step(t, 9), 13: pct(p)}, [A1, A4])
        sweep("warp@basic", 14, {**base, 12: step(2, 9), 13: pct(50)})
        sweep("drift@warp50", 15, {**base, 14: pct(50)}, notes=[A2, A4])
        sweep("drift@warp0", 15, base, values=[0, pct(50), 127], notes=[A2])
    elif engine == "epiano":
        base = {12: 0, 13: 0, 14: 0, 15: 0}
        add("all-zero", base, None)
        sweep("texture@tone0", 13, base)
        sweep("tone@tine0", 12, base)
        sweep("tine@tone50", 15, {**base, 12: pct(50)})
        sweep("punch", 14, base)
    elif engine == "organ":
        for t in range(8):
            for bass in (0, 64, 127):
                add(f"type={t}.bass={bass}", {12: step(t, 8), 13: bass, 14: 0, 15: 0}, [A1, A2, A3, A4, A5])
        for speed in (0, 32, 64, 96, 127):
            add(f"tremolo.speed={speed}", {12: step(3, 8), 13: 64, 14: 127, 15: speed}, [A3])
    elif engine == "hardsync":
        base = {12: 0, 13: 0, 14: 0, 15: 0}
        sweep("freq", 12, base, notes=[A2, A3, A4])
        sweep("sub@freq0", 13, base, notes=[A2])
        sweep("lowcut@noise100", 15, {**base, 14: 127}, notes=[A3])
        add("freq-max-high", {**base, 12: 127}, [A6])
    elif engine == "simple":
        base = {12: 0, 13: 0, 14: 0, 15: 0}
        for shape in (0, 25, 50, 75, 100):
            for pw in (0, 50, 100):
                add(f"shape={shape}.pw={pw}", {**base, 12: pct(shape), 13: pct(pw)}, [A3])
        sweep("stereo", 15, base, values=[0, pct(50), 127], notes=[A3])
        sweep("noise", 14, base, notes=[A3])
    elif engine == "envelopes":
        # on a plain saw (simple, shape 0): the time laws and the sustain scale
        base = {12: 0, 13: 0, 14: 0, 15: 0}
        for v in (0, 18, 36, 53, 71, 90):
            add(f"attack={v}", {**base, 20: v}, [A3], hold=timed(expected(v)))
        for v in (0, 18, 36, 53, 71, 90):
            add(f"decay={v}.sustain0", {**base, 21: v, 22: 0}, [A3], hold=timed(expected(v)))
        for v in (0, 18, 36, 53, 71, 90):
            add(f"release={v}", {**base, 23: v}, [A3], hold=1.0, gap=timed(expected(v)))
        for v in (0, 32, 64, 96, 127):
            add(f"sustain={v}", {**base, 21: 36, 22: v}, [A3])
    else:
        raise SystemExit(f"unknown engine {engine!r}")
    return out


class Midi:
    """The OP-XY's MIDI out, refusing everything but the allowed CCs and notes."""

    def __init__(self, send: bool):
        self.mo = None
        if send:
            import rtmidi

            self.mo = rtmidi.MidiOut()
            port = next(i for i, p in enumerate(self.mo.get_ports()) if "OP-XY" in p)
            self.mo.open_port(port)

    def send(self, msg: list[int]) -> None:
        kind = msg[0] & 0xF0
        if kind == 0xB0 and msg[1] not in ALLOWED_CC:
            raise PermissionError(f"CC{msg[1]} is not on this script's allow-list")
        if kind not in (0x80, 0x90, 0xB0) or len(msg) != 3 or any(b > 0x7F for b in msg[1:]):
            raise PermissionError(f"refused: {msg}")
        if self.mo:
            self.mo.send_message(msg)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("engine")
    ap.add_argument("--track", type=int, required=True, help="instrument track 1-8 (= MIDI channel)")
    ap.add_argument("--notes", default=f"{A3}", help="default notes, comma-separated MIDI numbers")
    ap.add_argument("--hold", type=float, default=2.0)
    ap.add_argument("--gap", type=float, default=0.6)
    ap.add_argument("--send", action="store_true", help="really send (after the owner's go-ahead)")
    ap.add_argument("--no-record", action="store_true")
    args = ap.parse_args()
    if not 1 <= args.track <= 8:
        raise SystemExit("--track must be an instrument track, 1-8")
    ch = args.track - 1
    notes = [int(n) for n in args.notes.split(",")]
    plan = takes(args.engine)
    seconds = sum(
        ((hold or args.hold) + (gap or args.gap)) * len(n or notes) + 0.15 for _, _, n, hold, gap in plan
    )
    print(f"{args.engine}: {len(plan)} takes on track {args.track}, about {seconds / 60:.1f} min")
    if not args.send:
        for take, ccs, n, hold, gap in plan:
            timing = f" hold {hold:.1f} s" if hold else ""
            timing += f" gap {gap:.1f} s" if gap else ""
            print(f"  {take}: CC {({**NEUTRAL, **ccs})} notes {n or notes}{timing}")
        print("dry run: nothing sent (add --send once the owner has approved)")
        return

    stamp = datetime.datetime.now().strftime("%Y-%m-%d-%H%M%S")
    folder = CAPTURES / f"{stamp}-{args.engine}"
    folder.mkdir(parents=True, exist_ok=True)
    midi = Midi(send=True)
    recorder = None
    if not args.no_record:
        recorder = subprocess.Popen(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "avfoundation", "-i", ":OP-XY",
             "-ac", "2", "-ar", "44100", "-y", str(folder / "audio.wav")],
            stdin=subprocess.PIPE,
        )
        time.sleep(1.0)
    t0 = time.perf_counter()
    cues = []
    try:
        for take, ccs, n, hold, gap in plan:
            for cc, value in {**NEUTRAL, **ccs}.items():
                midi.send([0xB0 | ch, cc, value])
            time.sleep(0.15)
            for note in n or notes:
                on = time.perf_counter() - t0
                midi.send([0x90 | ch, note, 100])
                time.sleep(hold or args.hold)
                off = time.perf_counter() - t0
                midi.send([0x80 | ch, note, 0])
                time.sleep(gap or args.gap)
                cues.append({"take": take, "cc": {**NEUTRAL, **ccs}, "note": note, "on": on, "off": off})
            print(f"  {take}")
    finally:
        midi.send([0xB0 | ch, 123, 0])
        if recorder:
            time.sleep(1.0)
            recorder.communicate(b"q")
        sheet = {
            "engine": args.engine,
            "track": args.track,
            "firmware": "1.1.33",
            "started": stamp,
            "hold": args.hold,
            "cues": cues,
        }
        (folder / "cues.json").write_text(json.dumps(sheet, indent=1))
        print(f"wrote {folder} ({len(cues)} cues)")


if __name__ == "__main__":
    sys.exit(main())
