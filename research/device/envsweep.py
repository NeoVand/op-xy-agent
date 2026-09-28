"""Envelope captures under the camera (docs/research/59-screen-profiling.md): sets the M2 page's
two envelopes to a planned list of states over MIDI and saves the screen once each state shows.

Sends only CC 20-23 (amp envelope A/D/S/R) and CC 24-27 (filter envelope A/D/S/R) on one track's
channel (channel N reaches track N), and only the values that change from one state to the next.
No notes, no other messages. Needs camera.command running and screencap.py calib done. Run with
the owner's approval on a scratch project, the track's M2 page showing (the amp envelope selected
for `--plan amp`; click an encoder to select the filter envelope for `--plan filter`).

Each state waits until the screen has changed and held still (the camera runs half a second or
more behind), then averages three frames. Per state it writes <prefix>-NNN.png (2x, colour),
<prefix>-NNN-4x.png (4x, grey) and <prefix>-NNN-raw.jpg (one camera frame, for re-rectifying
later), with the index and every message sent in <prefix>.json.

  uv run --with python-rtmidi --with opencv-python-headless --with numpy \
      python research/device/envsweep.py --track 3 --plan amp|filter [--prefix NAME] [--dry]
"""

import json
import sys
import time

import cv2
import numpy as np
import rtmidi

import screencap

AMP_CC, FILTER_CC = (20, 21, 22, 23), (24, 25, 26, 27)
ALLOWED = set(AMP_CC + FILTER_CC)
STAGES = ("attack", "decay", "sustain", "release")
# attack 0, decay and sustain and release halfway
BASE = (0, 64, 64, 64)
# out of the way: a spike on the left edge, then flat on the baseline to the end
MINIMAL = (0, 0, 0, 127)
FINE = [0, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96, 104, 112, 120, 124,
        126, 127]
COARSE = [0, 16, 32, 48, 64, 80, 96, 112, 127]
MEDIUM = [0, 4, 8, 16, 24, 32, 48, 64, 80, 96, 112, 120, 127]


def with_stage(env: tuple, stage: str, value: int) -> tuple:
    out = list(env)
    out[STAGES.index(stage)] = value
    return tuple(out)


def sweeps(values: list[int], base: tuple) -> list[tuple[str, tuple]]:
    """One stage at a time over `values`, the others at `base`."""
    return [(f"{stage}-{v:03d}", with_stage(base, stage, v)) for stage in STAGES for v in values]


def grids(base: tuple) -> list[tuple[str, tuple]]:
    """Decay and release against the sustain level (the curves' shape at other heights), and the
    longest and shortest layouts."""
    out = []
    for s in (0, 32, 96, 120):
        for d in (16, 48, 96, 127):
            out.append((f"d{d:03d}-s{s:03d}", (base[0], d, s, base[3])))
        for r in (0, 40, 80, 112):
            out.append((f"r{r:03d}-s{s:03d}", (base[0], base[1], s, r)))
    for a, d, s, r in [(64, 64, 127, 64), (64, 64, 0, 64), (127, 127, 64, 0), (127, 0, 127, 127),
                       (0, 0, 0, 127), (0, 127, 0, 0), (127, 127, 0, 0), (127, 127, 127, 0),
                       (32, 32, 100, 32)]:
        out.append((f"x{a:03d}-{d:03d}-{s:03d}-{r:03d}", (a, d, s, r)))
    return out


