"""Step-by-step screen captures with the owner (docs/research/59-screen-profiling.md): the owner
presses keys to reach a page, this tool turns that page's parameters over MIDI and saves the screen
once each change shows (the camera runs about 0.8 s behind), labelled.

Sends only the allow-listed CCs below, on the given channel: parameter lanes a track answers on
its own channel, plus track select (CC102, channel 1), tempo and groove (CC80/81), scene (CC85) and
master EQ (CC90, channels 1-4). No notes, no SysEx, no project load (CC86), no remote keys.
Every message and capture is appended to captures/screens/steps.json.

  uv run --with python-rtmidi --with opencv-python-headless --with numpy \
      python research/device/stepcap.py snap LABEL
      python research/device/stepcap.py cc CHANNEL CC V1 [V2 ...] --label LABEL
"""

import json
import sys
import time

import cv2
import numpy as np
import rtmidi

import screencap

# CC -> what it is (all on a track's channel unless noted)
ALLOWED = {7: "level", 9: "mute", 10: "pan", **{c: "M1 P" + str(c - 11) for c in range(12, 16)},
           **{c: "envelope" for c in range(20, 28)}, 28: "play mode", 29: "portamento",
           30: "bend range", 31: "preset volume", 32: "cutoff", 33: "resonance",
           34: "envelope amount", 35: "key tracking", 36: "send ext", 37: "send tape",
           38: "send FX I", 39: "send FX II", 40: "LFO 1", 41: "LFO 2", 42: "LFO 3", 43: "LFO 4",
           80: "tempo", 81: "groove", 85: "scene", 90: "master EQ", 102: "track select (ch1)"}
LOG = screencap.SCREENS / "steps.json"


def log_entry(entry: dict) -> None:
    data = json.loads(LOG.read_text()) if LOG.exists() else []
    data.append(entry)
    LOG.write_text(json.dumps(data, indent=1))


def next_name(label: str) -> str:
    data = json.loads(LOG.read_text()) if LOG.exists() else []
    n = sum(1 for e in data if "file" in e) + 1
    safe = "".join(ch if ch.isalnum() or ch in "-_" else "-" for ch in label)
    return f"steps-{n:03d}-{safe}"


def save(label: str, calib: dict, extra: dict) -> str:
    frames = screencap.fresh(3)
    mean = np.mean([f.astype(np.float32) for f in frames], axis=0)
    name = next_name(label)
    cv2.imwrite(str(screencap.SCREENS / f"{name}.png"), screencap.rectify(mean, calib, 2))
    cv2.imwrite(str(screencap.SCREENS / f"{name}-raw.jpg"), frames[-1])
    log_entry({"file": f"{name}.png", "label": label, "time": time.strftime("%H:%M:%S"), **extra})
    return name


def snap(label: str) -> None:
    calib = screencap.load_calib()
    # wait until the screen holds still (anything the owner just pressed has reached the camera)
    (img,) = screencap.fresh(1)
    last = screencap.rectify(img, calib)
    t0 = time.time()
    while time.time() - t0 < 4:
        (img,) = screencap.fresh(1)
        now = screencap.rectify(img, calib)
        if screencap.changed_pixels(now, last) <= 5 and time.time() - t0 > 1.0:
            break
        last = now
    print(save(label, calib, {"kind": "snap"}), flush=True)


def cc(channel: int, number: int, values: list[int], label: str) -> None:
    if number not in ALLOWED:
        raise SystemExit(f"CC{number} is not allow-listed")
    if number == 102 and channel != 1:
        raise SystemExit("track select goes on channel 1")
    if number == 90 and not 1 <= channel <= 4:
        raise SystemExit("master EQ uses channels 1-4")
    if not all(0 <= v <= 127 for v in values) or not 1 <= channel <= 16:
        raise SystemExit("bad channel or value")
    out = rtmidi.MidiOut()
    port = next((i for i, p in enumerate(out.get_ports()) if "OP-XY" in p), None)
    if port is None:
        raise SystemExit("no OP-XY port")
    out.open_port(port)
    calib = screencap.load_calib()
    try:
        for v in values:
            (img,) = screencap.fresh(1)
            before = screencap.rectify(img, calib)
            out.send_message([0xB0 | (channel - 1), number, v])
            sent = {"t": round(time.time(), 3), "channel": channel, "cc": number, "value": v}
            seen = screencap.settle(before, calib)
            name = save(f"{label}-cc{number}-{v:03d}", calib, {"kind": "cc", "sent": sent, **seen})
            flag = "" if seen["changed"] else "  (no visible change)"
            print(f"{name}  {seen['latency']:.2f}s{flag}", flush=True)
    finally:
        out.close_port()


def main() -> None:
    args = sys.argv[1:]
    label = args[args.index("--label") + 1] if "--label" in args else None
    if args[:1] == ["snap"] and len(args) >= 2:
        snap(args[1])
    elif args[:1] == ["cc"] and len(args) >= 4 and label:
        rest = [a for a in args[1:args.index("--label")]]
        cc(int(rest[0]), int(rest[1]), [int(v) for v in rest[2:]], label)
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main()
