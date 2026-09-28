# 59 — Screen profiling on the device: method and what the screens really show

> Sessions of 2026-09-27/28 with the owner's OP-XY (OS 1.1.33): a phone camera over the screen, the
> owner pressing keys, our scripts moving parameters over MIDI (CCs only) and saving the screen after
> every change. It answers what TE's guide art never showed: the sequencer and player screens, the
> real envelope editor, the aux tracks, the engines' pictures, which pages MIDI can drive. Every
> message sent is in `90-device-probe.md`. Captures are local (`research/device/captures/`, git-ignored);
> this note describes them in our own words and numbers.

## TL;DR

- **The method works**: 1,500+ settled screens plus 10 fps recordings, each labelled with the CC state
  that produced it. Three hours of capture covered the mixer, players, bar, steps, arrange, song mode,
  punch-in, every engine page, envelope, filter, LFO, tempo and every aux track.
- **Envelope editor** (M2): two envelopes (amp, filter), five handles on the selected one, no flat
  segment after the attack, the attack bending up from a vertical start, and **the release lane is a
  handle position: a higher value means a shorter release**. Handle positions are linear in the CC
  value (fits below).
- **MIDI reach**: every page answers its CC lanes except the three sampler engines' M1 pages (drum,
  synth sampler, multisampler) and the external CV page; the brain has no filter page.
