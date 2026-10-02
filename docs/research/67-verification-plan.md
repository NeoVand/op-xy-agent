# Verifying the replica against the unit: the plan

> **What this answers:** how we get from a replica that mostly looks right to one whose every
> capability is checked against the owner's OP-XY (OS 1.1.33), and exactly what to do in the next
> camera session. Written 2026-10-02, when the owner paused the agent work for this. Inputs: the
> firmware changelog audit (note 64), thirty video manuals and tutorials (note 65), the replica's
> coverage matrix (note 66), and the earlier device notes (59 screens, 60 sound, 62 default sounds,
> 90 probe log).

## 1. What "verified" means

A capability is verified when three things exist:

1. **Device evidence.** A camera frame, a USB audio take, a MIDI-out log or an MTP read from the
   owner's unit, named by its capture id. The guide, a video, a community note or our own reasoning
   tell us what to look for; none of them counts as evidence.
2. **A pinning test.** The replica's behaviour is held by a test that cites the capture: a
   reference frame compared with the simulator's (`scripts/device-compare.mjs`), an audio law fitted
   to the take, or a conformance case with the capture id in its title.
3. **The manual says so.** The unit's fact carries `verified_on: '1.1.33'` and the capture as its
   source.

Some differences will stay, each named with its reason. TE's factory samples are one: they live in
the firmware, MTP cannot read them, and D2 rules out shipping them. These rows read **known
different**, never "verified".

**The ledger.** Note 66's matrix (271 rows) becomes `knowledge/opxy/fidelity.json`. Each row is
one capability with its status, its evidence ids, its test and its manual unit. A test fails when a
row claims "verified" without a capture id and a test that exists. `node scripts/fidelity.mjs`
prints the counts and the open rows by area, so progress after each session is a number. Today's
count, from note 66: 100 rows rest on the unit, 87 on the guide, 42 on our own choices, 9 on
community work, 10 on fakes or the app alone, and 23 have nothing built to check.

## 2. What the research found

**Wrong, not just unverified.** Each of these has evidence against the replica. The device still
has the last word, so each is checked in Session 1 or 2 before the fix lands.

