# 61 — Listening: how the agent hears the OP-XY (M9)

The agent can now hear what it made: `listen` records a few seconds of the OP-XY's USB audio (or,
with no device, of the virtual OP-XY in the browser) and returns measurements in words and numbers;
`listen_tracks` hears instrument tracks one at a time. Everything below was built and tested on
synthetic signals with known answers (`src/lib/core/listen/*.spec.ts`); nothing was sent to the
owner's unit. What the device session should check is in §8.

Code: `src/lib/core/listen/` (pure analysis), `src/lib/device/listen/` (capture: AudioWorklet
recorder, analysis worker), `src/lib/agent/tools/listen.ts` (tools), `AppSound.listenTap()` (the
replica's master), `src/lib/agent/ui/ListenLight.svelte` (the panel's light).

## 1. Capture

| source          | how                                                                                                                                                                                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the OP-XY       | `getUserMedia` on the audio input whose name matches `op[-–_ ]?xy` (the unit is a class-compliant UAC1 input, 44.1 kHz stereo, note 90), echo cancellation, noise suppression and gain control off, in an `AudioContext` at the input's own rate; 200 ms pre-roll |
| the virtual one | a `GainNode` between the sound engine and the destination (`AppSound.listenTap()`), recorded in the replica's own context, so the replica keeps playing                                                                                                           |

- **Permission.** Browsers hide input names until the page may use a microphone. The first time,
  `getUserMedia({ audio: true })` asks; that stream is stopped unheard and only reveals the names.
  Then only the OP-XY's input is opened, and a stream whose track is not the OP-XY's is refused and
  stopped (`capture.svelte.spec.ts` checks both).
