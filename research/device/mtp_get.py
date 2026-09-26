"""Read-only MTP download: copies named files from the OP-XY (MTP mode) into research/device/captures/.
Usage: uv run --with pyusb python research/device/mtp_get.py projects/workspace.xy how_to_import.txt"""
import pathlib, struct, sys
import usb.core, usb.util
from mtp_list_lib import Mtp  # noqa

OUT = pathlib.Path(__file__).parent / "captures" / "mtp"
OUT.mkdir(parents=True, exist_ok=True)
m = Mtp()
m.open()
sid = m.storages()[0]
for path in sys.argv[1:]:
    h = m.resolve(sid, path)
    data = m.get(h)
    (OUT / path.replace("/", "__")).write_bytes(data)
    print(f"{path}: {len(data)} bytes → {OUT / path.replace('/', '__')}")
m.close()
