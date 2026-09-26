"""Read-only TE SysEx probe for the OP-XY.

Frame format and packing follow TE's own web update utility (see docs/research/60-firmware.md §4).
SAFETY: `send()` refuses everything except GREET, ECHO, SETTINGS INIT/GET_ALL (the read-only traffic
TE's update page sends to every device it finds) and FILE INIT (no event subscription) / FILE LIST
(the read-only calls TE's EP sample tool makes on connect). DFU (0x03), PRODUCT_SPECIFIC (0x7F),
SETTINGS SET and every other FILE sub-command (GET, PUT, DELETE, METADATA, MOVE, PLAYBACK) are
hard-blocked.

Usage: uv run --with python-rtmidi python research/device/te_sysex_probe.py [greet|echo|settings|files|all]
"""

import json
import pathlib
import random
import sys
import time

import rtmidi

TE_ID = [0x00, 0x20, 0x76]
TE_FRAME = 0x40
TE_DEBUG = 0x33
BIT_IS_REQUEST, BIT_HAS_RID = 0x40, 0x20
GREET, ECHO, FILE, SETTINGS = 0x01, 0x02, 0x05, 0x06
FILE_INIT, FILE_LIST = 0x01, 0x04
FILE_FLAGS = {1: "file", 2: "dir", 4: "read", 8: "write", 16: "delete", 32: "move", 64: "playback"}
SETTINGS_INIT, SETTINGS_GET_ALL = 0x01, 0x02
STATUS = {0: "ok", 1: "error", 2: "command not found", 3: "bad request"}

CAPTURES = pathlib.Path(__file__).parent / "captures"


def pack7(raw: list[int]) -> list[int]:
    """TE packed7: per 7 raw bytes, one flag byte carrying the high bits, then the 7 low parts."""
    out: list[int] = []
    for i in range(0, len(raw), 7):
        group = raw[i : i + 7]
        flags = 0
        for j, b in enumerate(group):
            flags |= (b >> 7) << j
        out.append(flags)
        out.extend(b & 0x7F for b in group)
    return out


def unpack7(data: list[int]) -> list[int]:
    out: list[int] = []
    for i in range(0, len(data), 8):
        flags, group = data[i], data[i + 1 : i + 8]
        out.extend(((flags >> j) & 1) << 7 | b for j, b in enumerate(group))
    return out


def allowed(cmd: int, payload: list[int]) -> bool:
    if cmd in (GREET, ECHO):
        return True
    if cmd == SETTINGS:
        return payload[:1] in ([SETTINGS_INIT], [SETTINGS_GET_ALL])
    if cmd == FILE:
        return (payload[:2] == [FILE_INIT, 0x00] and len(payload) == 6) or \
               (payload[:1] == [FILE_LIST] and len(payload) == 5)
    return False


class TeSysex:
    def __init__(self, device_id: int = 0x21):
        self.dev = device_id
        self.mi, self.mo = rtmidi.MidiIn(), rtmidi.MidiOut()
        self.mi.ignore_types(sysex=False, timing=True, active_sense=True)
        self.mi.open_port(self._port(self.mi))
        self.mo.open_port(self._port(self.mo))
        self.rid = random.randrange(4095)
        self.log: list[dict] = []

    @staticmethod
    def _port(io) -> int:
        return next(i for i, p in enumerate(io.get_ports()) if "OP-XY" in p)

    def send(self, cmd: int, payload: list[int] | None = None) -> int:
        payload = payload or []
        if not allowed(cmd, payload):
            raise PermissionError(f"blocked TE SysEx cmd=0x{cmd:02x} payload={payload[:4]}")
        self.rid = (self.rid + 1) % 4096
        frame = [0xF0, *TE_ID, self.dev, TE_FRAME,
                 BIT_IS_REQUEST | BIT_HAS_RID | ((self.rid >> 7) & 0x1F), self.rid & 0x7F,
                 cmd, *pack7(payload), 0xF7]
        assert frame[8] != 0x03, "DFU is never sent"
        self.log.append({"dir": "out", "hex": " ".join(f"{b:02X}" for b in frame)})
        self.mo.send_message(frame)
        return self.rid

    def receive(self, rid: int, cmd: int, timeout: float = 3.0) -> dict | None:
        deadline = time.time() + timeout
        while time.time() < deadline:
            m = self.mi.get_message()
            if not m:
                time.sleep(0.001)
                continue
            msg = m[0]
            self.log.append({"dir": "in", "hex": " ".join(f"{b:02X}" for b in msg)})
            if msg[:4] != [0xF0, *TE_ID]:
                continue
            if msg[5] == TE_DEBUG:
                raise RuntimeError("device debug frame: stop all TE traffic: "
                                   + bytes(msg[6:-1]).decode(errors="replace"))
            if msg[5] != TE_FRAME or msg[6] & BIT_IS_REQUEST:
                continue  # not a TE frame, or our own request echoed back
            got_rid = ((msg[6] & 0x1F) << 7) | msg[7]
            if got_rid != rid or msg[8] != cmd:
                continue
            status = msg[9]
            data = unpack7(msg[10:-1])
            if status >= 64:  # still working: keep waiting
                deadline = time.time() + timeout
                continue
            return {"status": status, "status_text": STATUS.get(status, f"specific {status}"),
                    "data": data, "text": bytes(data).decode(errors="replace")}
        return None

    def request(self, cmd: int, payload: list[int] | None = None, timeout: float = 3.0):
        return self.receive(self.send(cmd, payload), cmd, timeout)


