# 60 — The sound session: filters, envelopes, LFOs, drum fade, punch-in (OS 1.1.33)

Measured on the owner's unit on 2026-09-28 (probe log, "Sound session"): the simple engine on T3–T7
of a throwaway project, played over MIDI by `research/device/sound_capture.py` while its USB audio
was recorded (44.1 kHz). Captures are git-ignored under `research/device/captures/sound/`; the fits
come from `sound_analyze.py`, `filter_fit.py`, `envelope_fit.py`, `lfo_analyze.py` and
`punchin_keys_analyze.py` beside it. CC values are the lanes (0–127); the screen's 0–99 values are
CC · 99 / 127.

## 1. Method

- **Filters:** simple at full noise (a crossfade to pure white noise, note 57) through each type;
  each take's spectrum over T3's unfiltered noise is the filter's response. Sixth-octave bands from
  25 Hz to 20 kHz were fitted with analog prototypes under the bilinear transform at 44.1 kHz and,
  for oversampled filters, at 192 kHz (no warping): a one-pole, a two-pole with Q, two two-poles in
  series, and a four-pole ladder with feedback k.
- **Envelopes:** a saw at A3 (220 Hz) through no filter; the level followed over two periods every
  millisecond.
- **LFOs:** the tremolo on the saw's level and pitch; value, random and element on a resonant
  filter's cutoff, followed as the spectral peak of the noise every 10 ms; the duck on a held saw
  with T1 struck at known times.

## 2. Filters

| type      | model (mean fit error)                    | runs        | cutoff law, log2 Hz (CC 0–127)     | resonance (CC 0 → 127)                                                                           |
| --------- | ----------------------------------------- | ----------- | ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| ladder    | four one-poles in a loop, gain k (1.3 dB) | oversampled | 4.776 + 0.1128 c − 0.000252 c²     | k = 4 (c/127)^0.9; passband (1 + 0.32 k)/(1 + k)                                                 |
| svf       | two equal two-poles in series (1.3 dB)    | oversampled | 5.152 + 0.1210 c − 0.000277 c²     | Q per section 0.72 → 6.9 (damping 1.39 − 1.25 r^1.6); frequency −0.62 r^0.75 oct; level −9 r⁴ dB |
| z lowpass | one two-pole (1.2 dB)                     | 44.1 kHz    | 4.792 + 0.0828 c                   | Q 0.2, 0.63, 1.08, 8.9, ≈25, ≈40 at c = 0, 32, 64, 96, 112, 127; level −7.2 r^1.35 dB            |
| z hipass  | one two-pole highpass (0.7 dB)            | 44.1 kHz    | 3.891 + 0.0813 c (an octave below) | Q 0.2, 0.63, 1.07, 3.0, 3.9, 4.1; level as z lowpass                                             |

(r = resonance CC / 127.) The fitted cutoff is the prototype's: the ladder's one-pole corner (its
−3 dB point sits lower), the svf sections' and the z pair's natural frequency. The ladder and svf fit
only without warping (errors of 6–10 dB at high cutoffs under 44.1 kHz warping, 1–2 dB without),
so they run oversampled; the z pair fits best at 44.1 kHz: plain digital biquads, hence "z". At
resonance 0 the z pair's Q of 0.2 makes them very soft (a gentle slope from well below the
natural frequency); resonance takes the z lowpass to a sharp, nearly self-oscillating peak and the
z hipass only to Q ≈ 4. Resonance lowers the svf's frequency but not the others'.

- **Key tracking** (CC35, ladder and svf alike): 0 is none; the cutoff moves (note − 36) semitones
  × CC/127, so the pivot is C2 and the top tracks an octave per octave (A1, A3, A5 at 50 %: 1507,
  3095, 6309 Hz; at 0: 1700 Hz each).
- **Envelope amount** (CC34, the svf closed at cutoff 0): the envelope's peak opens the cutoff by
  about 0.85 × the amount's CC in the type's own cutoff steps (the screen's ghost moves a full step
  per CC); 0 does nothing (no negative side).

## 3. Envelopes

| stage   | shape                                                                               | length                                                                                 |
| ------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| attack  | an RC charge toward twice the peak, stopping at the peak (t10/t50/t90 = 0.18/1/2.1) | T = 5.16 ms · (e^(0.0878 c) − 1): 77 ms at 32, 1.42 s at 64, 5.8 s at 80, 6 min at 127 |
| decay   | exponential toward the sustain; a decay to 0 cuts at about −41 dB                   | half-life h(c), the table below                                                        |
| release | exponential to silence                                                              | h(127 − c): the lane is the handle's position, higher is shorter                       |
| sustain | linear in amplitude (32, 64, 96 → 0.26, 0.52, 0.75)                                 |                                                                                        |

