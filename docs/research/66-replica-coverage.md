# 66 — Replica coverage: what the replica does and what the unit has confirmed (OS 1.1.33)

> Audit of 2026-10-02, read-only. It covers the code under `src/lib/sim`, `sound`, `replica`,
> `app`, `device`, `core/mtp` and `core/xy`, read against notes 55, 57, 59, 60, 61, 62, 63 and 90,
> `docs/QUESTIONS.md` and `docs/PLAN.md`. Nothing was sent to the unit. A few local captures
> (`research/device/captures/`, git-ignored) were looked at by eye. The three projects ever pulled
> from the unit were decoded with xy-format's RLE. The question it answers: for every part of the
> OP-XY, does the replica have it, and what evidence from the owner's unit stands behind it?

## TL;DR

- **The matrix (§2) has 271 rows: 181 built, 66 partial, 24 missing.** The main evidence behind
  them:
  - the unit itself for 100 rows (DEV-AUDIO 21, DEV-CAMERA 58, DEV-OBS 21);
  - TE's guide for 87;
  - our own choices for 42;
  - community work for 9;
  - a fake unit for 8 and the app alone for 2;
  - nothing built to check for 23.

  Half the rows (135) carry some device evidence somewhere, often for one part only.

- **What the unit has confirmed is mostly what the screen looks like.**
  - The camera sessions pinned page layouts to about a pixel. The sound sessions pinned the synth
    engines, the four filters, the envelope laws, the LFO rates and depths, the duck, the velocity
    law, the drum fade and most punch-in effects.
  - Behaviour is a different matter. How keys, LEDs, the sequencer, recording, players, scenes and
    settings act comes mostly from the guide or from us. No LED was ever filmed on purpose.
  - The sequencer's timing, the players and the grooves have never been measured. The song takes
    of 2026-09-28 were used for the scene order only.
  - The five conformance suites (503 `it` cases) are written from the guide. About 100 case titles
    pin a choice of ours, and about 30 cite a capture.
- **Things that look wrong, not just unverified:**
  1. **The FX sound ignores the FX pages.** FX I is always a fixed dotted-eighth delay and FX II a
     fixed 2.2 s hall. They are built once (`sound/engine.ts:251-252`). The effect type, its four
     parameters, the FX filters and LFOs, and FX I → FX II never reach the sound. A new project's
     tracks already send to both.
  2. **Stored LFO speeds are decoded on a scale that conflicts with the measured law.**
     `sim/defaults.ts:55` spreads the lane evenly over 111 positions, but the unit is synced below
     CC 64 (60 §4). A new project's T4, T6 and T8 tremolos therefore play at rates the measured law
     does not give. Their env cards (fade-in) are never played (`sound/mapping.ts:474-481`).
  3. **The master section is mostly not in the sound.** There is no compressor (a new project
     stores 10), no saturator, and the EQ, level and send laws are ours.
  4. **"Loop until release" keeps looping after release** (`sound/mapping.ts:350-353`). Our own
     manual unit `sampler.synth-sampler` says it stops cycling.
  5. **The arpeggio's four styles after "off" are ours.** They do not match the two bar charts
     the camera caught (59 §2.7).
  6. **The replica keeps a level and pan per scene.** The device's file keeps only mutes per scene
     and volume and pan per pattern (10 §3.3 ★). A save drops the scene levels; a load gives every
     scene the same level.
  7. **The drum fade is drawn as a share of the sample but plays for a fixed time** (60 §5). The
     two agree only on a sample as long as the one the drawing was fitted on.
  8. **Most settings are stored but never played.** These include the preset high pass, width,
     tunings and portamento type, the project transpose, voices and MIDI channels, and the system
     velocity. Only velocity sensitivity and sample preview take effect.
- **Two open owner questions are already answered by captures on disk.**
  - QUESTIONS 9: the eighth wavetable is called **primes** on screen (`steps-356`).
  - Half of QUESTIONS 4: on T8 the M2 shift layer reads legato · off · octave · 71 (b1-2795), so
    bend 32767 shows "octave" and portamento 0 shows "off". T3 is still to look at.
- **Loading from the device (§5):**
  - Projects go both ways over WebUSB-MTP and both directions ran on the owner's unit
    (2026-09-28). Only the open project (`projects/workspace.xy`) can be loaded. A save adds a new
    file written over that project, so the device keeps its own sounds, mixer, players and
    auxiliary settings.
  - **Reading the unit's own samples is built but has never run on a unit.** It was tested only
    against a fake.
  - None of the three projects pulled from the unit names a sample on the drive. Every sample path
    in them (307 in all) points at TE's factory library (`content/samples/…`), which MTP does not
    show. So the path has never had real data to read.
  - User presets in `presets/` are not read at all.

## 1. How to read this

| Label      | Meaning                                                                                                           |
| ---------- | ----------------------------------------------------------------------------------------------------------------- |
| DEV-AUDIO  | measured on the owner's unit over USB audio (notes 57 §3, 60, 62)                                                 |
| DEV-CAMERA | the unit's screen filmed by the phone camera (note 59; `b1-NNNN`, `steps-NNN` frames)                             |
| DEV-OBS    | seen on the unit some other way: its MIDI or MTP replies, a file read off it, or the owner's own report (note 90) |
| GUIDE      | TE's guide text, changelog or illustrations (note 55; our manual units cite them)                                 |
| COMMUNITY  | community work: kmorrill/xy-format, op-forums, community tools                                                    |
| OURS       | our own choice or inference, marked "ours" in the code or found unmarked in this audit                            |
| EMULATED   | exercised only against a fake unit (`test/fakes/`)                                                                |
| APP        | an app feature with no device counterpart                                                                         |

- **Impl:** _yes_ means built as far as we know the device. _partial_ means built with a known part
  missing or simplified. _no_ means not built.
- **Verified by:** the first label is the main evidence. Later labels cover parts of the row, named
  in brackets. A `—` means there is nothing built to verify.
- **Paths** are under `src/lib/` unless they start with `src/`, `docs/`, `knowledge/`, `test/` or
  `research/`.
- **Short references:**
  - "59 §2.8" is `docs/research/59-screen-profiling.md` §2.8. "60" is the sound session, "62" the
    default sounds and "90" the probe log.
  - Q4 is item 4 of `docs/QUESTIONS.md`.
  - Conformance cases are `<suite>.cases.ts:<line>` under `sim/conformance/`.
- **Scope.** The rows merge seven area audits that listed 437 finer rows. The agent, the voice and
  the manual are out of scope.

## 2. The matrix

### 2.1 Panel: body, keys, encoders, LEDs

