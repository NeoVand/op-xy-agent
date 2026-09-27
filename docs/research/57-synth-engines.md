# 57 — The OP–XY's synth engines: what they are, and how we rebuild them

> Research note for the OP–XY Agent (the virtual OP–XY's sound, M2.5 follow-up). Scope: what each
> of the eight synth engines, the filters, envelopes, LFOs and voices does inside, as far as public
> evidence goes; the DSP models we built from it; the synth core that runs them in the browser; and
> the measurements on the owner's device that will calibrate them. Written 2026-09-27. **Nothing
> was sent to the device.** All text is our own wording; TE's guide is paraphrased, never quoted.
>
> **Confidence tags:** **[E]** established: TE's guide or staff, the device's own screen, decoded
> device-written data, or two or more independent reports agreeing. **[I]** inferred: our model,
> to be checked against recordings (§6).

---

## TL;DR

1. **TE publishes no internals, and the firmware is encrypted** (`60-firmware.md`). TE's Will says
   every OP–XY engine is new, not an evolution of the OP–1's or OP–Z's [E] (Andertons, Gear4music
   deep dives). No OP–1, OP–1 field or OP–Z engine has the same four parameters. So the models below
   come from TE's one-line descriptions, an oscilloscope review, TE staff demos, readings of the
   device's screen in tutorial videos and the 322 factory presets, and they need recordings to pin
   their constants.
2. **What we now know per engine** (details in §3):
   - **prism:** two oscillators with one shape (saw → square → narrow pulse), and a ratio in nine
     fixed steps shown on screen as 2:1, 1:1, 2:3, 1:2, 1:3, 1:4, 1:6, 1:8, 1:12 [E].
   - **axis:** two-operator FM. Its ratio detunes continuously from an octave below up to unison
     over 0–50, then climbs in fifth and fourth steps; tone is a built-in resonant filter [E].
   - **dissolve:** two sines, pure at all-zero, eaten by noise (swarm), with audio-rate AM and FM [E].
   - **wavetable:** 9 tables, 8 of them named on screen (buzz, zap, basic, geometric, fibonacci,
     fractal, crush, drawbars); warp is a piecewise-linear phase distortion, and drift detunes it [E].
   - **epiano and organ:** FM, like their OP–Z ancestors [E]. The organ has 8 types drawn as
     drawbars [E].
   - **hardsync:** a synced saw over three octaves, a sub at the master pitch, noise and a highpass
     "lowcut" [E].
   - **simple:** a saw → square morph, with pulse width acting only near square [E].
3. **Axis and epiano probably share an FM core.** All 20 of their factory presets carry the same
   four hidden values after P1–P4 (7616, 674, 3276, 8192); every other engine stores zeros there [E].
4. **The shared voice** (§4):
   - Filters, in order: svf (a gentle lowpass only), ladder (the aggressive, self-oscillating 24 dB
     one), z lowpass and z hipass. Stored type ids are 10, 16, 9 and 17 [E].
   - Envelope times are exponential in the encoder: attack ≈ 0.0111·e^(10.39·x) s, about 2 s at
     half and minutes at full. Two independent fits agree [E].
   - 24 voices, at most 8 per track [E].
5. **We rebuilt the sound as a synth core** (§5), and all eight engines now play on it:
   band-limited oscillators (minBLEP) with exact hard sync, TPT filters, the measured envelope law,
   and mipmapped wavetables. It runs sample by sample
   in an AudioWorklet, and the same code runs in Node, where objective tests measure harmonics,
   aliasing and filter slopes. The engine still makes every decision (play modes, glides, steals);
   the worklet only computes the sound.
6. **Calibration needs the owner's device** (§6): USB-audio captures of CC sweeps on a scratch
   project, then fitting each engine's curves by spectral distance. It changes device state (CCs and
   notes on a throwaway project), so it waits for the owner's go-ahead.

---

## 1. Sources

TE:

- Guide chapters: synth engines, instrument (envelopes, filter, LFOs, play modes, preset settings),
  project (voices), FX, mix and auxiliary. Our reworded units are in
  `knowledge/manual/units/instrument/`.
- The changelog (`knowledge/official/changelog.md`, git-ignored). No engine DSP changes in 22
  builds, apart from these:
  - 1.0.45: "knob feel" improved for some synth settings, which may have changed curves.
  - 1.0.50 and 1.1.15: voice-stealing and CPU limiting.
  - 1.1.25: epiano screen names fixed; delay tied to tempo.
- Product page: four filter types; 24-voice multitimbral; dual Blackfin processors plus a DSP
  co-processor.
- OP–Z reference: its organ and e-piano are 8 FM algorithms each. OP–1 field guide: LFO shapes and
  the effects' ancestry.

Reviews and demos:

- **Magazin Mehatronika** (Dušan Dakić, 2025): the only review with an oscilloscope, covering every
  engine by ear and by scope.
