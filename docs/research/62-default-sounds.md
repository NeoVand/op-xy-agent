# 62 — A new project's sounds on the unit against the replica (OS 1.1.33)

Measured on the owner's unit on 2026-09-29 (probe log, "The default sounds"): a new project with its
default sounds untouched, T1–T8 on MIDI channels 1–8, played over MIDI by
`research/device/preset_capture.py` while its USB audio was recorded; then the project itself read
over MTP. The replica rendered the same phrase from the same project file
(`src/lib/sound/compare.svelte.spec.ts`), and the two were compared part by part
(`research/device/preset_compare.py`, `preset_plot.py`). Captures are git-ignored under
`research/device/captures/presets/` and `captures/mtp/`.

## 1. Method

- **Takes.** `defaults-v100`: every synth track (T3–T8) three held notes C2, C3, C4 (1.4 s), a C
  major triad and eight short C3s; the drum tracks (T1, T2) each of their 24 keys. Then the synth
  tracks at velocity 40 and 127 (`defaults-v40`, `-v127`), 4 s holds with 3 s after each
  (`defaults-long`), and the drums at velocity 40. The take's record (`<tag>.json`) says what was
  played, and the replica's render reads it.
- **The project** (`projects/workspace.xy`, 9530 bytes, read-only over MTP): byte for byte the
  blank project of 2026-09-26 our defaults come from (`knowledge/presets/new-project.json`) but for
  the owner's MIDI channels, T1's keyboard octave, one header byte and one sample slot of T1's kit
  that the older file had edited. So the replica's new project is the unit's, sound for sound, as
  far as the file is decoded. The master section (not yet read by our reader; xy-format's
  `master_*_inspection.py`): EQ flat, saturator off (mix 0; gain 20, clip 20, tone 50), percussion
  and melodic groups 50, master 50, **compressor 10**.
