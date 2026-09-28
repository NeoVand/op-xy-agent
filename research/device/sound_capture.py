"""Filter, envelope and LFO capture (docs/QUESTIONS.md 5 and 7). NEEDS THE OWNER'S GO-AHEAD.

Plays takes into tracks 3-7 of a throwaway project over MIDI while the OP-XY's USB audio is recorded
(PortAudio, in this process: every note is stamped with the recording frame it was sent at) and
writes a cue sheet, like synth_capture.py. Dry run by default: prints the plan and sends nothing.

Setup by hand (types cannot be set over MIDI): a NEW project; the simple engine on T3-T7 (loaded
from the preset browser); filters T3 off, T4 ladder, T5 svf, T6 z lowpass, T7 z hipass; LFOs off.
For the lfo plan the owner then picks the LFO types: T3 tremolo, T4 value, T5 random, T6 duck,
T7 element. Everything else is sent: the engine's four values, both envelopes, play mode poly,
portamento off, the filter's four values, the sends at zero and (lfo plan) the LFO's four values.

Only these are ever sent: on the take's channel (3-7) CC 12-15, 20-39, 40-43, notes and all-notes-
off (CC123); on channel 1, CC102 (track select), CC80 (tempo, lfo plan), and for the duck takes
CC7 (T1's level) and T1's notes, which trigger the duck. No SysEx, program change, transport or
project load. Log each run in docs/research/90-device-probe.md.

Usage (uv run --with python-rtmidi --with sounddevice --with numpy --with scipy python \
       research/device/sound_capture.py …):
  PLAN [--only SUBSTRING] [--send] [--no-record]
  PLAN is one of: check filters lfo-check lfo envtop fade crossfade punchin

The hands-on plans play notes only while the owner changes a setting between runs: `fade` strikes
T1's highest drum key (E5, note 76; T1 selected so channel 1 reaches it), `crossfade` holds long
notes on T8 (a synth sampler loaded by hand), `punchin` loops a beat on T2 (the default drums)
and an arpeggio on T3 for two minutes while the owner holds each punch-in key on aux T2 in turn
(nothing on channel 1 then: its notes would play the selected punch-in track).
"""

import argparse
import datetime
import json
import math
import os
import pathlib
import signal
import sys
import time

CAPTURES = pathlib.Path(__file__).parent / "captures" / "sound"
RATE = 44100
# the one channel that is not a test track's: track select, tempo, and T1 (the duck's trigger)
CH1 = 0
TEST_TRACKS = {3, 4, 5, 6, 7}
# tracks that only ever get notes (the hands-on plans): T2's drums and T8's sampler
NOTE_TRACKS = {2, 8}
# the punch-in FX track (aux T2) listens on channel 10: its notes 53-76 fire the 24 effects
PUNCH_CH = 9
TRACK_CC = set(range(12, 16)) | set(range(20, 44)) | {123}
CH1_CC = {7, 80, 102, 123}

A1, A2, A3, A4, A5 = 33, 45, 57, 69, 81


def step(k: int, steps: int) -> int:
    """The CC value in the middle of zone k of a stepped parameter with `steps` zones."""
    return max(0, min(127, round((k + 0.5) * 128 / steps)))


def expected(cc_value: float) -> float:
    """Seconds an envelope stage takes at a CC value on the community's attack law."""
    return 0.0111 * (math.exp(10.386 * cc_value / 127) - 1) + 0.002


def timed(seconds: float) -> float:
    """Time to leave for a stage expected to take `seconds`, with room to see it settle."""
    return max(1.5, min(20.0, 1.3 * seconds + 0.5))