def list_dir(te: "TeSysex", node: int, depth: int, max_depth: int) -> list[dict]:
    entries, page = [], 0
    while page < 64:
        r = te.request(FILE, [FILE_LIST, page >> 8, page & 0xFF, node >> 8, node & 0xFF])
        if not r or r["status"] != 0 or len(r["data"]) <= 2:  # reply = page u16 + entries; <=2 bytes ends
            if r and r["status"] != 0:
                entries.append({"error": r["status_text"], "detail": r["text"][:80]})
            break
        d = bytes(r["data"][2:])
        i = 0
        while i + 7 <= len(d):
            nid, flags = (d[i] << 8) | d[i + 1], d[i + 2]
            size = int.from_bytes(d[i + 3:i + 7], "big")
            end = d.find(b"\0", i + 7)
            end = len(d) if end < 0 else end
            name = d[i + 7:end].decode(errors="replace")
            e = {"id": nid, "name": name, "size": size,
                 "flags": [n for bit, n in FILE_FLAGS.items() if flags & bit]}
            if flags & 2 and depth < max_depth:
                e["children"] = list_dir(te, nid, depth + 1, max_depth)
            entries.append(e)
            i = end + 1
        page += 1
    return entries


def main(what: str) -> None:
    te = TeSysex()
    CAPTURES.mkdir(exist_ok=True)
    result: dict = {}
    if what in ("greet", "all"):
        r = te.request(GREET)
        result["greet"] = r and {**r, "meta": dict(kv.split(":", 1) for kv in r["text"].strip("\0").split(";") if ":" in kv)}
    if what in ("echo", "all"):
        probe = [0xDE, 0xAD, 0xBE, 0xEF, 0x00, 0x7F, 0x80, 0xFF, 0x01]
        r = te.request(ECHO, probe)
        result["echo"] = r and {"status": r["status_text"], "roundtrip_ok": r["data"] == probe}
    if what in ("settings", "all"):
        r = te.request(SETTINGS, [SETTINGS_INIT, 0x03, 0xE8])
        result["settings_init"] = r and r["status_text"]
        if r and r["status"] == 0:
            pages, page = [], 0
            while page < 256:
                r = te.request(SETTINGS, [SETTINGS_GET_ALL, page >> 8, page & 0xFF])
                if not r or r["status"] != 0:
                    result["settings_error"] = r and r["status_text"]
                    break
                body = bytes(r["data"][2:]).split(b"\0", 1)[0].decode(errors="replace")
                if not body:
                    break
                pages.append(body)
                page += 1
            if pages:
                text = "".join(pages)
                (CAPTURES / "settings.json").write_text(text)
                try:
                    parsed = json.loads(text)
                    result["settings_groups"] = [g.get("desc") for g in parsed.get("settings", [])]
                except json.JSONDecodeError as e:
                    result["settings_parse_error"] = str(e)
    if what in ("files", "all"):
        r = te.request(FILE, [FILE_INIT, 0x00, 0x00, 0x40, 0x00, 0x00])  # flags 0, max response 4 MiB
        result["file_init"] = r and {"status": r["status_text"], "data": r["data"][:8]}
        if r and r["status"] == 0:
            d = r["data"]
            result["file_chunk_size"] = (d[1] << 24) | (d[2] << 16) | (d[3] << 8) | d[4] if len(d) >= 5 else None
            result["tree"] = list_dir(te, 0, depth=0, max_depth=int(sys.argv[2]) if len(sys.argv) > 2 else 1)
    (CAPTURES / f"te-sysex-{what}-{int(time.time())}.json").write_text(json.dumps({"result": result, "log": te.log}, indent=1))
    print(json.dumps(result, indent=1, default=str)[:6000])


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "greet")
