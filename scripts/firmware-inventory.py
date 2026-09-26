#!/usr/bin/env python3
"""OP-XY public firmware inventory + .tfw container parser (read-only, stdlib only).

Talks to teenage.engineering over HTTPS only. It NEVER opens a MIDI or USB port and never
sends anything to a device. See docs/research/60-firmware.md for the format write-up.

  python3 scripts/firmware-inventory.py                 # headers of every public build (1 KB Range GETs)
  python3 scripts/firmware-inventory.py --download 1.1.33 1.1.32   # also fetch full files, verify CRCs
  python3 scripts/firmware-inventory.py --parse path/to/file.tfw   # parse a local file, print JSON

Outputs (default run):
  research/firmware/headers/*.head1k           first 1 KB of each build (git-ignored)
  research/firmware/<version>/*.tfw            full files when --download is used (git-ignored)
  knowledge/firmware/opxy-firmware-inventory.json   small committed summary
"""

from __future__ import annotations

import argparse
import binascii
import hashlib
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOWNLOADS_URL = "https://teenage.engineering/downloads/op-xy"
RELEASES_URL = "https://teenage.engineering/_software/releases.json"
TFW_URL = "https://teenage.engineering/_software/op-xy/opxy_firmware_{v}.tfw"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"

OUTER_MAGIC = bytes.fromhex("babecafe")
INNER_MAGIC = bytes.fromhex("beefcafe")
PAYLOAD_OFFSET = 0x380  # ciphertext starts here in every OP-XY / OP-1 field build seen so far
TRAILER_LEN = 256  # opaque bytes after the padded ciphertext (probably a signature)


def http(url: str, rng: str | None = None, method: str = "GET"):
    req = urllib.request.Request(url, method=method, headers={"User-Agent": UA})
    if rng:
        req.add_header("Range", f"bytes={rng}")
    return urllib.request.urlopen(req, timeout=60)


def crc16_xmodem(data: bytes) -> int:
    # CRC-16/XMODEM: poly 0x1021, init 0x0000, no reflection, no xorout. binascii does it in C.
    return binascii.crc_hqx(data, 0)


def sku_string(b: bytes) -> str:
    """4 big-endian bytes -> 'TE033AS001' (same bit layout TE's update utility uses)."""
    e = int.from_bytes(b, "big")
    family, kind, member = (e >> 14) & 1023, (e >> 10) & 15, e & 1023
    return f"TE{family:03d}{'AS' if kind == 0 else '??'}{member:03d}"


def version_string(b: bytes) -> str:
    major, minor, patch, build = (int.from_bytes(b[i : i + 2], "big") for i in range(0, 8, 2))
    s = f"{major}.{minor}.{patch}"
    return f"{s}+{build}" if build else s


def parse_header(h: bytes, total_len: int) -> dict:
    """Parse the plaintext part of a .tfw (needs the first 0x104 bytes + the file length)."""
    if h[:4] != OUTER_MAGIC or h[0x40:0x44] != INNER_MAGIC:
        raise ValueError("not a babecafe/beefcafe .tfw container")
    plain = int.from_bytes(h[0x100:0x104], "little")
    padded = (plain + 15) // 16 * 16
    return {
        "outer": {
            "type": h[4],
            "crc16_xmodem_of_0x40_to_end": h[5:7].hex(),
            "version": version_string(h[7:15]),
            "sku": sku_string(h[15:19]),
        },
        "inner": {
            "type": h[0x44],
            "body_size_be32": int.from_bytes(h[0x45:0x49], "big"),
            "body_size_matches_len_minus_0x80": int.from_bytes(h[0x45:0x49], "big") == total_len - 0x80,
            "crc16_xmodem_of_0x80_to_end": h[0x49:0x4B].hex(),
            "version": version_string(h[0x4B:0x53]),
            "sku": sku_string(h[0x57:0x5B]),
        },
        "key_index_0x84": h[0x84],
        "iv_0xf0": h[0xF0:0x100].hex(),
        "plaintext_size": plain,
        "ciphertext_size": padded,
        "trailer_size": total_len - PAYLOAD_OFFSET - padded,
        "other_header_bytes_zero": not any(h[0x5B:0x84]) and not any(h[0x85:0xF0]) and not any(h[0x104:PAYLOAD_OFFSET]),
    }


