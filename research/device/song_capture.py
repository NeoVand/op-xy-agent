"""Records the OP-XY playing: every MIDI message it sends and its USB audio. SENDS NOTHING.

For comparing a whole song on the unit with the replica (docs/research/90-device-probe.md). Set up by
hand on the unit: com → system settings → midi → clock "both" (start, stop and clock out), and give
each instrument track a MIDI channel on the project's midi page (T1–T8 → channels 1–8), so every
note the sequencer plays goes out on its track's channel. Then start this: it arms and records
until the unit stops (its own stop message, then 3 s for the tails), or for at most --seconds.

Each MIDI message is stamped with the audio frame it arrived at, so notes, clock and sound share one
timeline. Until the unit starts, only the last few seconds are kept (--preroll), so it can wait long
for the owner. Writes captures/song/<tag>.wav (stereo, 44.1 kHz, 16-bit) and captures/song/<tag>.json
(the messages, their frames and seconds, and a summary). Ctrl-C also ends the take.

Usage: uv run --with python-rtmidi --with sounddevice --with numpy --with scipy python \
       research/device/song_capture.py TAG [--seconds 300] [--preroll 5]
"""

import argparse
import json
import pathlib
import sys
import time

CAPTURES = pathlib.Path(__file__).parent / "captures" / "song"
RATE = 44100


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("tag")
    parser.add_argument("--seconds", type=float, default=300, help="the longest wait plus take")
    parser.add_argument("--preroll", type=float, default=5, help="seconds kept from before the start")
    args = parser.parse_args()

    import numpy as np
    import rtmidi
    import sounddevice as sd
    from scipy.io import wavfile

    CAPTURES.mkdir(parents=True, exist_ok=True)
    midi_in = rtmidi.MidiIn()
    port = next((i for i, p in enumerate(midi_in.get_ports()) if "OP-XY" in p), None)
    if port is None:
        sys.exit("no OP-XY MIDI input (is it out of MTP mode?)")
    device = next(
        (i for i, d in enumerate(sd.query_devices()) if "OP-XY" in d["name"] and d["max_input_channels"] > 0),
        None,
    )
    if device is None:
        sys.exit("no OP-XY audio input")

    chunks: list = []
    frames = [0]
    # frames dropped from the front while waiting for the start (the recording begins after them)
    dropped = 0
    events: list[dict] = []
    # rtmidi's own delta times, summed: a finer MIDI timeline than the audio blocks' frames
    clock = [0.0]

    def take_audio(indata, count, _time, status):
        if status:
            print(f"  (audio: {status})")
        chunks.append(indata.copy())
        frames[0] += count

    def take_midi(message, _data):
        data, delta = message
        clock[0] += delta
        events.append({"frame": frames[0], "midi_t": round(clock[0], 5), "bytes": data})

    midi_in.ignore_types(sysex=True, timing=False, active_sense=True)
    midi_in.set_callback(take_midi)
    midi_in.open_port(port)
    stream = sd.InputStream(device=device, channels=2, samplerate=RATE, dtype="int16", callback=take_audio)
    stream.start()
    print(f"armed for up to {args.seconds:.0f} s: press play on the OP-XY; stop it to end the recording")
    started = time.time()
    stopped_at = None
    try:
        while time.time() - started < args.seconds:
            time.sleep(0.25)
            kinds = [e["bytes"][0] for e in events]
            begun = next((i for i, k in enumerate(kinds) if k in (0xFA, 0xFB)), None)
            if begun is None:
                # still waiting: keep only the pre-roll (the callbacks only ever append)
                keep = int(args.preroll * RATE)
                while len(chunks) > 1 and frames[0] - dropped - len(chunks[0]) >= keep:
                    dropped += len(chunks.pop(0))
                cut = next((i for i, e in enumerate(events) if e["frame"] >= dropped), len(events))
                del events[:cut]
            # the unit's own stop, after its start, ends the take three seconds later (the tails)
            if stopped_at is None and begun is not None and 0xFC in kinds[begun:]:
                stopped_at = time.time()
                print("  stop seen: three more seconds for the tails", flush=True)
            if stopped_at is not None and time.time() - stopped_at > 3:
                break
    except KeyboardInterrupt:
        pass
    print()
    stream.stop()
    stream.close()
    midi_in.close_port()

    audio = np.concatenate(chunks) if chunks else np.zeros((0, 2), dtype="int16")
    wav = CAPTURES / f"{args.tag}.wav"
    wavfile.write(wav, RATE, audio)
    events = [e for e in events if e["frame"] >= dropped]
    for e in events:
        e["frame"] -= dropped
        e["t"] = round(e["frame"] / RATE, 4)
    channels: dict[int, int] = {}
    for e in events:
        status = e["bytes"][0]
        if 0x90 <= status <= 0x9F and e["bytes"][2] > 0:
            channels[(status & 0x0F) + 1] = channels.get((status & 0x0F) + 1, 0) + 1
    clocks = [e["midi_t"] for e in events if e["bytes"][0] == 0xF8]
    bpm = None
    if len(clocks) > 48:
        span = clocks[-1] - clocks[0]
        bpm = round(60 * (len(clocks) - 1) / 24 / span, 2) if span > 0 else None
    summary = {
        "seconds": round(len(audio) / RATE, 2),
        "messages": len(events),
        "notes_by_channel": dict(sorted(channels.items())),
        "starts": [e["t"] for e in events if e["bytes"][0] in (0xFA, 0xFB)],
        "stops": [e["t"] for e in events if e["bytes"][0] == 0xFC],
        "clock_bpm": bpm,
        "peak": int(np.abs(audio).max()) if len(audio) else 0,
    }
    (CAPTURES / f"{args.tag}.json").write_text(json.dumps({"summary": summary, "events": events}))
    print(json.dumps(summary, indent=1))
    print(f"wrote {wav} and {wav.with_suffix('.json')}")


if __name__ == "__main__":
    main()
