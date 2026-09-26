"""Read-only MTP probe for the OP-XY in MTP mode (PID 0x0021): GetDeviceInfo, OpenSession,
GetStorageIDs/Info, GetObjectHandles/Info for the root (and optionally one level down), CloseSession.
Nothing is written. Usage: uv run --with pyusb python research/device/mtp_list.py [depth]"""
import struct, sys
import usb.core, usb.util

DEPTH = int(sys.argv[1]) if len(sys.argv) > 1 else 1
dev = usb.core.find(idVendor=0x2367, idProduct=0x0021)
if dev is None:
    sys.exit("OP-XY not in MTP mode (PID 0x0021 not found)")
usb.util.claim_interface(dev, 0)
EP_OUT, EP_IN = 0x0A, 0x89
tid = 0

def txn(code, *params, timeout=5000):
    """Send a command container, read data phase (if any) and the response."""
    global tid
    tid += 1
    cmd = struct.pack("<IHHI", 12 + 4 * len(params), 1, code, tid) + b"".join(struct.pack("<I", p) for p in params)
    dev.write(EP_OUT, cmd, timeout)
    data = b""
    while True:
        buf = bytes(dev.read(EP_IN, 1 << 16, timeout))
        length, ctype, rcode, rtid = struct.unpack("<IHHI", buf[:12])
        while len(buf) < length:
            buf += bytes(dev.read(EP_IN, 1 << 16, timeout))
        if ctype == 2:
            data += buf[12:length]
            continue
        if ctype == 3:
            rparams = struct.unpack(f"<{(length - 12) // 4}I", buf[12:length]) if length > 12 else ()
            return rcode, data, rparams

def mstr(b, o):
    n = b[o]; o += 1
    s = b[o:o + 2 * n].decode("utf-16-le").rstrip("\0"); return s, o + 2 * n

def u32arr(b, o):
    n = struct.unpack_from("<I", b, o)[0]; o += 4
    return list(struct.unpack_from(f"<{n}I", b, o)), o + 4 * n

def u16arr(b, o):
    n = struct.unpack_from("<I", b, o)[0]; o += 4
    return list(struct.unpack_from(f"<{n}H", b, o)), o + 2 * n

rc, d, _ = txn(0x1001)  # GetDeviceInfo (no session needed)
o = 8; ext, o = mstr(d, o); o += 2  # std ver u16, vendor ext id u32, vendor ext ver u16, ext desc, functional mode
ops, o = u16arr(d, o); events, o = u16arr(d, o); props, o = u16arr(d, o); capfmt, o = u16arr(d, o); pbfmt, o = u16arr(d, o)
manu, o = mstr(d, o); model, o = mstr(d, o); ver, o = mstr(d, o); serial, o = mstr(d, o)
print(f"GetDeviceInfo rc={rc:#06x}: manufacturer={manu!r} model={model!r} device_version={ver!r} ext={ext!r}")
print(f"  operations ({len(ops)}):", " ".join(f"{x:04X}" for x in sorted(ops)))
print(f"  object formats: {len(pbfmt)}; events: {len(events)}")

rc, _, _ = txn(0x1002, 1)  # OpenSession(1)
print(f"OpenSession rc={rc:#06x}")
rc, d, _ = txn(0x1004)  # GetStorageIDs
storages, _ = u32arr(d, 0)
for sid in storages:
    rc, d, _ = txn(0x1005, sid)  # GetStorageInfo
    stype, fstype, access, cap, free, freeobj = struct.unpack_from("<HHHQQI", d, 0)
    desc, o = mstr(d, 26); label, o = mstr(d, o)
    print(f"Storage {sid:#010x}: '{desc}' label='{label}' capacity={cap/1e9:.2f} GB free={free/1e9:.2f} GB access={access}")

    def listing(parent, depth, indent):
        rc, d, _ = txn(0x1007, sid, 0, parent)  # GetObjectHandles(storage, all formats, parent)
        handles, _ = u32arr(d, 0) if d else ([], 0)
        for h in handles[:80]:
            rc, info, _ = txn(0x1008, h)  # GetObjectInfo
            fmt = struct.unpack_from("<H", info, 4)[0]; size = struct.unpack_from("<I", info, 8)[0]
            name, _ = mstr(info, 52)
            isdir = fmt == 0x3001
            print(f"{indent}{'[' if isdir else ''}{name}{']' if isdir else ''}  {'' if isdir else f'{size} B'}")
            if isdir and depth > 0:
                listing(h, depth - 1, indent + "    ")
        if len(handles) > 80:
            print(f"{indent}… {len(handles) - 80} more")

    listing(0xFFFFFFFF, DEPTH, "  ")
rc, _, _ = txn(0x1003)  # CloseSession
print(f"CloseSession rc={rc:#06x}")
usb.util.release_interface(dev, 0)
