"""Camera-assisted MIDI sweep: find messages that visibly change the OP-XY (screen or LEDs).

A camera (default: the Mac's Desk View camera, which looks down at the desk) watches the device.
For each candidate message we grab a "before" frame, send the message, grab an "after" frame and
measure the change inside regions of interest (ROIs: the screen, the LED rows). Anything above the
noise floor is logged with before/after images in research/device/captures/cam/.

SAFETY: only messages from the explicit candidate generators below are sent. Never CC86 (project
load), never CC120–127 (channel mode: local control off, omni/mono/poly), never TE SysEx, never
Program Change. Run in a scratch project; the owner watches.

Usage (uv run --with python-rtmidi --with numpy --with pillow python research/device/camsweep.py …):
  devices                         list cameras
  calib [--cam N]                 save captures/cam/calib.jpg (to choose ROIs)
  sweep PLAN [--cam N] [--roi x,y,w,h ...] [--threshold T]
PLANS:
  rk-channels   CC106/107 press of key 5 (mix) on channels 1–16
  rk-keys       CC106/107 presses of a few visible keys on channel 1 (tempo, com, M2, track 3)
  cc-unknown    CCs not yet mapped (value 127 then 0) on channel 1
  mmc           MIDI Machine Control: stop, play, deferred play, record strobe, record exit, pause
  notes16       notes 0–127 on channel 16 (possible key-trigger layer), velocity 100
"""

import datetime
import io
import json
import pathlib
import subprocess
import sys
import time

import numpy as np
import rtmidi
from PIL import Image

OUT = pathlib.Path(__file__).parent / "captures" / "cam"
FORBIDDEN_CC = {86} | set(range(120, 128))
KNOWN_CC = {7, 9, 10, 46, 80, 81, 82, 83, 84, 85, 90, 102, 104, 105, 106, 107} | set(range(12, 44))


def arg(name: str, default=None, cast=str):
    if name in sys.argv:
        return cast(sys.argv[sys.argv.index(name) + 1])
    return default


def grab(cam: int) -> np.ndarray:
    """One frame from an AVFoundation camera as a float32 grey image."""
    raw = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "avfoundation", "-framerate", "30",
         "-video_size", "1280x720", "-i", f"{cam}:none", "-frames:v", "1", "-f", "image2pipe",
         "-vcodec", "mjpeg", "-"],
        capture_output=True, check=True, timeout=15).stdout
    return np.asarray(Image.open(io.BytesIO(raw)).convert("L"), dtype=np.float32)


def rois_from_args(shape) -> list[tuple[int, int, int, int]]:
    rois = []
    for i, a in enumerate(sys.argv):
        if a == "--roi":
            x, y, w, h = map(int, sys.argv[i + 1].split(","))
            rois.append((x, y, w, h))
    return rois or [(0, 0, shape[1], shape[0])]


def change(a: np.ndarray, b: np.ndarray, rois) -> float:
    return max(float(np.mean(np.abs(a[y:y + h, x:x + w] - b[y:y + h, x:x + w]))) for x, y, w, h in rois)


def guard(msg: list[int]) -> None:
    if msg and msg[0] == 0xF0 and msg[1:4] == [0x00, 0x20, 0x76]:
        raise PermissionError("TE SysEx is never sent by camsweep")
    if (msg[0] & 0xF0) == 0xB0 and msg[1] in FORBIDDEN_CC:
        raise PermissionError(f"CC{msg[1]} is forbidden")
    if (msg[0] & 0xF0) == 0xC0:
        raise PermissionError("program change is forbidden")


def plans(name: str):
    """Yields (label, [messages], gap_seconds)."""
    if name == "rk-channels":
        for ch in range(16):
            yield f"rk mix ch{ch + 1}", [[0xB0 | ch, 106, 5], [0xB0 | ch, 107, 5]], 0.2
    elif name == "rk-keys":
        for label, key in (("tempo", 1), ("com", 24), ("M2", 7), ("track3", 16)):
            yield f"rk {label} ch1", [[0xB0, 106, key], [0xB0, 107, key]], 0.2
    elif name == "cc-unknown":
        for cc in range(0, 120):
            if cc in KNOWN_CC or cc in FORBIDDEN_CC:
                continue
            yield f"cc{cc}=127,0 ch1", [[0xB0, cc, 127], [0xB0, cc, 0]], 0.25
    elif name == "mmc":
        for label, cmd in (("stop", 0x01), ("play", 0x02), ("deferred play", 0x03), ("record strobe", 0x06),
                           ("record exit", 0x07), ("pause", 0x09)):
            yield f"mmc {label}", [[0xF0, 0x7F, 0x7F, 0x06, cmd, 0xF7]], 0.0
    elif name == "notes16":
        for n in range(128):
            yield f"note {n} ch16", [[0x9F, n, 100], [0x8F, n, 0]], 0.15
    else:
        sys.exit(f"unknown plan {name}")


def main() -> None:
    cmd = sys.argv[1] if len(sys.argv) > 1 else "devices"
    cam = arg("--cam", 1, int)
    OUT.mkdir(parents=True, exist_ok=True)
    if cmd == "devices":
        subprocess.run(["ffmpeg", "-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""])
        return
    if cmd == "calib":
        Image.fromarray(grab(cam).astype(np.uint8)).save(OUT / "calib.jpg")
        print(f"saved {OUT / 'calib.jpg'}")
        return
    plan = sys.argv[2]
    threshold = arg("--threshold", 4.0, float)
    mi, mo = rtmidi.MidiIn(), rtmidi.MidiOut()
    mo.open_port(next(i for i, p in enumerate(mo.get_ports()) if "OP-XY" in p))
    base = grab(cam)
    rois = rois_from_args(base.shape)
    noise = change(base, grab(cam), rois)
    print(f"noise floor {noise:.2f}; threshold {max(threshold, noise * 3):.2f}; rois {rois}")
    stamp = datetime.datetime.now().strftime("%H%M%S")
    log = []
    for label, msgs, gap in plans(plan):
        before = grab(cam)
        for m in msgs:
            guard(m)
            mo.send_message(m)
            time.sleep(gap)
        time.sleep(0.45)
        after = grab(cam)
        d = change(before, after, rois)
        hit = d > max(threshold, noise * 3)
        print(f"{'CHANGE' if hit else '      '} {d:6.2f}  {label}")
        entry = {"label": label, "delta": round(d, 2), "hit": hit, "msgs": msgs}
        if hit:
            safe = label.replace(" ", "_").replace("=", "").replace(",", "-")
            Image.fromarray(before.astype(np.uint8)).save(OUT / f"{stamp}_{safe}_before.jpg")
            Image.fromarray(after.astype(np.uint8)).save(OUT / f"{stamp}_{safe}_after.jpg")
        log.append(entry)
    (OUT / f"sweep_{plan}_{stamp}.json").write_text(json.dumps(log, indent=1))
    print(f"hits: {[e['label'] for e in log if e['hit']]}")


if __name__ == "__main__":
    main()
