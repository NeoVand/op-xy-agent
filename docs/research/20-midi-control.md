# 20 — Live MIDI control & observation of the OP-XY

> Research note for the OP-XY Agent (see `docs/VISION.md`). Scope: everything about **controlling and
> observing the OP-XY live over MIDI** (USB first). Written 2026-09-26 by a research agent.
> **This agent sent nothing to the device.** Device-facing claims come from official TE pages,
> community code/docs, or — where tagged **verified** — from the lead agent's read-only probe of the
> owner's unit on OS 1.1.33 (`docs/research/90-device-probe.md` [PROBE], protocol detail in
> `docs/research/60-firmware.md` §4 [FW]). Section 11 lists the remaining device tests with exact bytes.
>
> Machine-readable companions (our own structuring of the facts, each entry with `source`):
> `knowledge/midi/cc-map.json` and `knowledge/midi/remote-keys.json`.
>
> Citations are source keys like **[TE-MIDI]**; every key resolves to a URL and/or a local file path in
> the **Sources** table at the end. Raw snapshots of everything fetched live in `research/web/`
> (gitignored, third-party content).

**Confidence legend** (used throughout and in the JSON files)

| tag                    | meaning                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------- |
| **verified**           | observed on the owner's OP-XY (OS 1.1.33, 2026-09-26) by the lead agent's probe [PROBE] |
| **official**           | stated on teenage.engineering (guide, MIDI reference, changelog, TE's own updater code) |
| **community-verified** | ≥2 independent community sources, or tooling that was clearly run against hardware      |
| **community**          | one community source (or several that copy each other); plausible, unconfirmed          |
| **derived**            | inferred by us from structural consistency across sources (testable prediction)         |
| **speculative**        | educated guess; treat as unknown until probed                                           |
| **conflicting**        | sources disagree; candidates listed                                                     |

**Firmware of record.** The owner's unit runs **OP-XY OS 1.1.33** (GREET `os_version:1.1.33`,
`hw_rev:2`, SKU `TE033AS001` [PROBE]) — also the latest public release (2026-09-02 [TE-REL]). The
community sources span 1.0.x (2024–25) to 1.1.21 (2026-07). Apart from the items tagged _verified_
(USB/port enumeration, idle behaviour, identity/GREET/ECHO/FILE SysEx, echo of foreign SysEx),
nothing here has been checked on 1.1.33 yet — that is what the probe plan in §9/§11 is for.

---

## 1. TL;DR

> **Verified on the owner's OP-XY, OS 1.1.33, device session 1 (2026-09-26)** — details in
> `90-device-probe.md`; these override anything below that disagrees:
>
> - Stock COM MIDI settings: clock **in**, notes **both**, other **both**, active track channel 1,
>   echo **off**. With clock **in** the device sends no transport and no clock.
> - Clock **both**: `FA` per play press (restart = another `FA`), `FC` on stop, no `FB`/`F2`, `F8`
>   runs continuously even while stopped. Incoming `FA`/`FC` start/stop playback.
> - **CC80: BPM = 2 × value, clamped 40–220** (T16 resolved). **CC9: 0 = unmuted, 1–127 = muted**
>   (level, not toggle). **CC104 = play, CC105 = stop, CC102 = track select (zero-based)**.
> - **CC106/107 remote keys: no effect on 1.1.33** (channels 1 and 16; keys 2 and 51).

1. **The official CC table is tiny**: CC7 volume, CC9 mute, CC10 pan, CC46 "track parameters" on
   channels 1–16; CC80 tempo, CC81 groove, CC82 delayed scene, CC83/84 prev/next scene, CC85 scene,
   CC86 project on _any_ channel; CC90 EQ on channels 1–4; all 0–127 [TE-MIDI]. Everything else
   (CC12–43 per track) comes from a TE MIDI chart the community transcribed [SHEET][XYF-CCMAP][MIDIGUIDE].
2. **A "lane model" explains the whole per-track map (derived, strong evidence).** CC numbers address
   the four encoders of each module page in order: M1 = CC12–15, M2 (amp env) = CC20–23, M2 alt page
   (filter env) = CC24–27, M2+shift = CC28–31, M3 = CC32–35, M3+shift = CC36–39, M4 (LFO) = CC40–43.
   It matches the official module descriptions [TE-INST][TE-AUX], xy-format's decoded per-track
   storage lanes ("CC29 current lane", …) [XYF-WRITER], and every aux-track entry in the chart
   (e.g. audio-in _shift+mid = tape send_ ⇔ CC37). It also predicts untested CCs (CC16–19, CC42/43,
   MIDI-track CC20–23/28–31) — see §3.0.
3. **The CC28–31 "conflict" is resolved in favour of the official chart**: play mode
   (poly/mono/legato), portamento, bend range, preset/engine volume. xy-format's newer decoded-image
   work pins CC28–31 to exactly those M2-shift lanes [XYF-WRITER][XYF-SPATIAL]; the old p-lock names
   that opxy-reactive flagged came from a superseded model [XYF-PLOCKS].
4. **Channels**: by default channel N ↔ track N — 1–8 instrument tracks, 9 brain, 10 punch-in FX,
   11 external MIDI, 12 external CV, 13 external audio, 14 tape, 15 FX I, 16 FX II
   [TE-AUX][SHEET][REACT-DESIGN]. An **"active track channel"** additionally routes incoming notes to
   whichever track is selected (official setting; community reports it duplicates notes when it
   collides with a track channel) [TE-COM][GEN-INDEX]. Per-track **output** channels
   (project → config → midi) are **off** in a fresh project [XYF-PROJCFG] — tracks don't send their
   sequenced notes until assigned [REACT-DESIGN].
5. **The OP-XY is receive-mostly.** Turning encoders on normal tracks transmits nothing
   (community-verified negative result). It _sends_: clock + Start/Stop (no Continue, no SPP),
   sequenced notes on assigned channels, pitch-bend strip, the MIDI track's 8 CCs / bank / program,
   and — in **controller mode (COM → M2)** — a complete emit map (encoders CC1–4, encoder clicks
   CC15–18, keys as CCs, keyboard as notes 53–76) [DECK-CENSUS][REACT-DESIGN].
6. **Remote UI keys: CC106 = key down, CC107 = key up**, values 0–71 cover every front-panel key
   and the four encoder clicks (not encoder turns or the volume knob) [DAWLESS-CC106][SHEET]. Status by firmware: works ≤1.0.21, reported disabled from
   1.0.25, **re-confirmed on 1.1.4 (2026-03-04 sweep)**, unknown on 1.1.33. New finding: the key index
   maps 1:1 onto controller-mode emits (**ctrl CC = index + 5**, **keyboard note = index + 27**),
   which cross-validates three independent sources and settles that values 10–13 are the four
   encoder clicks (derived).
7. **SysEx (verified on 1.1.33)**: the Universal Identity Request `F0 7E 7F 06 01 F7` returns
   `F0 7E 21 06 02 00 20 76 21 00 01 00 00 00 00 00 F7` — device id **0x21**, SKU `TE033AS001`,
   version bytes **zero**. The OP-XY speaks TE's proprietary protocol
   (`F0 00 20 76 21 40 <flags|rid_hi> <rid_lo> <cmd> <packed7> F7`): **GREET (0x01)** returns
   `os_version:1.1.33; hw_rev:2; …` — firmware becomes first-class state; ECHO (0x02) works;
   SETTINGS (0x06) → "command not found"; **FILE (0x05) works** (root dirs `drum/`, `synth/`, empty)
   [PROBE][FW][TE-UPD]. **DFU (0x03) must be hard-blocked in our transport.**
8. **MIDI echo is ON by default (verified)**: the unit echoed the identity request back, but not TE
   frames. Every input handler must drop echoes of our own output. An idle, stopped unit sends
   nothing — no clock, no active sensing (verified) [PROBE].
9. **Open conflicts that need a probe**: CC80 tempo scaling (0–127 → 40–220 BPM linear
   [MIDIGUIDE][STEMBOUNCE] vs BPM/2 "calibrated" [VIBE-TEMPO]); CC86 filename prefix vs suffix;
   CC40/41 labels; CC90 channel-4 blend; whether CC120/CC123 are honoured; default active-track
   channel; which drum sound sits on which key per kit.
10. **Settings needed for full control**: COM → M1 → midi: clock/notes/other = both, active track ch
    = a channel the agent never uses, echo off (or filter echoes); COM → M3 (devices): enable the
    computer's clock/notes/other and, on page 2, _transport receive_; project → config → midi: T1–T8 →
    ch1–8 if we want to see the device's sequenced notes; **not in MTP mode** (MIDI is unavailable
    there) [XYF-CC86].
11. **Safety**: most "harmless" CCs mutate the project (autosave is on by default [TE-PROJ]); remote
    keys can create/delete projects (hold-gestures fire instantly via CC) or link tracks; switching to
    an empty scene duplicates the current one (UI behaviour [TE-ARR]). Panic = ledger note-offs +
    CC64/120/123 on all channels + (if remote keys work) _stop ×2_ (official: stop twice halts all
    sound [TE-LAYOUT]). Web MIDI cannot cancel timestamped sends, so keep lookahead short.

---

## 2. Channel model

### 2.1 The 16 tracks and their default channels

| Track | Kind       | Aux # (guide) | Default MIDI ch | Default engine / role in a new project                | Sources                               |
| ----: | ---------- | ------------: | --------------: | ----------------------------------------------------- | ------------------------------------- |
|     1 | instrument |             – |               1 | drum sampler ("drum 1")                               | [DAWLESS-CC106][XYF-PLOCK-LOG][SHEET] |
|     2 | instrument |             – |               2 | drum sampler ("drum 2")                               | same                                  |
|     3 | instrument |             – |               3 | prism ("bass")                                        | same                                  |
|     4 | instrument |             – |               4 | epiano ("keys"/pluck)                                 | same                                  |
|     5 | instrument |             – |               5 | dissolve ("lead")                                     | same                                  |
|     6 | instrument |             – |               6 | hardsync ("pluck"/soft pluck)                         | same                                  |
|     7 | instrument |             – |               7 | axis ("pads"/strings)                                 | same                                  |
|     8 | instrument |             – |               8 | multisampler ("pads")                                 | same                                  |
|     9 | auxiliary  |             1 |               9 | **brain** (key/scale detection + live transpose)      | [TE-AUX]                              |
|    10 | auxiliary  |             2 |              10 | **punch-in FX** (24 momentary FX on the keyboard)     | [TE-AUX]                              |
|    11 | auxiliary  |             3 |              11 | **external MIDI** (sequences an external device)      | [TE-AUX]                              |
|    12 | auxiliary  |             4 |              12 | **external CV** (CV tip / gate ring on multi-out)     | [TE-AUX]                              |
|    13 | auxiliary  |             5 |              13 | **external audio** (input: mic/headset/line/USB/main) | [TE-AUX]                              |
|    14 | auxiliary  |             6 |              14 | **tape** (pitch/speed/length/mix looper)              | [TE-AUX]                              |
|    15 | auxiliary  |             7 |              15 | **FX I** (send FX; default delay)                     | [TE-AUX][XYF-AUX-LOGS]                |
|    16 | auxiliary  |             8 |              16 | **FX II** (send FX; default reverb)                   | [TE-AUX][XYF-AUX-LOGS]                |

- The track ↔ channel defaults are **community-verified**: the official CC table lists per-track CCs on
  "channel 1–16" [TE-MIDI]; the community sheet has an explicit channel→track tab [SHEET]
  (`community-cc-sheet-gid2101262780.csv`); all stem tools mute tracks 1–8 via CC9 on channels 1–8
  [STEMBOUNCE][OPXYSTEMS][STEMX]; op-xy-generator played tracks by channel [GEN-MAIN].
- Engines are properties of the _project_ (user changeable; the engine list is axis, dissolve, drum,
  epiano, hardsync, multisampler, organ, prism, sampler, simple, wavetable, and **midi** — renamed
  from "external" in 1.0.15 [TE-DL]; the online guide still says "external" [TE-SYN]).
- Official polyphony: 24 voices, auto-allocated or assigned per track in project → config → voices
  [GUIDE-MD]; community: 8 voices max per track [DAWLESS-LIMITS] (community).

### 2.2 Receive routing (what a channel reaches)

- **Channel N → track N** for CCs and notes (community-verified, see above).
- **Active track channel** (official: "selecting the active track channel (the active track is the one
  currently selected)" in COM → system → midi [TE-COM]). Community: the default is reportedly channel
  1, and when it collides with a track channel, notes are _duplicated_ onto whatever track you switch
  to — op-xy-generator tells users to set it "to something not otherwise mapped" [GEN-INDEX];
  opxy-reactive recommends an unused channel [REACT-DESIGN]. Note that by default _all 16_ channels
  already address a track, so "unused" means "a channel the agent never sends on" (e.g. ch12, the
  external-CV track, when nothing is patched to the multi-out) — or "off" if the menu offers it.
  **Agent rule: detect/ask, then have the user move it off channels 1–8.** Default value and whether
  CCs are also re-routed: open (§11 T8).