def verify_full(data: bytes) -> dict:
    return {
        "sha256": hashlib.sha256(data).hexdigest(),
        "outer_crc_ok": crc16_xmodem(data[0x40:]) == int.from_bytes(data[5:7], "big"),
        "inner_crc_ok": crc16_xmodem(data[0x80:]) == int.from_bytes(data[0x49:0x4B], "big"),
    }


def listed_versions() -> list[tuple[str, str | None, bool, bool]]:
    """(version, release date, has download link, marked 'unavailable') from the downloads page."""
    html = http(DOWNLOADS_URL).read().decode("utf-8", "replace")
    linked = set(re.findall(r"opxy_firmware_(\d+_\d+_\d+)\.tfw", html))
    text = re.sub(r"<[^>]+>", "\n", re.sub(r"<script[\s\S]*?</script>", " ", html))
    dated = re.findall(r"\n\s*(\d+\.\d+\.\d+)\s*\n\s*(\d{4}\.\d{2}\.\d{2})\s*\n\s*([^\n]*)", text)
    out = {
        v: (d.replace(".", "-"), v.replace(".", "_") in linked, nxt.strip().lower() == "unavailable")
        for v, d, nxt in dated
    }
    for u in linked:
        out.setdefault(u.replace("_", "."), (None, True, False))
    return sorted(((v, *rest) for v, rest in out.items()), key=lambda t: tuple(map(int, t[0].split("."))))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--download", nargs="*", default=[], metavar="VERSION", help="also fetch these full builds")
    ap.add_argument("--parse", metavar="FILE", help="parse a local .tfw and print JSON")
    args = ap.parse_args()

    if args.parse:
        data = Path(args.parse).read_bytes()
        print(json.dumps({**parse_header(data[:0x400], len(data)), **verify_full(data), "size": len(data)}, indent=2))
        return 0

    fw_dir = ROOT / "research" / "firmware"
    (fw_dir / "headers").mkdir(parents=True, exist_ok=True)
    rows = []
    for version, date, linked, withdrawn in listed_versions():
        u = version.replace(".", "_")
        url = TFW_URL.format(v=u)
        try:
            head = http(url, method="HEAD")
        except Exception as exc:  # noqa: BLE001 — record and continue
            rows.append({"version": version, "date": date, "linked": linked, "url": url, "error": str(exc)})
            continue
        size = int(head.headers["Content-Length"])
        h = http(url, rng="0-1023").read()
        (fw_dir / "headers" / f"opxy_firmware_{u}.head1k").write_bytes(h)
        row = {
            "version": version,
            "date": date,
            "linked_on_downloads_page": linked,
            "withdrawn": withdrawn,  # TE marks the build "unavailable" (1.0.29: MTP corruption bug)
            "url": url,
            "size": size,
            "last_modified": head.headers.get("Last-Modified"),
            **parse_header(h, size),
        }
        local = fw_dir / version / f"opxy_firmware_{u}.tfw"
        if version in args.download and not local.exists():
            local.parent.mkdir(parents=True, exist_ok=True)
            local.write_bytes(http(url).read())
        if local.exists():
            row.update(verify_full(local.read_bytes()))
        rows.append(row)
        print(f"{version:8} {date or '?':10} {size:>10}  iv={row['iv_0xf0'][:8]}…  plain={row['plaintext_size']}", file=sys.stderr)

    try:
        latest = next(d for d in json.load(http(RELEASES_URL))["devices"] if d["sku"] == "TE033AS001")
    except Exception:  # noqa: BLE001
        latest = None
    out = {
        "source": DOWNLOADS_URL,
        "releases_json": RELEASES_URL,
        "latest_in_releases_json": latest and {k: latest[k] for k in ("sku", "version", "fw_url")},
        "builds": rows,
    }
    dest = ROOT / "knowledge" / "firmware" / "opxy-firmware-inventory.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out, indent="\t") + "\n")  # tabs: matches the repo prettier config
    print(f"wrote {dest.relative_to(ROOT)} ({len(rows)} builds)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