- **Recording** runs in an AudioWorklet (`opxy-recorder`): stereo input (mono up-mixed), chunks of
  4096 frames posted to the page with their peak (the light's meter), exactly the frames asked for.
  A new `MediaStream` source delivers silence for its first moments (seen in Chromium as a 10 Hz
  low reading on a 220 Hz tone over 0.5 s), hence the pre-roll.
- **Analysis** runs in a worker: 30 s of 48 kHz stereo takes about 0.5 s in Node, which on the page
  would starve the replica's scheduler (it looks 100 ms ahead). If a worker cannot start, the page
  analyses.
- **Audio start.** A real-time context needs a user gesture; the agent is always asked from a key
  press or a click, so contexts start. In Chromium tests a `userEvent.click` unlocks audio.

## 2. Level and loudness (`level.ts`)

- Sample peak, RMS, crest (peak − RMS in dB), DC offset, clipping: samples ≥ 0.9999 and **runs of
  three or more** (a flat top), so a sine that only touches full scale is not clipping.
- **Integrated loudness after ITU-R BS.1770-4:** K-weighting (high shelf + RLB high-pass, derived for
  any rate from the analog prototypes libebur128 (MIT) fitted to the standard's 48 kHz
  coefficients), 400 ms blocks every 100 ms, absolute gate −70 LUFS, relative gate −10 LU; the
  loudest momentary (400 ms) and short-term (3 s) values; loudness range after EBU Tech 3342
  (short-term values gated at −70 LUFS and −20 LU, 95th − 10th percentile).
- Evidence: the 48 kHz coefficients match the standard to 1e-7; the response at 44.1 kHz is within
  0.1 dB of 48 kHz from 30 Hz to 12 kHz; EBU Tech 3341 test signals 1–5 (−23/−33 dBFS stereo sines,
  both gates, power averaging) read −23.0/−33.0 LUFS within 0.05; a full-scale 1 kHz sine on one
  channel reads −3.01 LUFS; a 10 LU step reads 10.0 LU of range.

## 3. Tone and stereo (`spectrum.ts`, `stereo.ts`)

- Welch spectrum (Hann frames of ~190 ms, 50 % overlap, channels averaged). Bands low 20–150,
  low-mid 150–500, mid 500–2500, high 2.5–8 k, air 8–20 kHz, each as its share of all energy and
  **against pink noise** (equal energy per octave: 0 = pink's balance). Centroid (magnitude
  weighted), tilt (slope of power per hertz over third octaves 50 Hz–16 kHz: white 0, pink −3,
  brown −6 dB/oct), a coarse third-octave profile. Bands integrate fractional bins.
- Evidence (exact-slope noises built in the frequency domain): pink within 0.8 dB of pink in every
  band, tilt −3 ± 0.3; white 0 ± 0.3, brown −6 ± 0.3; centroids 6.9 kHz (pink), 10 kHz (white), a
  sine's own frequency; at 22.05 kHz the bands are judged against what that rate can hold.
- Stereo: correlation Σ LR / √(Σ L² Σ R²), width = RMS(side)/RMS(mid) (capped at 10), balance in dB
  (±60 for a silent side), the correlation below 150 Hz (two Butterworth low-passes), and the level
  lost folding to mono. Evidence: mono 1/0/0 dB; unrelated noise |r| < 0.05, width ≈ 1, −3 dB in
  mono; a flipped channel −1; a 6 dB pan reads 6.02 dB; a mono bass under a wide top reads > 0.95
  low-end correlation, a flipped bass < −0.95.

## 4. Onsets (`onsets.ts`)

Three detectors, one list:

1. **Spectral flux** over 30 Hz–16 kHz: Blackman–Harris frames of ~23 ms every quarter frame
   (5.8 ms at 44.1 kHz), log-compressed magnitudes (γ = 1000), each bin weighted so every third of
   an octave counts the same (as madmom's log-filtered spectrogram; otherwise a kick's few low bins
   drown among a chord's many high ones). A bin rises only above the **highest value it held over
   the previous 45 ms**, by at least 0.1 (about 1 dB): a temporal maximum filter, after SuperFlux's
   in frequency. A low saw's harmonics beat inside each bin tens of times a second, and a frame can
   catch that periodic swell a little higher than the frames before it did (an A1 saw alone gave
   about 90 false onsets in 8 s with a 20 ms look-back, 47 at 45 ms without the margin, none with
   it). Bins more than 60 dB under the frame's strongest never rise (window leakage flickers). Peaks: the largest within ±30 ms, above **twice** the mean of the
   surrounding 170 ms plus 5 % of the largest (Böck et al. 2012 with λ = 2: a held chord's partials
   beat and ripple the flux). Frames where the energy falls (plain and weighted toward the highs) are
   offsets: a clean tone's log flux also jumps when it fades.
2. **High-band flux** (6–16 kHz, same scale): a quiet hat over a loud chord.
3. **Low-band energy** (the signal low-passed at 200 Hz): its energy per frame rising to twice the
   highest of the frames before that do not overlap it. A kick under a loud bass fills bins the
   bass already holds, so the flux barely moves.

Placement: a clean rise out of near-silence (energy ×10 over 2.5 ms) is placed to the sample; a
low-band onset at a quarter of the way up a 10 ms-smoothed low envelope (a kick sweeping down
through a bass swells twice), pinned within 3 ms on the whole signal's rise; anything else at the
flux peak, parabolically interpolated, 0.58 of a frame in (fitted on clicks, drums and saw notes at
22.05, 44.1 and 48 kHz). Detections within 20 ms are one onset. Each onset counts in the bands whose
**filtered energy doubles** across it (20 ms after against 20 ms ending 5 ms before, and at least
−30 dB of the whole): 43 Hz frame bins would let a kick's tail and a bass note beat.

Evidence: impulse clicks placed exactly; noise-burst sixteenths at 132 BPM with off-beats 12 dB
down all found within 1 ms; from the flux alone within 3 ms; melody and legato pitch changes within
5–10 ms; gated saw sixteenths give 16 onsets and no offsets; hats 10 dB under kicks found; kicks and
hats land in their own bands. A held A1 saw alone gives no onset after its start (47 with no margin,
§4 item 1). In a deliberately hard mix (kicks only 6 dB over a continuous saw bass line), 10 or more
of 16 kicks land within 6 ms, the rest at 10–16 ms where the bass dips just before them, one 29 ms
off right after a bass note change; the hats within 4 ms. Known limits: two onsets in the same bins
closer than 45 ms count as one (a flam, a fast ratchet); a legato bass change under a held bass
goes unheard (a saw bass line alone gives only its first note).

## 5. Tempo, grid, swing and the drum picture (`tempo.ts`)

- **Tempo:** autocorrelation of the onset pulse (the flux plus √ of the rise in power, so kicks and
  snares outweigh hats) scored at one to four beat periods for every 0.25 BPM from 40 to 220 (the
  OP-XY's range), interpolated. Candidates scoring ≥ ¾ of the best are readings of one rhythm; the
  **set tempo picks among them** when known, else a log-normal preference around 120 BPM (σ = one
  octave, Ellis 2007 / librosa). Result: BPM, confidence (winner above the median candidate),
  alternatives, and against the set tempo: `same` (±3 %), `double`, `half`, `three-halves`,
  `two-thirds`, `different`, and how well the rhythm supports the set tempo (0–1).
- Evidence: click tracks at 42, 60, 90, 120, 128, 150, 174, 200, 218 BPM read within ±0.5 with the set
  tempo (support > 0.95); unaided 42–150 exact, and 174–218 read at half with the exact tempo named
  as an alternative (a listener's tap); house at 124 and 128, rock at 90 and 120, a breakbeat at 95
  read at their beat unaided; sixteenth hats at 70 and drum and bass at 174 with the set tempo; clicks
  at 120 against a set 80 or 100 read `different` (support < 0.6); notes at half the set tempo read
  `half`; noise has no pulse.
- **Grid:** phase where the most (squared) onset strength falls on beats, refined by least squares
  on onsets near beats; each onset's slot (beat, "e", "and", "a"); **swing** = 50 + 200 × the
  off-sixteenths' median delay in beats (50 straight, 66.7 triplet; under 50 the shuffle side);
  tightness = 1.4826 × the median distance to the swung grid (a robust standard deviation), strays
  (> 30 ms) counted apart. Swing is reported only with ≥ 4 off-sixteenths making ≥ 15 % of the onsets
  and clustered within 12 ms (stray decays scatter; swung notes do not).
- Evidence: straight sixteenths 50.0 ± 0.5 % with < 1 ms spread, phase within 5 ms; 56, 58, 62, 66.7,
  70 % and a 42 % shuffle within 1 point; 8 ms of random timing reads 5.5–10 ms, 2 ms reads < 3 ms;
  no swing without off-sixteenths; in a house loop the kicks sit 100 % on the beat and the hats
  > 60 % on the "and".

## 6. Key and chords (`harmony.ts`)

- Chroma from spectral peaks 50 Hz–5 kHz (190 ms frames, peaks interpolated), each added to its
  nearest pitch class weighted by cos² of the distance (nothing at half a semitone). Key: the
  Krumhansl–Kessler profile (24 rotations) with the best Pearson r; clear when r ≥ 0.75 and ≥ 0.05
  over the runner-up. Chords: triads, 7, maj7, m7, dim and sus4 templates holding each note's first
  six harmonics decaying by 0.6 (after Gómez 2006; with plain templates an F chord on saws read
  Fmaj7, its A's third harmonic being an E), per beat when the grid is known, a lone segment between
  two equal ones smoothed over.
- Evidence: C major, A minor, G major, E♭ major, F♯ minor progressions named on sines and on saws;
  C, Am, G7, Cmaj7, Am7, Bdim, Dsus4, B♭ named; C Am F G spans found at their changes (sines and
  saws, and under a drum loop in the analysis test). A loud bass pulls chords toward its harmonics
  (hints, labelled "rough").

## 7. Silence, dropouts, summary and flags (`silence.ts`, `summary.ts`)

- Silence: 10 ms frames under −60 dBFS (the louder channel): total, leading, trailing, the longest
  gap. **Dropouts:** 0.2–20 ms of digital silence cut into sound: the sound 2–20 ms either side above
  −40 dBFS and within 6 dB, and the 2 ms at each cut as loud (nothing faded). Evidence: three 5 ms
  cuts found at their times; a 50 ms rest and faded notes are not dropouts.
- The summary: a head line, then level, tone, stereo, rhythm, drums, harmony and silence lines, the
  focus (`mix`, `drums`, `tempo`, `harmony`, `tone`) first and with more detail, then "worth a look:"
  and the flags; the numbers follow as compact JSON (a clean 8 s song: < 1400 characters of text,
  < 1600 of numbers).

| flag            | when                                                                                               |
| --------------- | -------------------------------------------------------------------------------------------------- |
| `clipping`      | any run of ≥ 3 full-scale samples                                                                  |
| `hot`           | a peak ≥ −0.3 dBFS without clipping                                                                |
| `quiet`/`loud`  | integrated < −30 or > −8 LUFS                                                                      |
| `dropouts`      | any (see above)                                                                                    |
| `dc-offset`     | a channel mean over 0.01                                                                           |
| `mostly-silent` | silent more than half the take                                                                     |
| `phase`         | overall or below-150 Hz correlation under 0                                                        |
| `off-tempo`     | the set tempo is known, the pulse is at least 0.4 sure, the relation is `different`, support < 0.5 |
| `loose`         | ≥ 8 onsets on a grid spread over 15 ms                                                             |
| `no-pulse`      | ≥ 4 onsets, no set tempo the rhythm supports (≥ 0.8), and a heard pulse under 0.3 (or none)        |
| `silent`        | nothing above −60 dBFS                                                                             |

Tone is left as numbers: taste and genre decide the right balance.

## 8. The tools and device safety

- **`listen`** (read; `strict: false`, so it adds nothing to the API's strict grammar): seconds 1–30
  (default 8), a focus, and `from` (`device` or `virtual`; default the device when connected). It
  records nothing while the virtual OP-XY is stopped or its sound is off, or while the device reports
  it is stopped (with clock = both), and says what to do. The set tempo it compares with: the virtual
  OP-XY's, or the device's clock (else the tempo this app last sent). It notes the virtual OP-XY's
  metronome when it is on (its click is in what was heard; the replica's engine mixes it into the
  same bus as the tracks).
- **`listen_tracks`** (mutate, approval, on the device queue; `strict: false`): hears tracks 1–8
  alone in turn (default: tracks with notes on the virtual OP-XY, all eight on a device), 2–10 s
  each after 800 ms for the others' tails. Mutes are project state, so the approval sheet shows the
  mutes before and that every mute is put back. In a `finally`, every instrument track's mute is set
  back to what it was, after a failure or a stop too (tests: a failed second take, a stop mid-take,
  CC9 on the emulated OP-XY). **On a device** the OP-XY never reports mutes set by hand, so the tool
  runs only when the app knows all eight instrument tracks' mutes (from its own CC9 sends this
  session); otherwise it refuses without sending anything and tells the model to ask the user and set
  them with `mute_track` first. That keeps the promise "put back exactly as it was" (a hand change
  after that is the one thing it cannot see; the approval sheet says so).
- The prompt tells the conductor to listen after programming or shaping a sound, say what it heard
  against the request, revise, and stop when it matches or after a couple of rounds.

## 9. Open

- **With the owner's unit** (announce first; `listen` changes nothing, `listen_tracks` sends CC9):
  the input's name in Chrome on macOS (expected "OP-XY"), its rate (44.1 kHz expected) and the
  permission flow; USB latency against the sequencer; whether the OP-XY's metronome reaches USB
  audio; loudness of the factory "agent" project for a reference; tempo, grid and chords on real
  material.
- The replica's metronome in the tap (a separate click bus would let listening leave it out).
- Onsets: legato bass changes under a held bass; flams and ratchets under 45 ms.
- A beat-synchronous take (start at a bar line from the clock) for `listen_tracks` on a device, as
  community stem tools do (note 00: stembounce, opxy-stems).
