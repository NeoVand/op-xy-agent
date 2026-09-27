# Device probe log (the owner's OP-XY)

Everything here was observed on the real unit connected over USB-C to macOS (Darwin 25.3, Apple
Silicon). Scripts live in `research/device/` (run with `uv run --with python-rtmidi python <script>`).
**Rule:** every message sent to the device is listed here with its purpose. Nothing that changes device
state is sent without telling the owner first.

## 2026-09-26 — first contact (read-only)

### USB enumeration (`ioreg`, `system_profiler`, `usbdesc.py` — no transfers)

| Field                    | Value                                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Vendor / product strings | `teenage engineering` / `OP-XY`                                                                                  |
| VID / PID                | `0x2367` / `0x8021`                                                                                              |
| bcdUSB / bcdDevice       | `0x0200` / `0x0257` (meaning of 0x0257 unknown — not obviously the OS version)                                   |
| Speed                    | High-speed, 480 Mb/s                                                                                             |
| Configurations           | 3, **identical interfaces**, differing only in bMaxPower: 500 mA, 100 mA, 2 mA (likely charge/power negotiation) |
| Active configuration     | 1                                                                                                                |

Interfaces (every configuration):

| #   | Class / subclass | Meaning                                               | Endpoints           |
| --- | ---------------- | ----------------------------------------------------- | ------------------- |
| 0   | Audio / 0x01     | AudioControl (UAC1, protocol 0x00)                    | 0                   |
| 1   | Audio / 0x02     | AudioStreaming "Audio In" (OP-XY → host), alt1 active | 1                   |
| 2   | Audio / 0x02     | AudioStreaming "OP-XY Out" (host → OP-XY), alt1       | 2 (data + feedback) |
| 3   | Audio / 0x03     | **MIDIStreaming** "OP-XY Midi"                        | 2 (bulk in/out)     |

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

| Bytes         | Meaning                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------ |
| `7E 21 06 02` | Universal non-realtime, **SysEx device ID 0x21**, identity reply                           |
| `00 20 76`    | Manufacturer: **Teenage Engineering**                                                      |
| `21 00`       | Family code 0x0021 (LSB first)                                                             |
| `01 00`       | Family member 0x0001                                                                       |
| `00 00 00 00` | Software revision — **not reported** (zeros), so firmware version must come from elsewhere |

**MIDI echo is ON by default**: the device re-transmitted our SysEx. Our input handler must ignore
echoes of our own output (or the owner turns echo off in COM) to avoid feedback loops and false
"device changed" events.

## 2026-09-26 — TE SysEx protocol (read-only; `te_sysex_probe.py`)

Frame format, packing and command numbers come from TE's own web update utility and EP sample tool
(`docs/research/60-firmware.md` §4). Our packed-7 codec was verified against TE's JS implementation
on 33 random vectors before anything was sent. The script hard-blocks DFU (0x03), 0x7F, SETTINGS SET
and every FILE sub-command other than INIT (no subscribe) and LIST.