Half-life h (ms) against the decay CC (release: 127 − CC):

| CC  | 0   | 16  | 32  | 48  | 64  | 72  | 80  | 88  | 96  | 104  | 112  | 120  | 127  |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---- | ---- | ---- | ---- |
| h   | 4.5 | 64  | 128 | 197 | 281 | 339 | 421 | 547 | 758 | 1129 | 1802 | 3046 | 4993 |

Release measured at 15 CCs agrees with the decay at the same position within 5 %. The community's
law (op-forums) matches the attack's top (six minutes) but runs 1.5–2× slower in between, and our
old model gave decay and release the attack's law: a CC 80 decay took 7.7 s instead of 2.8 s.

## 4. LFOs

- **Rates** (tremolo and value alike; random steps too fast to follow reliably): synced from CC 0 to
  63 in powers of two of the beat, a quarter note per cycle at CC 32 (2 Hz at 120 BPM), 32, 16, 8,
  4, 2, 1, 0.5 Hz at CC 0, 8, …, 48; free from CC 64, standing still at 64 and rising as a square
  law: 21.5 Hz · ((c − 64)/63)² (0.38, 1.45, 3.20, 5.63, 8.74, 12.5, 17.0, 21.5 Hz at 72 … 127).
- **Amount ladders** are bipolar, CC 64 is zero (photographed on the value, random and element
  pages).
- **Tremolo:** the level dips to 1 − 0.82 |a| (a = amount −1…1); vibrato ±1500 a³ cents (±25 at
  a = 0.25, ±190 at 0.5, ±660 at 0.75); its env card: flat at 64, a slow fade-in at 0, a fade-out
  over a second or two at 96, none at 127.
- **Value on the cutoff:** half the amount already sweeps the whole range (25 Hz to 18 kHz from CC
  64): about ±127 cutoff steps at full amount.
- **Duck** (source "tr 1", MIDI icon dark: notes trigger it even from a silenced track): full amount
  dips to silence in about 6 ms; it holds 52, 59, 98, 297, 394 ms at hold CC 0, 32, 64, 96, 127 and
  recovers to 90 % in 641, 364, 163, 43, 7 ms at release CC 0, 32, 64, 96, 127 (higher is faster).
- **Random** shows an env ramp card no encoder reaches; **element** follows the amp envelope when
  its source is the envelope (a 1.4 s attack opened the z hipass fully at positive amounts).

## 5. Samplers

- **Drum key fade** (shift + E3): a linear fade-in from the start marker lasting a fixed time, not a
  share of the sample: about 0.95 s at 99 and 0.25 s at 50 (T ≈ 0.95 (v/99)² s); a 0.18 s kick at
  99 never reaches full level, a 2.9 s cymbal reaches it at 0.95 s. The replica faded the region's
  end out instead.