| Capability                                                                                                   | Impl    | Verified by                                                                                                | Evidence                                                                         | Gaps                                                                                         |
| ------------------------------------------------------------------------------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Body outline, 17 × 6 tile grid, caps, LED windows                                                            | yes     | GUIDE (TE's panel drawing, D9)                                                                             | `replica/art.generated.ts:20-60`; `replica/art.spec.ts:193-226`                  | no caliper check (50 §8)                                                                     |
| Colours: body, tiles, caps, step ramp, legends, record dot                                                   | yes     | COMMUNITY (TE's render) + DEV-OBS (the owner asked for the darker body)                                    | `knowledge/opxy/controls.json` colours; `replica/ReplicaDefs.svelte:11-17`       | no grey-card photo; step ramp and legend tint unverified                                     |
| Screen glass and frame                                                                                       | partial | GUIDE + DEV-CAMERA (corner radius ≈ 8 px, 59 §1.2)                                                         | `replica/geometry.ts:183-198`                                                    | drawn at 9 px; whether rows 221–222 are blank (55 §9)                                        |
| Speaker grille, mic hole, front tick                                                                         | yes     | GUIDE                                                                                                      | `replica/Grille.svelte`; `replica/Body.svelte:84-89`                             | —                                                                                            |
| Pitch-bend pad                                                                                               | yes     | GUIDE + OURS (amount follows position)                                                                     | `replica/PitchStrip.svelte:34-56`                                                | the unit's strip senses pressure                                                             |
| Volume knob                                                                                                  | partial | OURS (300° travel, starts centred) + APP (sets the app's output)                                           | `replica/state.svelte.ts:181-188`; `sound/volume.ts:7-27`                        | travel, law and any screen popup never seen                                                  |
| Power switch                                                                                                 | partial | GUIDE (outline)                                                                                            | `replica/Body.svelte:28-29`; `sim/areas/system/sim.ts:628-634`                   | the replica cannot press it, so off and boot cannot be reached                               |
| Level meter                                                                                                  | partial | COMMUNITY (13 segments from the render) + OURS (law)                                                       | `replica/geometry.ts:223-241`; `app/sound.svelte.ts:75-83`                       | 13 against 16–18 in note 50; colour and response unseen; battery while com is held not built |
| Ports and the charge LED                                                                                     | no      | —                                                                                                          | `knowledge/opxy/controls.json` only                                              | the replica is a top view (D5)                                                               |
| 68 keys, their ids and notes (F3 = 53 … E5 = 76)                                                             | yes     | GUIDE + COMMUNITY + DEV-OBS (keys 53–76 played on the unit, 90 2026-09-29)                                 | `knowledge/opxy/controls.json`; `replica/geometry.ts:102-125`                    | —                                                                                            |
| Key press, release, chords, press feel                                                                       | yes     | GUIDE (gestures) + OURS (feel: 50 ms down, 140 ms up, 95.5 % sink)                                         | `replica/Key.svelte:310-360`                                                     | key travel unmeasured                                                                        |
| Hold thresholds                                                                                              | partial | DEV-CAMERA (a held step copies after ≈ 0.5 s, during the hold) + OURS (module hold 800 ms, bar tap 400 ms) | `sim/areas/system/state.ts:32-33`; `sim/areas/sequencer/model.ts:20-23`          | module hold and bar tap never timed                                                          |
| Encoders: turn, click, push-turn (fine), shift-turn                                                          | yes     | GUIDE + OURS (a click acts on release)                                                                     | `replica/Encoder.svelte:102-152`                                                 | press or release not checked                                                                 |
| Encoder detents and acceleration                                                                             | partial | OURS (one detent moves the shown number by one; no acceleration)                                           | `sim/params.ts:308-316`; `replica/state.svelte.ts:240` (24 a turn, "unverified") | 50 §8 #4 open; every walkthrough counts detents                                              |
| LEDs on 48 keys only (steps, tracks, keyboard)                                                               | yes     | GUIDE (48 windows) + DEV-CAMERA (mode and M keys unlit in raw frames)                                      | `replica/art.spec.ts:227-231`                                                    | —                                                                                            |
| LED colours and levels (white, red, dim at 42 %)                                                             | yes     | GUIDE (the states) + OURS (levels, the red hue)                                                            | `replica/Key.svelte:372-405`                                                     | red hue and dim level never photographed                                                     |
| LED timing (250 ms flash; 30 ms on, 260 ms off)                                                              | yes     | OURS                                                                                                       | `sim/areas/sequencer/model.ts:26-27`; `replica/Replica.svelte:278-280`           | unmeasured                                                                                   |
| Track keys: white for instrument, red for aux; links dim; mix + shift lights unmuted                         | yes     | GUIDE (which contradicts itself on the colour) + DEV-OBS (mutes shown on the keys, 90 session 1 #15)       | `sim/frames.ts:293-312`                                                          | colours never checked                                                                        |
| Step keys: steps with notes lit                                                                              | yes     | DEV-OBS (`test 2` lit its steps on the unit, 90 2026-09-28) + GUIDE                                        | `sim/areas/sequencer/leds.ts:109-111`                                            | —                                                                                            |
| Step keys while playing: the playhead lights empty steps and dims lit ones                                   | yes     | OURS                                                                                                       | `sim/areas/sequencer/leds.ts:110`; `sequencer.cases.ts:866`                      | Q4; the most visible LED guess                                                               |
| Step keys in other states: armed, count-in, recording, step-record cursor, clear fill, shift layer, bar held | yes     | GUIDE + OURS (rates, bar-held dimming, playhead colour)                                                    | `sim/areas/sequencer/leds.ts:75-108`                                             | raw frames b1-498/505 suggest steps stay lit with bar held                                   |
| Keyboard LEDs: held keys, a held step's notes, players, components, sample pages, arrange's scene digits     | yes     | GUIDE (a held step's notes, the chosen sample key) + OURS (the rest)                                       | `sim/areas/sequencer/leds.ts:116-160`; `sim/areas/arrange/view.ts:282-300`       | `controls.json` allows only off and white; the code also uses dim and red                    |
| COM's LED brightness                                                                                         | partial | OURS                                                                                                       | `sim/areas/system/state.ts:278`                                                  | stored, never drawn                                                                          |
| App aids: computer keys, hover hints, turn trail, change glow, guide marks, teaching animation               | yes     | APP                                                                                                        | `replica/keyboard.ts`; `replica/change-glow.ts`; `replica/animation.ts`          | —                                                                                            |

### 2.2 Modes, pages and navigation

| Capability                                                                  | Impl    | Verified by                                                   | Evidence                                                        | Gaps                                                                                                             |
| --------------------------------------------------------------------------- | ------- | ------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Four modes (instrument, auxiliary, arrange, mix), M1–M4 pages, shift layers | yes     | GUIDE + DEV-CAMERA (most pages)                               | `sim/opxy-sim.svelte.ts:1-15`; `sim/areas/registry.ts`          | —                                                                                                                |
| Overlays from any mode: tempo, project, com, sample, player, bar            | yes     | GUIDE                                                         | `sim/opxy-sim.svelte.ts:63-70`                                  | what stays lit beneath them is ours (`sim/frames.ts:286-316`)                                                    |
| Track selection: T1–T8, auxiliary tracks 9–16                               | yes     | GUIDE                                                         | `sim/areas/auxiliary/sim.ts:81-90`                              | —                                                                                                                |
| Linked tracks (hold Tn + Tm, up to four)                                    | yes     | GUIDE + OURS (how a link comes undone)                        | `sim/opxy-sim.svelte.ts:459-479`; `instrument.cases.ts:454-488` | never tried on the unit                                                                                          |
| Mute with instrument or auxiliary + Tn outside mix                          | partial | OURS                                                          | `instrument.cases.ts:428-449` ("device check")                  | LEDs left as they were                                                                                           |
| The device map: 65 pages, 336 controls                                      | yes     | DEV-CAMERA (49 pages cite a capture) + OURS/GUIDE (16 do not) | `knowledge/opxy/device-map.json`; `sim/device-map.ts`           | uncaptured: the midi engine's M1–M3, tape M2–M4, FX I lofi, FX I and FX II M2–M4, the mix aux bank, project, com |
| Pages with neither art nor capture                                          | partial | OURS                                                          | 55 §9; §2.8, §2.12, §2.13 below                                 | naming, delete question, history, tuning editor, boot, step components; recording screens not drawn at all       |
| TE boot menu, factory reset, firmware update                                | no      | —                                                             | 63 (marked unclear)                                             | not drawn                                                                                                        |
| Sustain pedal (CC64 from a keyboard; OS 1.1.15)                             | no      | —                                                             | `knowledge/manual/units/instrument/sustain-pedal.md`            | the simulator takes no CCs                                                                                       |

### 2.3 Synth engines

| Capability                                                           | Impl    | Verified by                                                                                              | Evidence                                                                                     | Gaps                                                                |
| -------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| prism: picture, motion, labels                                       | yes     | DEV-CAMERA (steps-061…096, b1-1285…1343; the ratio as a fraction) + OURS (ray timing)                    | `sim/screen/pages/engines/prism.ts:1-15,208-216`; `sim/screen/pages/engines/engines.spec.ts` | rays' rise, hold and fade                                           |
| prism: sound                                                         | yes     | DEV-AUDIO (2026-09-27: levels ≤ 0.2 dB, partials ≤ 1 dB; 62: T3 −0.3…−3.4 dB)                            | `sound/synth/engines/prism.ts`; `sound/synth/engines/prism.spec.ts`                          | shoulder's svf darker by C4 (62 §3)                                 |
| simple: picture, labels                                              | yes     | DEV-CAMERA (steps-101…141) + OURS (the gap ramps)                                                        | `sim/screen/pages/engines/simple.ts:75`                                                      | stereo 0.25–0.5 stills                                              |
| simple: sound                                                        | yes     | DEV-AUDIO (0–2 dB per harmonic; the level reference)                                                     | `sound/synth/engines/simple.ts`                                                              | not in a new project, so outside note 62's check                    |
| organ: picture, labels                                               | yes     | DEV-CAMERA (steps-142…183) + OURS (a 60 ms drawbar slide)                                                | `sim/screen/pages/engines/organ.ts`; `sim/motion.ts:50-51`                                   | slide time                                                          |
| organ: sound                                                         | yes     | DEV-AUDIO (partials 0.1–0.2 dB)                                                                          | `sound/synth/engines/organ.ts`                                                               | tremolo depth measured only at 127; key click                       |
| epiano: picture, labels                                              | yes     | DEV-CAMERA (steps-184…224; tine on E3, punch on E4)                                                      | `sim/screen/pages/engines/epiano.ts`                                                         | —                                                                   |
| epiano: sound                                                        | yes     | DEV-AUDIO (tone and tine 0.1–1 dB; punch on tine, 62 §2.4)                                               | `sound/synth/engines/epiano.ts`                                                              | T4 +1.9…−2.2 dB (the preset high pass, FX II's tail)                |
| dissolve: picture, labels                                            | yes     | DEV-CAMERA (steps-225…265 and 10 fps) + OURS (the fade)                                                  | `sim/screen/pages/engines/dissolve.ts:40`                                                    | —                                                                   |
| dissolve: sound                                                      | yes     | DEV-AUDIO (partials 0.1–0.5 dB)                                                                          | `sound/synth/engines/dissolve.ts`                                                            | level falls 1.7 dB an octave faster than the unit (62 §3)           |
| hardsync: picture, labels                                            | yes     | DEV-CAMERA (block speed at 10 fps)                                                                       | `sim/screen/pages/engines/hardsync.ts`                                                       | —                                                                   |
| hardsync: sound                                                      | yes     | DEV-AUDIO (partials 1–1.5 dB) + OURS (the noise curve)                                                   | `sound/synth/engines/hardsync.ts:26`                                                         | T6 −5.6…−13.5 dB (its ladder and tremolo, §2.4)                     |
| axis: picture, labels                                                | yes     | DEV-CAMERA (steps-307…347) + OURS (easing between steps)                                                 | `sim/screen/pages/engines/axis.ts:20`                                                        | stills between the 16-CC steps                                      |
| axis: sound                                                          | yes     | DEV-AUDIO (waveform correlation 0.9995)                                                                  | `sound/synth/engines/axis.ts`                                                                | T7 too bright (+4.8 dB), its first 0.1 s (62 §4)                    |
| wavetable: picture, labels, table names                              | yes     | DEV-CAMERA (frames within 4 %; names on screen, primes in steps-356) + OURS (spin rate, primes' drawing) | `sim/screen/pages/engines/wavetable.ts:39,52`                                                | steps-356 shows primes' waveform, not yet used                      |
| wavetable: sound                                                     | yes     | DEV-AUDIO (frames within 0–0.5 dB) + OURS (tables are our formulas, Q9)                                  | `sound/synth/engines/wavetable.ts`                                                           | high warp off by 3–5 dB                                             |
| midi engine on an instrument track                                   | partial | GUIDE (page art) + OURS (listed after the eleven)                                                        | `sim/screen/pages/misc.ts:12-28`; `sim/areas/system/presets.ts:37-57`                        | the 1.1.33 browser lists no midi engine (59 §2.6, Q10); silent here |
| Fallback engines (before the worklet loads, or without AudioWorklet) | partial | OURS (pre-calibration)                                                                                   | `sound/mapping.ts:556-804`                                                                   | another sound; tine and punch swapped (`sound/mapping.ts:739-746`)  |

### 2.4 The instrument voice: envelopes, play modes, filter, LFO, levels, presets

| Capability                                                                                       | Impl    | Verified by                                                                                                           | Evidence                                                                      | Gaps                                                                                                  |
| ------------------------------------------------------------------------------------------------ | ------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Envelope editor (two envelopes, five handles, curves)                                            | yes     | DEV-CAMERA (313 states within 0.9 px)                                                                                 | `sim/screen/pages/envelope.ts`; `sim/screen/screen.spec.ts:135-211`           | —                                                                                                     |
| Attack law                                                                                       | yes     | DEV-AUDIO (60 §3)                                                                                                     | `sound/mapping.ts:56-58`; `sound/synth/laws.ts:24`                            | the 0.5 ms floor is ours                                                                              |
| Decay, sustain and release laws                                                                  | yes     | DEV-AUDIO (60 §3, 62 §2.2)                                                                                            | `sound/mapping.ts:61-89`; `sound/synth/adsr.ts:82-106`                        | sustain 99 plays 1.0, the unit 0.975                                                                  |
| Filter envelope times                                                                            | partial | OURS (the amp envelope's laws)                                                                                        | `sound/engine.ts:967`; `sound/synth/core.ts:169`                              | never measured (60 §7)                                                                                |
| M2 shift layer screen: play mode, portamento, bend, preset volume                                | yes     | GUIDE (drawn from the art) + DEV-CAMERA (b1-2788…2819 read legato · off · octave · 71, not yet used)                  | `sim/screen/pages/envelope.ts:133-155`                                        | T3's portamento: "00" or "off" (Q4)                                                                   |
| Play modes poly, mono, legato (sound)                                                            | partial | OURS (synth convention; the manual says derived)                                                                      | `sound/engine.ts:509-556,644-673`                                             | a new project's T3 is mono and T5 legato                                                              |
| Portamento (sound)                                                                               | partial | OURS, against DEV-AUDIO evidence (the axis take glided 0.15–0.3 s, linear in Hz, 57 §3)                               | `sound/mapping.ts:193-194`; `sound/synth/core.ts:328-332`                     | T7's 36 glides ≈ 47 ms here; the preset's lin/exp type ignored                                        |
| Bend range                                                                                       | partial | COMMUNITY (nine steps) + DEV-CAMERA ("octave" at 32767)                                                               | `sim/defaults.ts:64-81`                                                       | where the steps fall                                                                                  |
| Velocity law and sensitivity                                                                     | yes     | DEV-AUDIO (1 − s·(1 − v/127), within 0.2 dB, 62 §2.1)                                                                 | `sound/mapping.ts:276-303`                                                    | replica keys always play velocity 100 (`app/sound.svelte.ts:73-74`)                                   |
| Filter page, off state, type list (back to M1 after a pick)                                      | yes     | DEV-CAMERA (0.19–0.4 px rms)                                                                                          | `sim/screen/pages/filter.ts`                                                  | the resonance box rounds where the unit truncates (`filter.ts:225`); z hipass's ghost direction       |
| Filter sound: ladder, svf, z lowpass, z hipass                                                   | yes     | DEV-AUDIO (60 §2; `sound/synth/filters-device.spec.ts`: 9 cases within 3.5 dB)                                        | `sound/synth/core.ts:57-118`; `sound/synth/laws.ts:31-62`                     | ladder feedback stops at 3.65 (the fit says 4)                                                        |
| Envelope amount and key tracking (sound)                                                         | partial | DEV-AUDIO (svf peak 0.85 × steps; key tracking on ladder and svf) + OURS (the hold through the sustain; the z types)  | `sound/mapping.ts:169-180`                                                    | T3 and T6 sit an octave darker than the unit through the sustain (62 §4)                              |
| Sends layer screen (aux out, tape, FX I, FX II)                                                  | yes     | DEV-CAMERA                                                                                                            | `sim/screen/pages/filter.ts:270-343`                                          | —                                                                                                     |
| LFO pages: tremolo, value, random, element, duck, off                                            | yes     | DEV-CAMERA (59 §2.4) + OURS (other sync counts, the shape card, duck's audio icon)                                    | `sim/screen/pages/lfo.ts`                                                     | —                                                                                                     |
| LFO rates                                                                                        | partial | DEV-AUDIO (free law; synced at multiples of 8, 60 §4) + OURS (the synced table)                                       | `sound/mapping.ts:382-393`; `sim/params.ts:117-134`                           | ours starts at a sixteenth; the unit runs to 32 Hz at CC 0                                            |
| Stored LFO speed (presets and project files)                                                     | partial | OURS, conflicting with DEV-AUDIO                                                                                      | `sim/defaults.ts:55` (`lfoSpeedOf`)                                           | a new project's T4, T6 and T8 tremolos play at the wrong rates                                        |
| Tremolo (sound)                                                                                  | partial | DEV-AUDIO (vibrato and level depths) + OURS (sine only)                                                               | `sound/mapping.ts:474-481`                                                    | env card and shape not played                                                                         |
| Value, random, element (sound)                                                                   | partial | DEV-AUDIO (value on the cutoff; element follows the amp envelope) + OURS (other destinations, random's steps, depths) | `sound/mapping.ts:454-495`; `sound/channel.ts:290-292`                        | env and amp destinations do nothing                                                                   |
| Duck (sound)                                                                                     | partial | DEV-AUDIO (6 ms dip, hold and release tables, 60 §4)                                                                  | `sound/mapping.ts:496-539`                                                    | a stored duck is not decoded (`sim/defaults.ts:93-128` has no duck case); the audio source is ignored |
| Engine and bus levels                                                                            | partial | DEV-AUDIO (62 §2.3; residuals in 62 §3)                                                                               | `sound/engine.ts:120-127`                                                     | no master compressor (§2.6)                                                                           |
| Polyphony and voice stealing                                                                     | partial | GUIDE (24 voices) + OURS (steal order)                                                                                | `sound/allocator.ts:9-51`                                                     | no 8-a-track cap; voice reservations not played                                                       |
| Preset settings in the sound: width, high pass, portamento type, tunings, transpose, mod routing | no      | — (62 §4 shows the high pass matters)                                                                                 | `sim/defaults.ts:171-180`                                                     | velocity sensitivity is the only one played; T4, T6 and T7 store a high pass                          |
| Octave popup and keyboard octave                                                                 | yes     | DEV-CAMERA (b1-254…283) + DEV-OBS (a new project's octaves)                                                           | `sim/areas/sequencer/popup-draw.ts:66-115`                                    | +3 never seen; timings ours; drum tracks                                                              |
| A new project's eight sounds                                                                     | yes     | DEV-OBS (read over MTP, byte for byte, 62 §1)                                                                         | `knowledge/presets/new-project.json`                                          | duck, tunings and mod routing undecoded                                                               |
| The other 148 factory presets                                                                    | partial | COMMUNITY (156 names and engines, xy-format's 1.1.21 list, matching the 1.1.33 screens)                               | `sim/areas/system/catalogue.ts:45-124`; `sim/areas/system/presets.ts:264-292` | they load as their engine's starting sound (Q16)                                                      |

### 2.5 Sampler engines and drum keys

| Capability                                                                                           | Impl    | Verified by                                                                                            | Evidence                                                           | Gaps                                                                                          |
| ---------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| 24 drum keys F3–E5 in TE's kit order                                                                 | yes     | COMMUNITY (22 factory kits, 30 §7.4) + GUIDE                                                           | `sim/areas/sample/state.ts:40-42`; `sound/kit.ts:14-38`            | —                                                                                             |
| Drum M1 page: tune, play mode, lanes, markers; shift: direction, pan, fade, gain                     | yes     | DEV-CAMERA (b1-2440…2590; 15 tests in `sim/screen/pages/drum.spec.ts`)                                 | `sim/screen/pages/drum.ts`                                         | an empty key; pan at known values; fade with the start moved in                               |
| Drum key ranges and steps                                                                            | yes     | DEV-CAMERA (tune in 0.1 steps, −16.10 seen) + COMMUNITY (pan, gain, ±48) + OURS (E4's order, pan step) | `sim/areas/sample/m1.ts:177-193`                                   | —                                                                                             |
| Drum fade (sound)                                                                                    | yes     | DEV-AUDIO (0.95·(v/99)² s, 60 §5)                                                                      | `sound/mapping.ts:330-335`                                         | drawn as fade/255 of the sample (`drum.ts:132-135`); does it follow the tune? (60 §7)         |
| Drum keys' other settings in the sound: start, end, tune, pan, gain, reverse, play modes, mute group | partial | OURS                                                                                                   | `sound/engine.ts:852-930`                                          | pan law, retrigger, choke and levels never measured                                           |
| Stand-ins for TE's factory kits                                                                      | partial | OURS (synthesized voices)                                                                              | `sound/kit.ts`                                                     | TE's samples live in the firmware, not on the drive; levels never compared (62 §3)            |
| Synth sampler M1: points, overview strip; shift: direction, tune, crossfade, gain                    | yes     | DEV-CAMERA (b1-2600…2708) + DEV-OBS (75 % maximum, owner's photo)                                      | `sim/areas/sample/m1.ts`; `sim/screen/pages/drum.ts`               | until-release and loop-off pictograms never seen                                              |
| Synth sampler sound: loop types, crossfade                                                           | partial | OURS                                                                                                   | `sound/mapping.ts:345-372`                                         | "until release" loops on after release; crossfade law unmeasured (Q7); /99 played, /100 drawn |
| Multisampler: up to 24 zones, keyboard strip                                                         | yes     | DEV-CAMERA (b1-2718…2782) + COMMUNITY                                                                  | `sim/areas/sample/m1.ts:72-82`; `sim/screen/pages/drum.ts:404-430` | notes above the top zone (30 §8 #6)                                                           |
| Multisampler stand-in pad                                                                            | partial | DEV-AUDIO (modelled on bandpasser, 62 §2.5)                                                            | `sound/synths.ts:587-625`                                          | +3.6…+4.2 dB over its first 0.3 s                                                             |
| Sampler M1 pages ignore CC 12–15                                                                     | yes     | DEV-CAMERA (59 §3)                                                                                     | `sim/device-map.ts:663`                                            | manual unit `sampler.overview` still says they answer                                         |
| Drum track M2–M4 pages                                                                               | partial | DEV-CAMERA (filmed on synth tracks only)                                                               | `sim/frames.ts:182-212`                                            | never filmed on a drum track (59 §4)                                                          |

### 2.6 Mixer, master section, FX and sends

| Capability                                               | Impl    | Verified by                                                  | Evidence                                                     | Gaps                                                                                                                       |
| -------------------------------------------------------- | ------- | ------------------------------------------------------------ | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Mix M1 strips: level bar, pan dot, ink                   | yes     | DEV-CAMERA (CC7 and CC10 sweeps)                             | `sim/screen/pages/mix.ts:15-39`                              | —                                                                                                                          |
| Level and pan laws (sound)                               | partial | OURS (unity at 75, matched to the unit's default level)      | `sound/mapping.ts:237-247`                                   | unmeasured away from the defaults                                                                                          |
| FX send popup (E1, E2)                                   | yes     | DEV-CAMERA (b1-069…096, T3 only)                             | `sim/areas/mixer/sim.ts:62-65,228-241`                       | other strips' tones; what dismisses it                                                                                     |
| Send law and routing (sound)                             | partial | OURS ((v/99)², after the fader)                              | `sound/mapping.ts:267`; `sound/channel.ts:101-104`           | only FX I and FX II are wired: tape and aux out do nothing, though a new project sends every track to tape at 99           |
| Mute: screen and sound                                   | yes     | GUIDE + DEV-OBS (CC9 mutes shown on the track keys)          | `sim/screen/pages/mix.ts:31`; `sound/channel.ts:10-11`       | M1 mute and solo never filmed (59 §4); live keys still sound on a muted track (ours)                                       |
| Solo (hold Tn in mix)                                    | partial | GUIDE + OURS                                                 | `sound/engine.ts:428-448`; `sim/areas/mixer/meters.ts:42-53` | an aux-bank solo stills the meters, not the sound                                                                          |
| M1 meters while playing                                  | partial | OURS (driven by sequencer hits, not audio)                   | `sim/areas/mixer/meters.ts:1-68`                             | every capture was taken stopped                                                                                            |
| Mix aux bank (mix pressed again)                         | yes     | GUIDE                                                        | `sim/frames.ts:218-232`                                      | no capture                                                                                                                 |
| M2 EQ screen                                             | yes     | DEV-CAMERA (steps-018…038, b1-136…170)                       | `sim/areas/mixer/eq.ts`; `sim/areas/mixer/draw.ts:249-271`   | the knob counted from blend 50 (ours)                                                                                      |
| EQ sound                                                 | partial | OURS (150 Hz shelf, 1 kHz bell, 6 kHz shelf, ±12 dB × blend) | `sound/mapping.ts:260-264`; `sound/engine.ts:227-235`        | E4: a blend (guide) or a morph (camera)?                                                                                   |
| M3 saturator screen                                      | yes     | DEV-CAMERA (b1-171…204)                                      | `sim/areas/mixer/draw.ts:275-323`                            | —                                                                                                                          |
| Saturator sound                                          | no      | —                                                            | not in the chain (`sound/engine.ts:222-243`)                 | —                                                                                                                          |
| M4 master page at rest: group levels, compressor bar, VU | yes     | DEV-CAMERA (b1-205…253)                                      | `sim/areas/mixer/draw.ts:327-453`                            | needle and strips with sound never filmed                                                                                  |
| Group and master levels (sound)                          | partial | OURS (unity at 50)                                           | `sound/mapping.ts:253-257`                                   | —                                                                                                                          |
| Master compressor (sound)                                | no      | —                                                            | `sim/areas/mixer/state.ts:99` (stored, unused)               | a new project stores 10 (62 §1); Q15                                                                                       |
| Output limiter                                           | partial | OURS (static soft knee)                                      | `sound/limit.ts:8-17`                                        | stands in for the compressor                                                                                               |
| FX list (shift + T7/T8) and pages                        | yes     | DEV-CAMERA (b1-4640…4780) + OURS (FX II's header "16")       | `sim/areas/auxiliary/sim.ts:704-727`                         | FX II's list never seen                                                                                                    |
| Effect labels: chorus, delay, dist, phaser, reverb       | yes     | DEV-CAMERA                                                   | `sim/areas/auxiliary/state.ts:114-127`                       | —                                                                                                                          |
| lofi labels                                              | partial | GUIDE                                                        | `sim/areas/auxiliary/state.ts:124`                           | never filmed                                                                                                               |
| Delay size in eight zones, 1/32…1/2                      | yes     | DEV-CAMERA (CC12 sweep)                                      | `sim/areas/auxiliary/state.ts:129-143`                       | the "1/8" zone is ours                                                                                                     |
| FX sound                                                 | partial | OURS (a fixed ping-pong delay and a fixed 2.2 s hall)        | `sound/engine.ts:251-252`; `sound/fx.ts:21-101`              | type, parameters, filter, LFO and FX I → FX II never reach the sound; the reverb's tail is shorter than the unit's (62 §3) |
| FX returns on aux T7/T8                                  | partial | OURS                                                         | `sound/engine.ts:253-257,429-436`                            | a muted FX track cuts its return (ours)                                                                                    |
| The midi engine's CC pages                               | yes     | OURS                                                         | `sim/areas/mixer/draw.ts:455-487`                            | the engine itself may be gone on 1.1.33 (Q10)                                                                              |

### 2.7 Tempo, groove and metronome

| Capability                             | Impl    | Verified by                                                       | Evidence                                             | Gaps                                                                                             |
| -------------------------------------- | ------- | ----------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| BPM 40–220 and its figures             | yes     | DEV-OBS (CC80 clamp, 90 session 1) + DEV-CAMERA (0.47 px rms)     | `sim/screen/pages/tempo.ts:38-90`                    | decimals (push + turn) never seen                                                                |
| Eleven groove types and their letters  | yes     | DEV-CAMERA (all eleven, in order, 59 §2.11)                       | `sim/params.ts:74-107`                               | a stale comment says only "SH" is known (`params.ts:91-94`)                                      |
| Groove amount slider                   | yes     | DEV-CAMERA                                                        | `sim/screen/pages/tempo.ts:184-212`                  | the ±99 scale and detents are ours; the device map calls it "swing" (63)                         |
| Groove sound (timing shapes)           | partial | OURS                                                              | `sound/groove.ts:28-181`                             | never recorded                                                                                   |
| Metronome level, speaker waves, on/off | yes     | GUIDE + DEV-CAMERA (the waves)                                    | `sim/screen/pages/tempo.ts:214-257`                  | a click of E4 is a separate flag here; frames 3888–3890 suggest it zeroes and restores the level |
| Metronome sound                        | partial | OURS (a synthesized 1320/1760 Hz click, accent every fourth beat) | `sound/kit.ts:374-384`; `sound/scheduler.ts:828-845` | never recorded; the count-in clicks with the metronome off                                       |
| Tap tempo                              | yes     | DEV-CAMERA (taps tap) + OURS (mean of three, 2 s reset)           | `sim/opxy-sim.svelte.ts:61-62,331-362`               | —                                                                                                |
| Pendulum, beat dots, weight            | yes     | DEV-CAMERA (fitted on the 10 fps run)                             | `sim/screen/pages/tempo.ts:94-166`                   | how fast the weight slides                                                                       |
| Jack                                   | partial | DEV-CAMERA (grey only)                                            | `sim/screen/pages/tempo.ts:253-256`                  | what turns it black                                                                              |

### 2.8 Sequencer

| Capability                                                                | Impl    | Verified by                                                                                                    | Evidence                                                                        | Gaps                                                                                                                |
| ------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Step entry: the last key, a held chord, drum keys as sounds               | yes     | GUIDE + DEV-OBS (steps written by the replica played and lit on the unit, `test 2`, 90 2026-09-28)             | `sim/areas/sequencer/steps.ts:75-196`; `sequencer.cases.ts:103-181`             | an empty step takes its note on release; C4/F3 before any key; velocity 100 (all ours)                              |
| A tap clears a step, also while playing                                   | yes     | GUIDE                                                                                                          | `sim/areas/sequencer/steps.ts:161-170`                                          | —                                                                                                                   |
| Check note (a held step lights its keys)                                  | yes     | GUIDE                                                                                                          | `sim/areas/sequencer/leds.ts:144-145`                                           | first held step only (ours)                                                                                         |
| Note length (bar E2)                                                      | yes     | GUIDE + DEV-CAMERA ("length 50") + COMMUNITY (ticks)                                                           | `sim/areas/sequencer/bar.ts:175-178`                                            | —                                                                                                                   |
| Extend and overlap                                                        | yes     | GUIDE + OURS (overlap = full + ¼ step)                                                                         | `sim/sequencer.ts:380-399`                                                      | —                                                                                                                   |
| Nudge and its held repeat                                                 | yes     | GUIDE + OURS (20/480 a press; repeat after 400 ms)                                                             | `sim/sequencer.ts:411-431`; `sim/areas/sequencer/steps.ts:236-283`              | —                                                                                                                   |
| Copy (hold a lit step ≈ 0.5 s) and paste                                  | yes     | DEV-CAMERA (the copy happens during the hold; Q4 answered)                                                     | `sim/areas/sequencer/steps.ts:128-178`                                          | how long the clipboard lives is ours                                                                                |
| Rotate and transpose a sequence                                           | yes     | GUIDE                                                                                                          | `sim/sequencer.ts:437-455`                                                      | —                                                                                                                   |
| Single-sound view                                                         | yes     | GUIDE                                                                                                          | `sim/areas/sequencer/recording.ts:95-101`                                       | —                                                                                                                   |
| Live recording: arm, first note starts, overdub, latch                    | yes     | GUIDE + OURS (a tap of record unlatches)                                                                       | `sim/areas/sequencer/recording.ts:102-169`                                      | —                                                                                                                   |
| Count-in                                                                  | yes     | GUIDE (1.0.38) + OURS (16 sixteenths in any meter; it clicks with the metronome off)                           | `sim/areas/sequencer/recording.ts:41,139-147`; `sound/scheduler.ts:836-838`     | —                                                                                                                   |
| Live note placement and record quantise                                   | yes     | OURS + COMMUNITY (480-tick grid)                                                                               | `sim/sequencer.ts:457-483`; `sim/sequencer-playback.ts:302-306`                 | quantise applied at playback; no case                                                                               |
| Recorded automation (turns while recording)                               | yes     | GUIDE + COMMUNITY                                                                                              | `sim/areas/sequencer/recording.ts:254-273`                                      | —                                                                                                                   |
| Armed, count-in and recording screens                                     | no      | —                                                                                                              | `sim/frames.ts:155` (no frame type)                                             | still to capture (59 §4); the page beneath stays as it was                                                          |
| Step recording                                                            | yes     | GUIDE                                                                                                          | `sim/areas/sequencer/recording.ts:110-252`                                      | stepping back is silent here; the guide says the step's sound plays                                                 |
| Clear a track (record + hold stop)                                        | yes     | GUIDE + OURS (1 s; the playing pattern only)                                                                   | `sim/areas/sequencer/recording.ts:67-81`                                        | the guide says the whole track                                                                                      |
| Undo (shift + record)                                                     | yes     | GUIDE + OURS (a second undo redoes; which edits count)                                                         | `sim/areas/sequencer/model.ts:214-238`                                          | —                                                                                                                   |
| Parameter locks (hold a step + turn; locks on empty steps)                | yes     | GUIDE + DEV-CAMERA                                                                                             | `sim/areas/sequencer/steps.ts:198-234`                                          | —                                                                                                                   |
| Lock popups: step box, orange while writing, locked values in the top bar | yes     | DEV-CAMERA (b1-605…713)                                                                                        | `sim/areas/sequencer/popup-draw.ts:19-43`; `sim/areas/sequencer/sim.ts:66-102`  | the first box's tint; 400 ms of orange is ours; none on aux tracks                                                  |
| What can be locked                                                        | partial | GUIDE (+1.1.0, 1.1.15)                                                                                         | `sim/areas/sequencer/locks.ts:9-464`                                            | synth sampler and multisampler M1 cannot be locked (1.1.0 says the sampler can); the `.xy` drops several lock kinds |
| Locks in the sound                                                        | partial | OURS                                                                                                           | `sound/scheduler.ts:202-227,601-644`                                            | notes already sounding follow only M1 and the filter                                                                |
| Smoothing (bar E4, shape)                                                 | partial | DEV-CAMERA (the glyph) + OURS (the curve)                                                                      | `sound/scheduler.ts:623-643`                                                    | never heard                                                                                                         |
| Step components: gesture, blinking, several a step                        | yes     | GUIDE                                                                                                          | `sim/areas/sequencer/components.ts:114-162`                                     | —                                                                                                                   |
| Step components page                                                      | yes     | OURS (layout, names, wording)                                                                                  | `sim/areas/sequencer/draw.ts:39-77`; `sim/areas/sequencer/components.ts:39-112` | never filmed (59 §4)                                                                                                |
| The 14 components' behaviour                                              | partial | GUIDE (TE's table) + OURS (ramp spacing, bend curves, random draws, tonality chances, jump 5–7, skip counting) | `sim/sequencer-playback.ts:66-395`                                              | multiply 9 plays 9 hits (TE prints 3); tonality 1–2 do nothing                                                      |
| Bar card: roll, rows, clear labels                                        | yes     | DEV-CAMERA (b1-476…649) + OURS (the roll's pitch scale)                                                        | `sim/areas/sequencer/bar.ts`; `sim/areas/sequencer/bar-draw.ts`                 | quant "off" and a negative groove never seen                                                                        |
| Bars: + and −, duplicate, last-bar length, tap to switch                  | yes     | GUIDE + DEV-CAMERA                                                                                             | `sim/sequencer.ts:487-548`; `sim/areas/sequencer/bar.ts:73-163`                 | bar + − deletes the bar's content (ours)                                                                            |
| Bar clears: notes, params, all                                            | yes     | GUIDE + DEV-CAMERA (labels)                                                                                    | `sim/sequencer.ts:550-568`                                                      | clearing notes also takes the components (ours)                                                                     |
| Track scale                                                               | partial | GUIDE + COMMUNITY (bytes for ½, 1, 2, 16) + OURS (the digit map)                                               | `sim/sequencer.ts:84-107`                                                       | 1/5 and 1/7 (1.0.15) missing; the odd-scale grid of 1.1.25                                                          |
| Track groove on the bar's detents                                         | yes     | COMMUNITY (detents) + DEV-CAMERA ("-", "+16")                                                                  | `sim/sequencer.ts:630-654`                                                      | —                                                                                                                   |
| Limits: 4 bars, 64 steps, 120 notes, 16 patterns                          | yes     | GUIDE + COMMUNITY                                                                                              | `sim/sequencer.ts:13-18`                                                        | 120 notes and 16 patterns never tried on the unit                                                                   |
| Timing resolution (480 ticks a step)                                      | yes     | COMMUNITY                                                                                                      | `sim/sequencer.ts:411-431`                                                      | —                                                                                                                   |
| Playhead walk (per-track scale and length; LEDs and sound share one walk) | yes     | GUIDE + OURS                                                                                                   | `sim/sequencer-playback.ts:409-574`                                             | with random counts the LEDs can part from the sound                                                                 |

### 2.9 Players

| Capability                                              | Impl    | Verified by                                                                                   | Evidence                                                            | Gaps                                                                                                         |
| ------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Player page: first press dims it under "off", second on | yes     | DEV-CAMERA (59 §2.7)                                                                          | `sim/areas/sequencer/players.ts:42-61`                              | —                                                                                                            |
| Player list: shift + player, E1, let go                 | yes     | DEV-OBS (the owner's correction, 2026-09-29) + DEV-CAMERA                                     | `sim/areas/sequencer/players.ts:46-82`                              | —                                                                                                            |
| Arpeggio speeds                                         | partial | DEV-CAMERA (the ends) + OURS (triplets inferred)                                              | `sim/sequencer.ts:118-133`                                          | 1/4t or slower; the rate ignores the track scale                                                             |
| Arpeggio patterns                                       | yes     | GUIDE + DEV-CAMERA (pictograms) + OURS (note orders)                                          | `sim/sequencer-playback.ts:598-635`                                 | —                                                                                                            |
| Arpeggio range and hold                                 | yes     | DEV-CAMERA + OURS (hold's gestures)                                                           | `sim/areas/sequencer/players.ts:65-118`                             | range above 4                                                                                                |
| Arpeggio shift layer: length, style, glide, stereo      | partial | DEV-CAMERA (pictograms) + OURS (the four styles)                                              | `sim/areas/sequencer/player-draw.ts:215-262`                        | the styles conflict with the camera's charts                                                                 |
| Arpeggio playback                                       | partial | OURS                                                                                          | `sound/scheduler.ts:247-269,646-791`; `app/sound.svelte.ts:704-716` | stopped, held keys sound as a chord with no run; held notes survive a pattern change (1.1.21 says they stop) |
| Hold player                                             | yes     | GUIDE + DEV-CAMERA (the idle page)                                                            | `sim/areas/sequencer/players.ts:142-144`                            | the ribbon with notes latched never filmed                                                                   |
| Maestro                                                 | yes     | GUIDE + DEV-CAMERA (slabs, roll values) + OURS (transposing from the lowest note, roll scale) | `sim/sequencer-playback.ts:692-733`                                 | —                                                                                                            |
| Players kept per pattern                                | yes     | GUIDE (1.1.25, inferred)                                                                      | `sim/sequencer.ts:190-281`                                          | not in the `.xy` map: not loaded, not saved                                                                  |

### 2.10 Auxiliary tracks

| Capability                                                 | Impl    | Verified by                                                                                                  | Evidence                                                                    | Gaps                                                                        |
| ---------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Brain M1: auto or manual, root, scale, link                | yes     | DEV-CAMERA                                                                                                   | `sim/areas/auxiliary/sim.ts:351-375`; `sim/areas/auxiliary/draw.ts:195-213` | the link is shown only; nothing reads it                                    |
| Brain M2 routing page                                      | yes     | DEV-CAMERA (b1-4009…4031)                                                                                    | `sim/areas/auxiliary/draw.ts:217-289`                                       | the slide-in is not drawn                                                   |
| Routing direction (clockwise in, anticlockwise out)        | yes     | OURS                                                                                                         | `sim/areas/auxiliary/sim.ts:398-403`                                        | Q4; cases `auxiliary.cases.ts:311,433` pin it unmarked                      |
| Brain transposition of routed tracks                       | partial | GUIDE + OURS (the target, the short way round, a chord's lowest note, a key change over a move in the scale) | `sim/areas/auxiliary/sim.ts:175-183,283-327`; `sound/scheduler.ts:553-592`  | live notes are never transposed                                             |
| Brain's scale for ramps, random and tonality               | yes     | GUIDE                                                                                                        | `sound/scheduler.ts:553-557`                                                | no case                                                                     |
| Auto key detection                                         | partial | OURS                                                                                                         | `sim/areas/auxiliary/sim.ts:239-281`                                        | the unit's rule is unknown                                                  |
| Brain M3 and M4                                            | no      | —                                                                                                            | `sim/areas/auxiliary/sim.ts:81-82` (shows M1)                               | b1-4028 may be a brain LFO page                                             |
| Punch-in idle heartbeat                                    | yes     | DEV-CAMERA (fitted over 25 loops)                                                                            | `sim/areas/auxiliary/sim.ts:205-229`                                        | —                                                                           |
| Punch-in pictures                                          | partial | DEV-CAMERA (one still a key) + OURS (key order taken from the press order)                                   | `sim/areas/auxiliary/draw.ts:293-318`                                       | the 4–8 s animations are not played (Q8)                                    |
| Punch-in effects (24 key-and-group cells)                  | yes     | DEV-AUDIO (19 cells observed, 60 §6) + OURS (5 inferred; about 8 observed cells carry our numbers)           | `sound/punch/effects.ts:40-258`                                             | G and A♯ on the drums, follow, the ramps' ladders, random's intervals       |
| Punch-in with the transport stopped; tilt                  | partial | OURS                                                                                                         | `sound/engine.ts:356-361`; `sound/punch/effects.ts:198-203`                 | fills and repeats are silent when stopped; the melodic pan sweeps by itself |
| External MIDI pages: channel, bank, program, CC slots, LFO | yes     | DEV-CAMERA (b1-4103…4159, steps-788…828)                                                                     | `sim/areas/auxiliary/sim.ts:433-449,555-569`                                | the LFO modulates nothing                                                   |
| External MIDI output to gear                               | no      | —                                                                                                            | `app/bridge.svelte.ts:4-12`; `app/mapping.ts:53`                            | no notes, bank, program, CCs or LFO go out                                  |
| External CV meter                                          | yes     | DEV-CAMERA (b1-4236…4287)                                                                                    | `sim/areas/auxiliary/draw.ts:422-480`                                       | —                                                                           |
| CV pitch law, gate and output                              | partial | OURS (1 V an octave, C4 = 0 V)                                                                               | `sim/areas/auxiliary/sim.ts:452-462`                                        | the needle with notes is "to confirm" (59 §2.13); no gate; nothing goes out |
| External audio pages M1–M4                                 | yes     | DEV-CAMERA (drive, level, mix, routing, filter, LFO) + OURS (shift sends, other inputs' pictures)            | `sim/areas/auxiliary/draw.ts:484-835`                                       | only the mic input was seen                                                 |
| External audio: input and sound                            | no      | —                                                                                                            | —                                                                           | no input; drive, level, mix and the filter do nothing                       |
| Tape M1 page                                               | yes     | DEV-CAMERA (steps-954…998)                                                                                   | `sim/areas/auxiliary/state.ts:86-98`                                        | CC12 (pitch) moved the page only a little                                   |
| Tape strip and M2–M4                                       | partial | OURS (copied from external audio's pages)                                                                    | `sim/areas/auxiliary/sim.ts:86-89,470-494`                                  | never filmed playing                                                        |
| Tape sound                                                 | no      | —                                                                                                            | Q8                                                                          | clips, loop, speed, pitch and mix are all silent                            |
| FX tracks' M2–M4 (routing, filter, LFO)                    | yes     | OURS + GUIDE                                                                                                 | `sim/areas/auxiliary/sim.ts:96,101-126`                                     | never filmed; the filter and LFO move nothing                               |
| Aux step entry, live recording, clear                      | yes     | GUIDE                                                                                                        | `auxiliary.cases.ts:187,400,582,1350`                                       | components and groove are ignored in aux playback                           |
| Aux octave popup, "copied", lock view                      | no      | —                                                                                                            | `sim/areas/sequencer/steps.ts:141-147,296-301`                              | the unit shows an octave popup in the CV meter (59 §2.12)                   |
| Aux LFOs moving page values                                | no      | —                                                                                                            | —                                                                           | OS 1.1.32 says they do                                                      |
| Sub-page slides (brain M2, external MIDI M2/M3)            | no      | —                                                                                                            | —                                                                           | seen by the camera (59 §2.1), not drawn                                     |

### 2.11 Arrange: patterns, scenes, songs

| Capability                                                       | Impl    | Verified by                                                                                      | Evidence                                                                   | Gaps                                                                                                                |
| ---------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Arrange page: rules, band, stack, notes, scene box, footer       | yes     | DEV-CAMERA (b1-721…837, median 0.48 px)                                                          | `sim/areas/arrange/view.ts:42-191`; `sim/areas/arrange/draw.ts:66-210`     | the cross-fade and stack slide are not drawn                                                                        |
| Patterns: new, copy, paste, clear or delete                      | yes     | GUIDE + DEV-CAMERA (labels; M1 is new)                                                           | `sim/areas/arrange/model.ts:182-293`                                       | where a new pattern goes and which plays after a delete are ours                                                    |
| 16 patterns a track                                              | yes     | GUIDE                                                                                            | `sim/sequencer.ts:18`                                                      | never tried on the unit (Q13)                                                                                       |
| E4 scrolls the stack                                             | yes     | DEV-CAMERA                                                                                       | `sim/areas/arrange/model.ts:295-298`                                       | no slide                                                                                                            |
| Pattern switch while playing                                     | yes     | OURS (at once, the playhead keeps its place)                                                     | `sim/areas/arrange/model.ts:132-150`                                       | —                                                                                                                   |
| A sound per pattern; sound link                                  | yes     | GUIDE + OURS (turning the link off restores each pattern's sound)                                | `sim/areas/arrange/model.ts:99-180`                                        | —                                                                                                                   |
| Scenes 1–9 (shift + black key, arrange only); a new scene copies | yes     | GUIDE + DEV-OBS (arrange mode only, 90 2026-09-28 night)                                         | `sim/areas/arrange/sim.ts:77-84`                                           | —                                                                                                                   |
| Scenes 10–99                                                     | yes     | GUIDE + OURS (the display)                                                                       | `sim/areas/arrange/sim.ts:86-96`                                           | never filmed                                                                                                        |
| Scene clone, copy, paste, reset                                  | yes     | GUIDE + DEV-CAMERA (labels)                                                                      | `sim/areas/arrange/model.ts:342-379`                                       | the clone's target is ours                                                                                          |
| A scene's mix                                                    | partial | GUIDE ("the mix") against COMMUNITY (the file: mutes a scene, volume and pan a pattern, 10 §3.3) | `sim/areas/arrange/model.ts:303-321`; `sim/areas/arrange/state.ts:43-54`   | per-scene levels and pans are likely wrong; a save drops them (`sim/xy.ts:529`); a load gives every scene one level |
| Scene queue                                                      | yes     | GUIDE (the gesture) + OURS (timing, box, LEDs)                                                   | `sim/areas/arrange/sim.ts:126-144`                                         | 63 flags `arrange.scene-queue#queue`                                                                                |
| Scene length modes                                               | yes     | GUIDE + COMMUNITY + OURS (only patterns with notes count)                                        | `sim/areas/arrange/model.ts:419-461`                                       | a file's "shortest" mode is dropped on load (`sim/xy.ts:610-616`)                                                   |
| Song editor: 32 slots, cursor, footer                            | yes     | DEV-CAMERA (b1-838…874)                                                                          | `sim/areas/arrange/model.ts:505-597`; `sim/areas/arrange/draw.ts:212-399`  | scrolling past 32 entries is ours                                                                                   |
| Song loop on or off                                              | yes     | GUIDE + OURS (its sign; loop off stops the transport)                                            | `sim/areas/arrange/sim.ts:207-225`                                         | loop off never seen                                                                                                 |
| The playing entry's ring and notch                               | yes     | DEV-CAMERA                                                                                       | `sim/areas/arrange/draw.ts:349-372`                                        | —                                                                                                                   |
| Plain play runs the song from its first entry                    | yes     | DEV-OBS (90 2026-09-28 night)                                                                    | `sim/areas/arrange/sim.ts:146-153`                                         | —                                                                                                                   |
| A scene picked while the song plays takes over, then repeats     | yes     | DEV-OBS (test B)                                                                                 | `sim/areas/arrange/model.ts:475-490`; `sim/areas/arrange/song.spec.ts:291` | no conformance case                                                                                                 |
| A scene picked while stopped plays round and round               | yes     | DEV-OBS (test A)                                                                                 | `sim/areas/arrange/model.ts:475-490`; `arrange-mix.cases.ts:1336`          | release by opening song mode is ours                                                                                |
| A one-scene song with loop off plays once                        | yes     | OURS                                                                                             | `sim/areas/arrange/model.ts:657-716`                                       | in PLAN's "open for the owner"                                                                                      |
| Cue (shift + [−]/[+]); a song switched while playing             | yes     | GUIDE + OURS (timing)                                                                            | `sim/areas/arrange/model.ts:567-614`                                       | —                                                                                                                   |

### 2.12 Project, preset browser and system pages

| Capability                                                                  | Impl    | Verified by                                                                                | Evidence                                                                                                | Gaps                                                                                                 |
| --------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Project view: new, save, rename, settings                                   | yes     | GUIDE (art, 0.61 % MAD)                                                                    | `sim/screen/pages/project.ts:13-22`                                                                     | never filmed                                                                                         |
| New project (hold M1)                                                       | yes     | DEV-OBS (the owner's way in every session; contents byte for byte the unit's blank, 62 §1) | `sim/areas/system/projects.ts:205-214`                                                                  | hold time and labels are ours                                                                        |
| Save, save as, versions                                                     | yes     | GUIDE + OURS (labels, default names, 16 versions)                                          | `sim/areas/system/projects.ts:145-191`                                                                  | —                                                                                                    |
| Rename and the naming screen                                                | yes     | OURS (the screen) + GUIDE (its keys)                                                       | `sim/areas/system/naming.ts`; `sim/areas/system/draw.ts:386-427`                                        | never seen                                                                                           |
| Projects folder: factory, templates, user; load, duplicate                  | yes     | GUIDE (art) + DEV-OBS (the MTP tree)                                                       | `sim/areas/system/state.ts:308-313`; `sim/areas/system/build.ts:143-165`                                | "demo 1…6" are placeholders; which end key loads (Q4); no autosaves entry                            |
| Delete a project (hold M4)                                                  | yes     | GUIDE + OURS (it asks first)                                                               | `sim/areas/system/sim.ts:182-190,401-417`                                                               | 63 flags it                                                                                          |
| History page                                                                | partial | OURS                                                                                       | `sim/areas/system/sim.ts:378-398`                                                                       | never seen                                                                                           |
| Templates                                                                   | partial | GUIDE + DEV-OBS (the folder exists)                                                        | `sim/areas/system/state.ts:310`                                                                         | always empty; 63 flags `project.templates#load`                                                      |
| Project settings: time signature, scene length, voices, transpose           | yes     | GUIDE (art)                                                                                | `sim/areas/system/settings.ts:103-179`                                                                  | ranges ours; none of them is played (next row)                                                       |
| Project midi page: 16 track channels                                        | yes     | GUIDE + DEV-OBS (the owner set T1–T8 to channels 1–8 there)                                | `sim/areas/system/settings.ts:165-177`                                                                  | never filmed                                                                                         |
| Settings that take effect                                                   | no      | —                                                                                          | only `sim/areas/sample/sim.ts:612` (preview) and `sound/engine.ts:444` (velocity)                       | transpose, voices, channels, system velocity, detune, brightness and MIDI directions are stored only |
| COM page: device card, multi-out, charge                                    | yes     | GUIDE (art)                                                                                | `sim/screen/pages/com.ts`                                                                               | multi-out order ours ("device check")                                                                |
| System settings: midi, clock, keyboard, pitch bend, battery, monitor, legal | yes     | GUIDE + DEV-OBS (stock MIDI values: clock in, notes and other both, channel 1, echo off)   | `sim/areas/system/settings.ts:196-373`                                                                  | ranges and defaults ours                                                                             |
| Controller mode page and its shift layer                                    | yes     | GUIDE + COMMUNITY + OURS (the shift cards)                                                 | `sim/areas/system/draw.ts:349-371`                                                                      | —                                                                                                    |
| Devices and Bluetooth                                                       | yes     | GUIDE + OURS (the "computer" entry)                                                        | `sim/areas/system/settings.ts:484-502`                                                                  | pairing is not modelled                                                                              |
| MTP mode page                                                               | yes     | GUIDE + DEV-OBS (re-enumerates; leaves when the session closes)                            | `sim/areas/system/sim.ts:303-319`                                                                       | leaving on close is not modelled                                                                     |
| Battery, volume popup, power and boot, usage icons                          | partial | GUIDE + OURS                                                                               | `sim/areas/system/settings.ts:353-357`; `sim/areas/system/usage.ts`; `sim/areas/system/draw.ts:452-469` | the battery reads a fixed 80; no popup; boot drawn by us                                             |
| User tunings editor                                                         | yes     | OURS (the page) + GUIDE                                                                    | `sim/areas/system/sim.ts:532-547`                                                                       | no effect on pitch                                                                                   |
| Preset browser by engine (eleven engines, A–Z)                              | yes     | DEV-CAMERA (b1-1494…1569)                                                                  | `sim/areas/system/presets-draw.ts`; `sim/areas/system/presets.ts:53-69`                                 | —                                                                                                    |
| By category; the view popup on a click of E1                                | yes     | DEV-CAMERA (b1-1523…1568)                                                                  | `sim/areas/system/presets.ts:59-61`; `sim/areas/system/presets-draw.ts:75-84`                           | the popup's timing is ours                                                                           |
| Which key loads, and where the track lands                                  | yes     | DEV-CAMERA (lands on M1) + GUIDE (click E2)                                                | `sim/areas/system/sim.ts:590-605`                                                                       | the key itself was not seen; E3 and E4 load here too                                                 |
| Footer: cut, paste, rename, delete                                          | yes     | DEV-CAMERA (one frame) + GUIDE                                                             | `sim/areas/system/build.ts:210-228`; `sim/areas/system/presets.ts:336-438`                              | with shift held, on an empty folder, with a paste waiting: unseen                                    |
| shift + Tn                                                                  | yes     | GUIDE + OURS (opens in the last view)                                                      | `sim/areas/system/sim.ts:667-671`                                                                       | 59 §4                                                                                                |
| Tn + M1–M4: scramble, copy, paste, save a preset                            | yes     | GUIDE + OURS (what scrambles)                                                              | `sim/areas/system/presets.ts:445-543`                                                                   | —                                                                                                    |
| Preset settings page (shift + instrument)                                   | yes     | GUIDE (art) + DEV-OBS (stored values) + OURS (lists)                                       | `sim/areas/system/settings.ts:405-481`                                                                  | never filmed                                                                                         |

### 2.13 Sampling and slicing

| Capability                                            | Impl    | Verified by                                              | Evidence                                                               | Gaps                                         |
| ----------------------------------------------------- | ------- | -------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------- |
| Record page: sources, gain, threshold, meter, channel | yes     | GUIDE (art)                                              | `sim/areas/sample/sim.ts:318-429`; `sim/areas/sample/draw.ts:162-208`  | channel names, gain range and icons are ours |
| Audio input                                           | no      | —                                                        | `sim/areas/sample/record.ts:8,46-57` (a stand-in plays TE's demo wave) | takes carry no audio                         |
| Arming, threshold start, take end, 20 s limit         | partial | GUIDE + OURS (letting go ends the take)                  | `sim/areas/sample/record.ts:63-192`                                    | —                                            |
| Recording into a drum key, the synth sampler or zones | yes     | GUIDE + COMMUNITY                                        | `sim/areas/sample/record.ts:149-171`                                   | key mode for takes over 2.5 s is ours        |
| Monitoring or count-in while sampling                 | no      | —                                                        | —                                                                      | the guide is silent; never seen              |
| Sample library                                        | partial | GUIDE (art) + OURS (the contents)                        | `sim/areas/sample/library.ts:20-140`                                   | a stand-in catalogue                         |
| Slicer: transient, even, tap                          | yes     | GUIDE (art) + OURS (the hit detector; 8 slices to start) | `sim/areas/sample/slicer.ts`                                           | —                                            |

### 2.14 Live MIDI and USB audio

| Capability                                                          | Impl    | Verified by                                                                            | Evidence                                                           | Gaps                                                                                         |
| ------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Web MIDI, SysEx permission, port pairing                            | yes     | DEV-OBS (the owner's Chrome on `/lab`)                                                 | `device/access.svelte.ts:142-171`                                  | other systems' port names; a refused permission                                              |
| Identity request and GREET (firmware version)                       | yes     | DEV-OBS                                                                                | `device/session.svelte.ts:323-394`                                 | —                                                                                            |
| Echo handling                                                       | yes     | DEV-OBS + OURS (the 500 ms window)                                                     | `device/echo.ts`                                                   | note and CC echo with COM echo on, unmeasured                                                |
| One send choke point, the deny-list, approvals                      | yes     | OURS (a policy from TE's updater) + EMULATED                                           | `device/transport.ts`; `core/te/policy.ts`                         | FILE PUT cannot be sent                                                                      |
| Replica keyboard → notes                                            | yes     | EMULATED + DEV-OBS (the routing rule)                                                  | `app/bridge.svelte.ts:122,343-358`                                 | never played from the replica on the unit; channel 1 fixed; the replica's octave not applied |
| The agent's note previews                                           | yes     | EMULATED                                                                               | `agent/tools/device.ts:847`                                        | T1 previews on channel 1 reach the selected track instead                                    |
| Transport out (FA, FC)                                              | yes     | DEV-OBS (with clock = both)                                                            | `app/bridge.svelte.ts:306-311`                                     | under the stock clock "in", untested                                                         |
| Track select (CC102)                                                | yes     | DEV-OBS (tracks 1–8)                                                                   | `app/mapping.ts:53`                                                | aux tracks are never selected                                                                |
| Tempo (CC80), mute (CC9), level and pan (CC7, CC10)                 | yes     | DEV-OBS                                                                                | `core/opxy/ccmap.ts:152`; `agent/tools/device.ts`                  | aux channels and other tracks untested                                                       |
| Sound lanes CC12–35 (`set_sound`)                                   | yes     | DEV-OBS + DEV-AUDIO (every synth engine, envelope and filter)                          | 59 §3; `knowledge/midi/cc-map.json`                                | CC28–31 and CC36/37/39 unverified; samplers and CV ignore CC12–15                            |
| LFO, EQ and groove CCs                                              | no      | —                                                                                      | `knowledge/midi/cc-map.json`                                       | they answer on screen (59 §3), but nothing sends them                                        |
| Scenes CC82–85, project CC86, remote keys CC106/107, program change | no      | —                                                                                      | `core/te/policy.ts`                                                | CC86 blocked by design; remote keys dead on 1.1.33 (90 session 1); scene CCs untested        |
| Device → replica: notes, pitch bend, transport, clock               | yes     | EMULATED + DEV-OBS (the unit sends them)                                               | `app/bridge.svelte.ts:110-118,481-552`; `device/clock-follower.ts` | never shown in the app with the unit; the host-timed clock reads ≈ 1 % slow while playing    |
| Incoming CCs                                                        | no      | —                                                                                      | `device/mirror.svelte.ts:142-159`                                  | ignored                                                                                      |
| Clock or song position from the app                                 | no      | —                                                                                      | —                                                                  | —                                                                                            |
| Panic                                                               | yes     | EMULATED + DEV-OBS (in part: CC123 on a track's channel did not free a channel-1 note) | `device/transport.ts:423-444`                                      | no select-and-release step                                                                   |
| USB audio capture in the browser (`listen`)                         | partial | EMULATED + DEV-AUDIO (works with ffmpeg and PortAudio only)                            | `device/listen/capture.svelte.ts`                                  | Chrome's input name, rate and latency never tried                                            |
| One track at a time through CC9 mutes (`listen_tracks`)             | yes     | EMULATED                                                                               | `agent/tools/listen.ts:616-630`                                    | —                                                                                            |

### 2.15 Device integration: projects, samples and presets over USB

| Capability                                      | Impl    | Verified by                                                                                     | Evidence                                                              | Gaps                                                                                                  |
| ----------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Into and out of MTP mode                        | partial | DEV-OBS (`com → M4` by hand; the unit leaves when the session closes)                           | `device/mtp.ts:120-135`                                               | no known command enters MTP mode (30 §8 #18)                                                          |
| Browse and download any file (`/lab`)           | yes     | DEV-OBS (2026-09-28)                                                                            | `src/routes/lab/LabMtp.svelte`                                        | a read-only developer page                                                                            |
| Load the open project (`projects/workspace.xy`) | yes     | DEV-OBS (TE's "agent", 2026-09-28)                                                              | `app/project-transfer.svelte.ts` `loadFromDevice`                     | only the open project; nothing in `projects/user` can be picked                                       |
| Save a new project to `projects/user`           | yes     | DEV-OBS (`test 1` and `test 2` opened and played, 2026-09-28)                                   | `app/project-transfer.svelte.ts` `saveToDevice`; `core/mtp/policy.ts` | written over the open project, so sounds, mixer, players and aux settings stay the device's           |
| What a load takes in                            | partial | COMMUNITY (xy-format's map) + DEV-OBS (the owner's 1.1.33 files read and written byte for byte) | `sim/xy.ts:561-597`                                                   | not the master section, players, aux settings, drum keys' settings, a second kit, recorded bend lanes |
| Read the project's own samples from the drive   | yes     | EMULATED                                                                                        | `app/device-samples.ts:156-226`; `app/device-samples.spec.ts`         | never run on a unit; no project pulled so far names a drive sample                                    |
| Keep read samples on the computer (IndexedDB)   | yes     | APP                                                                                             | `app/device-samples.ts:283-342`                                       | a file changed on the device at the same path stays stale                                             |
| Sampler and zone regions from a project         | yes     | COMMUNITY (§3.5 ★, confidence C; checked on the blank project's kits and pad)                   | `sim/xy.ts:848-907`                                                   | one set an engine a track; `/fat32/` regions only in our own test files                               |
| Drum keys' settings from a project              | no      | —                                                                                               | `sim/xy.ts:833-843` (path and length only)                            | tune, start, end, play mode, direction, pan, fade and gain are dropped                                |
| TE's factory samples                            | no      | DEV-OBS (not on the drive MTP shows)                                                            | `app/device-samples.ts:1-12`                                          | stand-ins play (§2.5)                                                                                 |
| User presets on the device (`presets/…`)        | no      | —                                                                                               | —                                                                     | the browser lists the factory names only                                                              |
| Install a preset (`presets/mine/…`)             | yes     | EMULATED                                                                                        | `core/mtp/install.ts`; `ui/presets/PresetInstall.svelte`              | never tried on a unit (Q11)                                                                           |
| TE SysEx filesystem (`drum/`, `synth/`)         | partial | DEV-OBS (INIT and LIST work; INFO and METADATA refused)                                         | `core/te/`; `src/routes/lab/LabFiles.svelte`                          | PUT untested (Q1)                                                                                     |

## 3. Counts

Rows by status and by their main evidence (the first label of "Verified by"). The last column counts
rows with a DEV-AUDIO, DEV-CAMERA or DEV-OBS label anywhere in the cell, often covering one part only.

| Area                           |    Rows |     yes | partial |     no | DEV-AUDIO | DEV-CAMERA | DEV-OBS |  GUIDE | COMMUNITY |   OURS | EMULATED |   APP |      — | Any device evidence |
| ------------------------------ | ------: | ------: | ------: | -----: | --------: | ---------: | ------: | -----: | --------: | -----: | -------: | ----: | -----: | ------------------: |
| §2.1 Panel, keys, LEDs         |      24 |      16 |       7 |      1 |         0 |          1 |       1 |     13 |         2 |      5 |        0 |     1 |      1 |                   7 |
| §2.2 Modes and navigation      |       9 |       5 |       2 |      2 |         0 |          1 |       0 |      4 |         0 |      2 |        0 |     0 |      2 |                   2 |
| §2.3 Synth engines             |      18 |      16 |       2 |      0 |         8 |          8 |       0 |      1 |         0 |      1 |        0 |     0 |      0 |                  16 |
| §2.4 Instrument voice          |      25 |      11 |      13 |      1 |        10 |          5 |       1 |      2 |         2 |      4 |        0 |     0 |      1 |                  20 |
| §2.5 Samplers, drum keys       |      12 |       7 |       5 |      0 |         2 |          6 |       0 |      0 |         1 |      3 |        0 |     0 |      0 |                   8 |
| §2.6 Mixer, master, FX         |      23 |      11 |      10 |      2 |         0 |          8 |       0 |      4 |         0 |      9 |        0 |     0 |      2 |                   9 |
| §2.7 Tempo, groove, metronome  |       9 |       6 |       3 |      0 |         0 |          5 |       1 |      1 |         0 |      2 |        0 |     0 |      0 |                   7 |
| §2.8 Sequencer                 |      33 |      27 |       5 |      1 |         0 |          4 |       0 |     23 |         2 |      3 |        0 |     0 |      1 |                  10 |
| §2.9 Players                   |      10 |       7 |       3 |      0 |         0 |          4 |       1 |      4 |         0 |      1 |        0 |     0 |      0 |                   8 |
| §2.10 Auxiliary tracks         |      25 |      12 |       6 |      7 |         1 |          8 |       0 |      3 |         0 |      6 |        0 |     0 |      7 |                   9 |
| §2.11 Arrange, scenes, songs   |      20 |      19 |       1 |      0 |         0 |          4 |       3 |     11 |         0 |      2 |        0 |     0 |      0 |                  10 |
| §2.12 Project, presets, system |      25 |      21 |       3 |      1 |         0 |          4 |       1 |     16 |         0 |      3 |        0 |     0 |      1 |                  11 |
| §2.13 Sampling, slicing        |       7 |       3 |       2 |      2 |         0 |          0 |       0 |      5 |         0 |      0 |        0 |     0 |      2 |                   0 |
| §2.14 Live MIDI, USB audio     |      18 |      13 |       1 |      4 |         0 |          0 |       7 |      0 |         0 |      1 |        6 |     0 |      4 |                  11 |
| §2.15 Device integration (MTP) |      13 |       7 |       3 |      3 |         0 |          0 |       6 |      0 |         2 |      0 |        2 |     1 |      2 |                   7 |
| **All**                        | **271** | **181** |  **66** | **24** |    **21** |     **58** |  **21** | **87** |     **9** | **42** |    **8** | **2** | **23** |             **135** |

Other measures of the same picture:

- **The device map:** 65 pages, of which 49 cite a capture. Of its 336 controls, 206 have a MIDI
  lane: 122 answered on 1.1.33, 13 were ignored and 71 are untested.
- **Our manual:** 241 of its 1,231 facts (about 20 %) carry `verified_on: '1.1.33'`, and so do 8
  of its 207 procedures.
- **The code:** about 220 comment lines in `sim/` and `sound/` say "ours".

The panel, the sequencer and the system pages rest on the guide. The instrument pages and the synth
sound rest on the unit. The auxiliary and mixer areas are split: their screens were filmed, but most
of their sound is ours or absent.

## 4. Unverified assumptions, ranked by how often a user would hit them

Each item names what is assumed, where it lives, and the session step (§6) that settles it.
Stand-ins that are known to differ from the unit are included where a user hears them. A new
project already exercises everything in the first group.

**Every session (the first minutes on a new project)**

1. **The FX sound.** A fixed delay and hall whatever the FX pages say (`sound/engine.ts:251-252`).
   A new project's tracks send to both. → S3 #2.
2. **TE's factory drum kits are synthesized stand-ins** (`sound/kit.ts`). Their levels were never
   compared, and T1 and T2 of every new project play them. → S3 #9.
3. **The tremolos play at the wrong rates.** The stored LFO speed decode (`sim/defaults.ts:55`)
   puts a new project's T4, T6 and T8 tremolos at rates the unit's law does not give, and their
   fade-in is never played. → S3 #1, #4.
4. **Step LEDs while playing.** The playhead lights empty steps and dims lit ones
   (`sim/areas/sequencer/leds.ts:110`; Q4). → S2 #4.
5. **LED timing and levels.** A 250 ms flash, 30 ms on and 260 ms off fades, and dim at 42 %
   (`sim/areas/sequencer/model.ts:26-27`; `replica/Key.svelte:396-405`). → S2 #1, #5.
6. **Encoders.** One detent moves the shown number by one, with no acceleration, and a click acts on
   release (`sim/params.ts:308-316`). Every guided turn counts on this. → S2 #13.
7. **The master section.** No compressor and no saturator; the EQ, level, pan and send laws are
   ours (`sound/engine.ts:222-243`; `sound/mapping.ts:237-267`). → S3 #3.
8. **The metronome click** is synthesized, and the metronome is on in a new project
   (`sound/kit.ts:374-384`). → S3 #8.
9. **Popup and hold timings.** The octave popup and "copied" last 1.2 s, the orange box 400 ms, a
   module hold takes 800 ms and a bar tap under 400 ms counts (`sim/areas/sequencer/model.ts:20-47`;
   `sim/areas/system/state.ts:32-44`). → S1 #1; S2 #12.

**Most sessions (anyone making a beat, a part or a song)**

10. **Play modes and portamento.** Mono, legato and the glide law come from synth convention, and
    the glide law contradicts the axis take (`sound/engine.ts:509-556`; `sound/mapping.ts:193`).
    A new project's T3 is mono, T5 legato and T7 glides. → S3 #6.
11. **The filter envelope's times and hold.** It uses the amp envelope's laws, and the amount is
    held through the sustain (`sound/engine.ts:967`; `sound/mapping.ts:169-173`). This affects T3,
    T6 and T8. → S0 #5; S3 #5.
12. **Grooves.** All eleven timing shapes are ours (`sound/groove.ts`). → S0 #4; S3 #7.
13. **Live recording.** Placement and quantise applied at playback, every note step turning red, a
    16-sixteenth count-in that clicks even with the metronome off, and screens never drawn
    (`sim/sequencer.ts:457-483`; `sim/areas/sequencer/recording.ts:41`). → S1 #2; S4 #2.
14. **Factory presets beyond the eight** load as their engine's starting sound
    (`sim/areas/system/presets.ts:264-292`). That is every other preset a user picks. → Q16; S5 #6.
15. **Preset settings are not played.** The high pass, width, tunings and portamento type have no
    effect, though T4, T6 and T7 store high passes (`sim/defaults.ts:171-180`). → S3 #6.
16. **Step components.** The page is ours and so are the numbers inside each component (ramp
    spacing, bend curves, random draws, multiply 9) (`sim/sequencer-playback.ts:66-395`;
    `sim/areas/sequencer/draw.ts:39-77`). → S1 #1; S4 #3.
17. **The arpeggiator.** It does not run while stopped, its styles are ours, its triplet speeds
    are inferred and held notes survive a pattern change (`app/sound.svelte.ts:704-716`;
    `sim/areas/sequencer/player-draw.ts:215-221`). → S1 #3; S4 #4.
18. **Maestro** moves the chord so its lowest note lands on the key (`sim/sequencer-playback.ts:692-702`).
    → S4 #4.
19. **A scene's mix.** The replica keeps per-scene levels and pans; the file keeps them per pattern
    (`sim/areas/arrange/model.ts:303-321`). The agent's scene mixes rely on this. → S3 #11.
20. **The tape send and aux out are silent** (`sound/channel.ts:93-104`), though a new project
    sends every track to tape at 99. → S3 #12.
21. **Drum keys in the sound.** The pan law, retrigger, choke groups and play-mode order are ours;
    the fade is drawn one way and played another (`sound/engine.ts:852-930`;
    `sim/screen/pages/drum.ts:132-135`). → S1 #10; S3 #9.
22. **"Loop until release" loops on after release**, against our own manual
    (`sound/mapping.ts:350-353`). → S3 #9.
23. **Track scale.** The digit map is ours, and 1/5 and 1/7 are missing (`sim/sequencer.ts:84-107`).
    → S1 #1.
24. **Pattern switches** take effect at once while playing (`sim/areas/arrange/model.ts:132-150`).
    → S4 #5.
25. **Sampling records nothing:** a stand-in input plays a demo wave (`sim/areas/sample/record.ts`).
    → S1 #9.

**Some sessions**

26. **The brain.** Its key detection rule, transposing as a key change, live notes left alone, and
    the routing direction (`sim/areas/auxiliary/sim.ts:239-403`; Q4). → S1 #7; S3 #11.
27. **Scenes and songs.** Queue timing, the scene-length rule, a picked scene holding after stop,
    loop off stopping the transport, two-digit scenes (`sim/areas/arrange/model.ts:419-716`).
    → S1 #6; S4 #5.
28. **Inferred punch-in effects.** G and A♯ on the drums, follow, the ramps' ladders, random's
    intervals; the stopped transport; tilt (`sound/punch/effects.ts`; 60 §6). → S3 #10.
29. **The random, element and value LFOs.** Their shapes, depths and destinations beyond the cutoff
    (`sound/mapping.ts:454-495`). → S3 #4.
30. **Mute, solo and meters.** Live keys on a muted track, solo on the aux bank, and the meters'
    ballistics and VU (`sim/areas/mixer/meters.ts`; `sound/engine.ts:428-448`). → S1 #4; S3 #3.
31. **Tempo page.** The tap algorithm, metronome on/off as its own flag, decimal BPM
    (`sim/opxy-sim.svelte.ts:331-362,679`). → S1 #5.
32. **Projects and presets on screen.** The placeholder factory projects, the naming screen,
    delete asking first, which key loads a preset, shift + Tn's view
    (`sim/areas/system/catalogue.ts:138-146`; `sim/areas/system/sim.ts:182-190,590-605`).
    → S1 #8; S6.
33. **Live MIDI.** T1 previews reach the selected track; a held note crosses a CC102 change; the
    host-timed clock reads about 1 % slow; FA under the stock clock "in" (`agent/tools/device.ts:847`;
    `device/clock-follower.ts`). → S7.
34. **External gear.** External MIDI sends nothing, CV follows our 1 V an octave law, and external
    audio takes no input (`app/mapping.ts:53`; `sim/areas/auxiliary/sim.ts:452-462`). → S4 #6; S1 #7.
35. **The midi engine** is listed last in the browser, though the unit showed none (Q10). → S1 #8.

**Rarely**

36. Multiply 9, tonality 1–2, jump 5–7 and skip counting (`sim/sequencer-playback.ts:137-395`). → S4 #3.
37. Clearing a track (1 s, the playing pattern only), a second undo redoing, nudge sizes, overlap
    length (`sim/areas/sequencer/recording.ts:67-81`; `sim/areas/sequencer/model.ts:214-238`). → S1 #2; S4 #1.
38. Boot, power, battery, tunings, usage icons, the controller-mode shift layer, the multi-out
    order (`sim/areas/system/`). → S1 #8; S2 #10.
39. The volume knob's travel and law; the pitch-bend strip as position rather than pressure
    (`replica/state.svelte.ts:181-188`; `replica/PitchStrip.svelte:34-38`). → S2 #14, #15.
40. The ladder's resonance cap; which way the z hipass's envelope goes (`sound/synth/laws.ts:56`;
    `sim/screen/pages/filter.ts:218`). → S3 #5.

## 5. Device integration status (samples and projects)

### 5.1 Transport, and what has run on the unit

Everything goes over **MTP through WebUSB**: Chrome or Edge on macOS or Linux. On Windows, WPD owns
MTP devices (30 §6.2). The user puts the unit in MTP mode by hand with `com → M4`. It then:

- re-enumerates as PID 0x0021 with one vendor-class interface;
- drops its MIDI ports;
- returns to MIDI by itself once the session closes (90, session 1).

No TE SysEx command for "enter MTP" is known (30 §8 #18), so the app cannot switch modes itself.

| Layer       | Code                                          | What it assumes                                                                                                                                                   |
| ----------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WebUSB pipe | `device/mtp.ts` (`MtpConnection`, `bulkPipe`) | the first interface with bulk IN and OUT; a zero-length packet after a send of whole packets; 1 MiB reads; 10 s a read; a failed CloseSession is the unit leaving |
| MTP session | `core/mtp/session.ts`                         | transaction ids from 1; one GetObjectInfo per entry when listing; a whole file per GetObject (no GetPartialObject); names compared without case (FAT32)           |
| Policy      | `core/mtp/policy.ts`                          | reads always; SendObjectInfo and SendObject only after `allowWrites()`; never delete, move, overwrite or format; `write` refuses a name already there             |
| Path cache  | `core/mtp/paths.ts`                           | each folder listed once a session                                                                                                                                 |

**What has run on the owner's unit** (90, 2026-09-28 evening):

- the `/lab` browser: device info, storage, listings and a download of `projects/workspace.xy`;
- the project card's "load from the op-xy", which loaded TE's factory project "agent";
- "save to the op-xy…", which wrote `projects/user/test 1.xy` and `test 2.xy` (four organ notes
  added). Both opened and played on the unit.

That is the whole of the app's MTP history on hardware. The read of 2026-09-29 was the Python
probe (`mtp_get.py`), not the app.

**What has not run on a unit:**

- the sample reader (`app/device-samples.ts`), committed at 18:14 on 2026-09-29, after the last MTP
  session;
- the preset installer (Q11);
- the agent's `send_project`.

Every test of them uses `test/fakes/fake-mtp.ts`. That fake has the owner's folder tree, made-up
file contents and a storage id of our own.

### 5.2 Projects

- **Loading** reads `projects/workspace.xy`, the project open on the unit, and only that file. The
  2026-09-29 read held the MIDI channels the owner had set that session; whether they had been
  saved first is not recorded, so S5 #3 checks it. Any other project has to be opened on the unit first, or downloaded in
  `/lab` and opened from disk.
- **What a load takes in** (`sim/xy.ts` `xyToSim`):
  - the settings: tempo, groove, metronome, scene length, time signature, transpose, voices, MIDI
    channels and octaves;
  - every track's patterns: notes with their offsets, lengths and velocities, step components,
    locks in the columns we know, length, scale, quantise, groove and smoothing;
  - scenes (patterns and mutes) and songs;
  - each instrument track's sound from its playing pattern (engine, preset by name, the stored M1,
    envelopes, play mode, filter, sends, LFO and preset settings), with the other patterns' sounds
    held for when they play;
  - FX I and FX II's type and four values;
  - each track's level and pan from its playing pattern;
  - the sample paths of the drum keys, the sampler and the zones.
- **What a load leaves behind:**
  - the master section: EQ, saturator, compressor and the group and master levels (62 §1);
  - players;
  - the brain, external MIDI, CV, audio and tape settings;
  - drum keys' own settings;
  - a pattern's second kit (one set an engine a track);
  - recorded pitch-bend, mod-wheel and aftertouch lanes, which are kept as bytes but not played;
  - per-pattern levels other than the playing pattern's;
  - lock columns the replica cannot show, which stay in the file;
  - a "shortest" scene-length mode.
- **What a save writes** (`simToXy`): the settings, the patterns, components, locks in known
  columns, scenes (patterns and mutes) and songs. Everything is written over the device's open
  project.
- **What a save does not write:** sounds, mixer levels and pans, players, auxiliary settings,
  quantise switched off, track scales and grooves without a known byte, scene levels, and locks
  without a known column. Each is listed in `skipped`. A sound designed in the replica therefore
  does not reach the unit, and a save drops a recorded take's bend lanes when its notes change
  (`sim/xy.ts:313-314`).
- **Untried on the unit:** 16 patterns on a track, a cutoff lock's union mask (10 §7.7), a save with
  edited sounds (impossible today), and the 24-character, `_`-allowing name rule
  (`app/project-transfer.svelte.ts` `PROJECT_NAME`; 30 §8 #9 lists naming limits as untested).

### 5.3 The unit's own samples

**Code path:**

- A loaded project names each drum key's, sampler's and zone's sample by path. The file holds no
  audio, so `sim/xy.ts` stores the path as the file's id and the stand-ins play meanwhile.
- In the same MTP session as the load (`ProjectTransfer.loadFromDevice` → `DeviceSamples.read` →
  `readDeviceSamples`), every distinct path under `/fat32/` is mapped onto the MTP storage root:
  `/fat32/presets/x` becomes `presets/x`.
- Each path is resolved with a per-session folder cache and read with GetObject. Files up to 20 s
  of 96 kHz stereo float are read, 128 MB in all.
- Each file is decoded by our WAV/AIFF parsers and handed to the sound's sample registry under
  every id that holds it.
- The bytes are kept in IndexedDB (`opxy-samples`). They come back after a reload, an undo or a
  `.xy` opened from disk (`restoreCachedSamples`).
- A missing, refused, oversized or undecodable file is listed in the project card's `skipped`. A
  broken pipe ends the reading.

**Assumptions it rests on**, none checked against real data:

1. `/fat32/` is the MTP storage root. This agrees with the owner's MTP tree (`presets/`,
   `projects/`, `samples/` at the top), but has never been tried with a real region path.
2. Projects name drive samples the way xy-format's logs show: `/fat32/presets/<folders>/<name>.preset/<file>`
   and `/fat32/samples/user/<file>` (30 §4.2). Those logs come from older firmware. Our reader has
   seen `/fat32/` regions only in files our own test helper wrote (`test/fakes/xy-samples.ts`).
3. The region record layout (10 §3.5 ★, confidence C). It was checked on the blank project's
   factory kits and pad only.
4. The unit stays in MTP mode for as long as a long read takes. A kit means 24 files, and listing a
   folder costs one GetObjectInfo per entry.
5. Every file is WAV or AIFF, as the unit records and as `how_to_import.txt` allows (30 §4.1).

**The data has never existed.** We decoded the three projects ever pulled from the unit:

| Project pulled                       | Sample paths naming `content/samples/…` (factory) | Naming `/fat32/…` (drive) |
| ------------------------------------ | ------------------------------------------------- | ------------------------- |
| the blank 1.1.33 project, 2026-09-26 | 53                                                | 0                         |
| TE's "agent", 2026-09-28             | 201                                               | 0                         |
| the new project, 2026-09-29          | 53                                                | 0                         |

All three name only TE's factory library, which lives in the firmware and does not show over MTP.
Loading any of them would read nothing and play stand-ins everywhere. The happy path needs a
project that uses one of the owner's own samples, such as a recording or a preset from the
"Nostalgic Synths" pack in `presets/`.

**Even once samples arrive, the drum keys' own settings are dropped.** A loaded kit plays with
default settings, not the kit's: `sim/xy.ts:833-843` keeps only each region's path and length. The
synth sampler and zones do keep their points, loop, crossfade, tune, gain and direction
(`sim/xy.ts:880-907`).

### 5.4 What is missing

- **Loading a chosen project** from `projects/user` or `templates`. Only the open project loads.
- **The unit's user presets.** The owner's sound pack and snapshots in `presets/` are never listed
  or read. The replica's browser shows TE's 156 factory names, from xy-format's 1.1.21 list, which
  matched every 1.1.33 list on camera. Of these, only a new project's eight sound as on the unit.
- **TE's factory samples.** They cannot be had over MTP. One option, for the owner to decide given
  D2: the user's own unit plays each factory kit and sampled preset over USB audio and the app keeps
  the takes locally. This is the same capture as S3 #9, and nothing is shipped.
- **Writing sounds** into a saved project (the sound block, presets by donor copy, drum regions; 10
  §7.3 milestones 2–3).
- **A load or save tool for the agent.** Only `send_project` (a save) exists. A load needs the
  page's USB permission, which only a click can grant.

### 5.5 What a session must do

See S5 in §6, steps 1–3. These are reads only, except where marked ✍︎.

## 6. What a camera or audio session would need to capture

Every session runs on a throwaway new project unless noted. Announce every state change to the
owner and log it in `90-device-probe.md`. Calibrate the camera on the lit tempo page and check it
every half hour (59 §1). Key names are the device's: T1–T8, M1–M4, E1–E4, shift, step 1–16, record,
play, stop, bar, player, [−]/[+]. "nat N" is the Nth white key (nat 1 = F3) and "acc N" the Nth
black key (acc 1 = F♯3, acc 0 = D♯5).

### S0 — No device time: what is already on disk

1. Fit primes' wavetable drawing to `steps-356`, and answer Q9 from it.
2. Rebuild the M2 shift card from b1-2776…2819 (T8: legato · off · octave · 71). This settles T8's
   half of Q4.
3. Classify the step windows visible along the bottom of the 6,311 raw frames. Steps 4–8 sit under
   mix and M1–M4, at about y 1385–1412 of 1920 × 1440. Mark each off, dim or lit and join it to
   `b1.json`. The caps' own tones and the exposure confound this, so treat it as a first look.
   Frames shot while playing may settle Q4.
4. Measure note-on offsets in the song takes of "agent" (`captures/song/`, groove amount 30) against
   the 123.05 BPM grid: a first look at one groove type's law.
5. Fit the decay of the sound session's svf filter-envelope takes (90, sound session run 2) against
   the amp law. This may settle part of the filter-envelope question without new takes.

### S1 — Camera only: the owner presses keys, nothing is sent

Take stills unless 10 fps is noted.

1. **Step components and popups** (T3):
   - Notes on steps 1, 5, 9 and 13. Hold shift + step 5, then for each of nat 1 … nat 14 press it,
     then acc 1, acc 5, acc 9 and acc 0, taking a still after each. This covers multiply 9's text.
   - Give two steps different digits, then shift + both ("mixed"?). Record 3 s at 10 fps of a
     selected step blinking.
   - Popups: tap step 1, hold step 9 (10 fps: the first box's tint and how long it stays). Hold
     step 1 + one E1 detent and keep holding for 2 s (how long it stays orange).
   - Octave popup: [+] four times, then [−] to −3 and once more (10 fps: its fade).
   - Bar card: F3, C4, C5 and E5 on steps 1, 5, 9 and 13, then hold bar (the roll's pitch scale).
     With bar held, click E1 (quant "off"?) and turn E3 three detents left (a negative groove).
     Then bar + acc 1 … acc 0, a still each (the track-scale digit map).
   - Repeat a component on T1 and on aux T3.
2. **Recording** (10 fps):
   - Hold record + play for 5 s (armed), then nat 5 (the take starts).
   - Count-in: record + play → + play, once with the metronome on and once with it off.
   - Overdub on steps 1, 5, 9 and 13 (which steps go red?).
   - Step recording: hold record, then nat 5, 6, 7, then [+] and [−].
   - Clear: record + hold stop until clear, then check T3's second pattern, then shift + record
     twice.
3. **Players:**
   - Arpeggio E1 from fully left one detent at a time; E3 to its end.
   - With shift held, E2 one detent at a time (how many styles, and their charts).
   - Hold: latch three notes and film 5 s at 10 fps.
   - Maestro: shift + nine keys (how many slabs?).
4. **Mixer:** shift on M1; shift + T5; click E4 on T3; hold T3 for 2 bars while playing (10 fps); the
   aux bank; the send popup on T1, T2 and T8; M4 while playing (10 fps).
5. **Tempo:** push + turn E1 (decimals?); E2 past its last type; E3 at ±1, ±5 and both ends; click
   E4 at level 40, then E4 +1; headphones in (the jack); tap tempo five times at 100 BPM, wait 3 s,
   then tap twice.
6. **Arrange and songs:**
   - T1 → T2 → T3 and E4 one detent at a time (10 fps).
   - While playing, shift + play + acc 2 (the queued box).
   - shift + acc 0, acc 1, acc 2 (a two-digit scene).
   - shift + M1 with scenes 1–3 in use (the clone's target).
   - M1 on pattern 1 of 3, and M4 on 2 of 3.
   - Song mode: E1 both ways, a click of E1, 34 entries, shift + M4 with the cursor mid-song.
7. **Auxiliary tracks:**
   - Brain M2: E3 one detent each way (Q4: the routing direction).
   - Brain M3 and M4.
   - Brain M1: leave auto with E1 or E2.
   - Brain titles over D4 F4 A4, C E G B and C alone on T3.
   - Punch-in: nat 1 … acc 0 one key at a time at 10 fps, to confirm which picture goes with
     which key (Q8).
   - External MIDI: a slot set from off with shift + E1.
   - CV: the needle at C2, C3, C4 and C5, and [+] (10 fps, the popup inside the meter).
   - External audio: each input on E1, then a click on audio input.
   - Tape: M2, M3 with shift held, M4, and M1 while playing (10 fps).
   - FX II: its pages and shift + T8. The lofi page. The delay's eight size zones.
8. **System:**
   - project, then M3, then E2 one character at a time (the naming screen).
   - project → M4: every row of every page.
   - shift + project: E1 over every folder, then read the M1 and M4 labels (Q4).
   - M2 history on a saved project.
   - com: E3 end to end (multi-out order).
   - com → M1: every section; com → M2 with shift held; com → M3; com → M4, then M1.
   - The volume knob turned slowly (10 fps: any popup?); com held 3 s (battery).
   - Power off and on (10 fps).
   - The preset browser:
     - load with a click of E2, then E3, then E4;
     - E1 to the end of the engine list (midi? Q10);
     - leave it in category view, then shift + T3 and shift + T1;
     - the long pack name for 5 s (10 fps).
   - The preset settings pages on T4, T6 and T7.
9. **Sampling:**
   - The record page: each source on E1, and shift + E1 on line in and usb.
   - E3 and E4 at their ends.
   - Arming with E4 at maximum (10 fps).
   - Takes of 1, 3 and 5 s, letting go of M1 mid-take.
   - Every folder of the sample library, then M1 in a subfolder.
   - Each slicer mode.
10. **Sampler M1:**
    - shift + click E3 three times on the synth sampler (loop types).
    - On a drum key: E4 one detent at a time from each end; pan at −100, 0 and +100, counting the
      detents; fade 99 with the start moved in, on a short and a long sample; an empty key and an
      empty zone.
    - T1's M2, M3 and M4.

### S2 — LEDs and hardware

Rig: top-down over the whole panel, or each half. Lock exposure and white balance on a grey card,
and take one stop under as well so lit windows do not clip. Film at 60 fps for timing and 240 fps
for rise and fall.

1. **Palette:** lit, dim and off windows side by side. The red of an aux track key.
2. **Track field:** instrument T1–T8; aux T1–T8; T3 + T5 held (a link); mix + shift with T2 muted;
   hold T4 in mix (solo).
3. **Step field.** Notes on 1, 5, 9 and 13, a note held from 1 to 3, a lock alone on 7 and a note in
   bar 2. Shoot plain; holding step 5; holding bar at length 16 and then 12; bar + acc 4; with
   shift held.
4. **The playhead at 60 BPM** over lit and empty steps (Q4).
5. **Flash timing:** armed for 5 s, a count-in, a shift-selected step.
6. **Clear fill:** record + stop through to the end, and once let go halfway.
7. **Keyboard field:** held keys on T1, T3, aux T1 and aux T2; the arpeggio; a maestro chord; the
   component flow; the record page; the slicer; arrange with shift held (scene digits).
8. **Any other key lighting:** one whole-panel still while playing and recording, with the player,
   the metronome, com and sample all open.
9. **The level meter:** count its segments; a macro with com held (battery); its fall time against
   tones of known level.
10. **Power on:** which LEDs light while booting.
11. **Screen:** a corner macro on the lit tempo page (the radius, and 220 or 222 rows).
12. **Holds** with finger and screen in frame:
    - a step held until "copied" shows;
    - hold M1 in the project view (this makes a new project);
    - bar taps of 0.2–0.6 s;
    - tap-tempo gaps of 1.5 and 2.5 s.
13. **Encoders:**
    - tape on E1 and one slow turn on the tempo page (detents a turn);
    - 20 slow detents against one fast flick (acceleration);
    - a click at 60 fps (does it act on press or release?).
14. **The volume pot** at both stops and at the factory position.
15. **The pitch-bend strip** with T3 on a MIDI channel, capturing passively: a light and a hard press
    at one spot, then each end.

### S3 — USB audio

The script sends notes and the listed CCs to a throwaway project; the owner turns what MIDI cannot
reach. Record at 44.1 kHz.

1. **The new project untouched**, notes only: C3 held 8 s on T4, T6 and T8 (the stored tremolos' rate
   and fade-in), and an overlapping C3 → C4 on T7 (draemy's glide).
2. **FX:**
   - The owner loads each of the six types on FX I. A 30 ms pluck on T3 every beat, with CC38 127
     on channel 3.
   - CC12–15 on channel 15 at 0, 64 and 127, one at a time; the delay through all eight size
     zones.
   - FX II's reverb values; FX I → FX II at 99; CC39; and whether CC12–15 reach FX II on channel 16
     (new: announce it).
3. **Master:**
   - The compressor at 0, 10, 40, 80 and 99 by hand on a chord with drums (Q15).
   - CC90 on channels 1–3 at 0, 32, 96 and 127 on full noise.
   - E4 (blend or morph?) with the bands flat, then with the low band at 127.
   - The saturator's four values.
   - Group and master levels at 0, 25, 50, 75 and 99.
   - CC7 at 0, 16, 32, 64, 96 and 127; CC10 sweeps; CC38 at 0, 32, 64, 96 and 127.
   - Mute T3 mid-note (does its tail ring?) and play its keys (do they sound?); hold T1 in mix
     while T3 sounds (solo).
4. **LFOs:**
   - CC40 from 0 to 63 a step at a time, then 64–127 in steps of 4 (tremolo on a saw).
   - CC43 tremolo env at 0, 8, 16, 32, 48, 64, 96 and 127; the shapes by hand.
   - Random on a resonant z lowpass at a dozen speeds.
   - Element's amount from 64 to 127.
   - The value LFO onto resonance and onto env.
   - Duck with audio as its source.
   - Duck from the metronome with the click off (PLAN p-duck).
5. **Filter envelope:**
   - svf and ladder at cutoff 0 with amount 64 and resonance 96.
   - Attack CC24 at 0, 32, 64 and 80; decay CC25 from 16 to 112 with sustain 0; release CC27.
   - Sustain 0, 50 and 127 at amount 48 (Q15).
   - The z hipass's envelope direction; key tracking on the z pair; the ladder at resonance 127.
6. **Play modes, glide, bend, preset settings:**
   - CC28 at 0, 64 and 127 on overlapping, touching and released pairs.
   - CC29 at 1, 8, 16, 32, 64 and 127 between C3 and C4, both ways; the lin/exp type by hand.
   - CC30 across its range with the bend at both extremes.
   - By hand: high pass 0, 6, 20, 50 and 99 at A1 and A3; width 0, 50 and 99.
7. **Grooves:** T1's closed hat on every sixteenth; each of the eleven types at E3 −99, +50 and +99.
   Record MIDI out alongside.
8. **Metronome:** alone at three levels; in 3/4; a count-in with the metronome on and off.
9. **Samplers:**
   - A drum key's pan at −100, −50, 0, +50 and +100 and gain at −30, 0 and +20.
   - Tune −12, 0 and +12 at fade 99.
   - A oneshot struck twice 50 ms apart; two keys of one mute group; each play mode on a 2 s sample
     held 0.5 s.
   - A steady sample looped 20–80 % in each loop type, released after 2 s.
   - Crossfade at 0, 25, 50 and 75 % (Q7).
   - The multisampler above its top zone.
   - Every factory kit's 24 keys at velocity 100, for levels.
10. **Punch-in follow-ups** (60 §6 open):
    - Sequence on the unit itself, since the sequencer effects ignore notes coming in.
    - Hold each for 4 bars: G3, A♯3, B3 and B4 over two kits and two synths; C4 and D4 for 8 bars;
      C5, D5, E5 and E4.
    - C4, D4 and F♯4 with the transport stopped.
    - G♯4 held flat, tilted, and with the bend strip.
11. **Brain and scenes:**
    - T3 plays C E G; the brain is set to D4, F♯4, F♯3, G3 and a chord.
    - Live notes on channel 3 with the brain at D; then the brain muted.
    - Two scenes on one T1 pattern with different CC7 and CC10 (does the level follow the scene or
      the pattern?).
12. **Tape:** hold T6's keys over a loop. CC12–15 on channel 14 (pitch, speed, length, mix).
13. **Voices:** nine notes on one track, then 25 across tracks.

### S4 — MIDI out, captured passively

`song_capture.py` sends nothing. The owner first sets clock "both" and the project's T1–T8 to
channels 1–8 (a settings change: announce it).

1. **Note lengths:** bar E2 at 1, 50 and 100; extend step 1 to 4, then press 4 again; nudge once,
   five times and held.
2. **A live take** at quantise 0, then set quantise 100 and play it again.
3. **Components on C4 at step 1:**
   - pulse 2, pulse hold 2, multiply 3, 8, 9 and 0;
   - velocity acc 1, acc 9 and acc 0;
   - ramps 1 and 6, random 5, tonality 3, 4 and 8;
   - jump 5, 6 and 7;
   - skip trigger 3 and 0; skip component 2; skip lock 2.
4. **Players:**
   - Arpeggio over C4 E4 G4 at 120 BPM: every speed, every pattern, range 2, lengths 10 and 99,
     and with track scale 2.
   - Maestro over D4 F4 A4, entered both ways and played from C4, at roll 0, 50 and 99.
   - Hold over sequenced notes.
5. **Timing of changes:**
   - a pattern switched with E4 at step 5;
   - a scene queued in bar 1 of a 4-bar scene;
   - a song of one scene with loop off (does FC come?);
   - play pressed while playing.
6. **External MIDI:** the owner sets T3 to channel 5, bank 3, program 8. Play C4 E4 G4, sweep a CC
   slot, turn the LFO on and add a program lock. Log what goes out and when.

### S5 — MTP reads, plus writes marked ✍︎

1. **The device-sample path, end to end** (the main gap in §5). Reads only.
   1. Make a project that names drive samples. On T1 record a 2 s take into drum key E5
      (sample, hold M1); it lands in `samples/user/`. On T8 load a "Nostalgic Synths" sampler or
      multisampler preset (shift + M1, category view). Save with project → M2.
   2. com → M4. In Chrome on the live site: project card → "load from the op-xy".
   3. Note the card's line and its skipped list. Note the read time per file. Check that the unit
      returns to MIDI.
   4. Play E5 and the T8 keys in the replica against USB audio of the same keys. The drum key's
      own settings are expected to be missing.
2. **A bigger project:** three user kits (72 files). Does the unit stay in MTP mode throughout, and
   how long does it take?
3. **Unsaved edits:** change one value, enter MTP without saving, load. Is the edit there?
4. **16 patterns** on a track and a cutoff lock: load them, then save back under a new name ✍︎
   (Q13, 10 §7.7).
5. **Another project:** download `projects/user/<name>.xy` in `/lab` and open it from disk. Its
   samples should come back from the cache only.
6. **A factory preset harvest** ✍︎ (Q16): one saved project with a preset loaded on each pattern.

### S6 — Writes that need the owner's approval (✍︎, copies only, backups first)

- A drum kit and a multisample into `presets/mine/` (Q11).
- FILE PUT into `drum/` (Q1).
- On a duplicate project: hold M4 (does it ask?).
- On a throwaway snapshot: M4 in the preset browser (does it ask?).

### S7 — The live MIDI bridge

The app sends; the owner watches or listens.

- **Routing:** T3 selected, then a note on channel 1 (does T1 or T3 sound?).
- **Held notes:** a held channel-1 note across `B0 66 xx` (CC102); pitch bend on channel 1 (which
  track bends?).
- **Transport:** FA and FC under clock "in"; FA while playing.
- **Aux tracks:** CC102 values 8–15; CC9 on channels 9–16.
- **Other tracks:** CC7, CC10 and CC38; CC28–31 and CC36–39 on T3.
- **Scenes:** CC85 within the existing scenes, never past the last.
- **Echo:** with COM echo on.
- **Clock:** the measured tempo against what `listen` hears.
- **USB audio:** Chrome's input name, rate and latency, then `listen_tracks` with every mute put
  back.

## 7. Stale docs and data found on the way (not changed)

- **`docs/QUESTIONS.md`:**
  - item 9 asks for the eighth table's name, which the screen shows (primes, `steps-356`);
  - item 4's T8 half is answered (b1-2795);
  - item 2, the device spike session, ran on 2026-09-26 (90, session 1).
- **`docs/PLAN.md`:**
  - F2 #2 still says further presses of player step the list (corrected 2026-09-29, 59 §2.7);
  - "What the research changed" says remote keys are unknown on 1.1.33 (dead, 90 session 1). Note
    20 §1 and §7.2 say the same.
- **Wrongly marked "ours":**
  - only "SH" is called known, though all eleven groove letters were filmed (59 §2.11):
    `sim/params.ts:91-94`, `instrument.cases.ts:659`, 55 §9;
  - primes is called our name: `sim/params.ts:490`, `sound/synth/engines/wavetable.ts:291`,
    `sim/screen/pages/engines/wavetable.ts:52`, 57 §3;
  - `arrange-mix.cases.ts:732`: the camera saw the shift footer;
  - `arrange-mix.cases.ts:1665,1732,1766`: those defaults come from the owner's file;
  - `system-sample.cases.ts:728`: those stock MIDI values were read off the unit.
- **`sound/fx.ts:1-7`:**
  - says the FX parameters are not in the simulator; they are;
  - says unbuilt effects return nothing; the fixed delay and reverb play instead.
- **Other stale claims:**
  - `sound/engine.ts:125` says every default track is within 0.5 dB; 62 §3 lists larger residuals.
  - 57 §4 says decay and release use the attack's law; 60 §3 superseded that.
  - The `ccs` fact of `knowledge/manual/units/sampler/overview.md` says the samplers answer CC
    12–15. They ignore them (59 §3).
- **`knowledge/midi/cc-map.json`:**
  - says echo is on by default (verified), but session 1 found the stock echo off, with universal
    SysEx echoed anyway;
  - still labels FA, FC, F8 and CC32 "community-verified", though all four were seen on the unit.
  - Note 90's first section also calls echo on by default.
- **`docs/research/INDEX.md`** has no row for this note yet.