| Sent (rid varies)                                               | Purpose                                        | Reply                            | Result                                                                                                                                         |
| --------------------------------------------------------------- | ---------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `F0 00 20 76 21 40 7x xx 01 F7`                                 | **GREET** (TE's updater sends this on connect) | status 0, ASCII metadata         | ✅ `product:OP-XY; mode:normal; os_version:1.1.33; sw_version:1.1.33; hw_rev:2; sku:TE033AS001` (+ `serial`, `dsp_serial` — not recorded here) |
| ECHO `DE AD BE EF 00 7F 80 FF 01`                               | codec round trip                               | status 0, identical bytes        | ✅ packed-7 codec correct end to end                                                                                                           |
| SETTINGS INIT `[01 03 E8]` (TE's updater sends this on connect) | typed settings?                                | **status 2 "command not found"** | ❌ OP-XY has no SETTINGS over SysEx                                                                                                            |
| FILE INIT `[01 00 00 40 00 00]` (flags 0, max response 4 MiB)   | filesystem over SysEx?                         | status 0, data `0C 00 02 00 00`  | ✅ **supported**; chunk size 0x00020000 = 128 KiB (first byte 0x0C meaning unknown)                                                            |
| FILE LIST page 0, node 0                                        | root listing                                   | page 0 + 2 entries               | ✅ `drum` (id 1) and `synth` (id 2), both flags dir+read+write, size 0                                                                         |
| FILE LIST page 1, node 0                                        | end of root                                    | page 1, no entries               | end of listing                                                                                                                                 |
| FILE LIST page 0, node 1 / node 2                               | contents of drum / synth                       | page 0, no entries               | both **empty** on the owner's unit                                                                                                             |

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

## 2026-09-26 — FILE discovery R1/R2 (read-only; `te_sysex_probe.py discover`)

Plan from `30-presets-samples.md` §6.4. Frames follow TE's EP sample tool exactly.

| Sent                                                 | Purpose                               | Reply                                    |
| ---------------------------------------------------- | ------------------------------------- | ---------------------------------------- |
| FILE INIT `[01 00 00 40 00 00]`                      | open session (no subscribe)           | status 0                                 |
| FILE INFO `[0B 00 0n]`, n = 0, 1, 2                  | node info (parent, flags, size, name) | **status 3 "bad request"** for all three |
| FILE METADATA GET `[07 02 00 0n 00 00]`, n = 0, 1, 2 | folder metadata (accepted formats)    | **status 3 "bad request"** for all three |

Afterwards FILE INIT + LIST and GREET still worked normally (no wedge).

Findings: the OP-XY's FILE implementation on 1.1.33 is **not the EP-133 dialect**. INIT and LIST
match; INFO and METADATA GET are refused (maybe different sub-command numbers or payloads, or simply
unsupported). The INIT reply's first byte `0x0C` may be a protocol version. So the EP tool's upload
recipe (raw PCM + METADATA SET) can't be assumed to work; a PUT test would be exploratory. Next
read-only lead: see which TE SysEx commands **Field Kit** sends to the OP-XY (it greets the device and
switches it into MTP mode over SysEx; `30-presets-samples.md` §6.1).

## 2026-09-26 — Session 1 results (owner present, scratch project, OS 1.1.33)

The owner created a new empty project first (project → hold M1). Every step was announced; state was
restored afterwards (tempo 120, track 1 unmuted and selected). Transcripts: `captures/spike-*.jsonl`.

**Stock COM → system settings → midi (as found):** clock **in** (receive only), notes **both**,
other **both**, active track channel **1**, midi echo **off**. The owner then set **clock = both**
for the tests (still set).

| #     | Test                                                     | Result                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3     | Transport out, clock = in                                | **Nothing sent** (no FA/FC/F8) — stock settings don't transmit transport or clock                                                                                                                                                                                                                                                                                                                                   |
| 3     | Transport out, clock = both                              | Each **play** press → `FA` (a restart while playing is another `FA`); **stop** → `FC`; **no** `FB`/`F2`. **`F8` runs continuously, even while stopped** (960 ticks in 20 s = 120.0 BPM)                                                                                                                                                                                                                             |
| 11    | Transport in (`FA`, `FC` from us)                        | ✅ starts and stops playback; the device re-transmits `FA`/`FC`                                                                                                                                                                                                                                                                                                                                                     |
| 16    | CC80 tempo                                               | ✅ **BPM = 2 × value, clamped to 40–220** (0→40, 32→64, 60→120, 64→128, 96→192, 127→220; measured from the device clock and confirmed on the metronome page). 2-BPM resolution; values 20–110 are the useful range                                                                                                                                                                                                  |
| 15    | CC9 mute (ch1, watched via mix + shift LEDs)             | ✅ **0 = unmuted, 1–127 = muted**; a level, not a toggle (64 while muted stays muted)                                                                                                                                                                                                                                                                                                                               |
| 24    | CC106/107 remote keys                                    | ❌ **No effect on 1.1.33**: instrument (2) on ch1 and ch16, play (51) on ch1 — screen unchanged, no `FA`                                                                                                                                                                                                                                                                                                            |
| 23    | CC104 / CC105                                            | ✅ **CC104 127 = play** (device sends `FA`), **CC105 127 = stop** (`FC`)                                                                                                                                                                                                                                                                                                                                            |
| 23    | CC102                                                    | ✅ **track select, zero-based**: value 2 selected track 3 (value 0 → track 1)                                                                                                                                                                                                                                                                                                                                       |
| 12    | USB audio capture                                        | ✅ `ffmpeg -f avfoundation -i ":OP-XY"`: 44.1 kHz / 16-bit / stereo; 8 MIDI-triggered notes on track 1 show as 8 clear bursts, silence −106 dB. **The agent can hear the device**                                                                                                                                                                                                                                   |
| 13/32 | MTP mode (com → M4)                                      | Re-enumerates as **PID 0x0021**, 1 config, **1 interface, class 0xFF (vendor) sub 0x01 proto 0x01**, bulk IN 0x89 / bulk OUT 0x0A / interrupt IN 0x83. **MIDI ports disappear.** Class 0xFF is not WebUSB-protected and nothing on macOS claimed it                                                                                                                                                                 |
| —     | MTP session from our own code (`mtp_list.py`, read-only) | ✅ GetDeviceInfo: `teenage engineering` / `OP-XY` / device version **`1.1.33`** / ext `microsoft.com: 1.0;`; 22 ops incl. GetObject, SendObjectInfo/SendObject, DeleteObject, MoveObject, GetPartialObject, object-prop ops (9801–9805). Storage "OP-XY" 8.59 GB (8.36 free). Tree: `projects/{user/, templates/, workspace.xy}`, `samples/user/`, `presets/{snapshot/, <a user sound pack>/}`, `how_to_import.txt` |
| —     | MTP exit behaviour                                       | **Closing the MTP session makes the OP-XY leave MTP mode by itself** and return to MIDI                                                                                                                                                                                                                                                                                                                             |
| —     | `workspace.xy` download (`mtp_get.py`, read-only)        | 9,534 B blank 1.1.33 project; header **`DD CC BB AA 09 14 07 86`** (1.1.4 = `09 13 03 86`, 1.1.21 = `09 13 06 86`) → **format version bumped after 1.1.21**. Upstream `inspect_xy.py` still decodes tempo/groove/preset paths; the pattern directory needs re-mapping (M6)                                                                                                                                          |

Also observed: with echo **off**, the universal identity request was still sent back earlier — so
something other than the echo setting forwards universal SysEx. Open.

Implications:

- Onboarding recommends **clock = both** (lets the app mirror play state and tempo).
- The replica **cannot press device keys** on 1.1.33; it drives transport (FA/FC or CC104/105),
  track select (CC102), tempo (CC80), mutes (CC9) and parameters by CC, and **teaches** navigation by
  animating the keys for the user.
- **WebUSB-MTP is viable on macOS/Linux** (vendor-class interface): read the current project
  (`workspace.xy`), write projects/presets, then close the session to return the device to MIDI mode.
  Entering MTP still needs the owner (com → M4) unless we find Field Kit's SysEx command.

## 2026-09-26 — First end-to-end test of the app (owner, Chrome, live site)

The deployed `/lab` page (https://neovand.github.io/op-xy-agent/lab, device layer from
`src/lib/device`) was tested by the owner in desktop Chrome with Web MIDI + SysEx permission: **connect
works** (identity + GREET → OP-XY / 1.1.33 / hw rev 2 / TE033AS001, serial hidden), **play/stop and
track mutes work from the browser**. First proof that the static web app controls the real device.

## 2026-09-26 — What the device transmits in normal use (owner's project, clock = both)

Passive 25 s capture, started as the owner was asked to press keyboard keys, track 3, M2, the dark
encoder and play/stop: **only `F8` clock arrived** (1,400 ticks = 140 BPM, the project tempo). No
`FA`/`FC` came either, although session 1 verified the device sends them on every play/stop with clock
= both, so the owner had probably not reached those steps inside the window; the negative result for
keys and the encoder rests on the earlier research, not on this capture alone. No keyboard notes is
what our manual (`project.midi-channels`) predicts: tracks transmit notes only after the project gives
them a MIDI channel (project → M4 → midi page), and a fresh project has every channel off.
Implication for the replica: it mirrors notes (keyboard + sequencer) and the pitch-bend pad once track
channels are set, transport and tempo with clock = both, and never mode keys, M-keys or encoders in
normal use (only controller mode transmits those). The home page now says so and shows which channels
notes arrive on. Next: T28 (set T1 → channel 1, play keys and the sequencer, capture).

## 2026-09-27 — Synth calibration session (owner present, new project, OS 1.1.33)

Approved by the owner in chat: "go in and play all the engines, collect samples, run experiments".
Setup by the owner, by hand: a **new project** (hold M1 in the project view); engines T1 simple,
T2 organ, T8 wavetable (T3–T7 keep the defaults: prism, epiano, dissolve, hardsync, axis); on every
one of these tracks the **filter and LFO switched off** (T1, T2, T8 also a flat envelope).

What we send (`research/device/synth_capture.py … --send`, allow-listed in the script): on the
track's channel only, CC 12–15 (engine P1–P4) and CC 20–23 (amp envelope: attack 0, decay 64,
sustain 127, release 10 before every take), note on/off at velocity 100, and CC123 (all notes off)
at the end. No filter or LFO CCs, no transport, no SysEx, no project load. While sending, ffmpeg
records the OP-XY's USB audio (44.1 kHz, 16-bit stereo) into git-ignored
`research/device/captures/synth/<time>-<engine>/` with a cue sheet (`cues.json`).

Runs (appended as they happen):

1. 11:59 `test` and 12:00 `simple` (29 takes) on channel 1 — **invalid, wrong track.** The stock
   MIDI settings make channel 1 the _active track channel_, and T7 (axis) was selected, so every
   note played axis and the CC12–15 sweeps and envelope CCs went to T7's axis (the owner noticed).
   T7's M1 ended at tone 0, ratio 0, shape 127, tremolo 0; its envelope at attack 0, decay 64,
   sustain 127, release 10. Fix: each run first selects its track with **CC102** on channel 1
   (verified), then plays on channel 1. Captures kept as `…-test`, `…-simple-invalid-t7`.
2. 12:10–12:26, diagnosis (T1 selected by CC102): notes piled up because T1's release was minutes
   long (the owner's first "flat" envelope) and CC20–23 did not change it, though CC12–15 plainly
   reach the track: they seem to edit whichever envelope M2 shows. `relcheck` (release CCs + one
   note), `cccheck` (CC12 flipped under a held note; velocity-0 note-off), `offcheck` (T3, default
   envelope: note-off stops at once). ffmpeg also lost ~4 s per 100 s, so recording moved into the
   capture script (PortAudio), each cue stamped with the recording frame it was sent at (latency
   45 ms). The owner then set **every track: rectangular envelope (attack 0, sustain 100, release 0),
   LFO and filter off, FX sends (delay, reverb) to 0**; no envelope CCs are sent any more.
3. 12:29 and 12:31 `simple` on T1 (58 notes: A2 and A4 per take) — clean. Our model matches the
   device within 0–2 dB per harmonic (shape morph = saw − k·square, PW acting only on the square),
   except: noise is a crossfade (saw full to ~60 %, gone at 100 %, loudness steady) and stereo is a
   slow opposite phase wobble of left and right (±10–17° at A2, ±37–45° at A4, ~1–2 Hz), not a
   static detune. Narrowest pulse ≈ 6 %.
4. 12:55 `organ` on T2 and the start of `wavetable` on T8 — **engine sweeps invalid**: the notes
   (channel 1, the active track) reached T2/T8, but CCs on channel 1 reached **T1**, so the organ
   played its stored settings throughout (kept: `…-organ-fixed-params`) and T1's simple took the
   sweeps. `chcheck-1` settled it: CC12 on channel 2 changes T2's organ, and a note on channel 2
   plays T2 while T8 is selected. **Channel N reaches track N for notes and CCs**; channel 1 also
   follows the selected track for notes. The script now sends everything on the track's channel.
5. 13:01 `organ` on T2 (correct routing) — **contaminated**: an A1 left hanging on T8 by the killed
   wavetable run (sent on channel 1 while T8 was selected) droned at −14 dBFS through it; the
   all-notes-off sent afterwards on channels 1–8 did not release it (a note that came in on channel
   1 is released by channel 1 while its track is selected). `release_all` (each track selected in
   turn, note-offs 0–127 and CC123 on channel 1 and on the track's channel) cleared it: −103 dBFS.
   The capture script now clears its track first and releases its note when killed.
6. 13:06 onward, the clean chain (each engine on its own track and channel, owner's settings: filter,
   LFO, FX off, flat envelopes; CC 12–15 per take, notes A1–A6, CC123 at start and end):
   `organ` T2 (125 notes), `wavetable` T8 (425), `prism` T3 (114), `epiano` T4 (90), then
   dissolve T5, hardsync T6, axis T7 and long-note stereo takes of simple T1 and prism T3. The organ
   capture fitted the new organ engine (`57-synth-engines.md`, organ): every type's partials within
   0.1–0.2 dB.

## Session 1 runbook (owner present, ≈20–30 min)

Tool: `research/device/spike.py` (refuses TE SysEx and CC86; transcript in `captures/`). Test numbers
refer to `20-midi-control.md` §11. **Before starting, the owner creates a new empty project** so no
existing work is touched; stock COM settings.

| Step       | Owner does                           | We send (`spike.py …`)                                            | Observe                                           | Risk            |
| ---------- | ------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------- | --------------- |
| 1 (#3)     | press play, stop, play-while-playing | `listen 12`                                                       | `FA`/`FC`/`FB`/`F2`? clock `F8` while playing?    | safe            |
| 2 (#11)    | watch transport                      | `raw FA`, then `raw FC`                                           | does playback follow?                             | audible         |
| 3 (#16)    | read the tempo                       | `cc 1 80 60`, `cc 1 80 0`, `cc 1 80 127`                          | BPM shown → CC80 scaling; owner restores tempo    | state (scratch) |
| 4 (#15)    | watch track 1                        | `cc 1 9 127 0 1 64 0`                                             | mute polarity/threshold                           | state (scratch) |
| 5          | watch mixer                          | `cc 1 7 20 100`                                                   | volume response                                   | state (scratch) |
| 6 (#17)    | read groove                          | `cc 1 81 63 64`                                                   | which value = no groove                           | state (scratch) |
| 7 (#10)    | listen, drum track 1                 | `note 1 53 55 57 60 62 64`                                        | which keys sound; octave mapping                  | audible         |
| 8 (#24)    | watch the screen                     | `rk 5`, `rk 2` (and `--ch 16`)                                    | do remote keys work on 1.1.33?                    | UI              |
| 9 (#25/26) | watch the screen                     | `rk 7`, `rk 10`; `rkcombo 55 2`                                   | encoder-click keys; shift combos; shift not stuck | UI              |
| 10 (#23)   | watch                                | `cc 1 102 2`, `cc 1 104 127`, `cc 1 105 127`                      | CC102/104/105 meaning                             | UI/audible      |
| 11 (#14)   | —                                    | `note` without off via `raw 92 3C 40`, then `cc 3 123 0`; `panic` | notes silenced                                    | audible         |
| 12         | play a pattern                       | `ffmpeg -f avfoundation -i ":OP-XY" -t 5 captures/usb-audio.wav`  | USB audio capture works; levels                   | safe            |
| 13 (#32)   | COM → M4 (MTP), later M4 to exit     | `usbdesc.py`, `listen 3`                                          | MTP interface class/PID; MIDI port gone?          | safe            |
| 14         | (only if approved + backup)          | FILE PUT plan in `30-presets-samples.md` §6.4                     | where the file appears; then DELETE               | **writes**      |

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
