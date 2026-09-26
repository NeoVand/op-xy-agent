"""Minimal read-only MTP client (PTP containers over USB bulk) for the OP-XY in MTP mode."""
import struct
import usb.core, usb.util

class Mtp:
    def __init__(self):
        self.dev = usb.core.find(idVendor=0x2367, idProduct=0x0021)
        if self.dev is None:
            raise SystemExit("OP-XY not in MTP mode (PID 0x0021 not found)")
        usb.util.claim_interface(self.dev, 0)
        self.tid = 0

    def txn(self, code, *params, timeout=10000):
        self.tid += 1
        cmd = struct.pack("<IHHI", 12 + 4 * len(params), 1, code, self.tid) + b"".join(struct.pack("<I", p) for p in params)
        self.dev.write(0x0A, cmd, timeout)
        data = b""
        while True:
            buf = bytes(self.dev.read(0x89, 1 << 20, timeout))
            length, ctype, rcode, _ = struct.unpack("<IHHI", buf[:12])
            while len(buf) < length:
                buf += bytes(self.dev.read(0x89, 1 << 20, timeout))
            if ctype == 2:
                data += buf[12:length]
            elif ctype == 3:
                if rcode != 0x2001:
                    raise RuntimeError(f"MTP op {code:#06x} failed: response {rcode:#06x}")
                return data

    @staticmethod
    def _str(b, o):
        n = b[o]
        return b[o + 1:o + 1 + 2 * n].decode("utf-16-le").rstrip("\0")

    def open(self):
        self.txn(0x1002, 1)

    def close(self):
        self.txn(0x1003)
        usb.util.release_interface(self.dev, 0)

    def storages(self):
        d = self.txn(0x1004)
        n = struct.unpack_from("<I", d, 0)[0]
        return list(struct.unpack_from(f"<{n}I", d, 4))

    def children(self, sid, parent):
        d = self.txn(0x1007, sid, 0, parent)
        n = struct.unpack_from("<I", d, 0)[0]
        out = []
        for h in struct.unpack_from(f"<{n}I", d, 4):
            info = self.txn(0x1008, h)
            out.append((h, self._str(info, 52), struct.unpack_from("<H", info, 4)[0], struct.unpack_from("<I", info, 8)[0]))
        return out

    def resolve(self, sid, path):
        parent = 0xFFFFFFFF
        for part in path.split("/"):
            match = [c for c in self.children(sid, parent) if c[1] == part]
            if not match:
                raise FileNotFoundError(path)
            parent = match[0][0]
        return parent

    def get(self, handle):
        return self.txn(0x1009, handle)