- **Project → config → midi** sets "the midi channel on each of the 16 tracks" [TE-PROJ]. Decoded
  storage: `0xFF` = off, `0x00–0x0F` = ch 1–16; **a fresh 1.1.4 project has all 16 off**
  [XYF-PROJCFG]. xy-format's recording experiments assigned channels 1–8 before recording MIDI into
  tracks [XYF-PLOCK-LOG][XYF-CAP16], while stem tools work on default projects — so the most
  consistent reading is: _receive_ N→N is fixed, the project setting governs _output_ (and maybe
  overrides receive). Whether a non-default assignment (e.g. T3 → ch5) also moves the receive
  channel is **open** (§11 T9).
- **MTP mode**: MIDI is unavailable while the OP-XY is in MTP mode ("Exit MTP mode required for
  MIDI") [XYF-CC86] (community). In normal mode the USB descriptor has **no MTP interface** at all —
  MTP must re-enumerate the device (verified absence; details pending) [PROBE]. Our app must sequence
  _MTP deploy_ and _live MIDI_ phases.
- **USB (verified)**: class-compliant high-speed device (VID 0x2367 / PID 0x8021) with UAC1 audio in
  - out and one USB-MIDI streaming interface; **Web MIDI sees exactly one input and one output, both
    named `OP-XY`** [PROBE]. The OP-XY's own SysEx FILE command (0x05) exposes `drum/` and `synth/`
    directories over MIDI (read-only probe) [PROBE][FW] — file transfer without MTP may be possible
    (owned by the firmware/preset research, not this doc).
- Transports: USB-C (device and host), 3.5 mm TRS MIDI in, multi-out jack in MIDI mode (TRS out;
  "cannot be changed while plugged in"), BLE MIDI ("sending and receiving notes and clock")
  [TE-COM][GUIDE-MD]. dawless reports USB-C as the input used for remote keys and the aux (multi-out)
  port as output-only [DAWLESS-CC106].

### 2.3 Transmit routing

- Instrument tracks transmit their **sequenced notes only when assigned an out channel** in
  project → config → midi (plus notes-out enabled in COM) [REACT-DESIGN] (community).
- The **external MIDI track (T11)** and any instrument track running the **midi engine** send on the
  channel chosen on their M1 page (dark knob) [TE-AUX][TE-SYN] (official).
- **Controller mode** sends on the channel chosen with _shift + dark gray_ in COM → M2 [TE-COM]
  (official); default unknown (opxy-deck's parser example shows channel 1 [DECK-BRIDGE]).

---

## 3. The complete CC map

### 3.0 The lane model (derived)

| Module page (what the encoders edit)                               |                                  dark | mid | light | white | Evidence                                                                                                                        |
| ------------------------------------------------------------------ | ------------------------------------: | --: | ----: | ----: | ------------------------------------------------------------------------------------------------------------------------------- |
| **M1** engine / aux M1 page                                        |                                    12 |  13 |    14 |    15 | chart + p-lock captures [SHEET][XYF-PLOCK-LOG]                                                                                  |
| M1 + shift (engine params 5–8?)                                    |                                   16? | 17? |   18? |   19? | _speculative_: p-lock id gap 0x64–0x6A and 8 stored engine params [XYF-PLOCKS][XYF-WRITER]                                      |
| **M2** amp envelope A/D/S/R                                        |                                    20 |  21 |    22 |    23 | [SHEET][XYF-PLOCK-LOG][TE-INST]                                                                                                 |
| M2 alt page (click encoder) filter envelope A/D/S/R                |                                    24 |  25 |    26 |    27 | [SHEET][TE-INST]                                                                                                                |
| **M2 + shift** play mode / portamento / bend range / preset volume |                                    28 |  29 |    30 |    31 | [SHEET][XYF-WRITER] "CC28–31 current lane"                                                                                      |
| **M3** filter cutoff / resonance / env amount / key tracking       |                                    32 |  33 |    34 |    35 | [SHEET][XYF-WRITER][TE-INST]                                                                                                    |
| **M3 + shift** sends: ext (aux out) / tape / FX I / FX II          |                                    36 |  37 |    38 |    39 | [SHEET][TE-INST] "track send"; send words at +0x38A7…+0x38B3 [XYF-AUX-LOGS]                                                     |
| **M4** LFO: speed(source) / amount / destination / parameter       |                                    40 |  41 |    42 |    43 | lane order from aux-LFO storage probe [XYF-AUX-LOGS]; midi.guide "LFO parameter 1–4" [MIDIGUIDE]; chart labels differ (see 3.7) |
| Mixer                                                              | level = CC7 · pan = CC10 · mute = CC9 |     |       |       | [TE-MIDI]                                                                                                                       |

Why we believe it: (a) the instrument M2/M3 knob descriptions in the guide line up with the chart
numbers one-for-one [TE-INST]; (b) xy-format's decoded track struct stores these as consecutive u32
lanes and its author annotates them "CC29 current lane", "CC36 current lane", … [XYF-WRITER];
(c) for aux tracks the guide's _shift_ functions land exactly on the chart's CC37/38/39 entries
(external audio: shift+mid = tape send, shift+light/white = FX sends; FX I: shift+white = send to
FX II) [TE-AUX][SHEET]; (d) the aux filter stores HPF in the CC32 lane and LPF in the CC35 lane
(dark = HP, white = LP) [XYF-AUX-LOGS][TE-AUX]. The model is **derived** — use it to _predict and
test_, not as ground truth.

### 3.1 Global CCs

|  CC | Function                  | Channel                                   | Values / semantics                                                                                                                                                                              | Confidence                                                                                         | Side effect                                                                                        | Sources                                                                           |
| --: | ------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
|  80 | tempo                     | any                                       | 0–127. **Conflicting scaling**: (A) BPM = 40 + v·180/127 (0→40, 127→220); (B) BPM = 2·v ("calibrated slope of 2 BPM per unit"). 7-bit either way — exact tempos need clock-master mode or `.xy` | official (existence); conflicting (scale)                                                          | project tempo (persists via autosave)                                                              | [TE-MIDI]; A: [MIDIGUIDE][REACT-MAP][STEMBOUNCE][VIBE-CHANGELOG]; B: [VIBE-TEMPO] |
|  81 | groove amount             | any                                       | centred; **63 = no groove** (midi.guide); guide: clockwise past centre = swing, counter-clockwise = shuffle                                                                                     | official (existence); community (centre)                                                           | project groove                                                                                     | [TE-MIDI][TE-TEMPO][MIDIGUIDE]                                                    |
|  82 | scene, **delayed** switch | any                                       | 0–98 → scene 1–99, switches "after next bar" (community); MIDI command added in 1.1.0                                                                                                           | official (existence, 1.1.0); community (timing)                                                    | active scene                                                                                       | [TE-MIDI][TE-DL][MIDIGUIDE]                                                       |
|  83 | previous scene            | any                                       | trigger (value semantics unknown)                                                                                                                                                               | official                                                                                           | active scene                                                                                       | [TE-MIDI]                                                                         |
|  84 | next scene                | any                                       | trigger (value semantics unknown)                                                                                                                                                               | official                                                                                           | active scene                                                                                       | [TE-MIDI]                                                                         |
|  85 | scene, **immediate**      | any                                       | 0–98 → scene 1–99 immediately (0 = scene 1)                                                                                                                                                     | official + community-verified (0-based)                                                            | active scene; _UI rule: switching to an empty scene duplicates the current one_ — unknown for MIDI | [TE-MIDI][LAUNCHPAD][STEMBOUNCE][MIDIGUIDE][TE-ARR]                               |
|  86 | project                   | any                                       | 0–127 → loads the project whose **filename starts with** that 3-digit number (`000…`–`127…`) per kmorrill's test tool; midi.guide/opxy-reactive say **suffix**                                  | official (existence); conflicting (prefix/suffix)                                                  | **loads another project**; repeated requests crashed firmware until 1.0.40                         | [TE-MIDI][XYF-CC86][MIDIGUIDE][TE-DL]                                             |
|  90 | master EQ                 | **ch1 low, ch2 mid, ch3 high, ch4 blend** | 0–127 (flat point unknown; guide: blend low = neutral)                                                                                                                                          | official (ch 1–4); community-verified (band order); ch4 blend reported non-working (opxy-reactive) | master EQ                                                                                          | [TE-MIDI][TE-MIX][LAUNCHPAD][MIDIGUIDE][REACT-DESIGN]                             |
| 102 | track select              | **ch1 only**                              | 0–7 → tracks 1–8, 8–15 → aux tracks 9–16                                                                                                                                                        | community                                                                                          | UI selection                                                                                       | [SHEET][MIDIGUIDE]                                                                |
| 104 | play                      | any                                       | any value starts playback                                                                                                                                                                       | community (stembounce: "may not work on all firmware")                                             | transport                                                                                          | [SHEET][MIDIGUIDE][STEMBOUNCE]                                                    |
| 105 | stop                      | any                                       | any value stops                                                                                                                                                                                 | community                                                                                          | transport                                                                                          | same                                                                              |
| 106 | remote key **down**       | ch1 (only channel ever used)              | key index 0–71 (§7)                                                                                                                                                                             | community-verified (fw-dependent)                                                                  | anything a finger can do                                                                           | [DAWLESS-CC106][SHEET][XYF-CC106]                                                 |
| 107 | remote key **up**         | ch1                                       | same index; the older "CC107 = view tempo page" is key-up of index 1 (tempo) misread                                                                                                            | community-verified                                                                                 | –                                                                                                  | same + [MIDIGUIDE]                                                                |

### 3.2 Per-track CCs valid on every track (channels 1–16)

|    CC | Function                     | Values                                                                                | Confidence                                    | Sources                                                               |
| ----: | ---------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------- |
|     7 | track level (mixer M1 white) | 0–127                                                                                 | official                                      | [TE-MIDI][TE-MIX]                                                     |
|     9 | track mute                   | **0 = unmute, 1–127 = mute**; "mutes affect notes and not audio" (tails keep ringing) | official (CC) + community-verified (polarity) | [TE-MIDI][TE-MIX][MIDIGUIDE][STEMX][STEMBOUNCE][OPXYSTEMS][LAUNCHPAD] |
|    10 | pan                          | 0–127, centred (64 ≈ centre)                                                          | official (CC); community (centre)             | [TE-MIDI][MIDIGUIDE]                                                  |
|    46 | "track parameters"           | undocumented                                                                          | official (existence only)                     | [TE-MIDI]                                                             |
| 40–43 | LFO lanes (M4 knobs)         | see 3.0 / 3.7                                                                         | community + derived                           | [MIDIGUIDE][XYF-AUX-LOGS]                                             |

### 3.3 Instrument tracks 1–8 (synth, drum, sampler, multisampler engines)

|    CC | Lane           | Parameter                                                 | Values / notes                                                        | Confidence                                    | Sources                                      |
| ----: | -------------- | --------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------- |
| 12–15 | M1 dark…white  | engine **P1–P4**                                          | engine-resolved names in 3.4                                          | community-verified                            | [SHEET][XYF-CCMAP][XYF-PLOCK-LOG][MIDIGUIDE] |
| 16–19 | M1+shift?      | engine P5–P8?                                             | untested                                                              | speculative                                   | [XYF-PLOCKS]                                 |
|    20 | M2 dark        | amp attack                                                |                                                                       | community-verified                            | [SHEET][XYF-PLOCK-LOG] (device capture)      |
|    21 | M2 mid         | amp decay                                                 |                                                                       | community-verified                            | same                                         |
|    22 | M2 light       | amp sustain                                               |                                                                       | community-verified                            | same                                         |
|    23 | M2 white       | amp release                                               |                                                                       | community-verified                            | same                                         |
| 24–27 | M2 alt         | filter env A/D/S/R                                        | switch page by clicking an encoder on M2 [TE-INST]                    | community-verified                            | [SHEET][XYF-PLOCKS]                          |
|    28 | M2+shift dark  | play mode poly / mono / legato                            | 3-state enum; thresholds unknown                                      | community-verified                            | [SHEET][XYF-WRITER][TE-INST][MIDIGUIDE]      |
|    29 | M2+shift mid   | portamento                                                | midi.guide: 0 = off, 1–127 = amount                                   | community-verified                            | same                                         |
|    30 | M2+shift light | bend range                                                | midi.guide: off, 1–7 semitones, octave (9 states); thresholds unknown | community-verified (label) / community (enum) | same                                         |
|    31 | M2+shift white | preset ("engine") volume                                  | independent of CC7 track level                                        | community-verified                            | same                                         |
|    32 | M3 dark        | filter cutoff                                             |                                                                       | community-verified                            | [SHEET][XYF-PLOCK-LOG][TE-INST]              |
|    33 | M3 mid         | resonance                                                 |                                                                       | community-verified                            | same                                         |
|    34 | M3 light       | filter envelope amount                                    |                                                                       | community-verified                            | same                                         |
|    35 | M3 white       | key tracking                                              |                                                                       | community-verified                            | same                                         |
|    36 | M3+shift dark  | send → ext ("aux out", i.e. to T13 external-audio output) |                                                                       | community-verified                            | [SHEET][TE-INST]                             |
|    37 | M3+shift mid   | send → tape                                               |                                                                       | community-verified                            | [SHEET][XYF-AUX-LOGS]                        |
|    38 | M3+shift light | send → FX I                                               |                                                                       | community-verified                            | same                                         |
|    39 | M3+shift white | send → FX II                                              |                                                                       | community-verified                            | same                                         |
|    40 | M4 dark        | LFO speed (random/tremolo/value), source (element, duck)  | lane model; chart says "LFO destination"                              | conflicting / derived                         | [SHEET][MIDIGUIDE][XYF-AUX-LOGS][TE-INST]    |
|    41 | M4 mid         | LFO amount (tremolo: vibrato amount)                      | chart: "LFO parameter/envelope"                                       | conflicting / derived                         | same                                         |
|    42 | M4 light       | LFO destination (tremolo: volume; duck: hold)             | midi.guide "LFO parameter 3"                                          | community + derived                           | [MIDIGUIDE]                                  |
|    43 | M4 white       | LFO parameter (tremolo: envelope; duck: release)          | midi.guide "LFO parameter 4"                                          | community + derived                           | [MIDIGUIDE]                                  |

_Device evidence for this table_: xy-format's hold-record sweeps sent CC7, 10, 12–15 and 20–41 on
channels 1–8 and found every one stored as a p-lock on the matching track (unnamed 121–125), and
CC7/10/12/40 on the aux tracks (unnamed 126) [XYF-PLOCK-LOG] — i.e. _receipt and ordering_ are
verified; the _labels_ come from the chart and the guide.

Filter _type_, LFO _type_, engine/preset selection, preset settings (tuning, velocity sensitivity,
mod routing), master saturator and master group/compressor levels have **no known CC**
[VIBE-HUMAN][TE-MIX] — but note [VIBE-HUMAN] also wrongly claims play mode/portamento/bend range and
master EQ are not CC-addressable; the official table and chart contradict it (CC28–31, CC90).

### 3.4 Engine-resolved names for CC12–15 (P1–P4)

| Engine                 | P1 (CC12, dark)  | P2 (CC13, mid)                             | P3 (CC14, light) | P4 (CC15, white) | Confidence                                                                | Sources                 |
| ---------------------- | ---------------- | ------------------------------------------ | ---------------- | ---------------- | ------------------------------------------------------------------------- | ----------------------- |
| axis                   | tone             | ratio (display 0–50 detune, 51–100 fifths) | shape            | tremolo          | official                                                                  | [TE-SYN]                |
| dissolve               | swarm            | am                                         | fm               | detune           | official                                                                  | [TE-SYN]                |
| epiano                 | tone             | texture                                    | punch            | tine             | official (note: 1.1.25 "fix: incorrect parameter names on epiano screen") | [TE-SYN][TE-DL]         |
| hardsync               | freq             | sub                                        | noise            | lowcut           | official                                                                  | [TE-SYN]                |
| organ                  | type             | bass                                       | tremolo amount   | tremolo speed    | official                                                                  | [TE-SYN]                |
| prism                  | shape            | ratio                                      | detune           | stereo           | official                                                                  | [TE-SYN]                |
| simple                 | shape            | pw                                         | noise            | stereo           | official                                                                  | [TE-SYN]                |
| wavetable              | table (9 tables) | position                                   | warp             | drift            | official                                                                  | [TE-SYN]                |
| drum (drum sampler)    | tune             | sample start                               | sample end       | play mode        | community; per-key scope unknown                                          | [REACT-MAP][XYF-IMGMAP] |
| sampler / multisampler | sample start     | loop start                                 | loop end         | sample end       | community                                                                 | [REACT-MAP]             |
| midi (ex-"external")   | MIDI channel     | bank                                       | program          | –                | official (M1 knobs)                                                       | [TE-SYN][TE-AUX]        |

On a **midi-engine instrument track** the 8 CC slots behave like T11 below (derived).

### 3.5 Auxiliary tracks 9–16

CC7/9/10 work on all of them (official). Per track:

**T9 brain (ch9)** — M1: manual/auto (dark), key (mid), scale (light), link (white); M2 routing [TE-AUX].

|    CC | Parameter                                                                | Confidence           | Sources                    |
| ----: | ------------------------------------------------------------------------ | -------------------- | -------------------------- |
|    12 | manual/auto key detection?                                               | derived              | lane model + [TE-AUX]      |
|    13 | key? (12 buckets in storage)                                             | derived              | [XYF-AUX-LOGS] brain probe |
|    14 | scale? (7 buckets: major…locrian)                                        | derived              | same                       |
|    15 | link (link an instrument track to brain)                                 | community            | [SHEET][MIDIGUIDE]         |
| 40/41 | chart lists "LFO shape / onset-dest", but the guide shows no M4 on brain | community (doubtful) | [SHEET]                    |

**T10 punch-in FX (ch10)** — notes trigger FX (§4.3). Only CC7/9/10 (+ chart-listed 40/41).

**T11 external MIDI (ch11)** — M1: channel / bank / program; M2 + M3: eight CCs ("hold shift and rotate
the encoders to turn on or select the CC message"); M4: LFO [TE-AUX].

|    CC | Parameter                                                       | Values                                                         | Confidence                                                       | Sources                                                      |
| ----: | --------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------ |
|    12 | outgoing MIDI channel                                           | 16 buckets (ch = index + 1)                                    | community (chart; CC12 receipt on aux tracks is device-verified) | [SHEET][XYF-AUX-LOGS] T11 probe, [XYF-PLOCK-LOG] unnamed 126 |
|    13 | bank                                                            | 129 buckets: off, 1–128 (a 7-bit CC cannot reach every bucket) | community (chart, storage-consistent)                            | same                                                         |
|    14 | program                                                         | 129 buckets: off, 1–128                                        | community (chart, storage-consistent)                            | same                                                         |
| 20–23 | CC slots 1–4 value (M2 knobs)                                   |                                                                | derived (slot table stored in these lanes)                       | [XYF-AUX-LOGS]                                               |
| 28–31 | CC slots 1–4 CC-number/on (M2+shift)                            |                                                                | derived                                                          | [XYF-AUX-LOGS]                                               |
| 32–35 | CC slots 5–8 value (M3 knobs) — chart: "send cc value"          |                                                                | community                                                        | [SHEET][XYF-CCMAP]                                           |
| 36–39 | CC slots 5–8 CC-number/on (M3+shift) — chart: "which cc"        |                                                                | community                                                        | same                                                         |
| 40–43 | LFO speed / amount / destination (off, cc1, cc2, …) / parameter |                                                                | derived                                                          | [XYF-AUX-LOGS]                                               |

opxy-reactive maps CC32–39 as "user CC 1–8" [REACT-MAP]; that contradicts the chart's value/number
split and is probably wrong.

**T12 external CV (ch12)** — the chart lists only CC7/9/10 [SHEET]; midi.guide adds CC32/35/37–39
filter/sends (doubtful for a CV track) [MIDIGUIDE].

**T13 external audio (ch13)** — M1: input, drive, level, mix; M3: HP (dark) / LP (white), shift+mid =
tape send, shift+light/white = FX sends [TE-AUX].

|           CC | Parameter                                                    | Confidence                                              | Sources                                      |
| -----------: | ------------------------------------------------------------ | ------------------------------------------------------- | -------------------------------------------- |
|           12 | input source (mic, headset, line, USB, main)                 | community-verified (chart + aux CC12 receipt on device) | [SHEET][XYF-AUX-LOGS][TE-AUX][XYF-PLOCK-LOG] |
|           13 | drive (analog inputs only)                                   | community (chart, guide-consistent)                     | same                                         |
|           14 | (none — "level" is stored in the track-level lane, i.e. CC7) | derived                                                 | [XYF-AUX-LOGS]                               |
|           15 | mix into main output                                         | community (chart, guide-consistent)                     | same                                         |
|      32 / 35 | HP cutoff / LP cutoff                                        | community (chart + midi.guide, storage-consistent)      | [SHEET][MIDIGUIDE][XYF-AUX-LOGS]             |
| 37 / 38 / 39 | send → tape / FX I / FX II                                   | community (chart, guide-consistent)                     | [SHEET][TE-AUX]                              |
|        40–43 | LFO (CC40 receipt on aux verified)                           | community / derived                                     | [XYF-PLOCK-LOG][XYF-AUX-LOGS]                |

**T14 tape (ch14)** — M1: pitch, speed, length, mix; M3: HP/LP, shift+light/white = FX sends [TE-AUX].

|      CC | Parameter                                                                                | Confidence                                    | Sources                              |
| ------: | ---------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------ |
|      12 | pitch ("x speed"; x1 default … x10)                                                      | community-verified (chart + aux CC12 receipt) | [SHEET][XYF-AUX-LOGS][XYF-PLOCK-LOG] |
|      13 | speed (100 % centre; 50 %–200 %)                                                         | community (chart, guide-consistent)           | same                                 |
|      14 | **length** (chart's "key scale" looks like a mis-transcription; guide M1 light = length) | conflicting → derived (length)                | [TE-AUX][XYF-AUX-LOGS] vs [SHEET]    |
|      15 | mix (tape vs original)                                                                   | community (chart, guide-consistent)           | same                                 |
| 32 / 35 | HP / LP cutoff                                                                           | community (chart, guide-consistent)           | [SHEET][TE-AUX]                      |
| 38 / 39 | send → FX I / FX II                                                                      | community (chart, guide-consistent)           | same                                 |
|   40–43 | LFO                                                                                      | community / derived                           |                                      |

**T15 FX I / T16 FX II (ch15/16)** — M1 = effect parameters; M3 = HP/LP; FX I shift+white = send to
FX II [TE-AUX].

|             CC | Parameter            | Confidence                                      | Sources                           |
| -------------: | -------------------- | ----------------------------------------------- | --------------------------------- |
|          12–15 | effect P1–P4 (below) | community (chart; CC12 receipt on aux verified) | [SHEET][XYF-CCMAP][XYF-PLOCK-LOG] |
|        32 / 35 | HP / LP cutoff       | community (chart + midi.guide)                  | [SHEET][MIDIGUIDE]                |
| 39 (ch15 only) | FX I → FX II send    | community (chart, guide-consistent)             | [SHEET][TE-AUX]                   |
|          40–43 | LFO                  | community / derived                             |                                   |

**FX engines** (official labels; the guide's own descriptions disagree in places):

| Effect     | P1 (CC12)                       | P2 (CC13)                   | P3 (CC14)                    | P4 (CC15)                       | Notes            | Sources               |
| ---------- | ------------------------------- | --------------------------- | ---------------------------- | ------------------------------- | ---------------- | --------------------- |
| chorus     | rate                            | depth                       | feedback                     | stereo                          |                  | [TE-FX]               |
| delay      | size (8 steps "micro"→"insane") | amount (fine-tunes spacing) | fine (described as feedback) | dry                             | default on FX I  | [TE-FX][XYF-AUX-LOGS] |
| distortion | drive                           | amount                      | low cut                      | high cut                        |                  | [TE-FX]               |
| lofi       | rate                            | bits                        | quality                      | drift (stereo spread)           |                  | [TE-FX]               |
| phaser     | frequency                       | depth                       | rate                         | feedback                        | 12-pole          | [TE-FX]               |
| reverb     | size                            | modulation                  | rate (described as tone)     | feedback (described as dry/wet) | default on FX II | [TE-FX][XYF-AUX-LOGS] |

FX _type_ has no known CC (select via shift + FX track key; type byte enum delay 0x00, reverb 0x05,
chorus 0x0C, phaser 0x0D, distortion 0x0E, lofi 0x0F in `.xy`) [TE-FX][XYF-AUX-LOGS].

### 3.6 Channel-voice / performance messages (receive side)

| Message                       | Status                  | Received?                                                                                                                | Notes                                                                        | Confidence           | Sources                  |
| ----------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | -------------------- | ------------------------ |
| Note on / off                 | `9n` / `8n`             | yes                                                                                                                      | velocity honoured per preset velocity sensitivity                            | community-verified   | [XYF-LEGACY][STEMBOUNCE] |
| Pitch bend                    | `En`                    | yes; recorded as per-note automation                                                                                     | range = CC30 / preset bend range; "send pitchbend to linked tracks" (1.0.15) | community-verified   | [XYF-LEGACY][TE-DL]      |
| Channel aftertouch            | `Dn`                    | yes; recorded                                                                                                            | target set in preset _mod_ settings                                          | community-verified   | [XYF-LEGACY][TE-INST]    |
| Poly aftertouch               | `An`                    | unknown                                                                                                                  |                                                                              | –                    |                          |
| Mod wheel                     | `Bn 01`                 | yes; recorded                                                                                                            | target set in preset _mod_ settings                                          | community-verified   | [XYF-LEGACY][TE-INST]    |
| Sustain                       | `Bn 40`                 | yes from 1.1.15 ("new sustain pedal functionality (holds notes until pedal up)"); not applied to arpeggio notes (1.1.17) | official (changelog)                                                         | [TE-DL]              |
| All Sound Off / All Notes Off | `Bn 78 00` / `Bn 7B 00` | **unknown** — tools send them, nobody reports the effect                                                                 | –                                                                            | [VIBE-OUT][XYF-CC86] |
| Program change                | `Cn`                    | receive unknown; the MIDI track _sends_ PC                                                                               | –                                                                            | [TE-DL]              |

### 3.7 Known conflicts & errata in the sources

- **xy-format's CC table drops a column.** In [XYF-CCMAP] (copied into [DAWLESS]) "Link channel" and
  "LFO shape / onset" appear under _Sample/Multi-sample_; in the community sheet they belong to the
  **Brain** column (the sample column is empty) [SHEET]. Treat the sample column as "same as synth".
- **CC40/41 labels.** Chart: "LFO destination" / "LFO parameter/envelope" (synth) and "LFO shape" /
  "LFO onset (random/trem) / LFO dest (value/element)" (aux) [SHEET]; midi.guide: "LFO parameter 1–4"
  on CC40–43 [MIDIGUIDE]; storage: speed, amount, destination, param-dest in CC40–43 lane order
  [XYF-AUX-LOGS]. Probe before labelling (§11 T19).
- **p-lock parameter names** in [XYF-PLOCKS] (CC33 "Flt Type", CC34 "LFO Rate", CC28 "Flt Env
  Amount", …) are hypotheses from a superseded byte model — the MIDI CC → param-id _ordering_ is real,
  the _names_ are not. The decoded-image column table uses official names [XYF-WRITER].
- **dawless-reference README** mixes in OP-Z facts (engine names "cluster, DNA, …", "CC80–83 synth
  params", "USB MIDI only, no DIN") [DAWLESS-README] — only its `cc106-remote-keys.md` is empirical.
- **Drum notes.** op-xy-vibing's assistant guide claims a GM map (kick 36, snare 38…) [VIBE-MUSIC];
  its own spec/engine use 53–76 [VIBE-SPEC][VIBE-ENGINE]. A device-limits page says "MIDI 48–71"
  [DAWLESS-LIMITS] and xy-format's capture harness calls 48 the "kick slot" [XYF-CAP16]. See §4.2.
- **CC86 wording**: "suffix 000–127" [MIDIGUIDE][REACT-MAP] vs "3-digit prefix" with working test
  code [XYF-CC86].
- **"firmware 09 13 03 86"** — the source line of xy-format's CC table — is not a firmware version:
  sibling research found those are bytes 4–7 of a 1.1.4-era `.xy` header [XYF-CCMAP-JSON]. The chart's
  firmware vintage is therefore unknown (the community sheet predates 1.0.25 [SHEET]).

---

## 4. Notes

### 4.1 Which channel plays which track

Notes on ch1–8 play instrument tracks 1–8; xy-format recorded identical C4s sent on ch1–8 into all
eight tracks at once under external clock ("8-track simultaneous recording") [XYF-LEGACY]
(community-verified). The active-track channel additionally plays the selected track (§2.2).
Aux channels (speculative except where noted): ch9 notes → brain transposition (the brain keyboard
"transposes whatever tracks you have routed" [TE-AUX]); **ch10 → punch-in FX** (community-verified,
§4.3); ch11 → external MIDI track (forwarded to its output channel?); ch12 → CV/gate; ch14 → tape
clips; ch15/16 → "play whatever the last selected instrument track was" (keyboard behaviour on FX
tracks [TE-AUX]).

### 4.2 Drum key mapping

- The 24 drum keys are **MIDI 53–76 (F3–E5, C4 = 60 convention)**, left to right — community-verified:
  device-exported drum `patch.json` regions `lokey/hikey` 53…76 [DRUMUTIL]; drum builders use base
  note 53 [DRUMTOOL][DAWLESS-DRUM]; xy-format device capture: "the leftmost keyboard pad (low F) …
  (MIDI key 53)" [XYF-DRUMPATHS]; op-xy-vibing's live engine plays 53–76 [VIBE-ENGINE].
- The device's own sample naming uses **C3 = 60** (`unnamed-c3-121.wav` sits at key 60, `unnamed-f2-…`
  at key 53) [DRUMUTIL] — one octave lower than the "C4 = 60" convention used in this doc. Always
  exchange MIDI numbers, never note names, between components.
- **Which sound is on which key is kit-dependent.** op-xy-vibing's default map (53 kick, 54 kick_alt,
  55 snare, 56 snare_alt, 57 rim, 58 clap, 59 tambourine, 60 shaker, 61 closed hat, 62 open hat,
  63 pedal hat, 65 low tom, 66 crash, 67 mid tom, 68 ride, 69 high tom, 71 conga low, 72 conga high,
  73 cowbell, 74 guiro, 75 metal, 76 chi; 64/70 unnamed) [VIBE-SPEC][GEN-DRUM] is one kit's layout;
  xy-format found kit `pp` stores voice 23 on the low-F key and voice 0 ("kick a") on F#3
  [XYF-DRUMPATHS][XYF-IMGMAP]. The agent must read the kit (`.xy`/`patch.json`) or ask, not assume.
- Whether incoming notes are shifted by the track's keyboard octave, and what happens outside 53–76,
  is open (§11 T10).

### 4.3 Punch-in FX notes (ch10)

LaunchpadPrefs' custom mode (decoded from `OPXY_Performance.syx`) triggers punch-in FX with notes
**55, 60, 61, 62, 63, 70 on channel 10**, the "dark pink = lower C" pad being note 60 [LAUNCHPAD]
(community, used on hardware). Official: lower octave affects percussion tracks, upper octave
melodic tracks; some effects use gyro/pitch-bend [TE-AUX]. Mapping key index = note − 53 is
speculative (xy-format saw punch-in triggers stored as note byte 101 in `.xy` [XYF-AUX-LOGS] — a
storage encoding, not necessarily the MIDI note). The 24 effect names are unpublished [REACT-AGENT].

### 4.4 Velocity, pitch bend, aftertouch, sustain

- Velocity 1–127 is honoured subject to preset _velocity sensitivity_ (preset settings) [TE-INST];
  the COM → system → keyboard velocity curve (off/soft/hard) concerns the built-in keys [VIBE-HUMAN]
  (community restating the guide). opxy-reactive lists a per-device "velocity" toggle in COM → M3
  (community, unverified) [REACT-DESIGN].
- Pitch bend: 14-bit, centre 8192; bend range per preset (CC30) [MIDIGUIDE]. Channel AT, CC1 and PB are
  captured into the sequencer as per-note keyframe automation when recording [XYF-LEGACY].
- When recording, chord notes are stored high→low and MIDI-recorded notes always get an explicit gate
  [XYF-LEGACY] (community-verified via corpus diffs).

### 4.5 Recording into the OP-XY's own sequencer over MIDI (live)

- **Live record with external clock works**: xy-format's harness sends Start + 24 ppqn clock + notes on
  ch1–8 while tracks are armed; the notes land in the pattern [XYF-LEGACY][XYF-CAP16].
- **CCs → p-locks only in "hold-record" mode**: holding the record key (no clock sync) while sending CC
  ramps writes p-locks; CCs sent during clock-synced recording were _not_ stored, and sending notes
  alongside CCs flips the device into clock-synced mode [XYF-PLOCK-LOG] (community). With remote
  keys (record = index 50, §7) this is automatable — but it writes project data.

---

## 5. Transport & clock

| Direction      | Message                 | Behaviour                                                                                                                                    | Confidence                          | Sources                                                                           |
| -------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------- |
| OP-XY → host   | `F8` clock, 24 ppqn     | sent when clock out is enabled and playing; **an idle, stopped unit sends nothing — no clock, no active sensing** (verified, stock settings) | community-verified; idle = verified | [STEMBOUNCE][OPXYSTEMS][STEMX][REACT-DESIGN][PROBE]                               |
| OP-XY → host   | `FA` Start              | on play (never Continue)                                                                                                                     | community                           | [REACT-DESIGN]                                                                    |
| OP-XY → host   | `FC` Stop               | on stop                                                                                                                                      | community-verified                  | [REACT-DESIGN][OPXYSTEMS]                                                         |
| OP-XY → host   | `F2` SPP                | **not sent** ("confirmed user report")                                                                                                       | community                           | [REACT-DESIGN]                                                                    |
| host → OP-XY   | `FA`/`FC`               | starts/stops playback; needs _transport receive_ (COM → M3, page 2)                                                                          | community-verified                  | [STEMBOUNCE][OPXYSTEMS]                                                           |
| host → OP-XY   | `F8`                    | OP-XY follows external tempo when clock in is enabled ("set clock to both … otherwise the OP-XY won't follow the app's clock")               | community-verified                  | [STEMX][XYF-CAP16][TE-DL] "avoid delay effect reacting to jittery external tempo" |
| host → OP-XY   | `FB` Continue, `F2` SPP | unknown                                                                                                                                      | –                                   |                                                                                   |
| OP-XY → others | transport relay         | "relay incoming transport to other connected midi devices" (1.0.29)                                                                          | official                            | [TE-DL]                                                                           |
| BLE            | clock in/out            | since 1.0.29                                                                                                                                 | official                            | [TE-DL]                                                                           |

Behaviours worth encoding:

- **Beat-1 alignment**: the first `F8` after `FA` is beat 1 (both stem tools trim audio to it)
  [STEMBOUNCE][OPXYSTEMS].
- **Play key pressed while playing restarts from the start; stop pressed twice "halts all notes and
  sound"** [TE-LAYOUT] (official) — the second is our device-level panic when remote keys work.
- **Tempo** can be set with CC80 (coarse, scaling unconfirmed), or exactly by being clock master, or
  in the project file. op-xy-vibing keeps the OP-XY as transport/clock authority and only nudges tempo
  via CC80 (it deliberately never sends clock or transport) [VIBE-SERVER].
- **App as clock master** (gobelinor/stem-extractor): send `FA` at t0 = now + 120 ms, pre-schedule every
  `F8` with Web MIDI timestamps for the whole run, then `FC` — deterministic record windows [STEMX].
- **BPM estimation from incoming clock**: least-squares slope of tick index vs timestamp after
  dropping ~16 warm-up ticks (robust to browser event bursting) [STEMX]; or EMA (0.1) with outliers
  clamped to 2× the rolling median, phase extrapolation between ticks and a 1.5 s stall freeze
  [REACT-SRC] `src/state/clock.ts`; vibing uses EMA 0.85/0.15 [VIBE-SERVER].
- Firmware history: "fix midi out stops working after receiving midi clock on same midi port" (1.0.50),
  "fix MIDI clock lag over TRS MIDI" (1.0.40), "fix midi clock timing … trs midi" (1.0.45),
  "sometimes no notes sent on TRS MIDI when clocked via incoming TRS MIDI" (1.1.25) [TE-DL].
- **Scene timing**: CC82 queues a scene for the next bar (community); the UI's queue gesture is
  shift + play + scene [TE-ARR]; project config has a scene-length mode (longest / shortest /
  time signature) [XYF-PROJCFG] that likely governs when queued changes land (speculative).

---

## 6. SysEx

The byte-level protocol (derived from TE's own Web MIDI updater [TE-UPD], cross-checked with the
EP-series community write-up [EPSYSEX]) is documented in `docs/research/60-firmware.md` §4 [FW] and
`knowledge/firmware/te-sysex.json` [TE-SYSEX-JSON]; the lead agent's read-only probe on the owner's
unit is in [PROBE]. This section keeps only what the live-MIDI layer needs.

**Identity (verified on 1.1.33):**

```
→ F0 7E 7F 06 01 F7                                         universal identity request
← F0 7E 21 06 02 00 20 76 21 00 01 00 00 00 00 00 F7        identity reply
     21 = SysEx device id  → byte 4 of every TE frame to this unit
     00 20 76 = Teenage Engineering;  21 00 = family 33;  01 00 = member 1  → SKU TE033AS001
     00 00 00 00 = version bytes NOT reported → read the OS version with GREET instead
← F0 7E 7F 06 01 F7                                         our own request, echoed (MIDI echo is on by default)
```

**TE frame** (request / response):

```
F0 00 20 76 21 40 <0x60 | rid[11:7]> <rid[6:0]> <cmd> <packed7 payload…> F7
F0 00 20 76 21 40 <0x20 | rid[11:7]> <rid[6:0]> <cmd> <status> <packed7 payload…> F7
F0 00 20 76 21 33 <ASCII log text…> F7                          firmware debug line
```

12-bit request ids; the status byte sits outside the packed7 payload (0 ok, 1 error, 2 command not
found, 3 bad request, 16–63 command-specific error, ≥ 64 "still working"/success); packed7 = up to
7 bytes preceded by a byte of their MSBs [FW][EPSYSEX]. On EP devices a `33` debug frame means
"stop all traffic and power-cycle" [EPSYSEX].

|  cmd | name             | On the owner's OP-XY (1.1.33)                                                                                                         | Policy for the live layer                                                                               |
| ---: | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 0x01 | **GREET**        | ✅ `product:OP-XY; mode:normal; os_version:1.1.33; sw_version:1.1.33; hw_rev:2; sku:TE033AS001` (+ `serial`, `dsp_serial`) — verified | run on connect to make firmware first-class state; keep serials local (never log, never send to an LLM) |
| 0x02 | ECHO             | ✅ round-trips arbitrary bytes — verified                                                                                             | link / codec test                                                                                       |
| 0x03 | **DFU**          | not sent                                                                                                                              | **hard-blocked in the transport** (enter-bootloader payload `[01 01 00 C8]`)                            |
| 0x05 | FILE             | ✅ INIT + LIST work; root = `drum/` (id 1), `synth/` (id 2), both empty — verified                                                    | out of scope here; PUT/DELETE write to the device (owner approval)                                      |
| 0x06 | SETTINGS         | ❌ status 2 "command not found" — verified                                                                                            | no typed system settings over SysEx; COM settings stay manual                                           |
| 0x7F | PRODUCT_SPECIFIC | not sent                                                                                                                              | never                                                                                                   |

Consequences for the live-MIDI layer:

- **Echo filter.** The unit echoes foreign messages (the universal identity request came back) but
  **did not echo TE-protocol frames** (verified [PROBE]). Drop any incoming TE frame with the
  is-request bit (`0x40` in byte 6) set, and dedupe incoming channel messages that exactly match
  something we sent within the last few ms when echo is on (§8.1, §11 T7).
- One TE request in flight per device; match replies by (cmd, rid); treat status ≥ 64 as "keep
  waiting"; stop everything on a `33` debug frame [FW].
- The MIDI monitor shows incoming SysEx (official) [TE-COM]; 1.0.29 fixed a crash "on certain sysex
  messages" [TE-DL] — **never fuzz SysEx**. Web MIDI needs `requestMIDIAccess({ sysex: true })`
  (separate permission prompt) for identity/GREET; plain CC/notes do not.
- TE's updater warns that Chrome 152 on macOS broke Web MIDI (ports present, no devices); onboarding
  should detect and explain it [FW].

---

## 7. CC106/107 remote UI keys

**Protocol** (community-verified): `CC106 = v` presses key _v_, `CC107 = v` releases it; a true
down/up pair ("CC 106 alone leaves the key held until CC 107 releases it"); sending CC106 twice
re-triggers rather than toggles [DAWLESS-CC106]. All tools send on **channel 1** (`B0 6A vv` /
`B0 6B vv`) [XYF-CC106][DAWLESS-CC106][REACT-SRC][GEN-MAIN]; other channels are untested. dawless
reports input via USB-C [DAWLESS-CC106].

### 7.1 Key map (values 0–71; 72–127 "no observed effect")

`ctrl CC` = what the same key emits in controller mode (COM → M2) according to the opxy-deck bench
census [DECK-CENSUS]; the constant offset (+5 for CC keys, +27 for keyboard notes) is our derivation.
A scripted cross-check of all 72 indices against the census JSON matched every one; the only census
identities left over are the four encoder _turns_ (CC1–4), which have no remote-key counterpart —
consistent with "no CC for encoder rotation" [DAWLESS-CC106].

|     v | key                                 | ctrl CC / note | behaviour & caveats                                                                                                                                 | sources                          |
| ----: | ----------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
|     0 | project                             | CC5            | opens project view — **M1/M4 there create/delete projects**                                                                                         | [SHEET][DAWLESS-CC106]           |
|     1 | tempo                               | CC6            | opens tempo screen; repeated taps = **tap tempo** (changes BPM)                                                                                     | same + [TE-TEMPO]                |
|     2 | instrument                          | CC7            | press-and-hold behaviour; hold + track = mute shortcut [TE-MIX]                                                                                     | same                             |
|     3 | auxiliary                           | CC8            | press-and-hold; hold + track = mute aux track                                                                                                       | same                             |
|     4 | arranger                            | CC9            | opens arrange                                                                                                                                       | same                             |
|     5 | mixer                               | CC10           | opens mix                                                                                                                                           | same                             |
|   6–9 | M1–M4                               | CC11–14        | context-dependent; **hold gestures fire instantly via CC** (M1 "new project" worked without a hold) — M4 in the projects folder is "hold to delete" | [DAWLESS-CC106][TE-PROJ]         |
| 10–13 | encoder clicks dark/mid/light/white | CC15–18        | sheet (≤1.0.21): knob presses; 1.1.4 sweep: "no observed effect" (context-dependent — clicks toggle envelope pages, reset EQ, mute in arrange, …)   | [SHEET][DAWLESS-CC106] + derived |
| 14–21 | track 1–8                           | CC19–26        | select track; **holding one track key while pressing another links tracks**; shift+track = preset browser                                           | [DAWLESS-CC106][TE-INST]         |
|    22 | player (arp etc.)                   | CC27           | on/off toggle                                                                                                                                       | [SHEET][DAWLESS-CC106]           |
|    23 | sample                              | CC28           | opens sampling screen                                                                                                                               | same                             |
|    24 | com                                 | CC29           | opens COM (M4 there = MTP → MIDI drops)                                                                                                             | same                             |
|    25 | bar                                 | CC30           | opens bar menu                                                                                                                                      | same                             |
| 26–49 | keyboard F…E (24 keys)              | notes 53–76    | plays notes at the device's current octave; becomes "most recently played note"                                                                     | same                             |
|    50 | record                              | CC55           | hold = record (step record when stopped, live record when playing)                                                                                  | [DAWLESS-CC106]                  |
|    51 | play                                | CC56           | start; again = restart                                                                                                                              | same + [TE-LAYOUT]               |
|    52 | stop                                | CC57           | stop; **twice = halt all notes and sound**                                                                                                          | same                             |
|    53 | minus                               | CC58           | octave down / step back in step record                                                                                                              | [DAWLESS-CC106]                  |
|    54 | plus                                | CC59           | octave up / skip step in step record                                                                                                                | same                             |
|    55 | shift                               | CC60           | modifier — never leave held                                                                                                                         | same                             |
| 56–71 | step 1–16                           | CC61–76        | step keys (write the pattern)                                                                                                                       | same                             |

### 7.2 Firmware history (the "disagreement")

| Firmware                    | Observation                                                                          | Source                              |
| --------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------- |
| ≤ 1.0.21                    | works (down/up); "This let's you do SHIFT + button combos"                           | [SHEET] CC 106/107 tab              |
| Jan 2025 (1.0.21 era)       | op-xy-generator sends `B0 6A 34` twice then `B0 6A 33` (stop, stop, play — no CC107) | [GEN-MAIN] (last commit 2025-01-25) |
| ≥ 1.0.25                    | "disabled (or moved to another CC?)"                                                 | [SHEET]                             |
| 2025 (unspecified)          | "multiple 2025 reports of it not working (possibly removed then restored)"           | [REACT-DESIGN]                      |
| ≤ 1.1.4 (tested 2026-03-04) | **works**; systematic sweep of 0–127, CC107 release confirmed                        | [DAWLESS-CC106]                     |
| 1.1.21                      | unverified (opxy-reactive ships a probe step and disables `press` if it fails)       | [REACT-SRC] `src/probe/probe.ts`    |
| 1.1.33                      | **unknown → probe (§11 T24)**                                                        | –                                   |

### 7.3 What works and what doesn't (1.1.4 sweep)

- Works: navigation, track select, transport, **step-record mode** (hold record while stopped, tap
  notes, `plus` to skip steps) and **live recording** with hold durations [DAWLESS-CC106].
- Doesn't: direct step entry (tap note → tap step) — the step lights but nothing is committed
  [DAWLESS-CC106].
- Untested: shift combos on current firmware, note ties, encoder rotation (no CC exists for turning
  encoders remotely) [DAWLESS-CC106].

### 7.4 Rules for our agent

1. Capability-gate the whole feature on a UI-only probe (§9 phase 4). Record the firmware it passed on.
2. Keep a **held-keys ledger**; every CC106 gets a CC107 (timeout cap ~5 s, cf. opxy-deck's 5 s repeat
   cap [DECK-SCHEMA]); release everything on stop, panic, disconnect, `pagehide`.
3. Treat keys by risk class (see `knowledge/midi/remote-keys.json`): _ui_ (4, 5, 23, 25),
   _ui-caution_ (0, 1, 2, 3, 10–13, 14–21, 24, 53, 54), _modifier_ (55), _state-change_ (22),
   _audible_ (26–49, 51, 52), _writes project_ (50, 56–71), _destructive-in-context_ (6–9 — never
   send M-keys unless the agent itself navigated to a known screen and the user confirmed).
4. Macros worth building (all experimental, all confirm-first): _hard panic_ = tap 52 twice;
   _checkpoint_ = project (0) → M2 (7) — official "press M2 to save your project and create a version"
   [TE-PROJ]; _step-record a track_ (dawless recipe).

---

## 8. What the OP-XY sends (outbound)

### 8.1 Normal operation

| What                                   | Detail                                                                                                                                                                                                                                                                                | Gate                                                                                     | Confidence                                   | Sources                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------- | ----------------------------- |
| Clock / Start / Stop                   | §5                                                                                                                                                                                                                                                                                    | COM midi _clock_ (transport rides the clock toggle, per opxy-reactive) + M3 device clock | community-verified                           | [REACT-DESIGN][STEMBOUNCE]    |
| Sequenced notes                        | per track, only with a project out-channel (or midi engine / T11)                                                                                                                                                                                                                     | _notes_ out                                                                              | community                                    | [REACT-DESIGN][XYF-PROJCFG]   |
| Keyboard notes                         | unknown in normal mode (controller mode: notes 53–76)                                                                                                                                                                                                                                 | _notes_ out                                                                              | –                                            | §11 T28                       |
| Pitch-bend strip                       | "transmits continuously and heavily — must be coalesced"                                                                                                                                                                                                                              | _other_ out?                                                                             | community                                    | [REACT-DESIGN]                |
| Encoder moves on instrument/aux tracks | **never** ("no CC discovered for encoder rotation"; multiple forum reports)                                                                                                                                                                                                           | –                                                                                        | community-verified (negative)                | [REACT-DESIGN][DAWLESS-CC106] |
| MIDI track CCs                         | T11 / midi-engine M2+M3 slots; sequenceable, recordable, LFO-modulatable                                                                                                                                                                                                              | channel of that track                                                                    | official                                     | [TE-AUX][TE-SYN]              |
| Program / bank                         | from the MIDI track's M1 (p-lockable since 1.1.15 fix); exact bank message format unknown                                                                                                                                                                                             |                                                                                          | official (existence)                         | [TE-DL][TE-AUX]               |
| MIDI echo                              | **on by default** (verified): the universal identity request was echoed back, TE-protocol frames were not; scope for notes/CCs still to test (1.0.15 "midi echo setting was ignored for linked notes"; 1.1.15 "hanging notes when MasterEcho and Maestro is combined" may be related) | COM midi _echo_                                                                          | verified (default on) / official (existence) | [PROBE][TE-COM][TE-DL]        |
| Transport relay                        | incoming transport relayed to other connected devices                                                                                                                                                                                                                                 |                                                                                          | official                                     | [TE-DL]                       |
| SysEx                                  | identity reply, GREET responses, debug frames                                                                                                                                                                                                                                         |                                                                                          | official                                     | [TE-UPD]                      |

The practical upshot for the 1:1 replica: **device → replica sync is limited to notes, transport,
clock, pitch bend and MIDI-track CCs**. Knob positions on the device cannot be mirrored; the replica
must show _our_ sent-state cache and `.xy`-parsed values, labelled as such (opxy-reactive's
"honest capability matrix" [REACT-AGENT]).

### 8.2 Controller mode (COM → M2) — full emit map

Official: channel via _shift + dark gray_, knobs absolute (0–127) or relative via _shift + mid gray_,
octave buttons enable via _shift + light gray_, exit with _shift + com_ [TE-COM]. Map from the opxy-deck
census ("bench truth", 76 identities) [DECK-CENSUS]; physical names via the remote-key offset (derived):

| Control                                    | Message | Number(s)         | Notes                                                                                                                      |
| ------------------------------------------ | ------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Encoders dark / mid / light / white — turn | CC      | 1 / 2 / 3 / 4     | absolute default; at a rail the device re-sends the bound; relative = two's complement (1–63 cw, 65–127 ccw) [DECK-BRIDGE] |
| Encoder clicks                             | CC      | 15 / 16 / 17 / 18 |                                                                                                                            |
| project, tempo                             | CC      | 5, 6              | census names `key_pen`, `key_metronome`                                                                                    |
| instrument, auxiliary, arranger, mixer     | CC      | 7, 8, 9, 10       | census `mod1–mod4`                                                                                                         |
| M1–M4                                      | CC      | 11–14             | census `mod5–mod8`                                                                                                         |
| track 1–8                                  | CC      | 19–26             | census `mod9–mod16`                                                                                                        |
| player, sample, com, bar                   | CC      | 27, 28, 29, 30    | census `key_seq`, `key_audio`, `key_com`, `key_bar`                                                                        |
| record, play, stop                         | CC      | 55, 56, 57        | **127 on press, 0 on release** (true holds)                                                                                |
| minus, plus, shift                         | CC      | 58, 59, 60        |                                                                                                                            |
| steps 1–16                                 | CC      | 61–76             |                                                                                                                            |
| keyboard (low F … high E)                  | note    | 53–76             | note-on/off with velocity                                                                                                  |
| volume knob                                | –       | –                 | transmits nothing                                                                                                          |

Non-transport CC keys send press and release together, so holds are not detectable ("bench truth")
[DECK-SCHEMA]. Controller mode replaces normal operation, so it is for _OP-XY → agent gestures_
(e.g. "hold record to talk to the agent"), not for mirroring.

---

## 9. MIDI settings (COM) and the onboarding / capability probe

### 9.1 Settings that gate MIDI

| Where                        | Setting                                                                                                                               | Values                               | Recommended for the agent                                                                                | Confidence                                         | Sources                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------- |
| COM → M1 system → _midi_     | clock                                                                                                                                 | off / in / out / both                | **both** (out to follow the device; in when we are master)                                               | official (setting); community (values)             | [TE-COM][REACT-DESIGN][STEMX]         |
|                              | notes                                                                                                                                 | off / in / out / both                | **both**                                                                                                 | same                                               | same                                  |
|                              | other (CC, PB, AT…)                                                                                                                   | off / in / out / both                | **both**                                                                                                 | same                                               | [TE-COM][STEMBOUNCE]                  |
|                              | active track ch                                                                                                                       | channel (reported default 1)         | **a channel the agent never sends on** (all 16 map to tracks; e.g. ch12 if no CV gear) or off if offered | official (setting); community (default)            | [TE-COM][REACT-DESIGN][GEN-INDEX]     |
|                              | midi echo                                                                                                                             | on / off — **default on** (verified) | turn **off**, or filter our own echoes (the app must filter either way)                                  | official; default verified                         | [TE-COM][PROBE]                       |
| COM → M1 → _monitor_         | incoming MIDI monitor (channel, value, clock, sysex)                                                                                  | –                                    | use during onboarding to separate "not delivered" from "delivered but ignored"                           | official (since 1.1.15)                            | [TE-COM][TE-DL]                       |
| COM → M3 _devices_           | per connected device: clock / notes / other send+receive; page 2: **transport receive** (plus timestamp / velocity per opxy-reactive) | toggles                              | enable all for the computer; transport receive **on**                                                    | community (two tools, possibly not independent)    | [STEMBOUNCE][OPXYSTEMS][REACT-DESIGN] |
| COM → M2 _ctrl_              | channel, knob mode, octave buttons                                                                                                    | –                                    | only for OP-XY → agent gestures                                                                          | official                                           | [TE-COM]                              |
| COM → M4 _mtp_               | –                                                                                                                                     | –                                    | leave MTP before live control                                                                            | community                                          | [XYF-CC86]                            |
| project → M4 config → _midi_ | per-track channel T1–T16: off / 1–16 (fresh project: all off)                                                                         | –                                    | T1–T8 → 1–8 if we want the device's sequenced notes                                                      | official (setting); community (default, semantics) | [TE-PROJ][XYF-PROJCFG][REACT-DESIGN]  |
| COM main page                | multi-out: midi / cv-gate / sync8 / sync16 / sync24 / audio                                                                           | –                                    | irrelevant for USB                                                                                       | official                                           | [TE-COM]                              |

### 9.2 Proposed onboarding / capability-probe sequence

Ordered from zero-risk to state-changing. Each phase writes into a per-device, per-firmware
**capability record** (example at the end). Phases 0–2 are safe to automate; 3–4 need the user
watching; 5 needs explicit consent and a scratch project.

**Phase 0 — enumerate & listen (no bytes sent).**
`navigator.requestMIDIAccess()` (no sysex); find input/output whose name matches `/op[\s–—-]?xy/i`
(verified: one pair, both named `OP-XY`; VID 0x2367/PID 0x8021 — Web MIDI exposes names only)
[PROBE]. **Install the echo filter before sending anything** (echo is on by default). Listen 3 s
idle (expect silence — verified), then ask the user to press play/stop on the device: expect `F8`,
`FA`, `FC` → `clockOut`, `transportOut`, BPM (regression). Ask the user to play a few keys →
`notesOut` + channel. Detect the Chrome-152-on-macOS Web MIDI breakage (ports present, no devices)
and explain it [FW].

**Phase 1 — read-only identity (needs sysex permission; verified to work on 1.1.33).**
Send `F0 7E 7F 06 01 F7`; parse the 17-byte reply → `sku` (`TE033AS001`), device byte (`0x21`);
ignore our own echoed request. The version bytes are zero, so send GREET
`F0 00 20 76 21 40 60 <rid> 01 F7` → `os_version` (1.1.33), `hw_rev`, `mode` [PROBE][FW]. Compare
with `releases.json` (latest) and the guide baseline (1.1.15); key the capability record and the
firmware-dependent behaviours (`knowledge/firmware/changelog-midi-usb.json`) on it. If SysEx is
denied: ask the user for the version and store it as "unverified".

**Phase 2 — delivery checks with no-op messages.**
Ask the user to open COM → M1 → _monitor_. Send `BF 03 00` (ch16 CC3 — unmapped in every source) and
ask whether it appears → `outPathOk`, `otherInGate`. Echo scope: listen 500 ms for `BF 03 00` coming
back → `echoCc` (the SysEx part is already known: foreign SysEx echoed, TE frames not [PROBE]).

**Phase 3 — audible but non-persistent (user confirms the device is not recording).**
`90 3C 40` … 300 ms … `80 3C 00` (track 1) and `92 3C 40`/`82 3C 00` (track 3) → `notesIn`, routing.
Then `FA` … 2 s … `FC` → `transportIn` (closed-loop check: clock output should start/stop too).

**Phase 4 — UI-only remote keys.**
`B0 6A 05` … 200 ms … `B0 6B 05` (mixer view) then `B0 6A 02` … `B0 6B 02` (back to instrument);
ask whether the screen changed → `remoteKeys: works|absent`. (Avoid tempo — tap tempo — and any
M-key, track key or record here.)

**Phase 5 — state-changing calibrations (announce, scratch project, restore).**
CC80 scaling, CC9 polarity, CC28–31/40–43 labels, CC90 ch4, CC120/123 honoured, scene CCs — see §11.

Capability record shape (illustrative: only `device`, `idleSilent`, the SysEx `echo` fields and
`teSysex` are verified values today [PROBE]; the rest are placeholders the probe fills in):

```json
{
	"device": {
		"portIn": "OP-XY",
		"portOut": "OP-XY",
		"sku": "TE033AS001",
		"sysexDeviceId": 33,
		"firmware": { "os_version": "1.1.33", "hw_rev": "2", "source": "greet" }
	},
	"caps": {
		"clockOut": true,
		"transportOut": true,
		"idleSilent": true,
		"notesIn": true,
		"ccIn": true,
		"transportIn": true,
		"clockIn": null,
		"echo": { "default": "on", "foreignSysex": true, "teFrames": false, "cc": null },
		"teSysex": { "greet": true, "echo": true, "file": true, "settings": false },
		"remoteKeys": "untested",
		"allNotesOffHonoured": null
	},
	"calibration": {
		"activeTrackChannel": null,
		"cc80": "unknown",
		"cc86Naming": "unknown",
		"cc9MuteThreshold": 1,
		"drumBaseNote": 53
	},
	"probedAt": "2026-09-26T00:00:00Z"
}
```

---

## 10. Patterns worth adopting from the codebases

### 10.1 Scheduler / lookahead

- **op-xy-vibing** — tick-driven, _no look-ahead_: on each tick emit due note-offs first, then note-ons,
  then CC/LFO updates; external 24 ppqn clock is multiplied up to the loop's ppq (96 → 4 engine ticks
  per MIDI clock); structural edits (tempo, lengths, track defs) are queued to the **next bar
  boundary**, parameter tweaks apply next tick; probability uses a **seeded RNG** for reproducibility;
  micro-shifts in ms are converted to ticks at the current tempo [VIBE-ENGINE][VIBE-SERVER][VIBE-PLAN].
- **stem-extractor** — app-as-master: everything pre-scheduled with `output.send(msg, timestamp)` from a
  known downbeat [STEMX].
- **For our browser app** (recommendation): a _two-clock_ scheduler — a Worker-driven 25 ms tick
  (immune to main-thread jank and background-tab timer clamping) that schedules everything due in the
  next ~100 ms with Web MIDI timestamps; when following the OP-XY's clock, predict tick times from the
  PLL and schedule against them. Keep the window short because **scheduled Web MIDI messages should be
  assumed uncancellable** (the spec's `MIDIOutput.clear()` has, to our knowledge, never shipped in
  Chromium — verify, but design as if it is unavailable) — stem-extractor's `stopNow()` sends `FC`
  but its already-queued `F8`s keep flowing [STEMX]. (Web MIDI is also window-only: the Worker can
  own the timer, not the port.)

### 10.2 Stuck-note / panic safety

- **Active-notes ledger** keyed by (channel, note) as a _stack_ (overlapping same-pitch notes), with the
  off-tick computed at note-on; offs survive document hot-swaps; reconcile overdue offs at every bar
  and on stop; "after stop expect no on|cc for 200 ms" is a test assertion [VIBE-ENGINE][VIBE-PLAN].
- **Panic**: explicit note-off for every ledger entry, then per channel CC64=0, CC120, CC123
  [VIBE-OUT]; xy-format's stop also sends CC123 ×16 + `FC` [XYF-CC86]. Because CC120/123 support on the
  OP-XY is unverified, the ledger offs are the real guarantee; add _stop, stop_ via remote keys when
  available [TE-LAYOUT][GEN-MAIN].
- **Remote-key ledger + caps** (§7.4); opxy-deck's safety caps (5 s max without release, drop held
  state on profile switch) [DECK-SCHEMA].
- **Rate guards**: dedupe unchanged CC values per (ch, cc); shed CC bursts above ~2.5k msg/s global or
  ~800/track, never shed notes [VIBE-ENGINE][VIBE-PLAN]; coalesce UI-facing param streams to ~60 Hz,
  never coalesce notes/transport [REACT-AGENT]. Heavy commands (CC86, scene CCs, remote keys) get a
  min-interval (repeated CC86 requests crashed the firmware before the 1.0.40 fix [TE-DL]).
- On port `statechange` → disconnected: clear ledgers, mark caps stale; on reconnect: panic, re-probe
  phase 0–1.
- **Echo hygiene**: with the default echo on, our own messages can come back on the input (verified
  for SysEx [PROBE]). Tag outgoing messages, drop matching echoes, and never forward input straight
  to output (a MIDI-thru loop would feed back).

### 10.3 JSON loop IR (opxyloop-1.0) — schema example

Top level: `version` ("opxyloop-1.0"), `meta` {tempo, ppq, stepsPerBar, swing?, key?, mode?},
`deviceProfile` {portName?, drumMap?}, `tracks[]` {id, name, type, midiChannel 0–15, role?, pattern
{lengthBars, steps[] {idx, events[] {pitch|degree+octaveOffset|chord, lengthSteps, velocity, prob?,
gate?, microshiftMs?, ratchet?}}}, ccLanes[]?, lfos[]?, drumKit?}. CC lane `dest` is `cc:<n>` or
`name:<identifier>` resolved against the fixed OP-XY map. Example (verbatim excerpt, §9.3 of the spec):

```json
{
	"version": "opxyloop-1.0",
	"meta": {
		"tempo": 96,
		"ppq": 480,
		"stepsPerBar": 16,
		"swing": 0.08,
		"key": "C",
		"mode": "ionian"
	},
	"deviceProfile": { "portName": "OP-XY" },
	"tracks": [
		{
			"id": "t-chords",
			"name": "Pad",
			"type": "dissolve",
			"midiChannel": 0,
			"role": "pad",
			"pattern": {
				"lengthBars": 2,
				"steps": [
					{
						"idx": 0,
						"events": [
							{
								"chord": "Imaj7",
								"lengthSteps": 8,
								"velocity": 96,
								"invert": 1,
								"register": ["C3", "B4"]
							}
						]
					},
					{
						"idx": 8,
						"events": [{ "chord": "V7", "lengthSteps": 8, "velocity": 96, "rollMs": 12 }]
					}
				]
			},
			"ccLanes": [
				{
					"id": "cutoff-sweep",
					"dest": "name:cutoff",
					"mode": "ramp",
					"points": [
						{ "t": { "bar": 0, "step": 0 }, "v": 40 },
						{ "t": { "bar": 1, "step": 15 }, "v": 100 }
					]
				}
			],
			"lfos": [
				{
					"id": "pad-wobble",
					"dest": "name:resonance",
					"depth": 18,
					"rate": { "sync": "1/8T" },
					"shape": "triangle",
					"offset": 64
				}
			]
		}
	]
}
```

Excerpt from `docs/opxyloop-1.0.md`, © 2025 Kevin Morrill, MIT License [VIBE-SPEC]. The spec's
compact drum helper is worth keeping too: `"drumKit": {"patterns": [{"bar": 1, "key": "kick",
"pattern": "x...x...x...x...", "vel": 120}], "repeatBars": 8}`. Its concurrency model — every edit is
an RFC 6902 JSON Patch against a `docVersion`, stale patches rejected and rebased, atomic temp+rename
writes, git checkpoints [VIBE-SERVER][VIBE-PLAN] — maps directly onto our "undo is sacred" rule.
Gaps for us: no scenes/songs, no mutes, no step components/p-locks, 4/4 assumed — our IR must be a
superset that can target both MIDI (this doc) and `.xy`.

### 10.4 Semantic addressing

opxy-reactive's OSC-style namespace (`/track/3/filter/cutoff`, `/track/*/ampEnv/attack`,
`/fx/1/param/2`, `/global/tempo`, `/clock`, `/meta/**`), glob subscriptions, engine-resolved labels
("bass · prism · shape"), normalized 0..1 values with `raw` kept, and a `via` field
(direct/mitm/echo/ctrl/disk) that says how a value was learned [REACT-AGENT][REACT-DESIGN]. The reverse
map (addr → ch/cc) is built _from the forward labeler_, so sending and labeling can't disagree
[REACT-SRC] `src/index.ts`. Adopt the idea (not the code — no LICENSE file), keyed on the lane model:
`/track/{1-16}/{m1|m2|m2env|m2shift|m3|m3shift|m4}/{knob|name}`, `/scene`, `/transport`,
`/key/{name}` (remote keys), `/global/{tempo|groove|eq/low…}`. In a browser there are no virtual
ports, so opxy-reactive's MITM strategy becomes simply "every CC we send updates the sent-state cache".

### 10.5 Tool surface for the agent (MCP-shaped)

- **mcp-koii** shows the minimal lifecycle (`list_midi_ports`, `connect_to_device`, `disconnect`,
  `play_note`, `play_pattern`, `play_drum_pattern` with ASCII grids, scale helpers) plus **MCP prompts as
  embedded documentation**; its drum tool reports recognized vs ignored instruments back to the model
  (good), but it blocks with `time.sleep` inside tool calls (avoid) [KOII].
- **op-xy-vibing's WS API**: `getDoc`, `getState`, `applyPatch{baseVersion, ops, applyNow}`,
  `replaceJSON`, `setTempoCC`; transport requests are refused (`transport_external_only`) because the
  device is authoritative [VIBE-SERVER].
- **opxy-reactive ops**: `send{addr,value}`, `press/release{key}` gated by the probe,
  `setTrackEngine`, `setFx` [REACT-AGENT].
- **opxy-deck's agent skill**: validate-before-swap + hot reload, "propose a table before touching ≥3
  controls", invariant core controls, never edit bench-truth data [DECK-SKILL][DECK-SCHEMA].

Proposed surface (each tool declares `sideEffect: none | audible | ui | project | destructive`,
returns what it did, what is unverified, and how to verify): `device.status/probe/capabilities`,
`midi.panic`, `transport.start|stop|restart`, `tempo.set{bpm, method: cc80|clock}`,
`scene.select{n, when: now|nextBar}`, `scene.step{±1}`, `track.mute|level|pan|select`,
`param.set{track, address, value, unit: normalized|raw}` (engine-aware labels from `cc-map.json`),
`notes.play{track, notes[], at?}`, `loop.patch{baseVersion, ops}` (IR), `ui.press{keys[], holdMs}`
(capability-gated, confirm), `project.load{n}` (destructive, confirm; CC86), `knowledge.ccLookup`.

---

## 11. Open questions / device tests

Bytes are hex; `Bn` = CC on channel n+1. **Risk flags**: `SAFE` (passive or unmapped no-op), `UI`
(navigation only), `AUDIBLE` (sound, nothing stored unless recording), `STATE` (changes project/scene
data that autosave may persist — use a scratch project and restore), `DANGER` (can load/create/delete
or needs care), `NEVER`.

1. ~~**Ports**~~ — **done (verified)**: one input + one output, both `OP-XY` [PROBE]. Re-check on other OSes (Windows names). `SAFE`
2. ~~**Idle output**~~ — **done (verified)**: idle unit sends nothing (no `F8`, no `FE`) with stock settings [PROBE]. Still open: does `F8` run while stopped when clock out = both is set explicitly? `SAFE`
3. **Transport output** — user presses play, stop, play-while-playing. Observe `FA`/`FC`; any `FB` or `F2`? `SAFE`
4. ~~**Identity**~~ — **done (verified)**: `F0 7E 21 06 02 00 20 76 21 00 01 00 00 00 00 00 F7` (device id 0x21, version bytes zero) [PROBE]. `SAFE`
5. ~~**GREET**~~ — **done (verified)**: `os_version:1.1.33`, `hw_rev:2`, `sku:TE033AS001`; ECHO works, SETTINGS not found, FILE INIT/LIST work [PROBE][FW]. `SAFE`
6. **Monitor delivery** — user opens COM → M1 → monitor; send `BF 03 00`. Is it displayed (channel 16, CC3)? `SAFE`
7. **Echo scope** — echo is on by default and reflects foreign SysEx but not TE frames (verified [PROBE]). Still open: send `BF 03 01`; listen 500 ms for `BF 03 01` (CC echoed?); `90 3C 01`/`80 3C 00` (notes echoed? — also audible); realtime `FA`/`FC` echoed? Latency of the echo? `SAFE`/`AUDIBLE`
8. **Active track channel** — note the setting; select track 5 on the device; send `90 3C 40`/(300 ms)/`80 3C 00`. Which tracks sound (1, 5, both)? Repeat with a CC (`B0 20 40`) — does it go to track 1 or 5? `AUDIBLE`/`STATE`
9. **Project channel vs receive** — in a scratch project set T3 → ch5 (project config); send `92 3C 40`/`82 3C 00` and `94 3C 40`/`84 3C 00`. Which reaches T3? `STATE`
10. **Drum keys** — track 1 (drum): send notes `30`…`4C` (48–76) at `64` velocity, 150 ms apart (`90 nn 64` / `80 nn 00`). Which note is the leftmost key? Out-of-range behaviour? Does the device keyboard octave shift incoming notes? `AUDIBLE`
11. **Transport input** — `FA`, 2 s, `FC`, with _transport receive_ off then on. Does playback follow; does clock output follow (closed loop)? `AUDIBLE`
12. **Continue / SPP** — while stopped: `F2 10 00` (16 sixteenths = bar 2) then `FB`. Where does playback start? Is `FB` ignored? `AUDIBLE`
13. **Clock input** — clock = in/both; `FA` then `F8` every 25 ms (100 BPM) for 4 bars, `FC`. Does the tempo display follow 100.0? Does the project tempo change persistently? `AUDIBLE`/`STATE?`
14. **All notes off** — `92 3C 40` (no off), then `B2 7B 00`. Silenced? Repeat with `B2 78 00` (All Sound Off). `AUDIBLE`
15. **Mute polarity & threshold** — `B0 09 7F` (muted?), `B0 09 00` (unmuted?), `B0 09 01` (muted?), `B0 09 40`. Restore to 0. `STATE`
16. **CC80 scaling** — note current BPM; send `B0 50 3C` (60): 125.0 → linear 40–220; 120 → BPM/2. Then `B0 50 00` and `B0 50 7F`. Restore. `STATE`
17. **CC81 centre** — `B0 51 3F` and `B0 51 40`: which shows "no groove"? Restore. `STATE`
18. **CC28–31** (scratch project, track 3, shift+M2 page visible): `B2 1C 00/40/7F` (play mode buckets), `B2 1D 40` (portamento), `B2 1E 00…7F` in 16-step sweep (bend-range buckets), `B2 1F 40` (preset volume). `STATE`
19. **CC40–47 LFO lanes** (scratch, track 3, M4 visible): send `B2 28 40` … `B2 2F 40` one by one. Which knob/sub-function moves? `STATE`
20. **Unmapped-lane predictions** (scratch, track 3): CC16–19 (`B2 10..13 40`, engine P5–P8?), CC46 (`B2 2E 40`), T11 CC20–23/28–31 (`BA 14..17 40`, `BA 1C..1F 40`), brain CC12–14 (`B8 0C..0E 40`). Observe any change. `STATE` (unknown effects)
21. **CC90 bands** — `B0 5A 7F`, `B1 5A 7F`, `B2 5A 7F`, `B3 5A 7F` with mixer M2 visible. Is ch4 = blend working now? Restore. `STATE`
22. **Scenes** (scratch project with scenes 1–2 populated): `B0 55 01` (→ scene 2 now), `B0 52 00` (→ scene 1 at next bar; time it against clock), `B0 53 00`/`B0 53 7F`, `B0 54 00`/`B0 54 7F` (does value matter?). Then `B0 55 09` to an _empty_ scene: is the current scene duplicated? `STATE`/`DANGER`
23. **CC102 / CC104 / CC105** — `B0 66 02` (select track 3?), `B0 68 7F` (play?), `B0 69 7F` (stop?). `UI`/`AUDIBLE`
24. **Remote keys** — `B0 6A 05`, 200 ms, `B0 6B 05` (mixer), then `B0 6A 02`/`B0 6B 02`. Also on channel 16: `BF 6A 05`/`BF 6B 05`. Works on 1.1.33? Channel-independent? `UI`
25. **Encoder-click keys** — go to instrument M2 (`B0 6A 07`/`B0 6B 07`), then `B0 6A 0A`/`B0 6B 0A`: does the envelope page toggle amp↔filter? `UI`
26. **Shift combo** — `B0 6A 37`, `B0 6A 02`, `B0 6B 02`, `B0 6B 37` (shift+instrument → preset settings). Does the preset-settings page open? Leave it with `B0 6A 02`/`B0 6B 02` (the guide: press instrument or any M-key to return). Afterwards verify shift is not stuck (press any key on the device). `UI`
27. **Controller mode map** — user enters COM → M2, presses M1, turns/clicks the dark encoder, presses a white key: expect `B? 0B 7F/00`, `B? 01 vv`, `B? 0F …`, note `35`. Confirms the +5/+27 relation and the default channel. `SAFE`
28. **Outbound notes** — with T1 project channel off vs 1 and notes out on: play the keyboard and the sequencer. What is transmitted, on which channel? `STATE` (project config)
29. **MIDI track output** — T11 channel 2, program 5, bank 1, one CC slot set: monitor output for `C1 04`, bank messages (`B1 00 …`/`B1 20 …`?), CC values; do PCs repeat on pattern loop? Do notes received on ch11 get forwarded? `STATE`
30. **Punch-in notes** — `99 35 64` (hold 1 s) `89 35 00`, then `99 41 64`/`89 41 00`. Which FX/group? `AUDIBLE`
31. **Brain notes** — `98 3E 64`/`88 3E 00` while a routed track plays. Transposes? Persists? `AUDIBLE`/`STATE?`
32. **MTP exclusivity** — enter MTP; repeat test 4. Port gone or silent? `SAFE`
33. **CC86** — manual only, user-prepared projects named `000…`/`…000`: single `B0 56 00`. Which naming loads? What happens to unsaved changes? `DANGER` (never automated)
34. **DFU / PRODUCT_SPECIFIC SysEx, random SysEx** — `NEVER`.

---

## 12. License notes per repo

| Repo / source                                                             | License                                                                               | What we may do                                                                       |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| jshph/opxy-reactive                                                       | **no LICENSE file** (package.json says "MIT", unconfirmed)                            | learn facts & design ideas; do not copy code until the author adds a license         |
| kmorrill/op-xy-vibing                                                     | MIT (© 2025 Kevin Morrill)                                                            | reuse with attribution (e.g. the opxyloop-1.0 excerpt above)                         |
| kmorrill/op-xy-generator                                                  | none                                                                                  | facts only                                                                           |
| kmorrill/xy-format                                                        | MIT (© 2026 Kevin Morrill)                                                            | reuse with attribution                                                               |
| kmorrill/dawless-reference (fetched to `research/web/dawless-reference/`) | none (GitHub reports no license)                                                      | facts only                                                                           |
| kmorrill/ep-series-sysex (fetched docs)                                   | MIT                                                                                   | reuse with attribution                                                               |
| benjaminr/mcp-koii                                                        | README/setup.py say MIT, **no LICENSE file**                                          | design ideas only                                                                    |
| kazuochi/opxy-deck                                                        | MIT (© 2026 Kaz / Signal26); its `assets/opxy.svg` is TE artwork "removed on request" | code/data reusable with attribution; **don't reuse the artwork**                     |
| buba447/LaunchpadPrefs-OPXY                                               | none                                                                                  | facts only                                                                           |
| om3opr/stembounce                                                         | MIT (© 2025 OM3)                                                                      | reuse with attribution                                                               |
| mofongo/opxy-stems                                                        | README says MIT, no LICENSE file                                                      | facts / ideas                                                                        |
| gobelinor/stem-extractor                                                  | **PolyForm Noncommercial 1.0.0**                                                      | facts only — incompatible with an OSI-licensed project                               |
| idroz/mezmer                                                              | Apache-2.0 (no MIDI code; audio device named `OP-XY` [MEZMER])                        | n/a                                                                                  |
| arnaudgreiner/nts-radio                                                   | README says MIT, no LICENSE file; not MIDI-related                                    | n/a                                                                                  |
| pencilresearch/midi (midi.guide CSV)                                      | **CC-BY-SA-4.0**                                                                      | facts restated with attribution; if we redistribute their table, share-alike applies |
| Community Google Sheet "OP-XY MIDI CC Reference"                          | none stated                                                                           | facts only                                                                           |
| teenage.engineering guide, changelog, updater JS                          | © Teenage Engineering                                                                 | facts only; snapshots stay local (gitignored)                                        |

---

## Sources

Local paths are relative to the repo root. Snapshots in `research/web/` were fetched 2026-09-26.

| Key                      | URL / path                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PROBE                    | `docs/research/90-device-probe.md` — lead agent's read-only probe of the owner's OP-XY (OS 1.1.33, 2026-09-26)                                                                                                                                                                                                                                                     |
| FW                       | `docs/research/60-firmware.md` §4 (TE SysEx protocol, byte level)                                                                                                                                                                                                                                                                                                  |
| TE-SYSEX-JSON            | `knowledge/firmware/te-sysex.json`                                                                                                                                                                                                                                                                                                                                 |
| XYF-CCMAP-JSON           | `knowledge/midi/xy-format-cc-map.json` (sibling research: xy-format's CC map with .xy p-lock columns)                                                                                                                                                                                                                                                              |
| TE-MIDI                  | https://teenage.engineering/guides/op-xy/midi-references — `research/web/te-guides_op-xy_midi-references.html`                                                                                                                                                                                                                                                     |
| TE-COM                   | https://teenage.engineering/guides/op-xy/com — `research/web/te-guides_op-xy_com.html`                                                                                                                                                                                                                                                                             |
| TE-AUX                   | https://teenage.engineering/guides/op-xy/auxiliary — `research/web/te-guides_op-xy_auxiliary.html`                                                                                                                                                                                                                                                                 |
| TE-DL                    | https://teenage.engineering/downloads/op-xy (changelog) — `research/web/te-downloads_op-xy.html`                                                                                                                                                                                                                                                                   |
| TE-REL                   | https://teenage.engineering/_software/releases.json — `research/web/te-software-releases.json`                                                                                                                                                                                                                                                                     |
| TE-UPD                   | https://teenage.engineering/apps/update + `/apps/update/assets/index-C4sb_ae6.js` — `research/web/te-apps_update.html`, `research/web/te-apps-update/index-C4sb_ae6.js`                                                                                                                                                                                            |
| TE-INST                  | https://teenage.engineering/guides/op-xy/instrument — `research/web/te-guides_op-xy_instrument.html`                                                                                                                                                                                                                                                               |
| TE-SYN                   | https://teenage.engineering/guides/op-xy/synth-engines — `research/web/te-guides_op-xy_synth-engines.html`                                                                                                                                                                                                                                                         |
| TE-FX                    | https://teenage.engineering/guides/op-xy/fx — `research/web/te-guides_op-xy_fx.html`                                                                                                                                                                                                                                                                               |
| TE-MIX                   | https://teenage.engineering/guides/op-xy/mix — `research/web/te-guides_op-xy_mix.html`                                                                                                                                                                                                                                                                             |
| TE-ARR                   | https://teenage.engineering/guides/op-xy/arrange — `research/web/te-guides_op-xy_arrange.html`                                                                                                                                                                                                                                                                     |
| TE-PROJ                  | https://teenage.engineering/guides/op-xy/project — `research/web/te-guides_op-xy_project.html`                                                                                                                                                                                                                                                                     |
| TE-TEMPO                 | https://teenage.engineering/guides/op-xy/tempo — `research/web/te-guides_op-xy_tempo.html`                                                                                                                                                                                                                                                                         |
| TE-LAYOUT                | https://teenage.engineering/guides/op-xy/layout — `research/web/te-guides_op-xy_layout.html`                                                                                                                                                                                                                                                                       |
| GUIDE-MD                 | `research/repos/gravitinos_opxy-tutor/manuals/op-xy-guide.md` (Markdown mirror of the guide)                                                                                                                                                                                                                                                                       |
| REACT-DESIGN             | `research/repos/jshph_opxy-reactive/DESIGN.md`                                                                                                                                                                                                                                                                                                                     |
| REACT-AGENT              | `research/repos/jshph_opxy-reactive/AGENT.md`                                                                                                                                                                                                                                                                                                                      |
| REACT-MAP                | `research/repos/jshph_opxy-reactive/maps/opxy-1.1.21.json`                                                                                                                                                                                                                                                                                                         |
| REACT-SRC                | `research/repos/jshph_opxy-reactive/src/` (`probe/probe.ts`, `state/clock.ts`, `labels/registry.ts`, `index.ts`, `server/ws.ts`)                                                                                                                                                                                                                                   |
| VIBE-SPEC                | `research/repos/kmorrill_op-xy-vibing/docs/opxyloop-1.0.md`                                                                                                                                                                                                                                                                                                        |
| VIBE-ENGINE              | `research/repos/kmorrill_op-xy-vibing/conductor/midi_engine.py`                                                                                                                                                                                                                                                                                                    |
| VIBE-OUT                 | `research/repos/kmorrill_op-xy-vibing/conductor/midi_out.py`, `tools/panic.py`                                                                                                                                                                                                                                                                                     |
| VIBE-SERVER              | `research/repos/kmorrill_op-xy-vibing/conductor/conductor_server.py`, `tools/wsctl.py`                                                                                                                                                                                                                                                                             |
| VIBE-TEMPO               | `research/repos/kmorrill_op-xy-vibing/conductor/tempo_map.py`, `conductor/tests/test_tempo_map.py`                                                                                                                                                                                                                                                                 |
| VIBE-CHANGELOG           | `research/repos/kmorrill_op-xy-vibing/CHANGELOG.md`                                                                                                                                                                                                                                                                                                                |
| VIBE-PLAN                | `research/repos/kmorrill_op-xy-vibing/PROJECT_PLAN.md`, `feature-coding-assistant.md`, `AGENTS.md`                                                                                                                                                                                                                                                                 |
| VIBE-HUMAN               | `research/repos/kmorrill_op-xy-vibing/docs/op-xy-non-automatable-human-control.md`                                                                                                                                                                                                                                                                                 |
| VIBE-MUSIC               | `research/repos/kmorrill_op-xy-vibing/musical-coding-assistant.md`                                                                                                                                                                                                                                                                                                 |
| GEN-MAIN                 | `research/repos/kmorrill_op-xy-generator/main.js`                                                                                                                                                                                                                                                                                                                  |
| GEN-INDEX                | `research/repos/kmorrill_op-xy-generator/index.html` (active-track-channel note, ~line 1060)                                                                                                                                                                                                                                                                       |
| GEN-DRUM                 | `research/repos/kmorrill_op-xy-generator/generation/drum.js`                                                                                                                                                                                                                                                                                                       |
| XYF-CCMAP                | `research/repos/kmorrill_xy-format/docs/reference/opxy_midi_cc_map.md`                                                                                                                                                                                                                                                                                             |
| XYF-PLOCK-LOG            | `research/repos/kmorrill_xy-format/docs/logs/2026-02-13_midi_cc_plock_discovery.md`                                                                                                                                                                                                                                                                                |
| XYF-PLOCKS               | `research/repos/kmorrill_xy-format/docs/format/plocks.md`                                                                                                                                                                                                                                                                                                          |
| XYF-WRITER               | `research/repos/kmorrill_xy-format/xy/image_writer.py` (TRK_* lane tables, `set_m2_shift`, `PLOCK_PARAMS`)                                                                                                                                                                                                                                                         |
| XYF-SPATIAL              | `research/repos/kmorrill_xy-format/tools/analyze_spatial_variance.py`                                                                                                                                                                                                                                                                                              |
| XYF-CC106                | `research/repos/kmorrill_xy-format/tools/analysis/cc106_keys.py`                                                                                                                                                                                                                                                                                                   |
| XYF-CC86                 | `research/repos/kmorrill_xy-format/tools/analysis/cc86_select.py`                                                                                                                                                                                                                                                                                                  |
| XYF-CAP16                | `research/repos/kmorrill_xy-format/tools/capture_16pat.py`                                                                                                                                                                                                                                                                                                         |
| XYF-PROJCFG              | `research/repos/kmorrill_xy-format/docs/logs/2026-06-13_project_config_inspection.md`                                                                                                                                                                                                                                                                              |
| XYF-AUX-LOGS             | `research/repos/kmorrill_xy-format/docs/logs/2026-06-14_brain_t9_probe.md`, `2026-06-15_{aux_lfo,aux_filter,t10_punch_in_fx,t11_external_midi,t12_external_cv,t13_external_audio,t14_tape,t15_fx_i,t16_fx_ii}_probe.md`                                                                                                                                            |
| XYF-DRUMPATHS            | `research/repos/kmorrill_xy-format/docs/format/drum_sample_paths.md`                                                                                                                                                                                                                                                                                               |
| XYF-IMGMAP               | `research/repos/kmorrill_xy-format/docs/format/decoded_image_map.md` (drum voice table)                                                                                                                                                                                                                                                                            |
| XYF-LEGACY               | `research/repos/kmorrill_xy-format/docs/logs/2026-02-13_agents_legacy_snapshot.md` (MIDI harness experiments, unnamed 93/94/106–109)                                                                                                                                                                                                                               |
| DAWLESS-CC106            | https://github.com/kmorrill/dawless-reference/blob/main/devices/teenage-engineering/op-xy/cc106-remote-keys.md — `research/web/dawless-reference/cc106-remote-keys.md`                                                                                                                                                                                             |
| DAWLESS-README / DAWLESS | same repo `README.md`, `midi-cc-map.md` — `research/web/dawless-reference/`                                                                                                                                                                                                                                                                                        |
| DAWLESS-DRUM             | same repo `drum-note-map.md` — `research/web/dawless-reference/drum-note-map.md`                                                                                                                                                                                                                                                                                   |
| DAWLESS-LIMITS           | same repo `device-limits.md` — `research/web/dawless-reference/device-limits.md`                                                                                                                                                                                                                                                                                   |
| SHEET                    | https://docs.google.com/spreadsheets/d/1zRCaETkKXG4sMAbXxMcYvS4RCCAOrMtmAxHE4lVH8CU ("OP-XY MIDI CC Reference", linked from op-xy-generator `midi_cc.html`) — `research/web/community-cc-sheet-gid0.csv` (matrix), `…gid1944425660.csv` (CC 106/107), `…gid2101262780.csv` (channels), `…gid800440877.csv`, `…gid26363836.csv`, `community-cc-sheet-htmlview.html` |
| MIDIGUIDE                | https://github.com/pencilresearch/midi/blob/main/Teenage%20Engineering/OP-XY.csv (CC-BY-SA-4.0, updated 2026-02-03) — `research/web/midi-guide/OP-XY.csv`                                                                                                                                                                                                          |
| DECK-CENSUS              | `research/repos/kazuochi_opxy-deck/opxy-controls.json`                                                                                                                                                                                                                                                                                                             |
| DECK-SCHEMA              | `research/repos/kazuochi_opxy-deck/MAPPING-SCHEMA.md`                                                                                                                                                                                                                                                                                                              |
| DECK-BRIDGE              | `research/repos/kazuochi_opxy-deck/opxy-bridge.swift`                                                                                                                                                                                                                                                                                                              |
| DECK-SKILL               | `research/repos/kazuochi_opxy-deck/skills/deck/SKILL.md`                                                                                                                                                                                                                                                                                                           |
| KOII                     | `research/repos/benjaminr_mcp-koii/koii_server.py`, `koii/midi_interface.py`, `README.md`                                                                                                                                                                                                                                                                          |
| LAUNCHPAD                | `research/repos/buba447_LaunchpadPrefs-OPXY/README.md`, `OPXY_Performance.syx` (decoded by hand: CC85 ch1 v0–15; CC90 ch1–3; CC9 ch1–8 momentary 1/0; ch10 notes 55,60–63,70)                                                                                                                                                                                      |
| STEMBOUNCE               | `research/repos/om3opr_stembounce/README.md`, `src/devices/op-xy.ts`, `src/core/midi.ts`, `src/core/bounce-engine.ts`                                                                                                                                                                                                                                              |
| OPXYSTEMS                | `research/repos/mofongo_opxy-stems/README.md`, `index.html`                                                                                                                                                                                                                                                                                                        |
| STEMX                    | `research/repos/gobelinor_stem-extractor/README.md`, `src/engine/machines/op-xy.ts`, `src/engine/midi/{messages,ClockMaster,MidiEngine}.ts`, `src/ui/components/DeviceSetup.tsx`                                                                                                                                                                                   |
| MEZMER                   | `research/repos/idroz_mezmer/audio/minaudio.go`                                                                                                                                                                                                                                                                                                                    |
| EPSYSEX                  | https://github.com/kmorrill/ep-series-sysex/blob/main/docs/sysex-protocol.md — `research/web/ep-series-sysex/sysex-protocol.md`                                                                                                                                                                                                                                    |
| DRUMUTIL                 | `research/repos/YYUUGGOO_OP-XY-Drum-Utility/patch.json` (device-exported drum preset)                                                                                                                                                                                                                                                                              |
| DRUMTOOL                 | `research/repos/buba447_opxy-drum-tool/index.html` (`hikey: 52 + rowNumber`)                                                                                                                                                                                                                                                                                       |