# simple on every test track: a saw (shape 0) or white noise (noise at full), no stereo movement
SAW = {12: 0, 13: 0, 14: 0, 15: 0}
NOISE = {12: 0, 13: 0, 14: 127, 15: 0}
# rectangular amp envelope (release 127 = none: the lane is the handle's position, higher is
# shorter), the filter envelope unused (amount 0), poly, no portamento, no sends
BASE = {
    20: 0, 21: 64, 22: 127, 23: 127,
    24: 0, 25: 64, 26: 127, 27: 127,
    28: 0, 29: 0,
    32: 127, 33: 0, 34: 0, 35: 0,
    36: 0, 37: 0, 38: 0, 39: 0,
}
FILTERS = {4: "ladder", 5: "svf", 6: "z lowpass", 7: "z hipass"}
LFO_TYPES = {3: "tremolo", 4: "value", 5: "random", 6: "duck", 7: "element"}


class Take:
    """One take: CCs over BASE on `track`, then `notes` one after another (each held `hold`, then
    `gap` of silence), or, for a duck take, one note held while T1 is struck at `strikes`. The
    device shows `track`, except in a duck take: notes on channel 1 play the selected track, so T1
    stays selected there (its own channel carries the held note either way)."""

    def __init__(self, name, track, ccs, notes, hold=1.5, gap=0.35, strikes=None, ch1=None):
        self.name = name
        self.track = track
        self.ccs = {**BASE, **ccs}
        self.notes = notes
        self.hold = hold
        self.gap = gap
        self.strikes = strikes or []
        self.ch1 = ch1 or {}
        self.select = 1 if self.strikes else track

    def seconds(self) -> float:
        return len(self.notes) * (self.hold + self.gap) + 0.3


def plan_check() -> list[Take]:
    """A few seconds on each test track: the owner confirms the screens and hears each voice."""
    out = []
    for t in sorted(TEST_TRACKS):
        out.append(Take(f"check.saw.t{t}", t, {**SAW, 32: 96}, [A3], hold=1.0))
        out.append(Take(f"check.noise.t{t}", t, {**NOISE, 32: 96}, [A3], hold=1.0))
    return out


def plan_filters() -> list[Take]:
    out: list[Take] = []
    add = lambda *a, **k: out.append(Take(*a, **k))
    # T3, filter off: the sources, then the amp envelope's laws on the saw
    add("ref.noise", 3, NOISE, [A1, A3, A5])
    add("ref.saw", 3, SAW, [A2, A3])
    for v in (0, 16, 32, 48, 64, 72, 80):
        add(f"env.attack={v}", 3, {**SAW, 20: v}, [A3], hold=timed(expected(v)))
    for v in (0, 16, 32, 48, 64, 72, 80):
        add(f"env.decay={v}.sus0", 3, {**SAW, 21: v, 22: 0}, [A3], hold=timed(expected(v)))
    for v in (127, 112, 96, 80, 64, 56, 48):
        add(f"env.release={v}", 3, {**SAW, 23: v}, [A3], hold=1.0, gap=timed(expected(127 - v)))
    for v in (0, 32, 64, 96, 127):
        add(f"env.sustain={v}", 3, {**SAW, 21: 32, 22: v}, [A3], hold=2.0)
    # each filter type: cutoff on noise, resonance on noise, the saw through a resonant filter
    for t, kind in FILTERS.items():
        for c in list(range(0, 128, 8)) + [127]:
            add(f"{kind}.cutoff={c}", t, {**NOISE, 32: c}, [A3])
        for c in (32, 64, 96):
            for r in (0, 32, 64, 96, 112, 127):
                add(f"{kind}.cutoff={c}.res={r}", t, {**NOISE, 32: c, 33: r}, [A3])
        for c in (32, 64, 96):
            for r in (0, 64, 127):
                add(f"{kind}.saw.cutoff={c}.res={r}", t, {**SAW, 32: c, 33: r}, [A2])
    # key tracking against the note, on the two most used types
    for t in (4, 5):
        for k in (0, 64, 127):
            add(f"{FILTERS[t]}.keytrack={k}", t, {**NOISE, 32: 64, 33: 80, 35: k}, [A1, A3, A5])
    # the filter envelope: how far each amount opens a closed svf, then its decay law
    for a in (0, 16, 32, 48, 64, 80, 96, 112, 127):
        add(f"svf.envamount={a}", 5, {**NOISE, 32: 0, 33: 64, 34: a, 25: 64, 26: 0}, [A3], hold=3.0)
    for d in (32, 48, 64, 80):
        add(f"svf.envdecay={d}", 5, {**NOISE, 32: 0, 33: 64, 34: 127, 25: d, 26: 0}, [A3],
            hold=timed(expected(d)))
    return out