def plan(which: str) -> list[dict]:
    """The states, each {label, amp, filter}: the selected envelope swept with the other one out
    of the way, then the other one (drawn dim) swept, with a reference state every so often."""
    states = []

    def add(label, amp, filt):
        states.append({"label": label, "amp": tuple(amp), "filter": tuple(filt)})

    if which == "amp":
        add("ref", BASE, MINIMAL)
        for label, env in sweeps(FINE, BASE) + grids(BASE):
            add(f"amp-{label}", env, MINIMAL)
            if len(states) % 40 == 0:
                add("ref", BASE, MINIMAL)
        add("ref", BASE, MINIMAL)
        # the filter envelope as drawn when not selected, the amp out of the way
        for label, env in sweeps(COARSE, BASE):
            add(f"dim-filter-{label}", MINIMAL, env)
        for s in (0, 96):
            for d in (32, 127):
                add(f"dim-filter-d{d:03d}-s{s:03d}", MINIMAL, (0, d, s, 64))
            for r in (0, 96):
                add(f"dim-filter-r{r:03d}-s{s:03d}", MINIMAL, (0, 64, s, r))
        # both at once: labels, overlaps
        add("both-base", BASE, BASE)
        add("both-apart", (32, 48, 100, 90), (96, 96, 30, 20))
        add("both-crossed", (96, 96, 30, 20), (32, 48, 100, 90))
        add("ref", BASE, MINIMAL)
    elif which == "filter":
        add("ref-filter", MINIMAL, BASE)
        for label, env in sweeps(MEDIUM, BASE) + grids(BASE):
            add(f"filter-{label}", MINIMAL, env)
            if len(states) % 40 == 0:
                add("ref-filter", MINIMAL, BASE)
        add("ref-filter", MINIMAL, BASE)
        # the amp envelope as drawn when not selected
        for label, env in sweeps(COARSE[::2], BASE):
            add(f"dim-amp-{label}", env, MINIMAL)
        add("both-apart", (32, 48, 100, 90), (96, 96, 30, 20))
        add("ref-filter", MINIMAL, BASE)
    else:
        raise SystemExit(__doc__)
    return states


def arg(name, default, cast=str):
    return cast(sys.argv[sys.argv.index(name) + 1]) if name in sys.argv else default


def main() -> None:
    track = arg("--track", None, int)
    which = arg("--plan", None)
    if track is None or not 1 <= track <= 8 or which not in ("amp", "filter"):
        raise SystemExit(__doc__)
    prefix = arg("--prefix", f"env2-{which}")
    states = plan(which)
    current = {cc: None for cc in ALLOWED}
    count = 0
    for st in states:
        for cc, v in zip(AMP_CC + FILTER_CC, st["amp"] + st["filter"]):
            if current[cc] != v:
                count += 1
                current[cc] = v
    print(f"{len(states)} states, {count} messages on channel {track}", flush=True)
    if "--dry" in sys.argv:
        return
    out = rtmidi.MidiOut()
    ports = out.get_ports()
    port = next((i for i, p in enumerate(ports) if "OP-XY" in p), None)
    if port is None:
        raise SystemExit(f"no OP-XY among {ports}")
    out.open_port(port)
    channel = track - 1
    calib = screencap.load_calib()
    screencap.SCREENS.mkdir(parents=True, exist_ok=True)
    sent, index = [], []
    current = {cc: None for cc in ALLOWED}
    index_path = screencap.SCREENS / f"{prefix}.json"

    def save() -> None:
        index_path.write_text(json.dumps({"track": track, "plan": which, "calib": calib,
                                          "states": index, "sent": sent}, indent=1))

    try:
        for n, st in enumerate(states):
            (img,) = screencap.fresh(1)
            before = screencap.rectify(img, calib)
            batch = []
            for cc, v in zip(AMP_CC + FILTER_CC, st["amp"] + st["filter"]):
                if current[cc] != v:
                    assert cc in ALLOWED and 0 <= v <= 127
                    out.send_message([0xB0 | channel, cc, v])
                    current[cc] = v
                    batch.append([cc, v])
            t = time.time()
            sent.extend({"t": round(t, 3), "channel": track, "cc": cc, "value": v} for cc, v in batch)
            seen = screencap.settle(before, calib) if batch else {"latency": 0, "changed": False}
            frames = screencap.fresh(3)
            mean = np.mean([f.astype(np.float32) for f in frames], axis=0)
            name = f"{prefix}-{n:03d}"
            cv2.imwrite(str(screencap.SCREENS / f"{name}.png"), screencap.rectify(mean, calib, 2))
            cv2.imwrite(str(screencap.SCREENS / f"{name}-4x.png"),
                        cv2.cvtColor(screencap.rectify(mean, calib, 4), cv2.COLOR_BGR2GRAY))
            cv2.imwrite(str(screencap.SCREENS / f"{name}-raw.jpg"), frames[-1])
            index.append({"n": n, "file": f"{name}.png", "label": st["label"],
                          "amp": list(st["amp"]), "filter": list(st["filter"]), "sent": batch, **seen})
            flag = "" if seen.get("changed") or not batch else "  (no visible change)"
            print(f"{name} {st['label']:28s} {seen['latency']:.2f}s{flag}", flush=True)
            if n % 10 == 0:
                save()
    finally:
        save()
        out.close_port()
    print(f"{len(sent)} messages sent on channel {track}; index {index_path}", flush=True)


if __name__ == "__main__":
    main()