- **Behaviour**: picking a filter type returns to M1; the brain's M2 and the external MIDI track's CC
  pages slide in sideways; popups (octave, FX sends) fade after a second or two; arrange's M1 is
  "new" (TE's art had it reversed).
- **Pitfalls learned**: the camera runs ~0.8 s behind; the phone view can shift mid-session (it moved
  ~115 camera px and back); calibrate on a lit page (tempo), not on the dark bezel.

## 1. Method

### 1.1 Rig

- iPhone on a mount 30–40 cm above the screen, angled 25–30°, Continuity Camera (the phone locked,
  Center Stage off). `research/device/camera.command` runs in **Terminal.app** (only an app the user
  launches can get macOS camera access; the agent's shell cannot) and writes the latest frame
  (1920 × 1440) ten times a second to `captures/cam/live.jpg`. The preview on the Mac is mirrored;
  the frames are not.
- `screencap.py` maps the screen onto its own grid: a homography from the four screen corners to
  960 × 444 (2× the 480 × 222 panel), then the display's black and white stretched to 0 and 255.

### 1.2 Calibration

- **Use a page lit edge to edge** (the tempo page): `screencap.py calib --lit` fits each side's lit
  edge along 60 profiles (walking outward from the lit area to the first drop, so key tops beyond
  the bezel never count), refits without outliers, and intersects the lines. Residuals 0.13–0.26 px;
  the rectified page then fills 0..959 × 0..443 to within a pixel.
- The first method (the faint edge between the bezel and the panel's black) was off by up to 12 panel
  px: don't use it.
- The display has **rounded corners** (radius ≈ 8 panel px).
- `screencap.py check` (on the tempo page) reports how far the screen has moved since calibration.

### 1.3 Drift

The device slides under key presses and the phone can re-frame. Phase correlation of each raw frame
against the calibration frame, on the device body around the screen (screen masked, frames at ¼
scale, Hanning window), measures it robustly; ECC alone cannot catch large moves.

| Captures                          | Shift from the final calibration (camera px) |
| --------------------------------- | -------------------------------------------- |
| envelope runs, 22:16–22:25        | +24, +18                                     |
| mixer … drum, 22:30–23:45         | +22…+26, +11…+18                             |
| tempo, 00:18                      | +14, −5                                      |
| **ext audio … FX I, 00:38–00:53** | **−114…−116**, 0…+7                          |
| after recalibration, 01:06        | −2, 0                                        |

Every capture keeps its raw camera frame (`*-raw.jpg`), so all of them can be re-rectified with
per-frame corrected corners (planned tool: `screencap.py realign`). Pages from 00:38–00:53 look shifted
~47 px left in their saved PNGs; **that offset is the camera, not the device**. The FX page matches TE's
layout once realigned.

### 1.4 Tools (all in `research/device/`, read-only unless noted)

| Tool                      | What it does                                                                                                                                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `camera.command`          | camera → `live.jpg` (Terminal.app)                                                                                                                                                                                                                                 |
| `screencap.py`            | `calib [--lit]`, `check`, `snap NAME`, `watch PREFIX [--min S] [--every S]` (saves every screen that settles, and moving ones every S seconds, each with its raw frame), `record PREFIX` (every frame at 10 fps; stop with SIGTERM, not ctrl-c, when backgrounded) |
| `envsweep.py` (**sends**) | planned envelope states over CC 20–27 on one channel; waits until each change shows and settles                                                                                                                                                                    |
| `stepcap.py` (**sends**)  | `cc CH CC V… --label L`: allow-listed CC sweep, one capture per value after it settles; `snap LABEL`. Log: `captures/screens/steps.json`                                                                                                                           |
| `envfit.py`               | envelope handle positions and curve fits from the `env2-*` runs                                                                                                                                                                                                    |

`fresh()` returns only new frames; `settle()` waits for a visible change (≥ 30 pixels moving > 40
levels) that then holds across two frames. Still screens show < 5 such pixels between frames, so
anything above 20 is a real change (a digit ticking over is enough).

### 1.5 Timing and hygiene

- The camera shows a change 0.5–0.9 s after the CC (up to 4.4 s on animated pages). Sweeps must wait
  for the change, never a fixed delay (the first envelope sweep's frames were one step late).
- Stop playback before sweeping, or step locks and engine animations muddle the frames. Playing
  frames are useful too, but label them.
- Backgrounded recorders ignore SIGINT: stop them with SIGTERM. Two ran for an hour by mistake
  (`dissolve-anim/` is now a 10 fps record of 00:05–01:10, old calibration, no raw frames).

## 2. What the screens show

Positions are panel pixels (480 × 222) unless noted. "E1…E4" are the encoders, dark to white; the
screen marks each parameter with a dot or cap in its encoder's shade (E1 dark or hollow, E2 mid grey,
E3 light grey, E4 white).

### 2.1 General

- Popups (octave, mixer sends) appear over the page and fade after ~1–2 s.
- Sub-pages of one module slide sideways (brain M1 → M2; external MIDI M1 → M2 → M3).
- Engine pages style their top bar two ways:
  - prism, epiano and wavetable use coloured cells;
  - simple and axis use plain text.
- Most engine pictures animate constantly.

### 2.2 Envelope editor (instrument M2)

- **Two envelopes per track**, amp and filter. The selected one is bright with five square handles
  (start, peak, decay end, release start, end) and dim vertical drop lines from the peak, the decay
  end and the release start. The other is drawn dim with no handles.
- **Swapping:** a click on any encoder swaps the selection. CC 20–23 always set the amp envelope and
  CC 24–27 the filter envelope, whichever is selected.
- **Labels:** "amp" and "filter" sit right-aligned about 8 px left of each envelope's release-start
  handle, about 6 px above its sustain line. They overlap freely.
- **Handle positions are linear in the value.** Fits on 25 values per stage, residuals ≤ 0.9 px, in a
  frame normalised so the start handle sits at x 41 and the end at 440.5, baseline 201.6:

  | Encoder / CC       | Moves                            | Position (cc 0–127)   | Range                      |
  | ------------------ | -------------------------------- | --------------------- | -------------------------- |
  | E1 attack (20/24)  | peak, right along the top        | x = 41.6 + 0.9105·cc  | 41.6 → 157.3               |
  | E2 decay (21/25)   | decay end, right of the peak     | Δx = −0.5 + 0.7982·cc | on the peak → +100.9       |
  | E3 sustain (22/26) | sustain line, up                 | y = 201.7 − 1.3459·cc | baseline → 30.7 (the top)  |
  | E4 release (23/27) | release start, right, toward end | x = 333.8 + 0.8436·cc | 333.7 → 440.9 (on the end) |

  So the graph is ~171 px tall and the release region is anchored at the right. **A higher release
  value is a shorter release**: at 127 the release start sits on the end handle. In the raw 22:16
  frames the start handle sat at (40.1, 204.7) and the end at (439.1, 204.1). Absolute positions still
  want the realigned frames.

- **Curve shapes:**
  - The attack leaves the start handle vertically and bends toward the peak (concave). There is **no
    flat segment**: the decay starts at the peak.
  - The decay falls steeply and flattens onto the sustain level; the release has the same shape.
  - First fits: attack ≈ a cubic with control points (0, 0.61·h) and (0.95·w, top), rms ≈ 2 px.
    Release ≈ an exponential approach with k ≈ 4.5 over its width.
  - The decay tracer picked up stray pixels, so its fit is not yet trustworthy. Refit on realigned
    frames with a cleaner tracer.
- **Shift layer** (hold shift): a white card over the dimmed page with four icon rows:
  - play mode (poly / mono / legato icons);
  - portamento (off, then numbers);
  - bend range (semitones, up to an octave);
  - preset volume (number).
    Each row carries a dot in its encoder's shade.

### 2.3 Filter (instrument M3)

- **The page:** the curve over tinted bands, the type name at the top left, axis labels 50 · 1k · 2k ·
  5k · 20kHz, and a small value box on the curve.
  - Cutoff (CC32) slides the slope.
  - Key tracking (CC35) slides an arrow along the bottom, x ≈ 77 → 410 over cc 0–127.
  - Positive envelope amount (CC34) adds a hatched ghost of the curve to the right. The value range
    that shows it still needs reading off the captures.
- **Off:** the page dims under an "off" box; pressing M3 again switches the filter on.
- **Types:** shift + M3 lists ladder, svf, z hipass, z lowpass, with the current one boxed. **Picking
  one returns to the engine page (M1)**; M3 then shows the new type. z hipass mirrors the drawing (the
  hatch on the left).
- **Shift layer:** a white card with four send rows:
  - aux out (plug icon, "no send" or a value);
  - tape (reels icon);
  - FX I;
  - FX II.

### 2.4 LFO (instrument M4, five types)

- **Off:** dimmed under an "off" box; press M4 to switch on.
- **tremolo:**
  - rate: a note-value icon with a multiplier when synced (8, 6, 4, 2), a clock dial whose hand
    turns when free;
  - vib and vol: pointers on tick ladders;
  - env: a line tilting from rising (0) through flat (64) to falling (127);
  - a shape card (sine, square, …) under env.
- **value:**
  - speed, then amount on a ladder;
  - a scrolling column of destination cards: syn (engine), free, env, filter;
  - a large card with the destination parameter's name (in, attack, cutoff, res, key) over an
    animated knob icon.
- **random:** as value, plus an animated random step wave under speed and an env ramp card under
  the destination.
- **element:**
  - source icons for gyro (G), mic, envelope (^) and sum;
  - amount on a ladder;
  - destination cards (synth wave, env, filter, amp);
  - the parameter card: in, attack, cutoff, pitch, pan, ….
- **duck:** the source shows "tr 1" (a track number; the last position is a metronome icon), then
  amount, a live "signal" box, and hold and release cards.

### 2.5 Engine pages (instrument M1)

| Engine        | Picture                                                                                                                                                            | Knobs as seen                                                                                                                                                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| prism         | triangle, convex lens, concave lens, wedge; light rays through the lenses on every note                                                                            | shape grows the triangle; ratio thickens the convex lens in 10 steps (2:1, 1:1, 2:3, 1:2, 1:3, 1:4, 1:6, 1:8, 1:12, 1:16; the sweep skipped 1:3, which note 57's audio fit found); detune slides the concave lens; stereo opens the wedge into an arrowhead |
| simple        | isometric glass jar on stacked slabs                                                                                                                               | stereo splits it into two jars                                                                                                                                                                                                                              |
| organ         | four drawbars with scales 8…1, icons on the caps; they slide (animated)                                                                                            | each knob one drawbar                                                                                                                                                                                                                                       |
| epiano        | isometric stack of layers with tines; coloured top bar (tone, texture, tine, punch)                                                                                |                                                                                                                                                                                                                                                             |
| dissolve      | full-screen mosaic of squares, always moving                                                                                                                       | fm and detune whiten it                                                                                                                                                                                                                                     |
| hardsync      | a hair dryer blowing animated blocks; two sub dots; a low-cut S-curve                                                                                              | lowcut slides the S-curve right                                                                                                                                                                                                                             |
| axis          | isometric three-armed structure of cubes; plain top bar                                                                                                            | each knob lengthens or reshapes an arm                                                                                                                                                                                                                      |
| wavetable     | the waveform morphing with trails; the first top-bar cell shows the **table name** (basic, buzz, crush, drawbars, fibonacci, fractal, geometric, primes, zap seen) | drift fans the wave into moving ghost copies                                                                                                                                                                                                                |
| drum sampler  | the key's waveform; skipped parts tinted blue                                                                                                                      | tune "♩ −16.10" (0.1 steps), start and end markers, play mode icons (→\|, →, →G, ⟲). Shift: direction, pan (L▮▮R bar), fade (draws a dark ramp over the wave), gain (scales the wave)                                                                       |
| synth sampler | overview strip on top (base layer only), L and R waveforms, start / loop / end markers                                                                             | shift: direction, tune "♩ −12.00", crossfade % (a dark wedge at the loop), gain                                                                                                                                                                             |
| multisampler  | top strip is a full keyboard; the played sample's zone lights and jumps with the octave                                                                            | each zone brings its own waveform and markers; shift as the sampler                                                                                                                                                                                         |

**The three sampler engines ignore CC 12–15**: nothing on their M1 pages moves.

### 2.6 Preset browser (shift + M1)

- **Layout:** "N / preset" on the left, the engine list in the middle, that engine's presets on the
  right with the current one highlighted.
- **E1** opens a "by engine / by category" choice. The category view lists Nostalgic Synths, bass,
  drum, keys, ….
- **Footer:** cut · paste · rename · delete.

### 2.7 Players

Measured on the realigned frames b1-313…477 (arpeggio 313–379, list 391–411, hold 412–434, maestro
435–477) and rebuilt in `src/lib/sim/areas/sequencer/player-draw.ts`; `scripts/device-compare.mjs`
overlays agree to about a pixel. Pictograms TE never drew are traced off the frames by
`research/device/icontrace.py` into `knowledge/opxy/device-icons/players.json`. Coordinates below
are design px (capture rows × 220/222).

- **Switching on:** the first press of `player` shows the page at about 40 % brightness, with "off"
  (30 px, bold) in a black box, 60 × 40 at (210.5, 90.5), outlined white. The second press switches
  the player on.
- **Selection:** the first `shift + player` shows the list with the current player boxed. Each
  further press of `player` (shift still down) moves the box on, and letting go of shift opens that
  player's page. Layout: the track number and "player" at x 4 (baselines 25.3 and 45.3), the list at
  x 111 with baselines 20 px apart, in the order arpeggio, hold, maestro. The box is a 1.5 px outline,
  125 × 21 at x 105.25. All text on these pages is in the heavier weight.
- **Cards:** four 50 × 50 cards (radius about 3) at y 20, in the encoders' greys: dark, mid, light,
  white. White pictograms sit on the first two, ink on the other two, and pale blue marks what is
  off or not reached. The arpeggio's cards are at x 135 + 53·i; maestro's are wider apart, at
  130, 184.75, 239.5 and 294.25.
- **arpeggio:**
  - E1 speed is a note value only. TE's LFO note glyphs at 0.59 stand on y 62.4, centred on the card:
    a quarter (the slowest), an eighth, sixteenth, 32nd and a 64th (four flags, the fastest), with
    triplets drawn as three notes under an arc and a 3. The frames caught in passing suggest 1/4,
    1/8, 1/8t, 1/16, 1/16t, 1/32, 1/32t, 1/64. Whether 1/4t or slower values exist is to check.
  - E2 pattern pictograms, in the guide's order: up (a rising staircase), down, up/down (a stepped
    peak), up/repeat/down (the peak split in two), random (scattered blocks) and play order (an
    arrow to a dot).
  - E3 range is a ladder: rails 3 px wide at card x 17.25 and 31.75, four rungs 7.7 apart, and the
    octave count (10 px, grey) at the top right.
  - E4 hold is a hand, pale blue when off and ink when on.
  - A white ↗ arrow at (347, 14) appears on the base layer only: it marks a page with a shift layer.
  - "arpeggio" is 18 px bold, centred at 243.25, baseline 95.5 (smaller than 20 px, as if fitted to
    about 75 px). Maestro's name is 20 px at 241.
  - The run is fourteen isometric bars, 10 px wide from x 172.5, standing on the bottom edge. The
    front top is at 159.55 − 3.96·rank, where rank is the note's place among the run's pitches (not
    semitones), with a depth of (5, −5). Fill pale blue, edges a darker blue, 1 px. The run repeats
    across the fourteen: a triad at range 1 gives 1-2-3 heights, and at range 4 a twelve-step climb
    then 1, 2. The default screen's triad is the picture with nothing held.
  - The shift layer (no arrow):
    - length: two quarter notes (0.42 scale, the right one 4 px higher) with a tie under them that is
      white as far as the length reaches (half at 50) and pale beyond;
    - style: "off" (20 px) for the first, bar charts of seven 4 px bars for the others (seen:
      1-2-3-4-6-5-1 and 1-1-3-3-5-5-1; which style is which is unknown);
    - glide: a rising squiggle of three waves, inked from the left as far as glide reaches;
    - stereo: an ink ring (r 13.2, 2 px) with a pale ring behind it that parts to the right as
      stereo rises (about ±6 px apart at the value seen).
- **hold:** "hold" (20 px bold, centred at 239.5, baseline 45.6) over an infinity ribbon. Its
  loops are centred at (200.25, 121) and (278.75, 121), with eight lanes of 5.56 px from a 5.5 px
  hole to a 50 px rim. A lane at radius r on one loop is at 55.5 − r on the other, so the crossing
  lanes run at 45°, and the band falling to the right lies over the rising one. The knobs do nothing.
  The frames show no animation (to check with notes latched).
- **maestro:**
  - E1 roll: a wavy arpeggio sign with the value (14 px, bold) at its top right: 0, 10, 12…
  - E2 pattern: up, down, up/down, random, the arpeggio's pictograms.
  - E3 has no job: its card is crossed corner to corner in 1 px ink.
  - E4 hold: the hand.
  - Two stacks of four slabs, the stacks' front slabs at (160, 176.4) and (250, 176.4). Each slab is
    35 × 31.7 across, 5 deep, and 10 px further back and up than the one before. A slab stands for
    each stored note, filling the left stack from the back and then the right. Entering a new chord
    (shift + keys) lays them all flat, then raises one per note: 1, 4, then 4 + 2… Standing slabs
    are 19.8 px tall, and 39.6 while the chord sounds (tall for the frames while it played).
    Eight slabs suggest at most eight notes per chord (the simulator keeps eight).

### 2.8 Bar, steps

- **Bar card:** holding `bar`, or shift + bar to pin it, shows a white card over the dimmed page.
  - Top row: "1 2 3 4" with the current bar inverted, and "track scale 1".
  - Rows: quant 100 · length 50 · groove – · shape ⌐, each with its encoder dot.
  - On the right, a faint mini piano roll with a dash per note.
  - Bottom labels: clr notes (M1), clr params (M2), clr all (M4).
  - It fades on release.
  - bar + [+] / [−] adds or removes a bar.
- **Step popups:**
  - pressing or holding a step shows its number in a small box (the first one tinted cyan), with
    "copied" on a hold;
  - recording a lock turns the box orange;
  - holding a locked step shows the locked values in the top bar (e.g. shape 00, detune 06 against
    15 / 05).

### 2.9 Arrange and song mode

- **Arrange:**
  - eight track columns crossed by a band of track colours; the selected track's segment is bright,
    dotted with its notes, its number above;
  - a boxed scene number at the bottom (①);
  - the aux side adds a small icon at the top left.
- **Footer:** M1 **new**, M2 copy, M3 paste, M4 **clear** while the track has one pattern and
  **delete** once it has more. With shift: clone · copy · paste · reset (scenes).
- **Patterns** stack into a column of numbered blocks; E4 scrolls it so the current one sits on the
  band.
- **Song mode:**
  - "song 1" with a loop icon;
  - a 32-slot grid (8 × 4, rows marked [1] [9] [17] [25], [32] on the last slot), scenes as numbered
    circles, a white cursor line at the insertion point, a ring walking along during playback;
  - footer: clear all · ← · → · delete, lit while shift is held.

### 2.10 Mixer

Rebuilt in `src/lib/sim/areas/mixer/` (`draw.ts`, `eq.ts`). Edge-distance checks against the frames
below gave: M1 popup 1.0 / 0.3 px, EQ 0.26 / 0.17, saturator 0.33 / 0.25, master 0.57 / 0.49
(device→sim / sim→device).

- **M1:**
  - eight columns, each with a number, a pan dot along the bottom and a level line; CC 7 and 10 move
    them;
  - CC38 changes the send but shows nothing.
  - **Send popup** (b1-069…096): E1 or E2 swaps the selected track's column for two halves.
    - Each half has a 16 px box with a 1 px edge at y 6–22, holding "I" or "II" (10 px, baseline
      about 17).
    - A bar rises from the foot, top = 215 − 185·send/99: a 5 px stub at 0, up to y 30 at full.
    - On T3, FX I is near black and FX II the second grey; edges and numerals are black.
    - There is no fade: it snaps back about a second after the last turn.
  - The strips (now drawn so, `screen/pages/mix.ts`):
    - the level bar thickens with the level, even stopped: top 215 − 186.6·L, bottom 219.1 − 170.2·L
      (L 0–1), so 4 px at 0 and 20.5 px at full;
    - the selected track's number and pan dot take the strip's ink (white on T1–T2, black from T3);
    - the pan dot (about 8.5 px across) sits at y 209.4, x = strip middle + 24·pan (CC10 0 → −24,
      64 → centre, 127 → +24).
- **M2 EQ:** an isometric scene of panels on a grid floor, and a slider track with an "N" end.
  - The floor grid slopes ±2/3, with cells of 29.9 × 19.9 px.
  - Panels: low is two 4 × 4-cell panels, mid four 2 × 2, high eight 1 × 1. Every row spans eight
    cells in depth, and each panel is hinged at its near edge.
  - Tilt is 60° × CC/127 for every row, so CC 127 leans a panel to 60°, not upright. Heights are
    drawn about 1.25× taller than a true projection. The black "shadow" is the panel's flat
    footprint.
  - E4 bends the displayed bands linearly toward low cut, mid boost and high cut.
  - The knob shows the three displayed bands' mean distance from flat, which is why band CCs move it
    too. It rests at the groove's near end and sinks 2.5 px once it moves.
  - CC90 on channel 4 moves nothing; E4 does. Our blend default (50, from the `.xy` file) sits
    oddly with the knob resting at "N": to check.
- **M3 saturator:** four ladders (gain, clip, tone, mix) of 43 ticks, 20 × 2 px, every 5 panel rows,
  with 20 px white labels.
  - The caps are 50 × 20 and travel the full height (centre = 210 − 200·value).
  - E1's cap is hollow with a light grey edge; E2's is mid grey, E3's light grey, E4's white. The
    filled caps have a dark 1 px grip line.
- **M4 master:** the percussion and melodic levels in 50 px figures centred at x ≈ 119.5 and 359, and
  a 1 px divider at y 109.5.
  - Two white strips at x 229–251 split at 240; the compressor's dark bar rises from the divider in
    the right strip.
  - The VU meter pivots at (359.7, 152), with a scale radius of 94.5 and 13 ticks at the measured
    angles. It has a band from 0 to +3 and a grey dot beyond +3.
  - The needle is 3 px wide, spans radius 73–111 and rests on −20. The scale is not a standard VU:
    it has three ticks between −5 and 0 and three between 0 and +3.
  - How the needle and the strips move with sound is still to capture.

### 2.11 Tempo

- **Layout:** a light full-screen background, the BPM as a big number on the left, and a metronome
  in the middle carrying the groove's abbreviation (SH HS DA BO WO GA AC IN DF RO PR).
- **The weight slides down the arm as the tempo rises** (40 at the top, 220 at the bottom).
- **Groove amount** (CC81) is a slider under the metronome: 0 at the left, 64 in the middle, 127 at
  the right.
- **Speaker:** the icon at the top right loses its waves as E4 lowers the metronome volume.
- **Motion:** the pendulum swings with motion trails while playing. Repeated `tempo` presses tap the
  tempo.

### 2.12 Octave popup

- [+] / [−] on an instrument page show a small white card with a mini piano and the offset in a thin
  font: +1, **+0**, −1, −3. It appears low in the middle and fades after ~1–2 s.
- On the external CV page it appears inside the meter card.

### 2.13 Auxiliary tracks

| Track                  | M1                                                                                                                                                                                                                                             | Other pages                                                                                                                                                                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1 brain (ch 9)        | title "c major"; E1 auto (a brain head) / manual (a hand, with root and scale fields); E2 root (12); E3 scale (major, dorian, phrygian, lydian, mixo, minor, locrian); E4 link (crossed = off, then 02 04 06 08); a mini piano marks the scale | M2 routing: an "in" bracket from the brain to track boxes 1–8 with on/off, sliding in from M1. No filter page (CC32/35 do nothing)                                                                                                                                   |
| T2 punch-in FX         | 24 keys, each its own animation (planets, a digit clock, noise, hands, waves, line and bar sweeps…); 10 fps recordings of every key                                                                                                            | sounds not yet recorded                                                                                                                                                                                                                                              |
| T3 external MIDI (11)  | "midi", a DIN icon; channel 01–16 (CC12); bank and program crossed at 0, then 1–128 (CC13, CC14); CC15 nothing                                                                                                                                 | M2/M3 CC slots slide in: each slot crossed (off) or a big value with "cc N" under it; shift + turn picks the CC. M4 LFO: destinations are the slots, the parameter reads "no cc set"                                                                                 |
| T4 external CV (12)    | a "cv" voltmeter, −5 … +5 V; CC 12–15 move nothing                                                                                                                                                                                             | notes move the needle (to confirm)                                                                                                                                                                                                                                   |
| T5 external audio (13) | signal flow: "fdbk block" mic (crossed while blocking) → input → drive (00–20, CC13) → level (75) → mix (CC15, 00–99)                                                                                                                          | M2 routing boxes 1–8 and an "out" box; M3 filter: off by default, high-pass (CC32, rising from the left) and low-pass (CC35, falling from the right); M4 LFO with syn / filter / amp and parameters param1, hi pass, volume, pan                                     |
| T6 tape (14)           | a reel icon and speed % (CC13: 50–200 %; 63 → 99 %, 64 → 101 %); a tape strip with a length digit 1–16 (CC14); mix (CC15, 00–99); CC12 small change                                                                                            |                                                                                                                                                                                                                                                                      |
| T7 FX I (15)           | "FX I" boxed plus the type; four columns 100 px wide at x 40, 140, 240, 340, labels above and values below, partial strips at both edges; each column a bar split by a marker at the value's height                                            | types (shift + T7 lists them): chorus (rate, depth, feedback, stereo), delay (size, shown as a note value such as "1/8 dotted"; fine, feedback, dry), dist (…, clip, lo cut, hi cut), lofi, phaser (frequency, depth, rate, feedback), reverb (size, mod, tone, dry) |

## 3. MIDI reach on 1.1.33 (verified on screen)

| Answers                                                                                                                                                                                                                                                 | Ignores                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| synth engines M1 CC 12–15; M2 CC 20–27; M3 CC 32–35; M4 CC 40–43 (all LFO types); mixer CC 7, 10; tempo CC80, groove CC81; EQ CC90 ch 1–3; brain CC 12–15; ext MIDI CC 12–14 and 40–43; ext audio CC 13–15, 32, 35, 40–43; tape CC 12–15; FX I CC 12–15 | drum / synth / multi sampler M1 CC 12–15; ext CV CC 12–15; brain CC 32, 35; EQ CC90 ch 4 (nothing visible) |

Not tested on purpose: ext audio CC12 (input select: could open the mic and feed back).

## 4. Still to capture (next session)

- **Sequencer:**
  - step components (shift + step, each white key, value pages);
  - recording and count-in screens;
  - FX II;
  - the hold ribbon while latched;
  - song-mode loop (E1).
- **System:**
  - project view, settings and folder (browse only);
  - com pages (system, devices, MIDI, MTP);
  - preset settings;
  - the volume-knob popup;
  - sampling flows.
- **Drum track:** M2–M4 pages.
- **Mixer:** mute and solo on M1.
- **Instrument:** the M2 shift layer swept by CC 28–31.
- **Readings:** the external CV needle with notes; the filter page's value box (which parameter it
  shows).
- **Sounds over USB audio:** punch-in FX, the tape, filters and LFOs (`QUESTIONS.md` 5 and 7), and
  envelope decay and release times against the new handle model.
- **Before starting:** calibrate on the tempo page, `check` it every ~30 minutes, and keep the device
  on a non-slip surface.

## 5. Captures (local)

`research/device/captures/screens/` (git-ignored; 9.6 GB):

- **`env-*`**: first envelope sweep (lagged one step).
- **`env2-amp-*`, `env2-filter-*`**: the envelope runs, with an index of states in
  `env2-*.json` and `*-4x.png` grey versions for fitting.
- **`steps-NNNN-<label>-ccXX-VVV.png`**: every CC capture; `steps.json` maps file → label, CC,
  latency.
- **`b1-NNNN.png`**: the watcher's settled screens (`b1.json`: times restart after midnight). By step:

  | Frames     | Step                        |
  | ---------- | --------------------------- |
  | 69–96      | mixer sends                 |
  | 136–170    | EQ                          |
  | 171–204    | saturator                   |
  | 205–253    | master                      |
  | 254–283    | octave                      |
  | 284–379    | arpeggio                    |
  | 380–402    | player list                 |
  | 403–429    | hold                        |
  | 430–475    | maestro                     |
  | 476–550    | bar                         |
  | 551–649    | step entry and the bar card |
  | 650–720    | held steps and locks        |
  | 721–837    | arrange and scenes          |
  | 838–874    | song mode                   |
  | 875–991    | punch-in (white keys)       |
  | ~1380–1556 | engine picker and presets   |
  | 2452–2585  | drum                        |
  | 2611–2702  | sampler                     |
  | 2703–2775  | multisampler                |
  | 2776–2819  | M2 shift layer              |
  | 2917–3108  | filter types                |
  | 3846–3915  | tempo by hand               |
  | 3984–4036  | brain routing               |
  | 4103–4159  | ext MIDI slots              |
  | 4242–4329  | CV and ext audio            |
  | 4640–4780  | FX types                    |

- **`punch-black/`, `punch-white/`**: 10 fps, every punch-in key.
- **`dissolve-anim/`**: the dissolve and hardsync animations, then the whole session 00:05–01:10 at
  10 fps (see §1.5).
