"""Synth calibration capture (docs/research/57-synth-engines.md §6). NEEDS THE OWNER'S GO-AHEAD.

Plays parameter sweeps into one track of a throwaway project over MIDI while the OP-XY's USB
audio is recorded (PortAudio, in this process, so every note is stamped with the recording frame it
was sent at), and writes a cue sheet so each take can be cut out and compared with our engines. Only control changes 12-15 (engine) and 20-35 (envelopes, play mode, filter), notes and
all-notes-off are ever sent; anything else is refused. Dry run by default: prints the plan (every
message and when) and sends nothing.

Before --send, on the device: a NEW project (nothing saved, loaded or deleted), the track's engine
chosen by hand, its filter and LFO switched off and its amp envelope set by hand (attack 0, sustain
full, release 0: envelope CCs are not sent, as CC20-23 seem to follow whichever envelope M2 shows).
Log the session in docs/research/90-device-probe.md.

Usage (uv run --with python-rtmidi --with sounddevice --with numpy --with scipy python \
       research/device/synth_capture.py …):
  ENGINE --track N [--notes 45,69] [--hold 1.2] [--gap 0.5] [--send] [--no-record]
  ENGINE is one of: test prism axis dissolve wavetable epiano organ hardsync simple envelopes
"""

import argparse
import datetime
import json
import math
import os
import pathlib
import sys
import time

CAPTURES = pathlib.Path(__file__).parent / "captures" / "synth"
# what may be sent: engine params; track select (CC102) once at the start; all notes off to finish.
# Filter, LFO and envelope are set by hand on the device; none of their CCs is sent.
ALLOWED_CC = set(range(12, 16)) | {102, 123}
# channel N reaches track N, notes and CCs alike, whichever track is selected; channel 1 is also
# the "active track channel" for notes (stock MIDI settings). CC102 on channel 1 selects the track,
# zero-based, so the device shows the track being recorded (all verified on 1.1.33, 2026-09-27,
# docs/research/90-device-probe.md)
ACTIVE_CHANNEL = 0

A1, A2, A3, A4, A5, A6 = 33, 45, 57, 69, 81, 93


def pct(value: float) -> int:
    """A screen value 0-100 as a CC value (assumes a linear map; the session checks it first)."""
    return max(0, min(127, round(value * 127 / 100)))


def step(k: int, steps: int) -> int:
    """The CC value in the middle of zone k of a stepped parameter with `steps` zones."""
    return max(0, min(127, round((k + 0.5) * 128 / steps)))


SWEEP = [pct(v) for v in range(0, 101, 10)]

# nothing but the engine's own parameters is sent per take (the voice is set up by hand)
NEUTRAL: dict[int, int] = {}


def expected(cc_value: int) -> float:
    """Seconds an envelope stage should take at a CC value (the community's attack law)."""
    return 0.0111 * (math.exp(10.386 * cc_value / 127) - 1) + 0.002


def timed(seconds: float) -> float:
    """Time to leave for a stage expected to take `seconds`, with room to see it settle."""
    return max(2.0, min(25.0, 1.3 * seconds + 0.5))


# a take: id, CCs on top of NEUTRAL, notes (None: the default ones), and hold/gap overrides
Take = tuple[str, dict[int, int], list[int] | None, float | None, float | None]