- **Sound On Sound** (Simon Sherbourne, April 2025): the engines are new; three lowpass modes and one
  highpass; only the ladder's resonance whistles.
- **TE's Will:** Andertons deep dive (32:05–37:30) and Gear4music deep dive (15:37–20:30,
  38:51–40:30, 44:42–47:14).
- **r10 makes beats:** tutorials for epiano, axis, dissolve, and hardsync/organ/prism/simple/wavetable.
  Frame grabs of the device's own screen give prism's ratio steps and the wavetable names.
- **Other videos:** windowbed (envelopes and filters), Mo chreach! (video manual), Shimmery.mp3 (all
  the synths).
- **Forums:**
  - op-forums: the attack measurement (t/31132), voices (t/30250), the CPU icon (t/28494), the
    sidechain thread (t/28393), custom wavetables and phase distortion (Worldwave, t/29362).
  - Elektronauts: the SVF is lowpass only; only z has two modes.

Local evidence:

- Factory presets decoded with `kmorrill/xy-format` (322 `patch.json` from 1.0.x, 156 presets from
  1.1.21).
- `charlesvestal/sf2-to-opxy`: an independent attack-time fit.
- `55-screen.md`: envelope and LFO amounts are ±99; bend range 0 is off; the organ screen has
  drawbar rails.

Not reachable: Reddit and Gearspace blocked our tools, and loopop has no OP–XY review.

## 2. How to read the models

Each engine section lists what is established, our model with starting constants, and the open
questions. The constants sit as named values at the top of each engine's module
(`src/lib/sound/synth/engines/*.ts`) and are the knobs the calibration in §6 fits. Where the device
presents a value as 0–100 on screen, our model takes M1 as 0–99 encoder steps ÷ 99.

## 3. The engines

### prism — shape, ratio, detune, stereo

Established before measuring: two oscillators under one shape control (saw, square, a narrower
pulse at the top); detune is small and moves oscillator 2; stereo sounds wide and phasey; TE calls
it subtractive-style (Moog-like basses, supersaw and Reese sounds). All 8 factory presets are mono
with transpose +12.

Measured on the owner's device (2026-09-27, `2026-09-27-132309-prism` and
`2026-09-27-133842-prism-stereo`; `research/device/prism_fit.py`, `stereo_fit.py`):

- **Shape, first half (CC 0–64):** saw → square as saw − k·(the saw half a cycle on): odd harmonics
  (1 + k)/n, even (1 − k)/n, fitted within 0.05 dB. k = 0, 0.083, 0.275, 0.463, 0.654, 1 at CC 0,
  13, 25, 38, 51, 64. The level falls 3.9 dB per unit of k, so the square is only 0.9 dB louder
  than the saw.
- **Second half (CC 64–127): the two oscillators narrow one after the other.** At 1:1 the sound is
  0.568·pulse(w1) + 0.432·pulse(w2) (within 0.06 dB): oscillator 2 narrows first (w2 = 0.5, 0.422,
  0.238, 0.113 at CC 64, 76, 89, 102, then holds), oscillator 1 later (w1 = 0.5 to CC 89, then
  0.47, 0.346, 0.115 at 102, 114, 127). No level compensation. (Which oscillator narrows first is
  inferred from the levels: the louder one narrows later.)
