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
   - **axis:** measured: four feedback operators of one waveform. Three are detuned copies of the
     note; op2 plays the ratio's multiple (0.5–1, then steps 1 … 32). tone is their feedback, shape
     crossfades it to y² (odd harmonics), and a 180 Hz highpass sits on the sum (§3).
   - **dissolve:** measured: two sines ±34 cents apart at full detune; fm is each sine's own
     feedback, am a hard clip inside that loop, and swarm a fast random pitch jitter (§3).
   - **wavetable:** measured: nine tables in alphabetical order (basic first), each a simple rule
     over 32 crossfaded frames; warp is FM of the read by a sine, and drift slows that sine to half
     the note (§3).
   - **epiano and organ:** FM, like their OP–Z ancestors [E]. The organ has 8 types drawn as
     drawbars [E].
   - **hardsync:** a synced saw over three octaves, a sub at the master pitch, noise and a highpass
     "lowcut" [E].
   - **simple:** a saw → square morph, with pulse width acting only near square [E].
3. **Axis and epiano share hidden preset values.** All 20 of their factory presets carry the same
   four values after P1–P4 (7616, 674, 3276, 8192); every other engine stores zeros there [E].
   Measured, both are phase-modulated sine operators: epiano 1:1 FM, axis self-feedback. What the
   values do is still open.
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

Established before measuring: TE calls it an FM engine for lush strings, its ratio detuning over
0–50 and stepping up in fifths above; a scope review heard two operators, tone as a lowpass with an
unusual resonance, and shape morphing saw ↔ triangle; the guide's early screen art labelled P4
vibrato; all 10 factory presets are poly.

Measured on the owner's device (2026-09-27, `2026-09-27-133356-axis`; `research/device/axis_fit.py`):

- **The voice is four oscillators of one waveform at one level**:
  - three play the note, detuned −9.0, −4.0 and +8.0 cents (refined against the waveform, which
    they fit to −47 dB);
  - op2 plays the ratio's multiple of the note, +4.0 cents;
  - all start at phase 0 on each note: identical settings give identical waveforms to −73 dB, and
    the level beats as the copies drift apart.
- **Each oscillator feeds its own output back into its phase**, y = sin(φ + a·y + b·y²):
  - at shape 0 it is the plain feedback operator, fitted within 0.1–0.9 dB per oscillator;
  - there is no FM between the operators, and none of op1 by op2 at any ratio;
  - the loop takes the last sample. Past a feedback of ~1.25 it rings at half the sample rate:
    from tone ≈ 110, energy appears at 20–22 kHz, just under the capture's Nyquist (it ran at
    44.1 kHz): −19.5 dB at 114, −7.7 dB at 127, while the audible band stays clean.
- **tone sets the feedback**:
  - for op2, as a loop at our 48 kHz: 0.21, 0.34, 0.45, 0.58, 0.70, 0.82, 0.93, 1.05, 1.18, 1.28, 1.44 at CC 0,
    13 … 127;
  - the copies run at about 0.75, 0.9 and 0.82 of op2's (−9, −4, +8 cents);
  - the level does not change: 2J1(β)/β's dip is not made up.
  - The feedback fades with the oscillator's pitch above ~500 Hz: 0.95 at 880 Hz, 0.55 at 1.76 kHz,
    0.14 at 2.6 kHz, none by 3.5 kHz. That is the device's own band limit.
- **shape crossfades the feedback from y to y²**: y² feedback gives odd harmonics only (a
  square-like wave). The y term falls 1 → 0.6 → 0 and the y² term rises 0 → 0.71 → 0.99 at CC
  0 / 64 / 127 (within 0.2–0.4 dB). The even harmonics fade while the odd ones hold.