- **Synth sampler loop crossfade** (shift + E3): its maximum reads 75 %, drawn as a dark wedge
  sloping down into the loop end over three quarters of the loop (the owner's photo, "80s lover").
  Not measured by ear: that preset changes over time by itself.

## 6. Punch-in FX

Channel 10 reaches the punch-in track: notes 53–76 fire the 24 effects (the screen showed each
animation). Two recordings: "keys", a project the owner played at 123 BPM with each key held 6 s,
2 s apart; and "mix", a 120 BPM loop sent from the computer (drums on T2, synths on T3–T5) with each
key held 2 s. `punchin_effects.py` measures them (`grid`, `steps`, `fold`, `mix`); `punchin_plots.py`
draws the spectrograms. The keys make twelve effects, the same twelve in each octave: the lower
octave acts on the percussion group, the upper on the melodic group, each effect shaped to the group
it acts on. TE shows only a picture per key: the names are ours.

| Key (lower / upper) | Percussion group (lower octave)                                                    | Melodic group (upper octave)                                                          | Acts on               | Evidence                                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| F (1 / 13)          | mute                                                                               | mute                                                                                  | the sound             | observed: mix drums −72 dB; keys: the melodic parts gone                                                                     |
| F♯ (2 / 14)         | stutter: each sixteenth's first ~30 ms, in mono (kick keeps its click only)        | stutter: each sixteenth starts over at 1/12, 1/6, 1/3 and 1/2 of it, silent from 7/12 | the sound             | melodic observed (`fold 14`: ~18 dB down from 7/12); drums observed (mix hats 35 → 26 ms, −16 dB), mechanism inferred        |
| G (3 / 15)          | repeat the two sixteenths from the press                                           | the same                                                                              | the sequencer         | melodic observed (`steps`: p2 +0.12); drums not seen (p2 +0.01), inferred                                                    |
| G♯ (4 / 16)         | pan: each hit placed to one side by its sixteenth (about 10 dB, a one-bar pattern) | pan: the parts swing to one side (left, about −0.8, while the owner tilted the unit)  | each note / the sound | observed (hat balance sd 6.9 dB, repeating each bar; melodic balance +9 dB); that tilt steers the melodic pan inferred       |
| A (5 / 17)          | repeat three sixteenths                                                            | the same                                                                              | the sequencer         | observed (p3 +0.08 in the drums' band, +0.17 in the melodic band)                                                            |
| A♯ (6 / 18)         | octave up                                                                          | octave down                                                                           | the sequencer         | melodic observed (−12 semitones, r 0.90); drums inferred                                                                     |
| B (7 / 19)          | follow: the group's other tracks play the notes too                                | the same                                                                              | the sequencer         | inferred (community descriptions; not heard apart in these recordings)                                                       |
| C (8 / 20)          | kick and snare fill                                                                | ramp up: each step's notes a little higher, gliding                                   | the sequencer         | drums observed (snares on 1, 3, 6, 9, 11, 14, kicks changing bar to bar); melodic observed rising (+12 overall), ladder ours |
| C♯ (9 / 21)         | short: every hit cut after ~25 ms                                                  | short                                                                                 | each note             | observed (mix hats 35 → 20 ms)                                                                                               |
| D (10 / 22)         | hat fill: closed hat every sixteenth, open on the off-beat eighths                 | ramp down                                                                             | the sequencer         | drums observed (mix hats 35 → 65 ms); melodic lower (−19 overall, weak), ladder ours                                         |
| D♯ (11 / 23)        | soft: hits fade in over ~35 ms (peaks −7.5 dB)                                     | soft attack (at least 60 ms)                                                          | each note             | observed (mix hats −7.5 dB; melodic notes ~50 ms to their peak), how it is made inferred                                     |
| E (12 / 24)         | random: each step a random key of the kit                                          | random notes (fourths, fifths, octaves), gliding                                      | the sequencer         | changed steps observed; the rules inferred (community descriptions)                                                          |

- **Three levels.** The computer's drums in "mix" were left alone by keys 3, 5, 6, 7 and 12 and
  changed by 1, 2, 4, 9 and 11 (8 and 10 added hits): the repeats, octave, follow and random work on
  the sequencer's own notes; mute and stutter on the track's sound; pan, short and soft on each note
  as it starts.
- **Tempo.** The stutter and the repeats lock to the sequencer's sixteenths (`grid`: 123.00 BPM
  over the plain playback). With the transport stopped the replica counts them from the press (ours).
- **Held keys combine; mute wins** (OS 1.0.50): the replica multiplies the mute into whatever else
  holds.
- **Motion.** The manual says some effects follow the unit's movement or the pitch-bend strip,
  without saying which; the owner tilted the unit through the keys recording. The melodic pan moved
  (left for most of the hold), so it is the likely one. The replica has no motion to read and
  sweeps it by itself: leftwards first to 0.8, a cycle every 8 beats (ours).
- **The replica** (`src/lib/sound/punch/`): the table (`effects.ts`), the sound effects in an
  AudioWorklet on each track's channel (`core.ts`, before the sends), the note effects in the engine
  and the sequencer's in the scheduler (`sequence.ts`). A `shift + key` effect lasts while its key is
  held, as the simulator records it.
- **Open:** G on the drums; how the drums' stutter and soft attack are made; the fills past two bars,
  and whether they play with the transport stopped (the replica's play only while it runs); the
  ramps' ladders and random's intervals; follow; which effects follow tilt or the pitch-bend strip.

## 7. Open

- The synced LFO steps between the multiples of 8 (the screen's counts 8/6/4/2 suggest more).
- Random's step rate and its env card; tremolo's env at other values; element's depth law.
- The filter envelope's own times (assumed to follow the amp envelope's laws).
- Whether the drum fade scales with the key's tune.