- **Levels:** oscillator 2 is 2.4 dB under oscillator 1, in phase at 1:1; a little less at higher
  ratios (−2.2 dB at 2:1 to −4.8 dB at 1:16). Each oscillator also fades with its own pitch: −0.8,
  −1.6, −2.5 dB at 1.8, 2.6, 3.5 kHz (a one-pole-like fall at 4 kHz), −20 dB at 5.3 kHz and gone at
  7 kHz; oscillator 1's harmonics keep their levels (a gain, not a filter). A saw at 1:1 measures
  −14.8 dBFS (simple's saw −18.9).
- **Ratio: ten equal zones**, 2:1 1:1 2:3 1:2 1:3 1:4 1:6 1:8 1:12 1:16 (the screen reading missed
  1:16). Oscillator 2 runs 0.1–0.25 cents sharp even at detune 0.
- **Detune is in cents** (the same on A2 and A4): 0.9, 2, 4, 6, 7, 7.9, 10.1, 12.2, 13.2, 15 cents
  at CC 13, 25 … 127.
- **Stereo is the swept copy described under simple** (identical curves), not a pan of the two
  oscillators; the dry sound stays mono.
- Prism sounds at the note (not an octave down).

Model: exactly the above (`prism.ts`), the curves read linearly between the measured points. Against
the capture: levels within 0.2 dB, partials within 1 dB on most takes.

Open: a finer shape sweep (the blend between CC 51 and 64, the widths between points); which
oscillator narrows first (a shape sweep at a ratio other than 1:1); phase reset per note.

### axis — tone, ratio, shape, tremolo

Established:

- TE: an FM engine for lush strings. Its ratio detunes over 0–50 and steps up in fifths above.
- Scope review:
  - two operators;
  - ratio starts an octave below, sweeps smoothly to unison at 50, then covers about five octaves in
    fifth and fourth jumps;
  - tone acts like a lowpass with an unusual resonance;
  - shape morphs between saw and triangle and tightens transients.
- TE staff call tone a built-in filter.
- The guide's early screen art labelled P4 as vibrato.
- All 10 factory presets are poly, with preset width around 56 %.

Model [I]:

- Operator 2 at r × the note phase-modulates operator 1.
- r runs continuously from 0.5 to 1 below 50, most of its travel near 1 (that beating is the
  "lush"), then steps through 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32.
- Tone is a two-pole resonant lowpass, about 100 Hz–16 kHz.
- Tremolo depth and rate rise together.

Open:

- Whether operator 2 is heard directly.
- The index, the filter's type and Q, the ratio curve, and the tremolo's waveform.
- What the hidden values shared with epiano do.

### dissolve — swarm, am, fm, detune

Established:

- All zero is a pure sine.
- Two sine carriers, spread by detune up to a little under a semitone.
- Swarm feeds noise in: filtered noise plus a soft random pitch wobble.
- AM and FM work at audio rate. AM adds grit and highs; FM turns it saw-like.
- FM 100 with detune gives a Reese bass.
- Presets: FM usually 30–90, swarm ≤ 37.

Model [I]:

- Carriers at f·2^(±d/2400).
- Swarm: band-passed noise around the note, plus independent smoothed wobble on each carrier.
- AM by narrow-band noise centred on the note.
- FM by a 1:1 sine whose phase and level noise jitters.

Open: whether the AM and FM modulators are noise, periodic or both; the swarm noise's spectrum; the
detune curve; the stereo placement.

### wavetable — table, position, warp, drift

Established:

- 9 tables; switching tables keeps the position; everything at 0 is a sine.
- Tables named on screen, with the wave at position 0:
  - buzz: saw
  - zap: saw
  - basic: triangle → square → sine across positions
  - geometric: sine with ripples
  - fibonacci: sine with denser ripples
  - fractal: a saw of smaller saws
  - crush: a stair-stepped sine
  - drawbars: additive
  - The ninth was never seen.
- Warp is drawn as a piecewise-linear phase distortion. The wave's half-cycle point moves from about
  0.49 at warp 0 to 0.38 at 30, 0.33 at 40 and 0.26 at 62. It acts like PWM on any shape.
- Drift slides that point over time: LFO-like when low, FM-like in the middle, synced again at the
  top (Sound On Sound: phase modulation up to a synced audio rate).

Model [I]:

- **Knee:** d = 0.5 − 0.41·warp.
- **Distortion:** PD(x) = x/2d below the knee, else ½ + (x − d)/2(1 − d). It is driven by a second
  phase at f·(1 + δ), and the table is read at φ + PD(φw) − φw.
- **Drift:** δ = drift³, so drift 1 gives 2f, harmonic again. Drift does nothing at warp 0.

**The tables are TE's content: we design our own in the same families rather than capture theirs.**
(D2 applies by analogy.)

Open: the tables' data and frame count, the ninth table and the order, sine versus linear warp, the
drift law, and whether phases reset per note.

### epiano — tone, texture, punch, tine

Established:

- TE's staff: ranges from a nice electric piano to a filthy synth.
- The OP–Z e-piano is 8 FM algorithms, and reviewers hear FM here too.
- By ear:
  - tone brings in a modulator that turns saw- or square-like, and high tone sounds saw-like;
  - texture pushes the carrier from sine towards a peaky triangle;
  - punch adds a fast-decaying higher partial;
  - tine is how long the modulation takes to fall back to the pure carrier (0 sustains it; high tine
    plucks).
- 1.1.25 fixed the screen's parameter names; the CCs keep the guide's order.
- 4 of 5 factory epiano presets switch the M3 filter off.

Model [I]:

- **Carrier:** a 1:1 carrier with index I(t) = Imax·tone^1.5·e^(−t/τ), where τ goes from infinite
  (tine 0) down to about 30 ms. The modulator's own feedback moves it from sine to saw.
- **Texture:** a shaper, sine → triangle, then folding.
- **Punch:** a high (7–14×) partial decaying over 10–50 ms, scaled by velocity.

Open: the ratio and the modulator's waveform, velocity and key scaling, and whether tine is a time or
an amount.

### organ — type, bass, tremolo amount, tremolo speed

Established before measuring:

- TE: transistor to church; bass adds or removes bass; the tremolo moves the volume.
- 8 types: r10 counts eight, and the screen has drawbar rails with 8 stops.
- The character is FM-like, as the OP–Z's 8 FM organ algorithms were, with a "tweak" control.
- Most organ presets use the ladder filter. No percussion or key click is mentioned.

Measured on the owner's device (2026-09-27, `2026-09-27-130645-organ`: each type at its zone centre
× bass 0/64/127 on A1–A5, and the tremolo at five speeds; `research/device/organ_fit.py`):