def takes(engine: str, plan: str | None = None) -> list[Take]:
    out: list[Take] = []

    def sweep(name: str, cc: int, base: dict[int, int], values=SWEEP, notes=None):
        for v in values:
            add(f"{name}={v}", {**base, cc: v}, notes)

    def add(name, ccs, notes=None, hold=None, gap=None):
        out.append((name, ccs, notes, hold, gap))

    if plan == "stereo":
        # long notes: the stereo movement is slow (about a hertz)
        for v in (0, 16, 32, 48, 64, 80, 96, 112, 127):
            add(f"stereo={v}", {12: 0, 13: step(1, 9) if engine == "prism" else 0, 14: 0, 15: v}, [A2, A4], hold=4.0)
    elif plan is not None:
        raise SystemExit(f"unknown plan {plan!r}")
    elif engine == "test":
        add("test", {}, [A3])
    elif engine == "prism":
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
                add(f"shape={shape}.pw={pw}", {**base, 12: pct(shape), 13: pct(pw)})
        sweep("stereo", 15, base, values=[0, pct(50), 127], )
        sweep("noise", 14, base, )
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
    ap.add_argument("--plan", help="another plan for the engine (stereo)")
    ap.add_argument("--track", type=int, required=True, help="instrument track 1-8 (selected by CC102)")
    ap.add_argument("--notes", default=f"{A2},{A4}", help="default notes, comma-separated MIDI numbers")
    ap.add_argument("--hold", type=float, default=1.2)
    ap.add_argument("--gap", type=float, default=0.5)
    ap.add_argument("--send", action="store_true", help="really send (after the owner's go-ahead)")
    ap.add_argument("--no-record", action="store_true")
    args = ap.parse_args()
    if not 1 <= args.track <= 8:
        raise SystemExit("--track must be an instrument track, 1-8")
    ch = args.track - 1
    notes = [int(n) for n in args.notes.split(",")]
    plan = takes(args.engine, args.plan)
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
    folder = CAPTURES / f"{stamp}-{args.engine}" if not args.plan else CAPTURES / f"{stamp}-{args.engine}-{args.plan}"
    folder.mkdir(parents=True, exist_ok=True)
    midi = Midi(send=True)
    recorder = None if args.no_record else Recorder()
    # show the track on the device; its own channel carries the notes and CCs
    midi.send([0xB0 | ACTIVE_CHANNEL, 102, args.track - 1])
    time.sleep(0.4)
    cues = []
    try:
        for take, ccs, n, hold, gap in plan:
            for cc, value in {**NEUTRAL, **ccs}.items():
                midi.send([0xB0 | ch, cc, value])
            time.sleep(0.15)
            for note in n or notes:
                on = recorder.frames if recorder else 0
                midi.send([0x90 | ch, note, 100])
                time.sleep(hold or args.hold)
                off = recorder.frames if recorder else 0
                midi.send([0x80 | ch, note, 0])
                time.sleep(gap or args.gap)
                cues.append({"take": take, "cc": {**NEUTRAL, **ccs}, "note": note, "on": on / RATE, "off": off / RATE})
            print(f"  {take}")
    finally:
        midi.send([0xB0 | ch, 123, 0])
        if recorder:
            time.sleep(1.0)
            recorder.save(folder / "audio.wav")
        sheet = {
            "engine": args.engine,
            "track": args.track,
            "firmware": "1.1.33",
            "started": stamp,
            "hold": args.hold,
            "clock": "recording frames",
            "cues": cues,
        }
        (folder / "cues.json").write_text(json.dumps(sheet, indent=1))
        print(f"wrote {folder} ({len(cues)} cues)")


RATE = 44100


class Recorder:
    """The OP-XY's USB audio, recorded in this process; `frames` is how much has arrived so far."""

    def __init__(self):
        import numpy as np
        import sounddevice as sd

        self.np = np
        self.chunks: list = []
        self.frames = 0
        device = next(i for i, d in enumerate(sd.query_devices()) if "OP-XY" in d["name"] and d["max_input_channels"] > 0)

        def take(indata, frames, _time, status):
            if status:
                print(f"  (audio: {status})")
            self.chunks.append(indata.copy())
            self.frames += frames

        self.stream = sd.InputStream(device=device, channels=2, samplerate=RATE, dtype="int16", callback=take)
        self.stream.start()
        time.sleep(0.5)

    def save(self, path: pathlib.Path) -> None:
        from scipy.io import wavfile

        self.stream.stop()
        self.stream.close()
        wavfile.write(path, RATE, self.np.concatenate(self.chunks))


if __name__ == "__main__":
    main()
    # everything is written; PortAudio's shutdown can hang on macOS, so leave without it
    sys.stdout.flush()
    os._exit(0)