| What                           | The replica                                                   | The evidence against it                                                                                                                | Session  |
| ------------------------------ | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Parameter locks                | a lock lasts one step (`sound/scheduler.ts` `automate`)       | three videos show a lock holding until the next one; smoothing never wraps (65 §2.4)                                                   | 1, A1    |
| Where the mix lives            | levels and pans per scene (`sim/areas/arrange/model.ts`)      | the `.xy` file keeps volume and pan per pattern and only mutes per scene (10 §3.3); two videos agree (65)                              | 1, A2    |
| Clearing a track               | clears every pattern of the track                             | on 1.1.33, `record + hold stop` clears the playing pattern only (65 §2.2)                                                              | 1, A3    |
| The FX sound                   | all six built (2026-10-02), on our own laws (`sound/fx.ts`)   | the pages offer six effects with four values each (66 §4 #1); each law, and how dry acts, awaits Session 2                             | 2        |
| Slices                         | laid from F3                                                  | TE's own video lays them from the sliced key rightwards (65 §2.11)                                                                     | 1, D1    |
| The brain's keyboard           | a chromatic shift of up to six semitones, scale name kept     | a shift along the scale, by octave too, the mode named ("D dorian") (65 §2.8)                                                          | 1, C1    |
| Players                        | arpeggio order and styles ours; maestro roots on its lowest   | play order before random; styles return to the first note or double it; maestro keys on the first note entered, repeats kept (65 §2.6) | 1, B1–B2 |
| Skip components                | every Nth pass only                                           | pressing the digit again cycles four pass patterns; skip trigger 0 drops random notes of a chord (65 §2.3)                             | 1, A5    |
| Linked tracks                  | one direction, one primary                                    | links both ways, several primaries (65 §2.7)                                                                                           | 1, C2    |
| Stored LFO speeds              | decoded on an even scale                                      | the measured law is synced below CC 64 (60 §4); a new project's tremolos play at the wrong rates                                       | 2        |
| "Loop until release"           | keeps looping after release                                   | our own manual says it stops                                                                                                           | 2        |
| The master section             | no compressor or saturator; EQ, level and send laws are ours  | a new project stores a compressor at 10 (62 §1)                                                                                        | 2        |
| Settings stored, never played  | preset high pass, width, tunings, portamento type, transpose… | each changes the sound on the unit                                                                                                     | 2        |
| Linked tracks                  | links are stored and lit, but the linked track plays nothing  | the guide and 1.0.15, 1.1.15 describe linked tracks sounding, bending and octave-shifting (64 §4 #1)                                   | 1, G1    |
| Project transpose              | stored and exported, never heard                              | 1.0.9 (drums excluded), 1.1.21 and 1.1.25 change it; the guide says drums follow (64 §4 #2)                                            | 1, G2    |
| A latched arpeggio             | keeps running across a pattern switch                         | since 1.1.21 it stops (64 §4 #5)                                                                                                       | 1, G3    |
| Long notes over the loop       | re-attack every pass; a new note cuts the same pitch          | 1.0.40 and 1.0.38: a held drone is not retriggered, and a note can sound over the same note (64 §4 #9)                                 | 1, G4    |
| The duck from a silenced track | a muted or midi-engine track's notes never duck               | 1.1.3, and our own manual (verified on 1.1.33): notes duck even from a silenced source (64 §4 #10)                                     | 2        |
| The sample library             | sub-folders in square brackets                                | since 1.1.17 a "/" marks them (64 §4 #13)                                                                                              | 1, G6    |

**Firmware changes.** There is nothing newer than 1.1.33 (2026-09-02): the downloads page, TE's
release feed and direct requests for later files all agree, and the guide is still at 1.1.15.

Note 64 went through all 300 changelog items. 188 matter to a replica:

| Status                       | Items |
| ---------------------------- | ----- |
| implemented                  | 108   |
| partial                      | 19    |
| conflicting with a changelog | 3     |
| missing                      | 28    |
| unclear                      | 17    |
| beyond a browser             | 13    |

Its 54 device checks (64 §6, D1–D54) are spread over the sessions below: the behaviour ones in
Session 1's block G, the sound ones in Session 2, the screens in Session 4.

Fifteen places where the guide is now wrong are listed in 64 §5. Among them: track scales (1/5,
1/7, x5 and x7 exist), the sample library's sub-folder mark, the voice icon's rule, templates made
the default on the unit, and the song stopping at its end.

**Device integration.** Projects go both ways over MTP, and both ran on the owner's unit on
2026-09-28. The app's reader for the unit's own samples has only ever run against a fake. Every
project pulled so far names only TE's factory samples, which MTP cannot see, so the reader has
never had real data. User presets in `presets/` are not read at all (66 §5).

## 3. The sessions

Each session runs on a throwaway project unless it says otherwise. Every change to the unit's
state is announced first and logged in `90-device-probe.md`. Calibrate the camera on the lit tempo
page and check it every half hour (59 §1).

| Session                     | Rig                                                                                     | What it settles                                                                                                                                                                                                                                                                                                                  | Length |
| --------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **1. Behaviour**            | camera over the screen; MIDI out and USB audio recorded passively; MTP reads at the end | everything in the table above marked 1; the device-sample path end to end                                                                                                                                                                                                                                                        | ≈ 3½ h |
| **2. Sound**                | USB audio; the script sends notes and CCs                                               | FX types and FX values per pattern (D46), master, LFO decode and fade-in, the value LFO's slowest speed (D14), filter envelope, play modes and glide, grooves, metronome, samplers, the duck from a silenced track, preset mod routing and tunings, punch-in follow-ups, tape sounds, voices and the usage icons (D2) (66 §6 S3) | ≈ 3 h  |
| **3. LEDs and hardware**    | camera over the whole panel, 60 and 240 fps                                             | step and track LEDs, the playhead, flash rates and dim levels, encoders' detents and acceleration, hold thresholds, the meter, power (66 S2)                                                                                                                                                                                     | ≈ 1½ h |
| **4. Screens not yet seen** | camera over the screen, 10 fps                                                          | the step-component pages, recording and count-in, naming, history, preset settings, system and COM pages, sampling flows, the remaining aux pages (66 S1 #4–#9)                                                                                                                                                                  | ≈ 2 h  |
| **5. Timing**               | MIDI out recorded passively                                                             | step components, players, pattern and scene switches, note lengths, live takes and quantise (66 S4)                                                                                                                                                                                                                              | ≈ 1½ h |
| **6. Files**                | MTP; writes only with approval, on copies                                               | bigger projects, other projects, the factory preset harvest (Q16), user presets, FILE PUT (Q1) (66 S5–S6)                                                                                                                                                                                                                        | ≈ 1 h  |
| **7. The live bridge**      | the app sends; the owner watches                                                        | track routing, held notes over a track change, transport under clock in, CCs on other tracks, scenes, echo, USB audio's input (66 S7)                                                                                                                                                                                            | ≈ 1 h  |

## 4. Session 1 run sheet

Blocks A–D and G are about behaviour and need the camera. E and F need audio and MTP. The session
splits cleanly after block D if three and a half hours is too long.

**Before we start (owner, about 15 minutes).**

1. Charge the unit; USB-C to the Mac. The iPhone on its mount 30–40 cm above the screen, angled
   25–30°, Continuity Camera, Center Stage off. Open `research/device/camera.command` in
   Terminal.app (it asks for the camera once).
2. Make a throwaway project: project, then hold `M1` (a new project; the open one is saved first).
3. For the passive recording: com → system settings → midi → clock **both**, and on the project's
   midi page give T1–T8 channels 1–8. _This changes settings on the throwaway project only; it is
   logged._
4. I calibrate on the lit tempo page (`screencap.py calib --lit`) and start
   `song_capture.py session1-<block>` for each block. It sends nothing. Each block below names its
   captures.

Stop the transport between blocks. For each step: what you press, what I capture, and the
question. "nat N" is the Nth white key (nat 1 = F3), "acc N" the Nth black key.

### Block A — the sequencer core (≈ 45 min)

**A1. Do locks hold?**

1. T3: notes on steps 1, 5, 9 and 13 (C3, one step each). `M3`: cutoff to about 10.
2. Hold step 5 and turn `E1` to about 90 (a lock). Play for four bars.
3. Then hold step 13 and turn `E1` to about 30. Play for four bars.
4. Then `bar + turn E4` (shape) to 50, and then to 99. Four bars each.

- **Capture:** USB audio and MIDI out, plus a still of the bar card at each shape.
- **The question:**
  - Does step 9 play dark again, or stay bright until step 13's lock?
  - With one lock, does the first step of the next pass come back dark?
  - With shape up, does the glide run from the last lock back to the first?
- **The replica:** a lock lasts one step.

**A2. Mix per pattern or per scene?**

1. T1 plays a beat on pattern 1. Copy scene 1 onto scene 2 (`shift + M2`, `shift + acc 2`,
   `shift + M3`).
2. In scene 2, `mix`, T1: level to 20 (`E4`) and FX I to 50 (`E1`). Go to scene 1 (`shift + acc 1`).
   Do T1's level and send follow?
3. Back in scene 2, mute T1 (`click E4`). Go to scene 1: still muted?
4. Give scene 2 T1's pattern 2 (arrange), and repeat step 2.

- **Capture:** stills of mix `M1` after each switch; audio.
- **The question:** do levels and sends belong to the pattern, and mutes to the scene?

**A3. What does clearing take?**

1. T1 with notes in patterns 1 and 2. On pattern 1, `record + hold stop` until the row is red.
2. Switch to pattern 2. Is it intact?
3. Then `shift + record` (undo). Press it a second time: does that redo?

- **Capture:** 10 fps over the clear; stills of both patterns.

**A4. The playhead over steps** (Q4)

1. Tempo 60. T3 with notes on 1, 5, 9 and 13. Play.

- **Capture:** 20 s at 10 fps. Frame the step keys as well as the screen, or tilt the phone down
  for this one.
- **The question:** does the playhead light empty steps, and dim lit ones?

**A5. Skip components and pulse**

1. A chord on step 1 of T4. Then `shift + step 1 → nat 14 → acc 4`.
2. Press `acc 4` again, up to five times.
3. Then `acc 0`.

- **Capture:** a still after each press (the description and the flashing marks); MIDI out over
  eight passes each.
- **The question:**
  - Do the presses cycle four patterns?
  - Does skip trigger 0 drop single notes of the chord?

Then the pulse test. T1: kick on step 1, closed hat on step 2.

1. `shift + step 1 → nat 1 → acc 2` (pulse 2), then `acc 1`.
2. Then nat 2 (pulse hold) at 2.

- **Capture:** MIDI out.
- **The question:** how many kicks before the hat?

**A6. The step-component pages** (stills)

1. T3, notes on 1, 5, 9 and 13. Hold `shift + step 5`.
2. Press nat 1, then nat 2, and so on to nat 14. After each, press acc 1, acc 5, acc 9 and acc 0,
   with a still each time. This covers multiply 9's text.
3. Then give two steps different digits and select both. Does the page say mixed?

- **Note:** these are the pages the replica draws without a capture.

### Block B — players (≈ 20 min)

**B1. Arpeggio.** New T3, `player` until arpeggio.

1. Its length with nothing set: is it the shortest?
2. `E2` one detent at a time (the pattern order: is play order before random?).
3. `shift + E2` one detent at a time (how many styles; a still of each).
4. Hold a C E G triad through each style.

- **Capture:** stills, audio and MIDI out.

**B2. Maestro.** `player` to maestro.

1. `shift +` C, then the B♭ below. Do both keys play their own note plus a tone below?
2. Enter C, C, C, G. Are the repeats kept?
3. Play from D.

- **Capture:** MIDI out and stills.

**B3. Hold.** Latch three notes and film 5 s at 10 fps.

### Block C — auxiliary tracks (≈ 30 min)

**C1. The brain.**

1. T4 plays C-major chords, routed in. On aux T1 press D, then E, G, C♯, and the C an octave
   lower.
2. Film the title after each; record audio and MIDI out.
3. Press a key while stopped: does playback start?

- **The question:**
  - Is the shift diatonic (D dorian) or chromatic (D major)?
  - Does the low C drop everything an octave?

**C2. Links.**

1. Hold T7 and press T8. Then hold T8 and press T7.
2. Then link T2 → T1 and T3 → T1.
3. Mute T2.

- **Capture:** stills of the track LEDs while holding; MIDI out of what plays on each.

**C3. Tape** (Q8).

1. T1 plays distinct hits on steps 1, 3, 5, 9 and 13. Only T1 sends to the tape.
2. On aux T6: x1, 100 %, length 16, mix 99. Tap nat 1, nat 2, nat 3, acc 4 and nat 8, then the
   upper keys.
3. `E2` at 125, 133 and 150 % on a held note.
4. `[+]` and `[−]`.
5. Length 4, held for two bars.
6. Keys with the transport stopped.

- **Capture:** audio, plus stills of each page.

**C4. Punch-in, the open items.**

1. Over the T1 beat: does G repeat on the drums?
2. What does B (follow) do?
3. Do C and D (the fills) play with the transport stopped?

- **Capture:** audio and 10 fps.

### Block D — samplers (≈ 20 min)

**D1. Slices.**

1. Put a drum loop on drum key F4. Hold the key, `M1` → slice, even, 16.
2. Film the count and press done. Play every key.
3. Repeat from E5.
4. In transient mode: press slice 3 and turn `E2`. Does slice 2's end follow?
5. `shift + key` on slice 3, then done. Do slices 4–8 move down a key?

- **Capture:** stills and audio.

**D2. Sampler odds.**

1. The synth sampler: `shift + click E3` three times (the loop types).
2. T1's `M2`: labels, one or two envelopes, the waveform behind?
3. On a drum key: `shift + click E3`.
4. Mono on a kit: two overlapping long one-shots. Cut or not?

- **Capture:** stills, plus audio for the mono test.

### Block G — quick checks from the changelog (≈ 25 min)

Each one is a note-64 check (D-number). All of them are reads on the throwaway project.

1. **Links that sound** (D16). Set T4's keyboard octave +1. Hold T3 and press T4. Play C4 on T3, then
   bend, then switch T3's arpeggio on, then step-enter a note on T3.
   - Does T4 sound, in which octave, and does it bend?
   - Does the arpeggio stay on T3?
2. **Project transpose** (D54, D4). Drums on T1, a synth on T3, then project → `M4`, general,
   transpose +5.
   - Do the drums change? What is the range?
   - Then the brain on auto with T3 routed, transpose +2: does the brain's key move?
3. **The arpeggio across patterns** (D5). Hold on, latch a chord while playing, then the next
   pattern (arrange, `E4`), then a scene change. Does it stop at once?
4. **Long notes over the loop** (D33, D38).
   - Hold player with one note across the loop point: does it re-attack at step 1?
   - A pad, two overlapping C4s: does the first keep sounding?
5. **Track scales** (D49, D3). Hold bar and press each of the ten black keys, with a still of
   "track scale" each. Then scale 3 at quantise 100: record a few notes off the beat and see where
   they land.
6. **The sample library** (D6, D52, D17). `shift + sample`: stills of the top level (folder names and
   counts), a folder with sub-folders (how they are marked), and the group of user-preset samples.
7. **Small gestures:**
   - D11: which encoder click turns quant "off".
   - D18: hold player with C, E, G, let go, then D alone, then D with E held.
   - D44: `shift + M1` on scene 3 with 4 and 5 empty, where does it land?
   - D32: hold step 1 and press step 4 twice, where does the note end?

### Block E — the sound we hear first (≈ 20 min, a preview of Session 2)

All by hand, notes from the unit's keys, USB audio recording:

1. The new project untouched: hold C3 for 8 s on T4, T6 and T8 (the stored tremolos' rate and
   fade-in). Then an overlapping C3 → C4 on T7 (draemy's glide).
2. FX I set to each of its six effects in turn. Use a short pluck on T3 with its FX I send at 99,
   four bars each.
3. The duck from the metronome (amount at max, hold 0). Turn `E4` (release) by hand to each end:
   does a higher value recover faster or slower?
4. The metronome alone at three levels.

### Block F — your own samples, end to end (≈ 25 min; MTP reads only)

1. **Make a project that uses your samples.**
   - On T1, record a 2 s take into drum key E5: the sample page, hold `M1`. It lands in
     `samples/user/`.
   - On T8, load a "Nostalgic Synths" sampler or multisampler preset (`shift + M1`, category
     view).
   - Save with project → `M2`.
   - _This writes a new project and a recording on the unit, both yours to keep or delete._
2. **Load it.**
   - com → `M4` (MTP mode).
   - In Chrome on the live site: project card → "load from the op-xy".
   - I note the card's line and its skipped list, the read time per file, and whether the unit
     goes back to MIDI afterwards.
3. **Compare.** Play E5 and the T8 keys in the replica, against USB audio of the same keys on the
   unit. The drum key's own settings (tune, pan, gain) are expected to be missing: that is a known
   gap in the loader.
4. **Unsaved edits.** Change one value without saving, enter MTP, load again. Is the edit there?

**After the session (me):** realign and index the frames, file the audio and MIDI takes, and
write the results into notes 59 and 60. Fix what the evidence says is wrong, pin each fix with a
test that cites its capture, update the manual units and the ledger, then send the owner the list
of what changed and what is still open.

## 5. Work that needs no device (now, before Session 1)

1. The ledger and its report (§1), seeded from note 66.
2. The answers already on disk (66 §6 S0):
   - "primes" for Q9;
   - T8's M2 shift card;
   - a first look at the step LEDs in the 6,311 raw frames;
   - one groove type's offsets in the "agent" song takes;
   - the svf filter-envelope decay against the amp law.
3. Analysis scripts ready for Session 1's captures:
   - a lock-hold detector on the A1 audio (brightness per step);
   - a MIDI-out parser for skip, pulse, arpeggio and maestro (extending `take_timing.py`);
   - a scene-and-mix comparer for A2.
4. Code that waits on one yes or no from the unit, written behind a switch so each fix is quick
   once confirmed: lock hold, mix per pattern, clear scope, slices from the sliced key, the
   brain's diatonic shift, the arpeggio's order.

## 6. Order of work

1. Now: §5.
2. Session 1 (the owner's camera session). Then fix and pin.
3. Session 2 (sound) and Session 5 (timing), which share a rig. Then fix and pin, with FX types,
   master and LFOs first.
4. Sessions 3, 4, 6 and 7, by the ledger's open rows.

The agent's own work resumes once the ledger shows its tools act on verified behaviour. Its tools
and skills then get a pass to match whatever changed (scene mixes, locks, slices, the brain).
