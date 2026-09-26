# Sends ONLY the Universal Non-Realtime Identity Request (read-only query), then listens.
import time, rtmidi
mi, mo = rtmidi.MidiIn(), rtmidi.MidiOut()
mi.ignore_types(sysex=False, timing=True, active_sense=True)
mi.open_port([i for i,p in enumerate(mi.get_ports()) if 'OP-XY' in p][0])
mo.open_port([i for i,p in enumerate(mo.get_ports()) if 'OP-XY' in p][0])
for dev in (0x7F,):
    mo.send_message([0xF0, 0x7E, dev, 0x06, 0x01, 0xF7])
t0=time.time(); got=[]
while time.time()-t0 < 2.0:
    m = mi.get_message()
    if m: got.append(' '.join(f'{b:02X}' for b in m[0]))
    else: time.sleep(0.001)
print("replies:", got or "none")
