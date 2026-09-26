# Device probe log (the owner's OP-XY)

Everything here was observed on the real unit connected over USB-C to macOS (Darwin 25.3, Apple
Silicon). Scripts live in `research/device/` (run with `uv run --with python-rtmidi python <script>`).
**Rule:** every message sent to the device is listed here with its purpose. Nothing that changes device
state is sent without telling the owner first.

## 2026-09-26 — first contact (read-only)

### USB enumeration (`ioreg`, `system_profiler`, `usbdesc.py` — no transfers)

| Field | Value |
| --- | --- |
| Vendor / product strings | `teenage engineering` / `OP-XY` |
| VID / PID | `0x2367` / `0x8021` |
| bcdUSB / bcdDevice | `0x0200` / `0x0257` (meaning of 0x0257 unknown — not obviously the OS version) |
| Speed | High-speed, 480 Mb/s |
| Configurations | 3, **identical interfaces**, differing only in bMaxPower: 500 mA, 100 mA, 2 mA (likely charge/power negotiation) |
| Active configuration | 1 |

Interfaces (every configuration):

| # | Class / subclass | Meaning | Endpoints |
| --- | --- | --- | --- |
| 0 | Audio / 0x01 | AudioControl (UAC1, protocol 0x00) | 0 |
| 1 | Audio / 0x02 | AudioStreaming "Audio In" (OP-XY → host), alt1 active | 1 |
| 2 | Audio / 0x02 | AudioStreaming "OP-XY Out" (host → OP-XY), alt1 | 2 (data + feedback) |
| 3 | Audio / 0x03 | **MIDIStreaming** "OP-XY Midi" | 2 (bulk in/out) |

Implications:

- It's a fully class-compliant UAC1 audio + USB-MIDI device. Web MIDI sees one in/out port pair named
  `OP-XY`. Web Audio can capture the device via `getUserMedia` (it appears as an audio input).
- **No MTP interface in normal mode.** MTP must be a separate COM mode that re-enumerates the device
  (probably a different PID). → Needs a test with the owner (enter MTP mode, re-run `usbdesc.py`).
  This decides whether WebUSB-based MTP transfer from the browser is possible.
- macOS: `MIDIServer` holds the MIDI interface and `usbaudiod` the audio interfaces; Chrome already
  had a device-level user client open (from a Chrome tab or WebUSB/WebMIDI enumeration).

### MIDI ports (`listen.py` — passive)

- Input `OP-XY`, output `OP-XY`. Idle device sends nothing (no clock/active-sense while stopped).

### Identity Request (`identity.py`) — sent `F0 7E 7F 06 01 F7` (read-only universal inquiry)

Replies received:

```
F0 7E 21 06 02 00 20 76 21 00 01 00 00 00 00 00 F7   ← identity reply
F0 7E 7F 06 01 F7                                     ← our own request, echoed back
```

| Bytes | Meaning |
| --- | --- |
| `7E 21 06 02` | Universal non-realtime, **SysEx device ID 0x21**, identity reply |
| `00 20 76` | Manufacturer: **Teenage Engineering** |
| `21 00` | Family code 0x0021 (LSB first) |
| `01 00` | Family member 0x0001 |
| `00 00 00 00` | Software revision — **not reported** (zeros), so firmware version must come from elsewhere |

**MIDI echo is ON by default**: the device re-transmitted our SysEx. Our input handler must ignore
echoes of our own output (or the owner turns echo off in COM) to avoid feedback loops and false
"device changed" events.

## 2026-09-26 — TE SysEx protocol (read-only; `te_sysex_probe.py`)

Frame format, packing and command numbers come from TE's own web update utility and EP sample tool
(`docs/research/60-firmware.md` §4). Our packed-7 codec was verified against TE's JS implementation
on 33 random vectors before anything was sent. The script hard-blocks DFU (0x03), 0x7F, SETTINGS SET
and every FILE sub-command other than INIT (no subscribe) and LIST.

| Sent (rid varies) | Purpose | Reply | Result |
| --- | --- | --- | --- |
| `F0 00 20 76 21 40 7x xx 01 F7` | **GREET** (TE's updater sends this on connect) | status 0, ASCII metadata | ✅ `product:OP-XY; mode:normal; os_version:1.1.33; sw_version:1.1.33; hw_rev:2; sku:TE033AS001` (+ `serial`, `dsp_serial` — not recorded here) |
| ECHO `DE AD BE EF 00 7F 80 FF 01` | codec round trip | status 0, identical bytes | ✅ packed-7 codec correct end to end |
| SETTINGS INIT `[01 03 E8]` (TE's updater sends this on connect) | typed settings? | **status 2 "command not found"** | ❌ OP-XY has no SETTINGS over SysEx |
| FILE INIT `[01 00 00 40 00 00]` (flags 0, max response 4 MiB) | filesystem over SysEx? | status 0, data `0C 00 02 00 00` | ✅ **supported**; chunk size 0x00020000 = 128 KiB (first byte 0x0C meaning unknown) |
| FILE LIST page 0, node 0 | root listing | page 0 + 2 entries | ✅ `drum` (id 1) and `synth` (id 2), both flags dir+read+write, size 0 |
| FILE LIST page 1, node 0 | end of root | page 1, no entries | end of listing |
| FILE LIST page 0, node 1 / node 2 | contents of drum / synth | page 0, no entries | both **empty** on the owner's unit |

Findings:

- **The OP-XY speaks TE's SysEx protocol over USB-MIDI.** The app can read the exact OS version
  with GREET (the universal identity reply leaves it blank).
- **TE-protocol requests are not echoed** (only foreign messages like the universal identity
  request are). The echo filter still matters for everything else.
- **A filesystem is exposed over MIDI**: two writable directories, `drum` and `synth`, empty on a
  unit with no user content. Hypothesis: a sample/preset upload area like the EP-133 sample tool's,
  where files PUT into `drum`/`synth` show up in the drum/synth sample or preset browsers. If true,
  the browser app could install AI-generated kits and instruments **without MTP or Field Kit**.
  Testing that needs a FILE PUT, which writes to the device → owner approval required. Projects are
  not visible through this interface (so far).

## Pending device tests (need the owner or a state change)

1. ~~Firmware version~~ — owner reports **OS 1.1.33** (2026-09-26).
2. Enter MTP mode → `usbdesc.py` → does a class-0x06 interface appear? PID? Can Chrome WebUSB open it?
   Compare what MTP shows with the SysEx FILE tree (`drum`, `synth`).
2b. **FILE PUT test (writes!)**: upload one small WAV (and later a `.preset` folder) into `drum` with the owner's
   approval, see where it appears on the device, then DELETE it. Also check FILE INFO/GET on it.
3. Transport: send `FA`/`FC` (start/stop) — changes playback state (harmless, but announce).
4. Clock out: press play on the device, observe `F8` stream and SPP.
5. CC probes (volume/mute/tempo) — each changes live state; announce first, restore after.
6. CC106/107 remote-key probe (community reports vary by firmware).
7. USB audio capture: record the `OP-XY` audio input while playing.