def plan_lfo_check() -> list[Take]:
    """The LFO values we mean to send, one track at a time, for the owner to read off M4."""
    return [
        Take("lfo-check.tremolo.rest", 3, {**SAW, 40: 96, 41: 64, 42: 64, 43: 64}, [A3], hold=1.0),
        Take("lfo-check.value.filter-cutoff", 4, {**NOISE, 32: 64, 33: 80, 40: 96, 41: 64, 42: step(4, 6), 43: step(0, 4)}, [A3], hold=1.0),
        Take("lfo-check.random.filter-cutoff", 5, {**NOISE, 32: 64, 33: 80, 40: 96, 41: 64, 42: step(4, 6), 43: step(0, 4)}, [A3], hold=1.0),
        Take("lfo-check.duck.tr1", 6, {**SAW, 40: step(0, 17), 41: 64, 42: 32, 43: 32}, [A4], hold=1.0),
        Take("lfo-check.element.env-filter-cutoff", 7, {**NOISE, 32: 64, 33: 80, 40: step(2, 4), 41: 64, 42: step(2, 4), 43: step(0, 4)}, [A3], hold=1.0),
    ]


RATES = list(range(0, 128, 8)) + [127]


def plan_lfo() -> list[Take]:
    out: list[Take] = []
    add = lambda *a, **k: out.append(Take(*a, **k))
    slow = lambda c: 8.0 if 64 <= c < 80 else 4.0
    # T3 tremolo on the saw (filter off): rate by level, then the level and pitch depths, the env
    for c in RATES:
        add(f"tremolo.rate={c}", 3, {**SAW, 40: c, 41: 64, 42: 127, 43: 64}, [A3], hold=slow(c))
    for v in (0, 32, 48, 64, 80, 96, 112, 127):
        add(f"tremolo.vol={v}", 3, {**SAW, 40: 100, 41: 64, 42: v, 43: 64}, [A3], hold=3.0)
    for v in (0, 32, 64, 80, 96, 112, 127):
        add(f"tremolo.vib={v}", 3, {**SAW, 40: 100, 41: v, 42: 64, 43: 64}, [A3], hold=3.0)
    for v in (0, 32, 96, 127):
        add(f"tremolo.env={v}", 3, {**SAW, 40: 100, 41: 64, 42: 127, 43: v}, [A3], hold=4.0)
    # T4 value and T5 random on the filter's cutoff: the resonant peak on noise shows the wave
    wobble = {**NOISE, 32: 64, 33: 80, 42: step(4, 6), 43: step(0, 4)}
    for c in RATES:
        add(f"value.speed={c}", 4, {**wobble, 40: c, 41: 127}, [A3], hold=slow(c))
    for v in (0, 32, 64, 96, 127):
        add(f"value.amount={v}", 4, {**wobble, 40: 100, 41: v}, [A3], hold=3.0)
    add("value.retrigger", 4, {**wobble, 40: 80, 41: 127}, [A3, A3, A3], hold=1.2, gap=0.3)
    for c in range(0, 128, 16):
        add(f"random.speed={c}", 5, {**wobble, 40: c, 41: 127}, [A3], hold=slow(c))
    # T6 duck from T1 (silenced: its notes should still trigger): a held saw, T1 struck 4 times
    duck = {**SAW, 32: 127, 40: step(0, 17), 41: 127}
    strikes = [0.5, 2.0, 3.5, 5.0]
    for h in (0, 32, 64, 96, 127):
        add(f"duck.hold={h}", 6, {**duck, 42: h, 43: 32}, [A4], hold=6.0, strikes=strikes, ch1={7: 0})
    for r in (0, 32, 64, 96, 127):
        add(f"duck.release={r}", 6, {**duck, 42: 0, 43: r}, [A4], hold=6.0, strikes=strikes, ch1={7: 0})
    # in case the duck follows T1's audio rather than its notes: T1 audible (its kick is low; the
    # saw's harmonics above 300 Hz carry the dip)
    add("duck.audible", 6, {**duck, 42: 32, 43: 32}, [A4], hold=6.0, strikes=strikes, ch1={7: 100})
    # T7 element: the amp envelope (a 2 s attack) moving the z hipass's cutoff
    element = {**NOISE, 20: 64, 32: 64, 33: 80, 40: step(2, 4), 42: step(2, 4), 43: step(0, 4)}
    for v in (64, 96, 127, 32, 0):
        add(f"element.amount={v}", 7, {**element, 41: v}, [A3], hold=3.5)
    return out


