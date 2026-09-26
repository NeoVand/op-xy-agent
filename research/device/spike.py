"""Device spike runner for the owner-attended test session (docs/research/20-midi-control.md §11).

Every step prints exactly what it sends, then captures whatever the OP-XY sends back for a short
window, and appends a transcript to research/device/captures/spike-<date>.jsonl (git-ignored).

SAFETY: TE SysEx (F0 00 20 76 …) is refused here entirely — use te_sysex_probe.py, which has its
own allow-list. Project load (CC86) is refused unless --allow-project-load is given. `panic` sends
All Notes Off + All Sound Off on every channel.

Usage (uv run --with python-rtmidi python research/device/spike.py <cmd> …):
  listen SECONDS                  passive capture (e.g. while the owner presses play/stop)
  cc CH CC VALUE [VALUE…]         control change(s) on channel CH (1–16), 600 ms apart
  note CH NOTE [NOTE…]            note on (vel 100) / off after 250 ms, one after another
  rk KEY [KEY…] [--ch CH]         remote key: CC106 KEY, 200 ms, CC107 KEY (values 0–71)
  rkcombo HOLD KEY [--ch CH]      hold HOLD (CC106), press KEY, release both (e.g. shift + key)
  raw HEX…                        raw bytes, e.g. "FA" or "F2 10 00"
  clock BPM BARS                  send FA, 24 ppqn F8 clock for BARS bars at BPM, then FC
  panic                           CC123 + CC120 on all 16 channels
"""

import datetime
import json
import pathlib
import sys
import time

import rtmidi

CAPTURES = pathlib.Path(__file__).parent / "captures"
LOG = CAPTURES / f"spike-{datetime.date.today().isoformat()}.jsonl"
ALLOW_PROJECT_LOAD = "--allow-project-load" in sys.argv


def hx(msg) -> str:
    return " ".join(f"{b:02X}" for b in msg)


class Spike:
    def __init__(self):
        self.mi, self.mo = rtmidi.MidiIn(), rtmidi.MidiOut()
        self.mi.ignore_types(sysex=False, timing=False, active_sense=False)
        port = lambda io: next(i for i, p in enumerate(io.get_ports()) if "OP-XY" in p)
        self.mi.open_port(port(self.mi))
        self.mo.open_port(port(self.mo))
        CAPTURES.mkdir(exist_ok=True)
        self.step = " ".join(sys.argv[1:])

    def guard(self, msg: list[int]) -> None:
        if msg[:4] == [0xF0, 0x00, 0x20, 0x76]:
            raise PermissionError("TE SysEx is not sent from spike.py — use te_sysex_probe.py")
        if len(msg) >= 3 and (msg[0] & 0xF0) == 0xB0 and msg[1] == 86 and not ALLOW_PROJECT_LOAD:
            raise PermissionError("CC86 (project load) refused without --allow-project-load")
        if any(b > 0xFF for b in msg) or (msg[0] < 0x80):
            raise ValueError(f"not a valid MIDI message: {msg}")

    def send(self, msg: list[int]) -> None:
        self.guard(msg)
        print(f"  → {hx(msg)}")
        self.mo.send_message(msg)
        self.log("out", msg)

    def capture(self, seconds: float, quiet_clock: bool = True) -> list[str]:
        got, clocks, t0 = [], 0, time.time()
        while time.time() - t0 < seconds:
            m = self.mi.get_message()
            if not m:
                time.sleep(0.0005)
                continue
            msg = m[0]
            if msg == [0xF8] and quiet_clock:
                clocks += 1
                continue
            got.append(hx(msg))
            self.log("in", msg)
        if clocks:
            got.append(f"(+{clocks} × F8 clock, ≈{clocks / 24 / seconds * 60:.1f} BPM)")
        for g in got:
            print(f"  ← {g}")
        return got

    def log(self, direction: str, msg) -> None:
        with LOG.open("a") as f:
            f.write(json.dumps({"t": time.time(), "step": self.step, "dir": direction, "hex": hx(msg)}) + "\n")


def channel(arg: str) -> int:
    ch = int(arg)
    if not 1 <= ch <= 16:
        raise ValueError("channel must be 1–16")
    return ch - 1


def main(argv: list[str]) -> None:
    ch_opt = 0
    if "--ch" in argv:
        i = argv.index("--ch")
        ch_opt = channel(argv[i + 1])
        argv = argv[:i] + argv[i + 2 :]  # drop the flag AND its value before reading positionals
    args = [a for a in argv if not a.startswith("--")]
    cmd, rest = args[0], args[1:]
    s = Spike()
    print(f"[{cmd}] {' '.join(rest)}")
    if cmd == "listen":
        s.capture(float(rest[0]))
    elif cmd == "cc":
        ch, cc = channel(rest[0]), int(rest[1])
        for v in rest[2:]:
            s.send([0xB0 | ch, cc, int(v)])
            s.capture(0.6)
    elif cmd == "note":
        ch = channel(rest[0])
        for n in rest[1:]:
            s.send([0x90 | ch, int(n), 100])
            time.sleep(0.25)
            s.send([0x80 | ch, int(n), 0])
            s.capture(0.15)
    elif cmd == "rk":
        for k in rest:
            s.send([0xB0 | ch_opt, 106, int(k)])
            time.sleep(0.2)
            s.send([0xB0 | ch_opt, 107, int(k)])
            s.capture(0.5)
    elif cmd == "rkcombo":
        hold, key = int(rest[0]), int(rest[1])
        s.send([0xB0 | ch_opt, 106, hold])
        time.sleep(0.15)
        s.send([0xB0 | ch_opt, 106, key])
        time.sleep(0.2)
        s.send([0xB0 | ch_opt, 107, key])
        time.sleep(0.1)
        s.send([0xB0 | ch_opt, 107, hold])
        s.capture(0.5)
    elif cmd == "raw":
        s.send([int(b, 16) for b in rest])
        s.capture(1.0)
    elif cmd == "clock":
        bpm, bars = float(rest[0]), int(rest[1])
        period = 60.0 / bpm / 24
        s.send([0xFA])
        t_next = time.perf_counter()
        for _ in range(bars * 4 * 24):
            t_next += period
            s.mo.send_message([0xF8])
            while time.perf_counter() < t_next:
                pass
        s.send([0xFC])
        s.capture(0.5)
    elif cmd == "panic":
        for ch in range(16):
            s.mo.send_message([0xB0 | ch, 123, 0])
            s.mo.send_message([0xB0 | ch, 120, 0])
        s.log("out", [0xB0, 123, 0])
        print("  → CC123 + CC120 on channels 1–16")
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1:])
