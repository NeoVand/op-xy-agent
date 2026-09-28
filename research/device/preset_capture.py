"""Plays a fixed phrase into tracks of the project the OP-XY has open and records its USB audio, for
comparing each track's sound with the replica's rendering of the same project (the owner's goal:
"load any of the factory presets and play it, and it should sound like OP-XY").

NEEDS THE OWNER'S GO-AHEAD before --send: the unit plays out loud. It sends note on / note off on
the channels given and a final all-notes-off on each, and nothing else (no CCs, program changes,
SysEx or transport): the project, its sounds and settings stay as they are. Dry run by default: it
prints every message and when, and sends nothing.

On the device first: the project to compare open (for example TE's "agent"), each track to play
given a MIDI channel on the project's midi page (T1-T8 -> channels 1-8, as for song_capture.py),
the transport stopped. Log the session in docs/research/90-device-probe.md.

The phrase, per track: three held notes an octave apart (C2, C3, C4 by default, 1.4 s each), a
C major triad (1.8 s), then eight short notes (a sixteenth each at 120 BPM) on C3, each followed
by room for its release. Drum tracks (--drum) get each of their 24 keys (53-76) once instead.
Every message is stamped with the audio frame it was sent at, so takes cut out exactly.

Writes captures/presets/<tag>.wav (stereo, 44.1 kHz, 16-bit) and <tag>.json (the plan, the
stamps and the channels).

Usage: uv run --with python-rtmidi --with sounddevice --with numpy --with scipy python \
       research/device/preset_capture.py TAG --channels 3,4 [--drum 2] [--root 36] [--send]
"""

import argparse
import json
import pathlib
import sys
import threading
import time

CAPTURES = pathlib.Path(__file__).parent / "captures" / "presets"
RATE = 44100
VELOCITY = 100
DRUM_KEYS = range(53, 77)


def phrase(root: int) -> list[tuple[float, float, list[int]]]:
    """(start s, length s, notes) for a synth track, from its first note."""
    events: list[tuple[float, float, list[int]]] = []
    t = 0.0
    for octave in range(3):
        events.append((t, 1.4, [root + 12 * octave]))
        t += 1.4 + 1.2
    events.append((t, 1.8, [root + 24, root + 28, root + 31]))
    t += 1.8 + 1.4
    sixteenth = 60 / 120 / 4
    for _ in range(8):
        events.append((t, sixteenth * 0.8, [root + 12]))
        t += sixteenth * 2
    return events


def drum_phrase() -> list[tuple[float, float, list[int]]]:
    return [(i * 0.7, 0.1, [key]) for i, key in enumerate(DRUM_KEYS)]


def plan(channels: list[int], drums: list[int], root: int) -> list[dict]:
    """Every message with its time, track after track, 2 s apart."""
    messages: list[dict] = []
    t0 = 1.0
    for channel in channels + drums:
        notes = drum_phrase() if channel in drums else phrase(root)
        for start, length, keys in notes:
            for key in keys:
                messages.append({"t": t0 + start, "bytes": [0x90 | (channel - 1), key, VELOCITY]})
                messages.append({"t": t0 + start + length, "bytes": [0x80 | (channel - 1), key, 0]})
        end = max(start + length for start, length, _ in notes)
        # all notes off on the channel once its tails are over
        messages.append({"t": t0 + end + 1.5, "bytes": [0xB0 | (channel - 1), 123, 0]})
        t0 += end + 2.0
    return sorted(messages, key=lambda m: m["t"])


def allowed(message: list[int]) -> bool:
    status = message[0] & 0xF0
    return status in (0x80, 0x90) or (status == 0xB0 and message[1] == 123)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("tag")
    parser.add_argument("--channels", default="", help="synth tracks' channels, e.g. 3,4")
    parser.add_argument("--drum", default="", help="drum tracks' channels, e.g. 2")
    parser.add_argument("--root", type=int, default=36, help="the lowest held note (C2 = 36)")
    parser.add_argument("--send", action="store_true", help="play it (the owner has agreed)")
    args = parser.parse_args()
    channels = [int(c) for c in args.channels.split(",") if c]
    drums = [int(c) for c in args.drum.split(",") if c]
    if not channels and not drums:
        sys.exit("give --channels and/or --drum")
    if any(not 1 <= c <= 16 for c in channels + drums):
        sys.exit("channels are 1-16")
    messages = plan(channels, drums, args.root)
    assert all(allowed(m["bytes"]) for m in messages)
    length = messages[-1]["t"] + 1.0
    print(f"{len(messages)} messages over {length:.1f} s on channels {channels + drums}")
    if not args.send:
        for m in messages[:12]:
            print(f"  {m['t']:7.3f} s  {' '.join(f'{b:02x}' for b in m['bytes'])}")
        print("  … dry run: nothing sent (add --send once the owner has agreed)")
        return

    import numpy as np
    import rtmidi
    import sounddevice as sd
    from scipy.io import wavfile

    CAPTURES.mkdir(parents=True, exist_ok=True)
    out = rtmidi.MidiOut()
    port = next((i for i, p in enumerate(out.get_ports()) if "OP-XY" in p), None)
    if port is None:
        sys.exit("no OP-XY MIDI output (is it out of MTP mode?)")
    device = next(
        (i for i, d in enumerate(sd.query_devices()) if "OP-XY" in d["name"] and d["max_input_channels"] > 0),
        None,
    )
    if device is None:
        sys.exit("no OP-XY audio input")
    out.open_port(port)
    chunks: list = []
    frames = [0]
    lock = threading.Lock()

    def take_audio(indata, count, _time, status):
        if status:
            print(f"  (audio: {status})")
        with lock:
            chunks.append(indata.copy())
            frames[0] += count

    stamps: list[dict] = []
    stream = sd.InputStream(device=device, channels=2, samplerate=RATE, dtype="int16", callback=take_audio)
    stream.start()
    started = time.perf_counter()
    try:
        for m in messages:
            wait = m["t"] - (time.perf_counter() - started)
            if wait > 0:
                time.sleep(wait)
            out.send_message(m["bytes"])
            with lock:
                stamps.append({"frame": frames[0], "t": round(time.perf_counter() - started, 5), "bytes": m["bytes"]})
        time.sleep(1.0)
    finally:
        # whatever happened, nothing is left sounding
        for channel in channels + drums:
            out.send_message([0xB0 | (channel - 1), 123, 0])
        stream.stop()
        stream.close()
        out.close_port()
    audio = np.concatenate(chunks) if chunks else np.zeros((0, 2), dtype="int16")
    wav = CAPTURES / f"{args.tag}.wav"
    wavfile.write(wav, RATE, audio)
    summary = {
        "channels": channels,
        "drums": drums,
        "root": args.root,
        "seconds": round(len(audio) / RATE, 2),
        "peak": int(np.abs(audio).max()) if len(audio) else 0,
    }
    (CAPTURES / f"{args.tag}.json").write_text(json.dumps({"summary": summary, "stamps": stamps}))
    print(json.dumps(summary, indent=1))
    print(f"wrote {wav} and {wav.with_suffix('.json')}")


if __name__ == "__main__":
    main()