def plan_envtop() -> list[Take]:
    """The top of the decay and release range on T3's saw (its tremolo's depths at zero)."""
    out: list[Take] = []
    quiet = {**SAW, 41: 64, 42: 64}
    for v, hold in ((88, 6.0), (96, 8.0), (104, 11.0), (112, 15.0), (120, 20.0), (127, 26.0)):
        out.append(Take(f"env.decay={v}.sus0", 3, {**quiet, 21: v, 22: 0}, [A3], hold=hold))
    for v, gap in ((40, 6.0), (32, 8.0), (16, 16.0), (0, 26.0)):
        out.append(Take(f"env.release={v}", 3, {**quiet, 23: v}, [A3], hold=1.0, gap=gap))
    return out


FADE_NOTE = 76


def plan_fade() -> list[Take]:
    # T1's own channel is channel 1; the take's CCs would go there too, so none are sent
    return [Take(f"fade.{FADE_NOTE}", 1, {}, [FADE_NOTE] * 3, hold=3.5, gap=1.5)]


CROSSFADE_NOTE = 57
CROSSFADE_HOLD = 5.0


def plan_crossfade() -> list[Take]:
    note, hold = CROSSFADE_NOTE, CROSSFADE_HOLD
    return [Take(f"crossfade.{note}", 8, {}, [note, note], hold=hold, gap=1.0)]


PLANS = {
    "check": plan_check,
    "filters": plan_filters,
    "lfo-check": plan_lfo_check,
    "lfo": plan_lfo,
    "envtop": plan_envtop,
    "fade": plan_fade,
    "crossfade": plan_crossfade,
}


