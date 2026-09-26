"""Sweep CC80 (tempo) and measure the resulting tempo from the OP-XY's own F8 clock output.

Requires COM clock = out/both. Changes the project tempo, so use a scratch project.
Usage: uv run --with python-rtmidi python research/device/tempo_sweep.py [CC80 values…]
"""

import sys
import time

values = [int(v) for v in sys.argv[1:]] or [0, 32, 60, 64, 96, 127]
sys.argv = ["spike.py", "tempo-sweep " + " ".join(map(str, values))]  # label for the transcript
from spike import Spike  # noqa: E402


def measure(s: Spike, seconds: float) -> float:
    ticks, first, last, t0 = 0, None, None, time.time()
    while time.time() - t0 < seconds:
        m = s.mi.get_message()
        if not m:
            time.sleep(0.0003)
            continue
        if m[0] == [0xF8]:
            now = time.perf_counter()
            first = first or now
            last = now
            ticks += 1
    return (ticks - 1) / (last - first) * 60 / 24 if ticks > 2 else float("nan")


s = Spike()
for v in values:
    s.send([0xB0, 80, v])
    time.sleep(0.4)
    while s.mi.get_message():
        pass
    print(f"  CC80={v:3d} → {measure(s, 2.5):6.2f} BPM (from clock)")
