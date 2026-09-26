# Passive: list MIDI ports and listen to OP-XY input for N seconds. Sends NOTHING.
import sys, time, rtmidi
secs = float(sys.argv[1]) if len(sys.argv) > 1 else 5
mi, mo = rtmidi.MidiIn(), rtmidi.MidiOut()
print("IN :", mi.get_ports()); print("OUT:", mo.get_ports())
idx = next((i for i, p in enumerate(mi.get_ports()) if 'OP-XY' in p), None)
if idx is None: sys.exit("no OP-XY input")
mi.ignore_types(sysex=False, timing=False, active_sense=False)
mi.open_port(idx)
counts, samples = {}, []
t0 = time.time()
while time.time() - t0 < secs:
    m = mi.get_message()
    if m:
        msg, dt = m; k = hex(msg[0] & 0xF0 if msg[0] < 0xF0 else msg[0])
        counts[k] = counts.get(k, 0) + 1
        if len(samples) < 40 and msg[0] not in (0xF8, 0xFE): samples.append([hex(b) for b in msg])
    else: time.sleep(0.001)
print("status counts:", counts); print("samples:", samples)
