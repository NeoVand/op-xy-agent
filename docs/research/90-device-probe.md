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
   0.1–0.2 dB. The chain completed, and every capture has since been fitted (note 57 §3): prism,
   epiano, dissolve, hardsync, axis and wavetable, the last with its tables' rules, warp as FM by a
   sine and drift's slide to half the note. Nothing else was sent to the device after the chain.

## 2026-09-27 — Screen profiling by camera (owner present, new project, OS 1.1.33)

Setup by the owner: an iPhone on a mount over the screen (Continuity Camera); a **new empty
project**, T3 selected, its M2 (envelope) page showing. Terminal.app runs
`research/device/camera.command` (the agent's shell cannot get camera access), which writes the
camera's latest frame ten times a second; `screencap.py` maps the screen onto its own 480 × 222 grid.
The camera alone sends nothing.

What we send (`research/device/envsweep.py`, allow-listed in the script): **CC 20–27 on channel 3
only** (T3's amp envelope A/D/S/R and filter envelope A/D/S/R). No notes, no other CCs, no SysEx.
T3's envelopes in the scratch project are the only state changed.

1. 21:50–21:51, approved in chat ("ready"): the first sweep, 152 messages. Every other stage sat at
   attack 0, decay 64, sustain 64, release 64 while one stage stepped 0, 8, …, 120, 127. It ended
   with both envelopes at that base. The captures (`env-*`) were taken 0.45 s after each CC and show
   the **previous** state: the camera runs about 0.8 s behind. Found:
   - each encoder moves one handle;
   - the release lane is a handle position, so a higher value gives a shorter release;
   - there is no flat segment after the attack.
2. 22:16–22:20, after the camera was knocked and re-calibrated (22:13) ("Please take all the pictures you need"):
   `--plan amp` (`env2-amp-*`), 194 states and 270 messages. Each state waits until the screen has
   changed and held still (0.8–0.9 s), then averages three frames. The run covers:
   - the amp envelope stage by stage (25 values each, fine near 0 and 127), with the filter
     envelope out of the way (0, 0, 0, 127);
   - decay and release against four sustain levels;
   - the extreme layouts;
   - the filter envelope as drawn when not selected;
   - both envelopes together.
3. 22:23–22:25, after the owner clicked an encoder (M2 then shows the filter envelope): `--plan filter`
   (`env2-filter-*`), 119 states and 178 messages. The run covers:
   - the filter envelope stage by stage (13 values each), with the amp envelope out of the way;
   - decay and release against sustain;
   - the extreme layouts;
   - the amp envelope drawn dim.
     T3's envelopes end at amp 0/0/0/127 and filter 0/64/64/64. Every state in runs 2 and 3 changed
     the screen visibly. CC 24–27 move the filter envelope whichever envelope M2 shows (and CC 20–23
     the amp), so the note from the calibration session that CC 20–23 edit "whichever envelope M2
     shows" was wrong. Its long releases fit the inverted release lane instead: we had sent release 10,
     which is a long release.
4. 22:30–00:53, step by step with the owner (`research/device/stepcap.py`, allow-listed; log in
   `captures/screens/steps.json`). The owner opened each page by hand; the script moved its
   parameters and saved the screen after every value. A watcher (`screencap.py watch`) also saved every
   page the owner opened. There were 1,049 CC messages, and nothing but CCs:
   - **Instrument T3 (channel 3):** CC 7 and 10 (level, pan), 12–15 (M1 on all eight synth engines,
     plus a probe on the sampler), 32–35 (filter), 38 (FX I send), 40–43 (all five LFO types).
   - **Drum T1 (channel 1):** CC 12–15, which the drum sampler ignores.
   - **Channel 1:** CC 102 (track select, once), 80 and 81 (tempo, groove).
   - **Master EQ:** CC 90 on channels 1–4.
   - **Aux tracks:** brain (channel 9: 12–15, plus a probe of 32 and 35); external MIDI (11: 12–15,
     40–43); external CV (12: 12–15); external audio (13: 13–15, 32, 35, 40–43; never CC12, the input
     select, so the mic could not open); tape (14: 12–15); FX I (15: 12–15).
     After each sweep the values were set back to what the page showed first (read off the captures),
     except the tape speed (99 %; 100 % lies between two CC values). The owner meanwhile played notes,
     switched players, filter and LFO types, effect types and engines, and entered a short pattern on T3.
     All of it stayed in the scratch project, and nothing was saved, loaded or deleted.

   Findings (in full in note 59):
   - The drum sampler, synth sampler and multisampler ignore CC 12–15, as does the external CV page.
   - Every other page answered its lanes.
   - After a filter type is picked, the device returns to M1.
   - The phone's view shifted about 115 camera px between roughly 00:30 and 01:00 and came back
     (found by phase correlation against the device body). Captures of that stretch are re-rectified
     per frame, and the calibration is now fitted on the lit tempo page (`screencap.py calib --lit`).

## 2026-09-28 — Sound session: filters, envelopes, LFOs (owner present, new project, OS 1.1.33)

Approved by the owner in chat ("let's do sound sessions now"; "I'll be happy to press the buttons or
configure instruments"). Setup by the owner, by hand: a **new project**; the **simple** engine on
T3–T7 (from the preset browser); filters T3 off, T4 ladder, T5 svf, T6 z lowpass, T7 z hipass;
LFOs off on T3–T7. For the LFO part the owner then picks T3 tremolo, T4 value, T5 random, T6 duck,
T7 element.

What we send (`research/device/sound_capture.py … --send`, allow-listed in the script): on the
test tracks' own channels (3–7), CC 12–15 (simple: saw or full noise), 20–27 (both envelopes),
28–29 (poly, no portamento), 32–35 (filter), 36–39 (sends at zero), 40–43 (LFO, LFO part only),
notes at velocity 100 and CC123; on channel 1, CC102 (track select), CC80 = 60 (120 BPM, LFO part)
and, for the duck takes only, CC7 = 0 (T1's level) and T1's note 53, which trigger the duck. No
SysEx, program change, transport or project load. The script records the OP-XY's USB audio
(44.1 kHz stereo, PortAudio) into git-ignored `research/device/captures/sound/<time>-<plan>/`
with a cue sheet stamped in recording frames.

Runs (appended as they happen):

1. 11:41 `check` (10 takes, 255 messages): a saw and noise on each of T3–T7. Peaks under 0.4 of
   full scale; T3's noise unfiltered (centroid 11 kHz), the four types plainly different; every
   note stops within about 0.1 s of its note-off stamp (the recorder's block timing) and the
   output is digital silence between takes, so no sends and no release tail.
2. 11:42–11:52 `filters` (223 takes, 238 notes, 5399 messages): T3's noise and saw references and
   amp envelope laws; per type (T4–T7) a cutoff sweep on noise, resonance at three cutoffs and the
   saw through a resonant filter; key tracking on the ladder and svf; the svf's filter envelope
   (amount and decay). Completed; results below.
3. 12:07–12:14 `lfo-check`, one take per track (32 messages each) after the owner picked T3
   tremolo, T4 value, T5 random, T6 duck, T7 element; the owner photographed each M4 page: value
   and random read amount centred at CC41 = 64 (the ladder is bipolar), destination filter (CC42 =
   96 of six on value; random's single card), parameter cutoff (CC43 = 16); random also shows an
   env card (a rising ramp) no encoder reaches; element: source envelope (CC40 = 80), destination
   filter (CC42 = 80 of syn · env · filter · amp), cutoff; duck: source "tr 1" (CC40 = 4) with the
   MIDI icon dark and the audio icon faded, so notes trigger it.
4. 12:16–12:22 `lfo` (83 takes, 85 notes, 2443 messages; CC80 = 60 first): tremolo rate, level
   and pitch depth and env on T3; the value LFO's speed, amount and retrigger on T4's cutoff; the
   random LFO's speed on T5's cutoff; the duck's hold and release on T6 with T1 struck four times
   per take (T1's level CC7 = 0, then 100 for the last take); element's amount on T7. Completed.
5. 12:22 `envtop` (10 takes): the decay (88–127, sustain 0) and release (40–0) the first run did
   not reach, on T3's saw with its tremolo depths at zero (CC41 = CC42 = 64).
6. 12:39–12:44 `fade` (notes only, T1 selected by CC102 so channel 1 reaches it; 8 messages a
   run): T1's highest drum key (E5, 76, a cymbal) three times at sample fade 0, 99 and 50, then the
   lowest (F3, 53, a 0.18 s kick) at 0 and 99, the owner turning shift + E3 between runs. The fade
   is a linear fade-in from the start marker lasting a fixed time: about 0.95 s at 99, 0.25 s at 50
   (the kick at 99 never reaches full level).
7. 12:46–12:51 `crossfade` (notes on channel 8 only): T8 loaded by the owner with the synth
   sampler's first preset ("80s lover", tune −12.00), two notes of 5 s (A3) and 10 s (A5) at
   crossfade 0 and at the maximum, which reads **75 %** (the owner's photo: a dark wedge sloping
   down into the loop end over three quarters of the loop). The preset changes over time by itself,
   so the recordings do not isolate the crossfade; not used for the sound.
8. 12:53 `punchin` (notes on channels 2 and 3 only): a two-minute loop while the owner held each
   punch-in key on aux T2 in turn. Not usable: the owner could not time the presses and the loop
   hid some effects.
9. 12:57 `punchin-mix` (notes on channels 2–5, CCs 12–15/20–39/41–42 on 3–5 for the loop's
   tone, notes 53–76 on channel 10): the owner saw each key's animation (channel 10 fires the punch-
   in track), but the loop was too busy and the 2 s holds too short to hear every effect.
10. 13:06 `punchin-keys` (49 messages, all notes on channel 10): over a project the owner loaded
    and played ("agent"), 8 s of it alone, then each punch-in key 53–76 held 6 s, 2 s apart, the
    owner tilting the unit for the effects that follow the accelerometer. First look: keys 1, 3,
    22, 24 cut the highs (11–36 dB); 8, 10, 15 add them; 12 thins the lows; 13, 14, 21 chop the
    level (13 also narrows the stereo image to mono).

Nothing else was sent. The throwaway project was not saved.

## 2026-09-28 (evening) — The app's MTP client on the unit (owner present, OS 1.1.33)

The owner ran the app in Chrome (the live site's `/lab`, "storage (mtp)"), the OP-XY in MTP mode
(`com → M4`, put there by the owner). Read-only: GetDeviceInfo, OpenSession, GetStorageIDs,
GetStorageInfo, GetObjectHandles/GetObjectInfo for the top level and `projects/`, GetObject of
`projects/workspace.xy`, CloseSession. Nothing was written.

1. The first try, in the Claude app's built-in browser, failed at once ("No device selected"): that
   browser offers no WebUSB device picker. In Chrome the picker listed the OP-XY (VID 0x2367,
   PID 0x0021, as `ioreg` showed) and the panel read `teenage engineering OP-XY 1.1.33`, storage
   "OP-XY", 7.79 GB free of 8.00 GB; top level `presets/`, `projects/`, `samples/`,
   `how_to_import.txt` (6.0 KB).
2. `workspace.xy` downloaded whole (49 KB, header `09 14 07 86`): the open project was TE's factory
   project **"agent"** (the owner: probably saved by an older firmware). Tempo 123, groove amount 30,
   metronome off, 9 scenes, song 1 of 16 entries, songs 11–14 empty; T1 organ/fm organ, T2
   drum/in phase, T3 bass/vogel, T4 bass/alloy, T5 snapshot/sonar, T6 pluck/on tape, T7
   keys/elect piano, T8 dissolve without a preset. It stores its time signature as the bare index
   (4/4 = 1) where 1.1.4 new projects store 0x11; the reader now takes both
   (`core/xy/model.ts` timeSignatureOf) and the project round-trips byte for byte.
3. "disconnect" closed the session and the OP-XY left MTP mode by itself, as with our Python probe.
4. The project card on the home page, "load from the op-xy" (read-only: the same reads plus GetObject
   of `projects/workspace.xy`): the replica loaded "agent". A red "transferIn … transfer error"
   followed: the OP-XY had left MTP mode before answering CloseSession. Now ignored on close
   (e6f81d3).
5. **The first write** (announced to the owner and done by the owner's click): "save to the
   op-xy…" as `test 1` — GetObjectHandles/GetObjectInfo to find `projects/workspace.xy` and
   `projects/user`, GetObject of the workspace as the template, then SendObjectInfo + SendObject
   of `projects/user/test 1.xy` (49 KB, the replica's unchanged "agent", so the same bytes as the
   workspace). The card read "saved as projects/user/test 1.xy". On the device `test 1` showed in
   the project list, opened, and played like "agent" (the owner: "identical as far as I can say").
   Nothing else was written, replaced or deleted.
6. **An authored project** (announced; the owner's click): in the replica the owner lit steps 1, 5,
   9 and 13 on T1 (fm organ, whose first pattern was empty), then "save to the op-xy…" as `test 2`
   (the same operations as `test 1`: one new file, `projects/user/test 2.xy`, written over the
   open project). On the unit `test 2` opened and played an organ hit on every beat of the first
   scene, with the same four step keys lit (the owner: "it worked fully"). Notes written by the
   replica (`simToXy` over the device's own project) load and play on OS 1.1.33.

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