- **ratio**:
  - below the middle op2 plays at 0.5 + p times the note, p = CC/127 (exact to 1e-4);
  - above it, in steps of 0.05 of the knob, at 1, 2, 3, 4, 6, 8, 12, 16, 24, 32. There is no 1.5
    step (TE's "fifths" are the 2:3 and 3:4 between the steps);
  - op2 plays at the copies' level up to 1, then 0, −1.4, −3.0, −4.5, −6.1, −7.8, −9.4, −11.3,
    −13.2, −15.3 dB at each step (about 3 dB an octave).
- **The sum passes a one-pole highpass at 180 Hz**, so low notes play thinner. It is why A2 sounds
  7 dB quieter than A4 and seemed brighter (its feedback looked key-tracked until the highpass was
  taken off).
- **tremolo is a dip in level, with no vibrato**:
  - depth (peak to peak) 0.12, 0.24, 0.34, 0.46, 0.54 up to CC 64, then 0.50, 0.46, 0.40, 0.36,
    0.30 to 127;
  - the rate is 5.2 Hz up to the middle, then 6.3, 7.3, 8.5, 9.3, 10.5 Hz;
  - it dips by half its depth from note-on, and the swing fades in after ~0.25–0.4 s.
- Level: each oscillator's peak is −27.7 dBFS (−25.0 dBFS RMS for the voice on A4 at tone 64).
- The capture's track 7 had **portamento on**: each note glided in from the last, linear in Hz, over
  0.15–0.3 s. That is the track's setting, not the engine's; the analysis reads notes after it.

Model: the above (`axis.ts`), with the feedback tables fitted to our own loop through its spectra
(a loop that feeds back its last sample is duller than the ideal y = sin(φ + β·y) at the same β).
Against the capture:

- the unglided A3 takes match the device's waveform with a correlation of 0.9995 (−37 to −39 dB
  of difference after 0.1 s);
- each oscillator's feedback is within 1 % from tone 0 to 114, and levels within 6.0–6.3 dB of the
  calibration;
- the Nyquist ringing is −7.8 dB against the device's −7.7 dB at tone 127;
- the tremolo matches in depth, rate and first dip.

Open: the tremolo's onset (it came later on A2 than on A4); the first 0.1 s (−24 dB of difference:
a short attack?); what the hidden values shared with epiano do.

### dissolve — swarm, am, fm, detune

Established before measuring: all zero is a pure sine; two sine carriers spread by detune; swarm
feeds noise in; AM adds grit and highs, FM turns it saw-like; FM 100 with detune gives a Reese
bass. Presets: FM usually 30–90, swarm ≤ 37.

Measured on the owner's device (2026-09-27, `2026-09-27-132921-dissolve`;
`research/device/dissolve_fit.py`):

- **Everything at 0 is a pure sine**, −14.2 dBFS on A2 and 3 dB lower on A4 (−1.5 dB an octave).
- **detune splits two carriers to ±34.3 cents at full**, in proportion, the lower one 5 dB under
  the upper (at 0 they sum in phase).
- **fm is each carrier's own feedback**, y = sin(φ + β·y): β = 0.083, 0.150, 0.218 … 0.686 at CC
  13, 25, 38 … 127, straight in fm, the same on A2 and A4 (fitted within 0.5–1.2 dB). Not a 1:1
  modulator: a free modulator's best fits needed feedback anyway.
- **am is a hard clip inside that loop**, y = clip(g·sin(φ + β·y)): g = 1.054, 1.109, 1.176 …
  1.997 at CC 13, 25, 38 … 127 on A2 (within 0.1 dB of every harmonic), and less up the keyboard:
  1.045 … 1.727 on A4 (0.63 dB less an octave up at full). Nothing makes up the level, so am gets
  louder (+2 dB at full). With fm, the clip sits inside the loop (outside, the fit is 14 dB off).
- **swarm jitters each carrier's pitch with its own fast noise** (most of the motion within
  5–60 Hz): a band around the note whose width (standard deviation) is 0.13·swarm^1.6 of the note,
  and the level falls by up to 6 dB, partly because the carriers drift apart.

Model: the above (`dissolve.ts`), run at twice the sample rate and halved through a 64-tap lowpass
(`filters.ts`, `Decimator`). The clip is anti-aliased by its antiderivative. The feedback averages
the last two outputs, as the DX7 does. With β·g past 1 the loop's equation has two answers and
jumps; at 1× its harmonics folded back to −41 dB on 2 kHz notes, and at 2× they stay under −60 dB.
Swarm is white noise through a one-pole at 50 Hz, a new value every 16 samples. Against the capture:

- the levels sit 6.0–6.4 dB above the device's (the 6.2 dB calibration);
- fm, am and detune partials match within 0.1–0.5 dB;
- FM 100 + detune 60 is within 0.6–0.8 dB;
- AM 50 + FM 50 is within 1.3–2.1 dB (a weak 6th harmonic comes out 3–5 dB low);
- swarm's spectrum is within a few dB across its skirt, with its width matching on A4 and narrower
  than the device's on A2.