def punchin_mix(midi: "Midi", recorder: "Recorder | None", sleep=time.sleep, lead=4.0, hold=2.0, gap=1.0) -> dict:
    """A loop at 120 BPM (drums on T2, a bass line on T3, a melody on T4, chords on T5, their LFOs
    at rest) with each punch-in key fired in turn on channel 10: 53-76, held `hold`, `gap` apart."""
    frames = lambda: recorder.frames if recorder else 0
    tone = {**SAW, **BASE, 23: 100, 41: 64, 42: 64}
    for ch, extra in ((2, {32: 127}), (3, {32: 104, 33: 20}), (4, {32: 96, 33: 10})):
        for cc, v in {**tone, **extra}.items():
            midi.send([0xB0 | ch, cc, v])
    eighth = 0.25
    events: list[tuple[float, list[int]]] = []
    keys = list(range(53, 77))
    total = lead + len(keys) * (hold + gap) + 4.0
    bass = [33, 33, 45, 33, 36, 36, 48, 31]
    melody = [69, None, 72, 76, 74, None, 72, 67]
    chords = [(57, 60, 64), (53, 57, 60), (55, 59, 62), (52, 55, 59)]
    for n in range(int(total / eighth)):
        t = n * eighth
        hits = [59] + ([53] if n % 4 == 0 else []) + ([57] if n % 8 == 4 else [])
        for d in hits:
            events += [(t, [0x90 | 1, d, 90]), (t + 0.2, [0x80 | 1, d, 0])]
        b = bass[n % 8]
        events += [(t, [0x90 | 2, b, 100]), (t + 0.2, [0x80 | 2, b, 0])]
        mel = melody[n % 8]
        if mel is not None:
            events += [(t, [0x90 | 3, mel, 80]), (t + 0.22, [0x80 | 3, mel, 0])]
        if n % 8 == 0:
            for c in chords[(n // 8) % 4]:
                events += [(t, [0x90 | 4, c, 70]), (t + 1.9, [0x80 | 4, c, 0])]
    presses = []
    for i, k in enumerate(keys):
        t = lead + i * (hold + gap)
        events += [(t, [0x90 | PUNCH_CH, k, 100]), (t + hold, [0x80 | PUNCH_CH, k, 0])]
        presses.append({"key": k, "index": i})
    events.sort(key=lambda e: (e[0], e[1][0] & 0xF0 == 0x90))
    start = time.monotonic()
    stamps: dict[tuple[int, int], float] = {}
    try:
        for t, msg in events:
            sleep(max(0.0, start + t - time.monotonic()))
            if msg[0] & 0x0F == PUNCH_CH:
                stamps[(msg[1], msg[0] & 0xF0)] = frames() / RATE
            midi.send(msg)
    finally:
        for ch in (1, 2, 3, 4, PUNCH_CH):
            midi.send([0xB0 | ch, 123, 0])
    for p in presses:
        p["on"] = stamps.get((p["key"], 0x90))
        p["off"] = stamps.get((p["key"], 0x80))
    return {"presses": presses, "lead": lead, "hold": hold, "gap": gap, "total": total}


def punchin_keys(midi: "Midi", recorder: "Recorder | None", keys: list[int], sleep=time.sleep, lead=8.0, hold=6.0, gap=2.0) -> dict:
    """Over the device's own playback (a factory project the owner plays): `lead` seconds of it
    alone, then each punch-in key held `hold` seconds on channel 10, `gap` apart."""
    frames = lambda: recorder.frames if recorder else 0
    presses = []
    start = time.monotonic()
    try:
        for i, k in enumerate(keys):
            t = lead + i * (hold + gap)
            sleep(max(0.0, start + t - time.monotonic()))
            on = frames() / RATE
            midi.send([0x90 | PUNCH_CH, k, 100])
            sleep(max(0.0, start + t + hold - time.monotonic()))
            off = frames() / RATE
            midi.send([0x80 | PUNCH_CH, k, 0])
            presses.append({"key": k, "index": k - 53, "on": on, "off": off})
            print(f"  key {k - 52}")
        sleep(max(0.0, start + lead + len(keys) * (hold + gap) - time.monotonic()))
    finally:
        midi.send([0xB0 | PUNCH_CH, 123, 0])
    return {"presses": presses, "lead": lead, "hold": hold, "gap": gap}


def punchin_loop(midi: "Midi", recorder: "Recorder | None", seconds: float, sleep=time.sleep) -> list[dict]:
    """Two minutes of a beat on T2 and an arpeggio on T3 at 120 BPM (eighth notes), T3's tremolo
    depths at zero; returns the eighths' stamps."""
    events = []
    frames = lambda: recorder.frames if recorder else 0
    kick, snare, hat = 53, 55, 57
    arp = [57, 60, 64, 69, 64, 60, 57, 52]
    for cc, v in {**SAW, **BASE, 32: 127, 41: 64, 42: 64}.items():
        midi.send([0xB0 | 2, cc, v])
    eighth = 0.25
    start = time.monotonic()
    try:
        for n in range(int(seconds / eighth)):
            sleep(max(0.0, start + n * eighth - time.monotonic()))
            drums = [hat] + ([kick] if n % 4 == 0 else []) + ([snare] if n % 8 == 4 else [])
            note = arp[n % len(arp)]
            events.append({"eighth": n, "at": frames() / RATE})
            for d in drums:
                midi.send([0x90 | 1, d, 90])
            midi.send([0x90 | 2, note, 90])
            sleep(eighth * 0.8)
            for d in drums:
                midi.send([0x80 | 1, d, 0])
            midi.send([0x80 | 2, note, 0])
    finally:
        midi.send([0xB0 | 1, 123, 0])
        midi.send([0xB0 | 2, 123, 0])
    return events


class Midi:
    """The OP-XY's MIDI out, refusing anything this script is not allowed to send."""

    def __init__(self, send: bool):
        self.mo = None
        self.sent: list[list[int]] = []
        if send:
            import rtmidi

            self.mo = rtmidi.MidiOut()
            port = next(i for i, p in enumerate(self.mo.get_ports()) if "OP-XY" in p)
            self.mo.open_port(port)

    def send(self, msg: list[int]) -> None:
        kind, ch = msg[0] & 0xF0, msg[0] & 0x0F
        if len(msg) != 3 or any(b > 0x7F for b in msg[1:]) or kind not in (0x80, 0x90, 0xB0):
            raise PermissionError(f"refused: {msg}")
        if ch == CH1:
            if kind == 0xB0 and msg[1] not in CH1_CC:
                raise PermissionError(f"CC{msg[1]} on channel 1 is not allowed")
        elif ch + 1 in TEST_TRACKS:
            if kind == 0xB0 and msg[1] not in TRACK_CC:
                raise PermissionError(f"CC{msg[1]} is not allowed on a test track")
        elif ch + 1 in NOTE_TRACKS:
            if kind == 0xB0 and msg[1] != 123:
                raise PermissionError(f"only notes go to track {ch + 1}")
        elif ch == PUNCH_CH:
            if kind == 0xB0 and msg[1] != 123:
                raise PermissionError("only notes go to the punch-in track")
            if kind in (0x80, 0x90) and not 53 <= msg[1] <= 76:
                raise PermissionError(f"note {msg[1]} is not a punch-in key")
        else:
            raise PermissionError(f"channel {ch + 1} is not a test track's")
        self.sent.append(msg)
        if self.mo:
            self.mo.send_message(msg)


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


def run(takes: list[Take], midi: Midi, recorder: Recorder | None, tempo: int | None, sleep=time.sleep) -> list[dict]:
    """Plays the takes; with a do-nothing `sleep` and a Midi that does not send, a dry run that
    checks every message against the allow-list."""
    cues: list[dict] = []
    frames = lambda: recorder.frames if recorder else 0
    selected = None
    playing: tuple[int, int] | None = None
    try:
        if tempo is not None:
            midi.send([0xB0 | CH1, 80, tempo])
        for t in sorted({tk.track for tk in takes} & (TEST_TRACKS | NOTE_TRACKS)):
            midi.send([0xB0 | (t - 1), 123, 0])
        for take in takes:
            ch = take.track - 1
            if take.select != selected:
                midi.send([0xB0 | CH1, 102, take.select - 1])
                selected = take.select
            for cc, value in (take.ccs.items() if take.track in TEST_TRACKS else ()):
                midi.send([0xB0 | ch, cc, value])
            for cc, value in take.ch1.items():
                midi.send([0xB0 | CH1, cc, value])
            sleep(0.3)
            for note in take.notes:
                on = frames()
                midi.send([0x90 | ch, note, 100])
                playing = (ch, note)
                start = time.monotonic()
                struck = []
                for at in take.strikes:
                    sleep(max(0.0, start + at - time.monotonic()))
                    struck.append(frames() / RATE)
                    midi.send([0x90 | CH1, 53, 100])
                    sleep(0.05)
                    midi.send([0x80 | CH1, 53, 0])
                sleep(max(0.0, start + take.hold - time.monotonic()))
                off = frames()
                midi.send([0x80 | ch, note, 0])
                playing = None
                sleep(take.gap)
                cue = {"take": take.name, "track": take.track, "cc": take.ccs, "note": note, "on": on / RATE, "off": off / RATE}
                if struck:
                    cue["strikes"] = struck
                cues.append(cue)
            print(f"  {take.name}")
    finally:
        if playing is not None:
            midi.send([0x80 | playing[0], playing[1], 0])
        for t in sorted({tk.track for tk in takes}):
            midi.send([0xB0 | (t - 1), 123, 0])
    return cues


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("plan", choices=sorted(PLANS) + ["punchin", "punchin-mix", "punchin-keys"])
    ap.add_argument("--keys", default="1-24", help="punchin-keys: which keys, e.g. 1-24 or 13-24")
    ap.add_argument("--gap", type=float, default=2.0, help="punchin-keys: plain playback between keys")
    ap.add_argument("--seconds", type=float, default=120.0, help="punchin: how long the loop runs")
    ap.add_argument("--tag", default="", help="added to the capture folder's name (e.g. the setting the owner made)")
    ap.add_argument("--note", type=int, default=76, help="fade: the drum key to strike (53-76); crossfade: the note")
    ap.add_argument("--hold", type=float, default=5.0, help="crossfade: how long each note is held")
    ap.add_argument("--only", help="takes whose name contains this")
    ap.add_argument("--send", action="store_true", help="really send (after the owner's go-ahead)")
    ap.add_argument("--no-record", action="store_true")
    args = ap.parse_args()
    global FADE_NOTE, CROSSFADE_NOTE, CROSSFADE_HOLD
    if args.plan == "fade" and not 53 <= args.note <= 76:
        raise SystemExit("--note must be one of T1's drum keys, 53-76")
    FADE_NOTE = args.note
    if args.plan == "crossfade":
        CROSSFADE_NOTE = args.note if args.note != 76 else 57
        CROSSFADE_HOLD = args.hold
    if args.plan == "punchin-keys":
        lo, hi = (int(v) for v in args.keys.split("-"))
        if not 1 <= lo <= hi <= 24:
            raise SystemExit("--keys must be within 1-24")
        keys = [52 + k for k in range(lo, hi + 1)]
        hold = args.hold if args.hold != 5.0 else 6.0
        midi = Midi(send=args.send)
        if not args.send:
            punchin_keys(midi, None, keys, sleep=lambda _s: None, hold=hold, gap=args.gap)
            total = 8.0 + len(keys) * (hold + args.gap)
            print(f"punchin-keys: keys {lo}-{hi}, {total:.0f} s; dry run: {len(midi.sent)} messages would pass the allow-list; nothing sent")
            return
        stamp = datetime.datetime.now().strftime("%Y-%m-%d-%H%M%S")
        folder = CAPTURES / f"{stamp}-punchin-keys{'-' + args.tag if args.tag else ''}"
        folder.mkdir(parents=True, exist_ok=True)
        recorder = None if args.no_record else Recorder()
        info = {}
        try:
            info = punchin_keys(midi, recorder, keys, hold=hold, gap=args.gap)
        finally:
            if recorder:
                time.sleep(1.0)
                recorder.save(folder / "audio.wav")
            (folder / "cues.json").write_text(json.dumps({"plan": "punchin-keys", "firmware": "1.1.33", "started": stamp, **info, "messages": len(midi.sent)}, indent=1))
            print(f"wrote {folder} ({len(midi.sent)} messages)")
        return
    if args.plan == "punchin-mix":
        midi = Midi(send=args.send)
        if not args.send:
            info = punchin_mix(midi, None, sleep=lambda _s: None)
            chans = sorted({(m[0] & 0x0F) + 1 for m in midi.sent})
            print(f"punchin-mix: {info['total']:.0f} s; dry run: {len(midi.sent)} messages would pass the allow-list (channels {chans}); nothing sent")
            return
        stamp = datetime.datetime.now().strftime("%Y-%m-%d-%H%M%S")
        folder = CAPTURES / f"{stamp}-punchin-mix"
        folder.mkdir(parents=True, exist_ok=True)
        recorder = None if args.no_record else Recorder()
        info: dict = {}
        try:
            info = punchin_mix(midi, recorder)
        finally:
            if recorder:
                time.sleep(1.0)
                recorder.save(folder / "audio.wav")
            (folder / "cues.json").write_text(json.dumps({"plan": "punchin-mix", "firmware": "1.1.33", "started": stamp, **info, "messages": len(midi.sent)}, indent=1))
            print(f"wrote {folder} ({len(midi.sent)} messages)")
        return
    if args.plan == "punchin":
        midi = Midi(send=args.send)
        if not args.send:
            punchin_loop(midi, None, args.seconds, sleep=lambda _s: None)
            print(f"punchin: {args.seconds:.0f} s loop; dry run: {len(midi.sent)} messages would pass the allow-list; nothing sent")
            return
        stamp = datetime.datetime.now().strftime("%Y-%m-%d-%H%M%S")
        folder = CAPTURES / f"{stamp}-punchin"
        folder.mkdir(parents=True, exist_ok=True)
        recorder = None if args.no_record else Recorder()
        events = []
        try:
            events = punchin_loop(midi, recorder, args.seconds)
        finally:
            if recorder:
                time.sleep(1.0)
                recorder.save(folder / "audio.wav")
            (folder / "cues.json").write_text(json.dumps({"plan": "punchin", "firmware": "1.1.33", "started": stamp, "eighths": events, "messages": len(midi.sent)}, indent=1))
            print(f"wrote {folder} ({len(events)} eighths, {len(midi.sent)} messages)")
        return
    takes = PLANS[args.plan]()
    if args.only:
        takes = [t for t in takes if args.only in t.name]
    for t in takes:
        if t.track not in TEST_TRACKS and not (t.track in (1, 8) and args.plan in ("fade", "crossfade")):
            raise SystemExit(f"{t.name}: track {t.track} is not a test track")
    seconds = sum(t.seconds() for t in takes)
    tempo = 60 if args.plan.startswith("lfo") else None
    print(f"{args.plan}: {len(takes)} takes, about {seconds / 60:.1f} min")
    if not args.send:
        for t in takes:
            extra = f" strikes T1 at {t.strikes}" if t.strikes else ""
            print(f"  T{t.track} {t.name}: notes {t.notes} hold {t.hold:.1f} s{extra}")
        midi = Midi(send=False)
        run(takes, midi, None, tempo, sleep=lambda _s: None)
        ccs = sorted({m[1] for m in midi.sent if m[0] & 0xF0 == 0xB0})
        channels = sorted({(m[0] & 0x0F) + 1 for m in midi.sent})
        print(f"dry run: {len(midi.sent)} messages would pass the allow-list (CCs {ccs}, channels {channels}); nothing sent")
        return
    stamp = datetime.datetime.now().strftime("%Y-%m-%d-%H%M%S")
    folder = CAPTURES / f"{stamp}-{args.plan}{'-' + args.tag if args.tag else ''}"
    folder.mkdir(parents=True, exist_ok=True)
    midi = Midi(send=True)
    recorder = None if args.no_record else Recorder()
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(1))
    cues: list[dict] = []
    try:
        cues = run(takes, midi, recorder, tempo)
    finally:
        if recorder:
            time.sleep(1.0)
            recorder.save(folder / "audio.wav")
        sheet = {
            "plan": args.plan,
            "firmware": "1.1.33",
            "started": stamp,
            "clock": "recording frames",
            "filters": FILTERS,
            "lfo_types": LFO_TYPES if args.plan.startswith("lfo") else None,
            "messages": len(midi.sent),
            "cues": cues,
        }
        (folder / "cues.json").write_text(json.dumps(sheet, indent=1))
        print(f"wrote {folder} ({len(cues)} cues, {len(midi.sent)} messages)")


if __name__ == "__main__":
    main()
    # everything is written; PortAudio's shutdown can hang on macOS, so leave without it
    sys.stdout.flush()
    os._exit(0)