- **Timing.** PortAudio hands the recorder the unit's input in blocks of 4096 frames, so the
  recorder's frame stamps run up to 93 ms early. The send times are exact and keep pace with the
  audio clock, so each message sits at 44100·t + c (c the stamps' latest lead) plus the unit's own
  latency, a steady 12–15 ms from note on to sound (`research/device/take_timing.py`). Without this
  the first comparisons saw a slow attack and even harmonics that were only a window straddling the
  onset. The replica's worklet starts a note one render quantum (about 3 ms) after its time.

## 2. Findings

1. **Velocity is 1 − s·(1 − v/127) in amplitude**, s the preset's velocity sensitivity (shift + M2):
   linear in velocity at full sensitivity, nothing at 0. Every track fits within 0.2 dB at velocity
   40 and 127 against 100 (T6/T7 at s = 1: −8.0 dB at 40; T4/T8 at 0.81: −5.4; the drums at 0.6:
   −3.4; T5 at 0.31: −1.5; T3 at 0.21: −1.0). Velocity changes only the level: the epiano's
   sidebands are the same to 1 % at 40, 100 and 127. Our old law, (v/127)^1.5 whatever the
   sensitivity, played 100 about 3 dB down and 40 about 15 dB down on every track
   (`mapping.ts` `velocityGain`, `velocityScale`).
2. **The decay falls toward silence and stops where it meets the sustain.** Against the sound
   session's saw (decay CC 32, sustain 32 / 64 / 96), "exponential toward zero, held at the
   sustain" matches every millisecond within 0.1 dB, "exponential toward the sustain" (ours) was up
   to 3.5 dB high. Sustain 127 holds 0.975 of the peak. Both envelopes follow it now
   (`synth/adsr.ts`, `envelope.ts`); the filter envelope with it.
3. **Every engine plays the unit's level.** The engines were modelled on the device's dBFS plus
   6.2 dB (`DEVICE_GAIN_DB`), but the chain after them had only ever been set by ear: velocity 100
   took 3.1 dB, the bus 1.4 dB, so the whole replica played 4.5 dB under the unit (T3 −4.4, T4
   −4.6 dB). The core voices' gain is now exactly the inverse, and each engine's velocity is scaled
   to 1 where its level was measured (velocity 100 at its calibration preset's sensitivity).
4. **epiano: punch takes tine down in a straight line.** beach bum (tone 0, texture 0, tine 41,
   punch 54): the 4:1 index, read from h3/h1 and h5/h1 (J1/J0) in 23 ms windows, starts at 0.127
   on C3 and 0.110 on C4 (our model 0.118 and 0.101) and falls linearly to nothing in 85 ms, 11.5,
   11.8 and 12.0 times its start per second on C2, C3 and C4: 4.66 times punch's fast rate on the
   1:1 index at that setting. No rise (at punch 0 tine rises over 40 ms). The calibration session
   of 2026-09-27 never measured punch with tine (its "punch" takes swept tine at punch 0, its
   "tine" takes swept punch at tine 0).
5. **The multisampler's pad** (pad/bandpasser, TE's samples, which we cannot ship) is a flat
   harmonic series banded at 250 Hz on C2, 400 on C3, 500 on C4, the fundamental 10–14 dB under
   the band, an octave below it 10 dB down, falling 9 dB an octave above in band power (the
   preset's z lowpass at 700 Hz, Q 1.1), very wide (side/mid 1.1), growing 10 dB over three
   seconds, 3.6 dB louder an octave up. The replica played a soft sine, 20 dB too loud; it plays our
   own banded pad after that recipe now (`synths.ts` `band`).

## 3. Where the replica stands

Replica − unit at velocity 100, dB, over the first 0.3 s of each held note / over 0.4–1.3 s:

| track               | before (C2 · C3 · C4)                  | after (C2 · C3 · C4)               | what is left                                          |
| ------------------- | -------------------------------------- | ---------------------------------- | ----------------------------------------------------- |
| T3 prism shoulder   | −4.3 · −4.4 · −4.9 (body)              | −0.7/−0.8 · −0.3/−1.3 · −1.6/−3.4  | the svf opens less up the keyboard (darker by C4)     |
| T4 epiano beach bum | −2.2 · −4.6 · −5.9 (onset)             | +1.5/+1.9 · −0.7/−0.9 · −1.4/−2.2  | C2: the preset's highpass (5.9); FX II's tail shorter |
| T5 dissolve         | 0.0 · −1.3 · −3.4 (body)               | +1.3/+1.9 · +1.2/+0.7 · −0.4/−1.5  | the level falls 1.7 dB an octave faster than the unit |
| T6 hardsync         | −9.7 · −9.7 · −10.4 (body)             | −13.5/−5.7 · −8.4/−6.5 · −5.6/−7.2 | its ladder opens far less than the unit's (below)     |
| T7 axis draemy      | 3.5 kHz centroid on C2 (unit's 160 Hz) | +0.8/+4.8 · +2.0/+2.5 · −2.7/+0.8  | too many high harmonics (below)                       |
| T8 pad stand-in     | +23 · +20 · +18 (body)                 | +3.7/+1.3 · +4.2/+1.4 · +3.6/+2.3  | its first 0.3 s (the sample's own fade-in)            |

The drum kits (TE's samples, our synthesized kit in their place) are not compared yet: the part
measure skipped each hit's first 150 ms.

## 4. Open

- **The preset highpass** (shift + M2) is decoded but plays no part in the sound. T4's (5.9) takes
  about 3.75 dB off C2's fundamental; T6 has 7.5, T7 21.5. We suspect the 180 Hz one-pole we fitted
  into axis (note 57) is draemy's highpass rather than the engine. Needs a measurement: a saw at A1
  and A3 with the highpass at a few values.
- **The filter envelope's hold on the cutoff.** T6 (ladder, cutoff 2, envelope 48, sustain 39 %)
  and T3 (svf, cutoff 0) sit more than an octave more open on the unit through the sustain than
  in the replica: around 200 Hz against 100 Hz on T6's C2. The peak law (0.85 of the amount's steps,
  research 60 §2) was measured on the peak alone.
- **axis's top.** draemy on the unit loses harmonics steadily (5 dB by the 6th, 14 dB by the 18th
  against ours) and stops at about the 23rd on every note; its element LFO (envelope → tone) may be
  the cause, or the engine's own band limit. The filter is off (and switching it on in the replica
  darkens far too much).
- **dissolve's key scaling**, the **master compressor** at 10 (not modelled), the **reverb's tail**
  (FX II), the **drum kits'** levels per key.