Open: swarm at more notes (the A2 width); how the device keeps the clip's loop from aliasing on high
notes; any stereo (the capture plays mono).

### wavetable — table, position, warp, drift

Established before measuring: nine tables, eight named on screen (buzz, zap, basic, geometric,
fibonacci, fractal, crush, drawbars); switching tables keeps the position; the screen draws warp as
a phase distortion, and drift pulls the warping away from the note.

Measured on the owner's device (2026-09-27, `2026-09-27-131026-wavetable`, track 8: every table at
positions 0–100 % in steps of 5 on A1 and A4; warp on crush at position 64; drift at warp 64 on
basic's triangle, and at warp 0; `research/device/wavetable_fit.py`):

- **Order and frames.** The table knob runs alphabetically: basic, buzz, crush, drawbars,
  fibonacci, fractal, geometric, the unseen table, zap. So everything at 0 is basic's triangle, not
  a sine. Each table has 32 frames (crush 16), and a position between two frames crossfades them.
  Zap gives it away: its neighbouring frames cancel at the 74th, 127th and 168th harmonics, exactly
  at the positions that fall between frames (32 frames explains all 21 positions; 90 did not).
- **Each table is a simple rule**, recovered from the harmonics' magnitudes and phases. Our frames
  match within 0.0–0.5 dB on both notes unless noted:
  - basic, in thirds: a triangle bent into a square, sign(t)·|t|^k with k = (1 − 3x)^1.2; the
    square bent the same way into a falling saw; then the saw smooths into a sine by way of a softer
    saw with harmonics at 1/h² (within 2 dB; the fit's residual is −58 dB re the fundamental);
  - buzz: a saw crossfading into white noise, new noise in every frame (neighbouring positions
    correlate only where they share a frame). The saw falls to 5 %, the noise rises to −24 dB a
    harmonic (re the saw's fundamental) by the middle. All frames share one gain, so the level falls
    5 dB as the noise takes over;
  - crush: a sine rounded to steps of q = (0.2 + 1.13·x)² of its peak, the steps' square roots
    evenly spaced, from 51 levels to three (within 1 dB; residual −60 dB);
  - drawbars: nine tones at the Hammond ratios, each a sine with odd overtones at 1.93·n^−2.64, all
    in one phase (our earlier alternating signs cancelled harmonics the device reinforces). The
    registration tilts from the 16′ bar to the 1′, measured as nine levels per tenth of position;
  - fibonacci: a sine joined frame by frame by the Fibonacci harmonics at 1/(j + 1), folded as on a
    1024-point cycle (987 lands on 37);
  - fractal: saws at the octaves, their weights growing with position;
  - geometric: partials at the powers of ρ = 1 + 2x + 3x² (rounded, each above the last), the jth
    at (j + 1)^−(2 − x): a soft saw at 0; the note, 6, 36 and 216 times it at 1, ½, ⅓ and ¼ at the
    end (residual −74 dB);
  - the unseen table ("primes", our name): a sine joined frame by frame by the primes up to 127 at
    1/p;
  - zap: a rising saw whose hth harmonic turns by x·(59.9h − 2.9h²/(1 + 0.0191h)^0.534) degrees, a
    chirp that also slides a sixth of a cycle in time across the table.
- **Levels** (dBFS on A1): basic −16.5, crush −16.8, drawbars −20.0, fibonacci −16.5, primes
  −15.2, zap −20.6; buzz −23.9, falling as its noise takes over; fractal about −18 throughout;
  geometric −17.4 falling to −28.8 across positions.
- **The output rolls off like a one-pole lowpass at 8.3 kHz**, the same on every note (within
  0.2 dB up to 18 kHz). Harmonics carry on to about 20 kHz on both notes.
- **Warp is frequency modulation of the read by a sine**, not the drawn phase distortion: no
  piecewise-linear bend fits, whatever its knee. The read's phase swings by 0.15·warp cycles on A2
  and 0.117·warp on A4 with the sine at the note's rate (within about 1 dB up to warp 0.3 on
  crush, and 0.2–0.3 dB on the triangle). The sine keeps its own phase from note to note, so at a
  given warp the timbre differs a little from note to note. At high warp the device aliases:
  inharmonic energy reaches −29 dB on A2 and −37 dB on A4.
- **Drift slows that sine** from the note's rate to half of it: the ratio is 1 − s/2, where s is an
  S-curve, ½(2·drift)^2.6 mirrored above ½, the same on both notes. The result is a slow wobble low
  down, inharmonic FM in the middle and a subharmonic at the top. Halving the sine's rate doubles
  the swing, as FM does: the first sideband at drift 64 is predicted at −9.3 dB and measured at
  −9.4. Drift does nothing at warp 0.

Our model: all of the above, with every frame stored per half octave (the shared wavetable), and
warp read at the level for the fastest it drives the read. Unlike the device, ours does not alias.
The tables are our formulas fitted to the device's behaviour; nothing of the device's tables is
stored (D2 by analogy). For the owner to confirm: crush, geometric and basic are rules that
reproduce the device's frames closely, drawbars' registration is a measured table, and "primes" is
our name for the unseen table.

Open: the unseen table's name; warp at high settings (the fit degrades to 3–5 dB there, partly
the device's aliasing); whether the warp sine's phase is random or carries over from the last note.

### epiano — tone, texture, punch, tine

Established before measuring: TE calls it a nice electric piano to a filthy synth; reviewers hear
FM, as TE's OP-Z e-piano was (eight FM algorithms).

Measured on the owner's device (2026-09-27, `2026-09-27-132638-epiano`, velocity 100;
`research/device/epiano_fit.py`):