- **Every type is a set of sine partials** that start together in sine phase with the note (the
  partials' phases follow (r − 1)·90° against the 8′ at every note and bass). Most sit on the
  half-note grid (the 16′ is half the note), like drawbars; some types add ranks a few cents off
  it, which beat slowly against the rest:
  - type 1: 16′ 8′ 4′ 2′, equal at bass 0; bass trades the 16′ and 8′ (−20 dB at 127) for the 4′;
  - type 2: 16′, 8′, 5⅓′ (+1, −3, −6 dB); **bass slides the 8′ and 5⅓′ up to the 5⅓′ and 4′**
    (ratios 1 + ½·bass and 1.5 + ½·bass: inharmonic on the way);
  - type 3: a dominant 2⅔′ over 16′ and 8′, with a soft buzz (every half-note partial, −20 to
    −45 dB) that bass brightens;
  - type 4: a 4′ with its harmonics, an 8′, and **a sub 11 cents flat** (0.4968 × the note, odd
    harmonics) that bass brightens;
  - type 5: 8′ 4′ 2⅔′ equal; bass adds their harmonics up to 16 × the note;
  - type 6: 8′ and 4′ with **two 2′ ranks 17 and 26 cents sharp** (4.04 and 4.06 × the note);
  - type 7: a 2⅔′ lead over a **16′ and 5⅓′ 5–6 cents sharp**, bass brightening the 5⅓′;
  - type 8: a bright 8′ (harmonics ~1/n^1.5) with a 1′ rank (8 × the note, and its harmonics).
- **Higher notes are darker**: upper partials fall off more steeply as the note rises, by up to
  20 dB at 10 kHz (a key scaling, not a filter: a 1′ at 7 kHz keeps its level).
- **A one-pole high-pass near 54 Hz** sits on the whole engine (fitted within 0.3 dB): the 16′ of
  A1 is 7 dB down. Simple has none.
- **Tremolo:** gain 1 + amount·sin, so at full amount the level swings from silence to twice the
  steady level (RMS +1.8 dB). Rate = 10.9 Hz × speed^0.93 (3.2, 5.7, 8.4, 10.9 Hz at 32, 64, 96,
  127); still at 0. Its phase at the note differs take to take: it runs free, not per note.
- Level: −22 to −26 dBFS on the USB audio (simple's saw: −18.9).

Model (what we built):

- `organ-registrations.ts`, generated by `organ_emit.py`: every partial's ratio and its level at
  bass 0, ½ and 1 on A1–A5, read in dB linearly between them (held beyond A1 and A5).
- A sine oscillator per partial (a rotating phasor), its level and phase carrying the high-pass;
  partials fade out between 0.4 and 0.45 of the sample rate.
- The tremolo's phase is the core's clock × its rate, so the notes of a chord pulse together.
- Rendered against the capture, every take's partials within 40 dB of the loudest match to
  0.1–0.2 dB RMS (1–2 dB on types 4 and 7 at A1–A2, where close partials are hard to separate),
  and the level to 6.2 ± 0.2 dB, our fixed device offset (`device.ts`).

Open: the tremolo's depth against amount (only 127 measured), its rate between speed 0 and 32; the
bass curve between 0, 64 and 127; the onset (no key click heard).

### hardsync — freq, sub, noise, lowcut

Established before measuring: a saw slave hard-synced to a master; the sub at the master's pitch;
white noise; lowcut is a highpass on top of M3 (TE's staff): the thin, tinny sound.

Measured on the owner's device (2026-09-27, `2026-09-27-133212-hardsync`):

- **freq moves the synced saw linearly, 1 + 7·freq times the note**: the 2nd harmonic leads at CC
  13–25, the 3rd at 38, the 4th at 51, the 6th at 89, and at 127 a plain saw three octaves up; the
  same on A2, A3 and A4. The pitch stays the note's.
- **The sub is a saw at the note, in phase with the synced saw** (at freq 0 the sum stays a pure
  saw), up to 2× the synced saw's level at sub 127, rising a little faster than in proportion
  (≈ 2·sub^0.8).
- **The lowcut filters the saws only; the noise passes untouched** at every setting (white, flat to
  16 kHz). One pole, corner 101, 417, 712, 1023, 1888, 2757, 4028, 5006, 5334, 8165 Hz at CC 13,
  25 … 127 (fitted on the saw's first harmonics within 2 dB).
- Levels: the synced saw −24.3 dBFS on average (±1 dB note to note, even at the same setting); full
  noise −64 dBFS/Hz. On A6 at freq 127 the slave (14 kHz) aliases into noise.

Model: the above (`hardsync.ts`); our slave stops at 0.2 × the sample rate instead of aliasing.
Against the capture, the partials within 40 dB of the loudest match within 1–1.5 dB.

Open: the noise curve (only noise 100 was measured); the lowcut's corner near 0 (a slight cut of
A2 at freq 0?); what scatters the level note to note.

### simple — shape, pw, noise, stereo

Established before measuring: shape goes from saw to square and PW does nothing at saw (four
reviewers); "big square" is shape 100, PW 0, so PW 0 is the square; stereo sounds like a stereo
phaser; square basses use preset volume 11–25 %.

Measured on the owner's device (2026-09-27, `2026-09-27-123129-simple`,
`2026-09-27-133717-simple-stereo`):

- Shape: saw − k·(the saw half a cycle on), as prism; pulse width = 0.5 − 0.44·pw on the pulse part.
- Noise crossfades the oscillator into white noise (the oscillator whole to about 60 %, gone at
  100 %; the noise then carries 1.5× the saw's power).
- Saw: −18.9 dBFS on A2 and A4. The level of every engine built from measurements is scaled from it
  (`device.ts`: ours = device + 6.2 dB).
- **Stereo (also prism's): each channel is the dry sound plus a copy through a delay that a slow
  triangle sweeps**, so the copy sits a few cents off the note, up in one channel while down in the
  other, the two trading places at every turn (`stereo_fit.py`, the same on simple and prism):
  - up to CC 64 stereo raises the copy's level, 0.0135 a step to 0.86;
  - above 64 the level holds at 0.89 while the offset widens and the triangle quickens: 6.9 cents
    and a half period of 3.05 s up to 64, then 8.7, 10.7, 12.9, 15.2 cents and 2.8, 2.6, 2.35,
    2.2 s at 80, 96, 112, 127;
  - the copy is high-passed (one pole): ~815 Hz up to 64, falling to ~490 Hz at 127, so the bass
    stays in the middle;
  - the triangle runs free (its turns fall on one clock across notes), and the dry sound keeps its
    level. Left/right correlation at 127: 0.87 on A2, 0.69 on A4.

Model: the above (`simple.ts`, `stereo.ts`: τ₀ = 12 ms, a sweep of D = δ·P/4 either way, cubic
reads, the triangle's phase from the core's clock). Our render reproduces the fitted offsets, half
periods, copy levels (within 1 dB) and corners.

## 4. The shared voice

**Signal chain [I]:** engine → M3 filter (per voice) → amp envelope × velocity → preset volume →
preset highpass → width → track → sends → group → master EQ → saturator → compressor → limiter.

**Filters.**

Established:

- Four types. Stored ids: z lowpass 9, svf 10, ladder 16, z hipass 17. The gaps may hide internal
  types.
- svf is lowpass only, gentle, with good resonance (about 12 dB/octave).
- ladder is aggressive and whistles into self-oscillation (about 24 dB/octave).
- z lowpass has praised resonance; z hipass is the only highpass.
- Envelope amount is ±99.

Our models:

- svf: a TPT state-variable lowpass that never quite self-oscillates, k = 2(1 − 0.97·r^0.8).
- ladder: a four-pole TPT ladder with saturating feedback k = 4.1·r.
- z: a sharper two-pole, Q 0.5–25.
- Cutoff: 20 Hz–20 kHz exponential.
- Envelope depth: our 7-octave curve (unmeasured).

**Envelopes.**

- Established: attack time T ≈ 0.0111·e^(10.386·x) s for x = value/99 (op-forums t/31132). A second
  fit gives 0.01037·e^(10.4687·x) s (sf2-to-opxy). TE draws decay and release as exponential.
- Ours: the same law for decay and release, a 1 ms floor at 0, a linear attack, and exponential falls
  over four time constants per "time".
- Open: whether decay and release really follow the attack law, the attack's curvature, and whether
  sustain is linear or in dB.

**LFOs.**

- Established:
  - Types: element, random, tremolo, value, and duck (from 1.1.0).
  - Speed runs synced to the left and free to the right.
  - Regular destinations reset on each key; free ones don't.
  - Value shapes: sine, square, ramp, saw. Tremolo shapes: sine, saw, exp, square, blip. Random is
    sample-and-hold.
- Open: element's "env" source seems to follow the filter envelope on the device, not the amp
  envelope the guide names.

**Play modes and voices.**

- Established:
  - Portamento is linear or exponential, per preset.
  - Bend range is stepped, with 0 off.
  - 24 voices; at most 8 per track; per-track reservations.
  - The voice icon appears at 17 voices and blinks red on a steal.
  - A CPU limiter cuts notes under load.
- Stealing order [I]: released voices first, then the track's own oldest, then others (`allocator.ts`).

**FX** (send effects, established parameters):

| Effect     | Parameters                                                         |
| ---------- | ------------------------------------------------------------------ |
| chorus     | rate, depth, feedback, stereo                                      |
| delay      | size (8 steps, micro to insane), time tied to tempo, feedback, dry |
| distortion | drive, clipping amount, low and high cut before it                 |
| lofi       | rate, bits, quality, drift                                         |
| phaser     | frequency, depth, rate, feedback; 12 poles                         |
| reverb     | size (room to cathedral), modulation, tone, mix                    |

Lofi resembles the OP–1 field's "terminal" and the phaser the OP–1's "fazer" [I].

## 5. The synth core (our implementation)

**Why a rebuild.** The first engines were Web Audio node graphs: fixed PeriodicWaves, BiquadFilters
and node-rate modulation. They were cheap, but they could not do true hard sync, FM with feedback,
per-sample phase distortion or a real ladder, and they aliased and zippered. The core computes
every voice per sample instead.

**Where it runs.**

- `src/lib/sound/synth/` is plain TypeScript. `worklet.ts` runs it in an AudioWorklet with eight
  stereo outputs (one per instrument track, into the existing channel strips) and eight four-channel
  inputs carrying each track's LFO (cutoff cents, resonance dB, engine unit, vibrato cents).
- The same code runs in Node for tests.

**Who decides what.**

- The main thread's `SoundEngine` still decides everything a person hears as behaviour: play modes,
  glides, voice stealing, releases, the scheduler's timing, the LFO and the mixer.
- `WorkletVoice` (`host.ts`) has the Web Audio voice's surface. Each call becomes a timed message
  (`protocol.ts`), and the core replies when a voice has died away.
- `CORE_ENGINES` lists the engines the core plays; the rest stay on the Web Audio voices.

**DSP choices.**

- Oscillators get minimum-phase band-limited steps (minBLEP, 16 zero crossings): saws and pulses sit
  about 60–90 dB below naive aliasing, and hard sync resets land at the exact sub-sample instant.
  Triangle corners get a two-sample polynomial ramp.
- FM operators use DX7-style averaged feedback.
- Filters are topology-preserving transforms (Zavalishin): a Simper SVF and a four-pole ladder with
  saturating feedback and two-times headroom.
- Wavetables are stored per octave (512 >> l harmonics, eight samples per cycle of the top one).
  A note reads the richest level below Nyquist, picked a quarter octave early, and fades in the
  next one over the top quarter of its octave, so no harmonic ever passes Nyquist. Each level is
  built the first time a note reads it (one inverse FFT, well under a millisecond), so no note
  waits on the audio thread for a whole table.
- Envelopes follow the measured law above. Pitch, filter and engine parameters update every 16
  samples; oscillators, filters and amplitude run every sample.

**Levels and CPU.**

- Engines aim at RMS ≈ 0.28 at their default M1. `CORE_GAIN` centres them on the first Web Audio
  engines: at a new track's settings they sit between −2.9 dB (epiano) and +3.8 dB (simple). The
  device session will set each engine's own level.
- Parameters glide over about 4 ms inside the engines (`engines/ramp.ts`), so an LFO or a turned
  encoder never clicks. hardsync and dissolve have a soft ceiling above ±1 (`engines/guard.ts`) for
  rare aligned peaks.
- The budget is 24 voices in real time in one worklet thread: no allocation and no per-sample
  `pow`, `exp` or `tan`, with tables for costly shapes (`sine.ts`, a 4096-point sine within 4e-7 of
  `Math.sin`).
- Measured: engines cost 35–180 ns per voice-sample in Node. 24 voices of all eight together render
  11× faster than real time in Chromium through the whole graph.

**The engines as built** (constants at the top of each `engines/*.ts`, awaiting §6):

| Engine    | What we built                                                                                                                                                                                                                                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| prism     | Measured: saw → square blend k with a −3.9 dB/k level law, then oscillator 2 narrows before oscillator 1 (to w ≈ 0.113); oscillator 2 at −2.4 dB, less at high ratios; ten ratio zones up to 1:16; detune to 15 cents; each oscillator fades with its pitch above ~2 kHz; stereo = the swept copy.                                                      |
| simple    | Saw → square blend, width 0.5 − 0.44·pw on the pulse only, the measured noise crossfade, and the measured stereo: a delayed copy per channel, a triangle sweeping it ±6.9–15.2 cents (opposite in L and R), high-passed at 815–490 Hz.                                                                                                                  |
| hardsync  | Measured: a saw synced at 1 + 7·freq times the note (linear), a sub saw at the note in phase (to 2×), a one-pole lowcut on the saws only (101 Hz–8.2 kHz), white noise at −64 dBFS/Hz after it; levels at the device's.                                                                                                                                 |
| dissolve  | Two sines ±45 cents at full detune. Swarm: independent wobble per carrier, jitter on the FM, and a noise band at Q 2. AM by narrow-band noise at the note (Q 8). FM by a 1:1 cosine-phase modulator (the saw-like series at moderate index), DC removed exactly.                                                                                        |
| epiano    | 1:1 FM: tone raises the index (to 2.2 rad, where 1:1 FM is brightest) and the modulator's feedback (sine → saw); texture is the carrier's shape (sine → triangle → a peaky pickup triangle); punch a partial at 7× the note decaying over 25 ms, ∝ punch² × velocity; tine the index's decay, 8 s → 30 ms (none at 0). The FM level dip is compensated. |
| axis      | Operator 2 at r × the note phase-modulates operator 1 (index 1.3) and is also heard (0.5, less at high ratios). r runs 0.5 → 1 weighted to unison below 50 (M1 49 ≈ 3 cents: a slow chorus), then steps 1…32 above, gliding over 5 ms. Shape: saw at 0, triangle at 1. Tone: a resonant lowpass 100 Hz–16 kHz. Tremolo up to 0.6 deep, 0.5–10 Hz.       |
| organ     | Measured registrations: per type, every partial (on the half-note grid, or a few cents off it) at bass 0/½/1 on A1–A5, played as sine oscillators behind a one-pole 54 Hz high-pass. Type 2's bass slides two partials. Tremolo 1 + amount·sin at 10.9 Hz × speed^0.93, free-running on the core's clock.                                               |
| wavetable | Nine tables of our own, 16 frames each: formant (a sine at 0, our ninth, first so that all-zero is a sine), buzz, zap, basic, geometric, fibonacci, fractal, crush, drawbars. Warp: the knee d = 0.5 − 0.41·warp with rounded corners; drift δ = drift³ (periodic again at 1, nothing at warp 0).                                                       |

**Tests.**

- `dsp.spec.ts`: harmonic series, aliasing against naive waveforms, filter slopes, FM sidebands
  against Bessel values.
- `core.spec.ts`: sample-accurate starts, gates, cancels, steals, glides, filter envelope, LFO inputs.
- `host.svelte.spec.ts`: the real worklet in Chromium through the engine.
- One spec per engine, checking the established behaviours above.

## 6. Calibration on the owner's device (pending approval)

**Why.** Every [I] above is a starting point. The device is the only ground truth, and we can hear
it: its USB audio input captures at 44.1 kHz/16-bit stereo (`90-device-probe.md`).

**What it changes.** Parameter CCs and notes on a track change device state, so this runs only with
the owner's go-ahead, on a new throwaway project, with nothing saved, loaded or deleted, and every
message logged in `90-device-probe.md`. Filter and LFO types have no CC and are set by hand.

**Rig.**

- A Web MIDI script sends CC 12–15 (P1–P4), 20–27 (envelopes), 28–31 (play mode, portamento) and
  32–35 (filter) on the track's channel, while `ffmpeg -f avfoundation -i ":OP-XY"` (or
  getUserMedia) records.
- A neutral track: filter open, attack 0, sustain 100, release short, LFO off, sends 0, preset width
  and highpass 0, glide and bend off. Master EQ, saturator and compressor neutral.
- First, map CC values to the screen's 0–100 and find prism's step edges.
- Notes A1–A5 (A6 for aliasing), 2 s on and 0.5 s off, each twice (phase reset, randomness), plus a
  chord.

**Per engine.**

- **prism:**
  - shape 0–100 in steps of 10;
  - all 9 ratios plus a slow ramp;
  - detune on A2 and A4 (beat rate: cents or hertz);
  - stereo 0–100 at detune 0 and 50 (left/right correlation);
  - a pitch check at transpose 0.
- **axis:**
  - tone sweep;
  - ratio 0–50 in steps of 5, plus a ramp over 51–100 (sideband spacing);
  - shape sweep;
  - tremolo sweep (rate, depth, stereo);
  - an 8 s note for hidden vibrato.
- **dissolve:**
  - all 0;
  - detune, swarm, AM and FM alone on A2 and A4;
  - FM 100 + detune 60, and AM 50 + FM 50.
- **wavetable:**
  - every table at positions 0–100 in steps of 5 on A1 and A4, as single cycles to design our tables
    after (not to ship);
  - a slow position ramp;
  - warp on basic;
  - drift 0–100 at warp 50, and drift at warp 0 (expect nothing).
- **epiano:**
  - all 0 (a pure sine?);
  - texture alone at tone 0;
  - tone at tine 0;
  - tine at tone 50;
  - punch alone;
  - spectrograms of the decay.
- **organ:**
  - each type at its zone centre × bass 0/64/127 on five octaves (harmonic tables of the sustain);
  - the onset, for click;
  - tremolo at five speeds;
  - two staggered notes (phase reset).
- **hardsync:**
  - freq alone on A2–A4;
  - sub alone (octave and waveform);
  - noise with a lowcut sweep;
  - freq at maximum on A6 (the device's own aliasing).
- **simple:**
  - shape 0/25/50/75/100 × pw 0/50/100;
  - stereo 0/50/100 held 5 s (detune versus phase);
  - a noise sweep.

**Shared.**

- Filters: an impulse, noise and a −18 dBFS sine as sampler presets (loading those changes device
  state too, so announce it separately):
  - each type × cutoff in 8 steps × resonance 0/25/50/75/90/99;
  - the sine at three levels (saturation);
  - envelope amount ±99 in 5 steps;
  - key tracking 0/50/99.
- Envelopes: on a saw, attack, decay (sustain 0) and release at 0, 14, 28, 42, 56 and 71 (one long
  check at 85); sustain in 5 steps.
- LFOs and play modes:
  - tremolo shapes, rates and depths on the pure-sine epiano;
  - value LFO on a resonant cutoff;
  - portamento in both styles;
  - bend at each range;
  - mono versus legato.
- Voices: 9 long notes on one track, then 25 across tracks (which one drops, clicks).
- FX: an impulse through each effect. Delay: 8 sizes × 3 times at 120 BPM. Reverb: RT60 by size and
  tone. Chorus and phaser: rates and notches. Distortion: its curve. Lofi: on a 1 kHz sine.
- A/B references: factory presets playing a fixed phrase:
  - prism: nt-ribeye;
  - axis: nt-woody;
  - dissolve: nt-cold brew;
  - wavetable: nt-tall drink;
  - epiano: keys/jeans, bass/jacket;
  - organ: organ/chorale, organ/manual;
  - hardsync: bass/corduroy, lead/runway;
  - simple: bass/big square, pluck/deep luck.

**Fitting.**

- Render our engine at each captured setting.
- Minimise `spectralDistance` (third-octave log spectra, level-normalised) plus the difference in
  `harmonicLevels` over each model's named constants.
- Fit envelope times on the RMS envelopes.
- Keep the captures local (git-ignored `research/device/captures/`) and commit only the fitted
  constants and the scripts.

## 7. Open questions, in order of audible impact

1. Envelope decay and release laws; sustain linear or dB (every patch uses them).
2. Filter slopes, resonance curves and envelope depth per type.
3. ~~Prism's shape curve, stereo mechanism and octave; the ratio step edges.~~ Measured (§3).
4. ~~The organ's 8 types (partials) and its bass control per type.~~ Measured (§3, organ).
5. Epiano's modulator ratio and waveform, and tine's law.
6. Axis: whether operator 2 is audible, its FM index, and the tone filter.
7. Wavetable: frames per table, the ninth table, the warp shape and the drift law.
8. Dissolve's modulators (noise or periodic).
9. ~~Hardsync's sub octave and waveform, and the lowcut slope.~~ Measured (§3). (Simple's stereo too.)
10. LFO shapes per type and element's envelope source; portamento curves; bend steps.

## 8. File map

| Path                                      | What                                                          |
| ----------------------------------------- | ------------------------------------------------------------- |
| `src/lib/sound/synth/analysis.ts`         | FFT, harmonic levels, aliasing and spectral-distance measures |
| `src/lib/sound/synth/blep.ts`             | minBLEP table and buffer, polyBLAMP                           |
| `src/lib/sound/synth/oscillators.ts`      | phase, saw, shape blend (hard-syncable), FM operator          |
| `src/lib/sound/synth/filters.ts`          | TPT SVF, ladder, one-pole, DC blocker, soft clip              |
| `src/lib/sound/synth/adsr.ts`             | envelopes on the measured law                                 |
| `src/lib/sound/synth/wavetable.ts`        | mipmapped tables from partials or cycles                      |
| `src/lib/sound/synth/noise.ts`            | seeded white noise, smooth random                             |
| `src/lib/sound/synth/engines/*.ts`        | the eight engines (one module each)                           |
| `src/lib/sound/synth/engines/ramp.ts`     | click-free parameter glides                                   |
| `src/lib/sound/synth/engines/guard.ts`    | the soft ceiling                                              |
| `src/lib/sound/synth/engines/audition.ts` | test support: playing engines, the shared bounds              |
| `src/lib/sound/synth/sine.ts`             | the table sine                                                |
| `src/lib/sound/synth/core.ts`             | voices, filters per type, scheduling, the render loop         |
| `src/lib/sound/synth/protocol.ts`         | messages, constants, `CORE_ENGINES`                           |
| `src/lib/sound/synth/worklet.ts`          | the AudioWorklet processor                                    |
| `src/lib/sound/synth/host.ts`             | the worklet node, LFO wiring, `WorkletVoice`                  |
| `src/lib/sound/engine.ts`                 | the engine: hands core engines' notes to `WorkletVoice`s      |