- **Everything at 0 is a pure sine**, −17.9 dBFS on A2, 2.9 dB lower on A4 (−1.45 dB an octave up).
- **tone is a 1:1 FM index with no modulator feedback** (fitted within 0.1–0.9 dB): 0.67, 1.23,
  1.85, 2.41, 2.95 at CC 13, 25, 38, 51, 64 on A2 (≈ 5.9 × tone), capped at ≈ 3.05 from CC 64 up
  (the fundamental cancels near CC 38, where 1:1 FM's J0 = J2). A4 runs 0.82 × A2 (0.9 an octave).
  FM's own level dip is not compensated; past CC 76 the spectrum holds but the level falls 1.3 dB
  by 127.
- **tine decays the 1:1 index in straight lines**: after a hold (0.2 s at CC 13, none from 64), down
  at a fast rate to 0.65 of it, then at a slow rate to nothing; fast = 0.26, 0.4, 0.86, 1.45, 2.24,
  3.0 … 6/s and slow = 0.04, 0.06, 0.13, 0.24, 0.34, 0.45 … 0.92/s (of the starting index) at CC 13
  … 127, the same on A2 and A4. At 127 the index is gone in 0.8 s.
- **punch is a second modulator at 4× the note**: sidebands 3 and 5, then 7 and 9, in equal pairs;
  index 1.7·punch^2.95 on A2 (0.86 an octave up), rising over ~40 ms and then decaying by itself
  even at tine 0 (τ ≈ 1.9 s). Not a decaying partial.
- **texture blends a soft clipper into the carrier at an unchanged level**: 0.37 of the sine plus
  0.63 of atan(g·sine)/atan(g) (within 0.3–0.8 dB); g = 1.2, 2.2, 3.8, 7.0, 12.4, 19.4, 28.4 at CC
  13 … 89 on A2, the clipped share rising to all of it at the top (where h3 grows past a square's,
  a hint of folding). **The drive falls steeply up the keyboard**: 0.6 … 4.4 on A4.

Model: the above (`epiano.ts`): a phase-modulated carrier read from a band-limited table of clipper
shapes, the indexes shrinking where the spectrum would pass Nyquist. [I] Velocity scales both
indexes (0.5 at the softest, 1 at 100); tine's envelope applies to punch too. Against the capture:
tone and punch partials within 0.1–1 dB, texture within 0.3–0.6 dB (1–1.5 dB at its top on A2),
levels within ±0.4 dB except mid tone on A2 (1 dB).

Open: velocity; tine's effect on punch; texture's top (folding?); a slow index drift at tine 0.

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
- Wavetables are stored per half octave (512·2^(−l/2) harmonics, at least eight samples per cycle
  of the top one), which keeps a note's top harmonic within 14–20 kHz, as the device's reach.
  A note reads the richest level below Nyquist, picked an eighth of an octave early, and fades in
  the next one over the top quarter of its step, so no harmonic ever passes Nyquist. Each level is
  built the first time a note reads it (one inverse FFT, well under a millisecond), so no note
  waits on the audio thread for a whole table.
- Envelopes follow the measured law above. Pitch, filter and engine parameters update every 16
  samples; oscillators, filters and amplitude run every sample.

**Levels and CPU.**

- Engines aim at RMS ≈ 0.28 at their default M1. `CORE_GAIN` centres them on the first Web Audio
  engines: at a new track's settings they sit between −2.9 dB (epiano) and +3.8 dB (simple). The
  device session will set each engine's own level.
- Parameters glide over about 4 ms inside the engines (`engines/ramp.ts`), so an LFO or a turned
  encoder never clicks. hardsync has a soft ceiling above ±1 (`engines/guard.ts`) for rare aligned
  peaks; dissolve's clip bounds its own carriers.
- The budget is 24 voices in real time in one worklet thread: no allocation and no per-sample
  `pow`, `exp` or `tan`, with tables for costly shapes (`sine.ts`, a 4096-point sine within 4e-7 of
  `Math.sin`).
- Measured: engines cost 35–180 ns per voice-sample in Node. 24 voices of all eight together render
  11× faster than real time in Chromium through the whole graph.

**The engines as built** (constants at the top of each `engines/*.ts`, awaiting §6):

| Engine    | What we built                                                                                                                                                                                                                                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| prism     | Measured: saw → square blend k with a −3.9 dB/k level law, then oscillator 2 narrows before oscillator 1 (to w ≈ 0.113); oscillator 2 at −2.4 dB, less at high ratios; ten ratio zones up to 1:16; detune to 15 cents; each oscillator fades with its pitch above ~2 kHz; stereo = the swept copy.                                                     |
| simple    | Saw → square blend, width 0.5 − 0.44·pw on the pulse only, the measured noise crossfade, and the measured stereo: a delayed copy per channel, a triangle sweeping it ±6.9–15.2 cents (opposite in L and R), high-passed at 815–490 Hz.                                                                                                                 |
| hardsync  | Measured: a saw synced at 1 + 7·freq times the note (linear), a sub saw at the note in phase (to 2×), a one-pole lowcut on the saws only (101 Hz–8.2 kHz), white noise at −64 dBFS/Hz after it; levels at the device's.                                                                                                                                |
| dissolve  | Measured: two sines ±34.3 cents at full detune (the lower 5 dB under), each feeding back into its own phase (fm, β to 0.686), clipped hard inside the loop (am, drive to 2 on A2, key-scaled), swarm a one-pole 50 Hz pitch jitter to 0.13 of the note; run at 2× through a 64-tap decimator.                                                          |
| epiano    | Measured: a sine carrier phase-modulated 1:1 (tone, index to 3.05, no feedback) and 4:1 (punch, rising then fading), a soft clipper blended in (texture, drive key-scaled), tine's two straight-line decays on the index; key-scaled level.                                                                                                            |
| axis      | Measured: four feedback operators at one level, copies of the note at −9, −4, +8 cents and op2 at the ratio (0.5 + p, then steps 1 … 32, +4 cents); tone = feedback (per-oscillator tables, band-limited above ~500 Hz), shape = y → y² feedback, 180 Hz highpass, tremolo dips.                                                                       |
| organ     | Measured registrations: per type, every partial (on the half-note grid, or a few cents off it) at bass 0/½/1 on A1–A5, played as sine oscillators behind a one-pole 54 Hz high-pass. Type 2's bass slides two partials. Tremolo 1 + amount·sin at 10.9 Hz × speed^0.93, free-running on the core's clock.                                              |
| wavetable | Measured: nine tables in the device's order, each a rule fitted to its harmonics (basic's power-shaped morphs, buzz's saw into fresh noise, crush's quantiser, in-phase drawbars, geometric's powers, zap's chirp …) over 32 crossfaded frames (crush 16); a one-pole at 8.3 kHz; warp = FM by a free-running sine, drift slowing it to half the note. |

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
5. ~~Epiano's modulator ratio and waveform, and tine's law.~~ Measured (§3).
6. ~~Axis: whether operator 2 is audible, its FM index, and the tone filter.~~ Measured (§3): four
   feedback operators, no FM between them; tone is feedback.
7. ~~Wavetable: frames per table, the ninth table, the warp shape and the drift law.~~ Measured
   (§3): 32 frames (crush 16); warp is FM by a sine; drift slows it to half the note. The unseen
   table's name is still ours.
8. ~~Dissolve's modulators (noise or periodic).~~ Measured (§3): feedback, a clip, a pitch jitter.
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
