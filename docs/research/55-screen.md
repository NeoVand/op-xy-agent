# 55 — The OP–XY screen: pixels, type, pages and our UI simulator

> Research note for the OP–XY Agent (milestone M2.5, decisions D9 and D10). Scope: what the OP–XY's
> 480 × 222 display shows and how we reproduce it without the firmware. That covers the pixel grid,
> colours, type, pictograms, layout patterns, a page catalogue and the UI state machine our simulator
> implements. Written 2026-09-26, updated 2026-09-27 when the areas landed. **Nothing was sent to
> the device.** All text is our own wording.
> The measurements come from TE's public guide screen illustrations, which live in the git-ignored
> `research/ui-reference/guide-svg/` and `guide-screens/` (fetched by `scripts/fetch-research.sh`).
>
> **Confidence tags:** **measured** = read off TE's vector illustrations with our scripts (numbers are
> reproducible); **manual** = stated in our manual units (`knowledge/manual/units/**`, reworded from
> TE's guide); **inferred** = our reasoning; **unknown** = needs a photo of the real screen (§9).

---

## TL;DR

1. **Grid.** TE draws every screen page on a **480 × 220 px** grid. The panel has 222 rows (the value
   in `controls.json`), so we draw the pages one row down, which leaves a blank row above and below.
   The guide SVGs frame each page in a 215 × 98.54 unit rectangle, which is 2.2326 px per unit
   (0.4479 units per px). Corners are rounded at r = 8 px. Element edges fall on whole pixels, 1 px
   strokes on half pixels, and layouts snap to 5 px (measured).
2. **Colours.** An eight-step grey ramp from black to #f7f5f5 carries almost everything. The four
   encoder colours are dark #0f0e12, mid #484850, light #96969b and white #f7f5f5 (a ring on white
   cards). Red is rare: #e5371b marks the active pattern box in arrange, and #ff4d00 marks record dots
   and thresholds when sampling (measured).
3. **Type.** One light grotesque in four main sizes: **10 px** labels, **20 px** body text, lists and
   values, **40 px** titles and readouts, **50 px** BPM. Figures are tabular (0.545 em). We extracted
   **63 glyphs**: all lowercase letters, all digits, `# + - . / : – [ ]`, 15 capitals and the `ff`,
   `ffl` and `fi` ligatures. They go into `knowledge/opxy/screen-font.json` with metrics, one kerning
   pair and per-glyph sample counts (measured, §3).
4. **Pictograms.** We cut **49 icons** and one cell pattern (dissolve's noise field) from the art into
   `knowledge/opxy/screen-icons.json`. That covers the metronome, pen nib, six engine pictures, card
   icons, LFO pictures and the COM device view (§4).
5. **Renderer.** `src/lib/sim/screen/` is made of pure drawing functions on an injectable 2D context
   (canvas in the app, a recording mock in Node tests, an SVG context for previews). A declarative
   `ScreenFrame` goes in, one page comes out.
6. **Simulator.** `OpxySim` (`src/lib/sim/opxy-sim.svelte.ts`) turns the replica's press, release,
   turn and click events into frames and LED states. The core keeps the modes, tracks, transport,
   tempo and the instrument pages; six **areas** (`src/lib/sim/areas/`) cover the rest: system
   (power, project, COM, presets), sample (sampling, slicer, library, sampler pages), sequencer (bar
   menu, step components, locks, recording, players), mixer (M1–M4), arrange (patterns, scenes,
   songs) and auxiliary (the eight aux tracks). It follows the manual (§7) and is pinned by a
   conformance suite written from TE's guide (§10).
7. **Accuracy.** The comparison tool puts 53 of TE's illustrated states side by side with ours: 35
   are within 1 % mean absolute difference, most of the rest for reasons in TE's own pictures (§8).
   Pages TE never drew use our layouts in its visual language.

---

## 1. Pixel grid (measured)

| Quantity     | Value                                      | Notes                                              |
| ------------ | ------------------------------------------ | -------------------------------------------------- |
| Design grid  | 480 × 220 px                               | every guide screen, frame = first shape of the SVG |
| Panel        | 480 × 222 px                               | `controls.json`; drawn with `SCREEN_OFFSET_Y = 1`  |
| SVG scale    | 215 units = 480 px → 2.2326 px/unit        | 0.4479 units per px; heights 98.54 units = 220 px  |
| Frame        | black, r = 8 px corners                    | the tempo page's frame is grey #7d7d7d             |
| Snap         | fills on whole px, 1 px strokes on half px | e.g. the filter axis at x 30.5 … 450.5             |
| Rhythm       | 5 px                                       | cards at multiples of 5, 10 px dots, 20 px rows    |
| Header cells | 8 × (60 × 20 px)                           | 480 / 8                                            |

The guide PNGs are renders of the same SVGs at 2× (≈ 960 × 444). They include the panel's extra rows
and some rounding, so we compare against the SVGs instead (§8).

## 2. Palette (measured)

| Token (`palette.ts`) | Colour                                                          | Where                                                   |
| -------------------- | --------------------------------------------------------------- | ------------------------------------------------------- |
| `RAMP[0…7]`          | #000000 #2f2f37 #484850 #616169 #7a7a82 #96969b #afafb4 #f7f5f5 | header cells, mixer strips, filter bands (subset)       |
| `ink`                | #0f0e12                                                         | the dark encoder, text and outlines on white cards      |
| `panel`              | #16161e                                                         | the filter's lowest band                                |
| `white`              | #f7f5f5                                                         | cards, main text, the white encoder                     |
| `light`              | #afafb4                                                         | secondary text, axis labels, available soft labels      |
| `dim`                | #646464                                                         | soft labels that are not the main action (project page) |
| `card`               | #cdcdcd                                                         | the COM page's device card, selected radio ring         |
| `tempo`              | #7d7d7d                                                         | the tempo page's background                             |
| `chrome`             | #c5c6cc                                                         | the metronome's pendulum, weight and hands              |
| `red`                | #e5371b                                                         | arrange: the active pattern box                         |
| `record`             | #ff4d00                                                         | sampling: record dot, level threshold                   |

**Encoder colours on cards:** dark = a filled #0f0e12 dot, mid = #484850, light = #96969b, white =
a 1 px ink ring. Each dot is 10 px across, 5 px in from the card's top-left corner (6 px on the LFO
speed card). The header bar tints the four encoders' cells with ramp steps 0–1, 2–3, 4–5 and 6–7.

## 3. Typography (measured)

**Face.** Every piece of text on the screen is one light, geometric grotesque. The proportions are
close to a light Univers: x-height 0.512 em, cap height 0.724 em, a single-storey `g`, straight-legged
`R`. There is no bold. The capitals seen in the art are C F G H I K L O P Q R S T V X. Lettering in
pictograms (the voltmeter's V, the arrange icons) is heavier and was left out.

| Metric (units per em 1000) | Value     | Metric         | Value         |
| -------------------------- | --------- | -------------- | ------------- |
| ascender                   | 723       | descender      | 183           |
| cap height                 | 724       | x-height       | 512           |
| space                      | 271       | figure advance | 545 (tabular) |
| kerning                    | `11` −156 | ligatures      | ffl, ff, fi   |

**Sizes.** Across 436 labelled strings the solved sizes cluster at **10 px** (125 strings: card and
header labels, axis labels), **20 px** (287: body text, lists, values, soft labels), **40 px** (10:
titles, project name, big readouts) and **50 px** (the BPM). There are odd ones at 13, 17 and 18 px (the
sampler's L/R badges are 17.5). Tracking varies by style: titles run about −1.7 to −3 %,
some 10 px labels +1.6 %, and the BPM −6.7 %. The renderer takes tracking per call.

**How we got the glyphs** (`scripts/extract-screen-font.mjs`, re-runnable, no dependencies beyond the
repo's):

1. We parse each guide SVG (paths, rects, circles, groups, inline masks) and map it to screen pixels
   through the frame.
2. We group filled, unstroked, text-sized shapes into runs (neighbours no further apart than 0.6 of
   the smaller height, with enough vertical overlap and similar heights). Dots and accents join their
   letters.
3. We give each screen its known labels (`LABELS`: the words the guide text and the picture show,
   with optional position hints) and match runs to them. Matched shapes name their glyphs.
4. We solve sizes by alternating least squares on height = glyph height × string size. The solve is
   anchored so list text is 20 px, with height classes for flat and round capitals.
5. We solve spacing by robust least squares (Huber, IRLS): gap = rsb(a) + lsb(b) + tracking(string),
   plus the space where there is one. Figures are constrained to be tabular, and there are priors for
   sparse glyphs and symmetric shapes.
6. For each glyph we pick the most typical outline sample, seat it on its median baseline, and write
   the outlines in font units with advance, bounding box and sample count.

Results: the spacing residual has a median of 1.5 units, and figures fit tabular spacing to a median of
2.1 units. The script's `--check` mode confirms that the committed JSON regenerates byte for byte, and
a Node test runs it when the research input is present.

**Coverage and gaps.** Printable ASCII not in the art: ``! " $ % & ' ( ) * , ; < = > ? @ A B D E J M
N U W Y Z \ ^ _ ` { | } ~``. The renderer draws missing characters with Work Sans 300 (`fillText`),
so they look close but not identical. Groove abbreviations such as "BO" or "WO" hit this fallback.

## 4. Iconography (measured)

`screen-icons.json` stores each pictogram as paths in screen pixels relative to its box. Each path
keeps its fill, stroke, width, caps, evenodd flag, opacity and TE's masks as clip paths. An icon is
"every shape inside a box on a named screen, minus text", with options to exclude sub-boxes, filter
shapes, drop a page's 50 % dim (`opaque`) and take masked shapes that overhang the box (`masked`, for
the COM page's device view).

| Group    | Icons                                                                                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| tempo    | metronome, speaker, jack, slider thumb                                                                                                                             |
| engines  | prism, wavetable, axis, epiano, hardsync, simple, organ (drawbar chips); dissolve = cell pattern (48 × 20 cells of 10 px, 3 greys)                                 |
| midi     | DIN socket, arrow, "none" cross                                                                                                                                    |
| sampler  | tune note, direction, pan rails, fade, gain                                                                                                                        |
| M2 shift | play mode: poly, portamento, bend, volume                                                                                                                          |
| M3       | key-tracking arrow; sends: aux, tape, FX I, FX II                                                                                                                  |
| M4       | clock, syn wave, free wave, env, knob-on-curve, triplet, sixteenth, ramp, saw, pulse, ADSR, filter, duck source (audio / notes), duck signal, element motion curve |
| project  | pen nib, usage (voices, CPU, memory)                                                                                                                               |
| COM      | device seen from above, "adv" badge                                                                                                                                |

## 5. Layout patterns (measured)

- **Header bar** (engine pages): eight 60 × 20 cells in ramp order. Each encoder owns two cells: a
  10 px label at cell x + 5 (baseline 10), then its value, 20 px at x + 65 (baseline 17.75). Text is
  white on the dark half and black on the light half. Values are two digits ("00", "80"). TE's art for
  axis, organ and simple has no ramp; see §9.
- **Engine picture**: from y = 20.5 down to the bottom. It is TE's drawing, except dissolve (cells)
  and organ (drawbar rails at centre ± 12.5 and ± 10, stops 8…1 in #afafb4, and a chip per encoder in
  its tone at y = 165).
- **Soft labels** over M1–M4: 20 px, centred at x = 40 / 175 / 310 / 440, baseline 215. The tones are
  white (the key's main action), #afafb4 (available) and #646464 (secondary).
- **Cards** (play mode, sends, LFO): white, r = 5. The LFO cards carry a 2.23 px ink edge (1.12 px on
  duck) that reads as a seam where cards touch. Each card has its encoder's dot and a 10 px label
  above it at x + 5, baseline 45 (or 182.5 below a lower row).
- **Shift layers** (M2 play mode, M3 sends): the page stays underneath at 50 % opacity. Four
  200 × 35 cards sit 40 px apart (play mode at x 140, y 35; sends at x 155, y 30). Each card holds an
  icon at the left, a 20 px value at card x + 65 (baseline card top + 25) and the dot at card x + 185.
- **Lists** (preset browser, settings, engine picker): 20 px rows with the first baseline at 30.6.
  Columns show the selection by level: section = outline, setting = dark #2f2f37 fill, value = white
  fill with black text. Scroll bars are thin rules with a thumb.
- **Envelope graph** (M2): x from 40 to 440.5, levels from 200 (floor) to 25 (peak). The attack gets a
  98.5 px slot and holds at the peak; decay starts at x = 138.5 and runs up to 87 px; release is
  anchored at the right edge and grows left by up to 85.5 px; sustain fills the rest. The amp
  envelope is labelled "env" and the filter envelope "mod", scaled by the M3 envelope amount (at
  least 25 %). The edited envelope is white with five 5 px handles; the other is #484850.
- **Filter graph** (M3): the frequency axis is piecewise-log. The anchors are 50 Hz → 30.5,
  1 kHz → 160.5, 2 kHz → 245.5, 5 kHz → 330.5 and 20 kHz → 450.5. The response is filled in four bands
  (#16161e, #2f2f37, #484850, #96969b) split at 1K, 2K and 5K, each edged in black. The line is flat at
  47.5 until 40 px before the cutoff. It then rises into the resonance peak at the cutoff (up to 27 px
  higher) and falls through TE's two Bézier segments to its resting level, 157.5, 63 px later. The
  envelope amount widens the fall (TE's swept curve reaches 91 px). The area between the two curves
  is hatched at 45° every 5 px in #96969b, with a #616169 handle 45 % across it at mid-fall. A black
  40 × 25 "Q" box sits on the cutoff at y = 87.5. Below the graph are the axis labels (10 px, #afafb4,
  baseline 172.5) and "key" with an arrow whose strength shows key tracking.
- **LFO rulers**: ticks every 5 px (1.12 px, 10 px long, a 20 px zero tick at the middle) and a
  30 × 10 pentagon pointer whose tip marks the amount (−100…100 across the card's height).
- **Mixer**: eight full-height strips in ramp order. The level is a bar at y = 205 − 180 × level,
  0.56 px thick at rest and up to 13 px with output; it is white on strips 1–2 and black on the rest.
  Muted strips are hatched. The selected strip shows its number (20 px, y = 20) and a pan dot along
  the bottom.
- **Drum sampler**: two lanes (L at y 30, R at y 125, 480 × 90, #2f2f37). A waveform is drawn in
  2.1 px columns; the stand-in has no audio, see §9. There is a grey start marker and a white end
  marker, each with 10 × 5 handles at the lane edges, and a fade wedge (30 % black) before the end.
  The top row shows the tune (main layer), or direction, L/R pan, fade and gain with shift.

## 6. Page catalogue

Status key: **exact** = drawn from TE's art, compared in §8; **reconstructed** = TE shows this page
only dimmed under a shift layer, so it was rebuilt from that; **ours** = no art, our layout; **text**
= a named placeholder (`TextFrame`) until we have art or a photo.

| Mode / page                                                       | Base layer                                        | Shift layer                      | Status                                       |
| ----------------------------------------------------------------- | ------------------------------------------------- | -------------------------------- | -------------------------------------------- |
| tempo (any mode)                                                  | BPM, groove, swing, metronome                     | —                                | exact                                        |
| project (any mode)                                                | name, usage icons, new/save/rename/config         | M2: save as                      | exact; sub-pages text                        |
| com (any mode)                                                    | device + adv, multi-out, charge                   | —                                | exact; system/ctrl/devices/mtp text          |
| instrument M1, synth                                              | header + engine picture (8 engines)               | picker: shift + M1 engine list   | exact (axis/simple/organ header, §9)         |
| instrument M1, drum                                               | tune, key, play mode + lanes                      | direction, pan, fade, gain       | shift exact; main layer ours                 |
| instrument M1, sampler / multisampler                             | tune, root + lanes                                | same as drum                     | close (no loop markers)                      |
| instrument M1, midi                                               | channel, bank, program                            | —                                | exact                                        |
| instrument M2                                                     | amp / filter envelope (click swaps)               | play mode cards                  | shift exact; base reconstructed              |
| instrument M3                                                     | filter graph                                      | send cards; shift + M3 type list | shift exact; base reconstructed              |
| instrument M4                                                     | value, random, tremolo, duck, element             | shift + M4 type list             | exact                                        |
| mix M1                                                            | eight strips, pan of the selected                 | shift: LEDs show unmuted tracks  | exact (meters differ at rest)                |
| mix M2–M4                                                         | EQ, saturator, master                             | —                                | ours (no art)                                |
| midi M2 / M3                                                      | CC sets I and II                                  | —                                | ours (no art)                                |
| auxiliary M1–M4                                                   | brain, punch-in, ext midi/cv/audio, tape, FX I/II | effect list (shift + T7/T8)      | exact (8 pictures); routing/filter/LFO ours  |
| arrange                                                           | tracks and patterns, scenes, songs                | scene keys, queue                | exact (3 pictures)                           |
| sample (key, record, slicer, library)                             | record pages, slicer modes, library               | channel (shift + E1)             | exact (11 pictures)                          |
| bar menu, step components, players, lock view                     | bars, scale, length, components, arp/maestro/hold | player's second layer            | ours (no art)                                |
| project folder, settings, COM sub-pages, boot                     | lists, devices, controller, MTP                   | —                                | exact (7 pictures); naming/confirm/boot ours |
| preset browser (shift + Tn), preset settings (shift + instrument) | lists                                             | —                                | exact (instrument-103/118)                   |

## 7. UI state machine (manual)

The simulator's state is one plain object (`SimState` in `src/lib/sim/params.ts`). It holds the
mode, an overlay (tempo / project / com / sample / players / bar), the M-page per mode, shift, the held
keys, the active instrument and auxiliary tracks, the bank the arrange and mix pages address, a
picker, a named sub-page, eight instrument tracks and eight auxiliary strips, tempo, transport,
project, COM and tap times. `buildFrame(state)` and `buildLeds(state)` are pure.

**Keys.**

- `instrument` / `auxiliary` choose the mode and the set the track keys address. `shift + instrument`
  opens preset settings (text).
- `arrange` / `mix` choose the mode. Pressed again, they swap between instrument and auxiliary tracks
  [basics/main-modes].
- `tempo` opens the tempo page from anywhere. Further presses tap the tempo: the mean of up to three
  intervals, taps more than 2 s apart restart, and the result is limited to 40–220 BPM
  [tempo/tempo-screen].
- `project` and `com` toggle their pages, where M1–M4 open the soft-key sub-pages [project/project-view,
  com/overview]. `sample`, `player` and `bar` toggle their (text) pages.
- M1–M4 choose the page and close tempo, sample, players and bar. On instrument tracks,
  `shift + M3 / M4` opens the filter or LFO type list: turn to choose; click E1, or press the key
  that opened the list (ours), to load; any other M key leaves [basics/modules]. `shift + M1` opened
  our engine list the same way (the guide's) until the owner's unit showed that OS 1.1.33 brings up
  the preset browser there instead (research 59 §2.6), which the replica now draws; an engine loads
  as one of its presets.
- Holding `shift` shows a page's second layer: drum sampler settings on M1, play mode on M2, sends on
  M3 [instrument/play-mode, instrument/track-sends].
- T1–T8 select the track in the current set, lit white (instrument) or red (auxiliary)
  [basics/track-buttons]. `instrument + Tn` / `auxiliary + Tn` mute. In mix, `shift + Tn` mutes and, while
  shift is held, unmuted tracks light [mix/mute-solo]. `shift + Tn` elsewhere opens the preset browser
  (text). In instrument mode, a track key pressed while another is held links it to the held one (four
  tracks at most; again unlinks, ours): the held track stays active, its links glow dim while it is
  held [basics/linked-tracks].
- Step keys toggle the active track's steps (white).
- Keyboard keys light while held and, on sampler tracks, select the key being edited.
- `play` toggles the transport, `stop` stops and rewinds, `record` toggles recording.

**Encoders** (turn = whole detents; push-turn is marked fine):

| Page                    | E1                               | E2                 | E3                   | E4              | Click                      |
| ----------------------- | -------------------------------- | ------------------ | -------------------- | --------------- | -------------------------- |
| tempo                   | BPM ±1 (fine ±0.1)               | groove type        | swing / shuffle      | metronome level | E4: metronome on/off       |
| com                     | bluetooth advertise              | —                  | multi-out mode       | charging        | E1: advertise on/off       |
| M1 synth                | P1 0–99                          | P2                 | P3                   | P4              | —                          |
| M1 drum                 | tune ±0.1 (fine 0.01)            | sample start       | sample end           | play mode       | —                          |
| M1 drum + shift         | direction                        | pan ±2 (fine 1)    | fade                 | gain −30…20 dB  | —                          |
| M1 midi                 | channel 1–16                     | bank (none, 0–127) | program 1–128        | —               | —                          |
| M2                      | attack                           | decay              | sustain              | release         | any: amp ↔ filter envelope |
| M2 + shift              | poly / mono / legato             | portamento         | bend range (0 = off) | preset volume   | —                          |
| M3                      | cutoff                           | resonance          | envelope amount ±99  | key tracking    | —                          |
| M3 + shift              | aux out                          | tape               | FX I                 | FX II           | —                          |
| M4 value and random LFO | speed (synced counts, then free) | amount ±99         | destination          | parameter       | E4: next parameter         |
| M4 random + shift       | —                                | envelope ±99       | —                    | —               | —                          |
| M4 element              | source: gyro, mic, env, sum      | amount ±99         | destination          | parameter       | E4: next parameter         |
| M4 tremolo              | speed                            | vibrato            | volume               | envelope ±99    | —                          |
| M4 tremolo + shift      | —                                | shape              | —                    | —               | —                          |
| M4 duck                 | source: tracks 1–16, metronome   | amount             | hold                 | release         | E1: audio ↔ notes          |
| M4 duck + shift         | audio ↔ notes                    | —                  | —                    | —               | —                          |
| mix M1                  | FX I send                        | FX II send         | pan                  | level           | E3: centre pan; E4: mute   |
| picker                  | move                             | move               | move                 | move            | E1 or its M key: confirm   |

**LEDs.** Only track, step and keyboard keys have LED windows (`controls.json`). The simulator lists
all 48 on every update, so applying its map also turns off what went dark. The playhead chases over
the steps while playing: an empty step lights white, a step with a note dims (inferred).

**Defaults (manual or art).** New project: 120 BPM, T1–T2 drum, T3 prism, T4 epiano, T5 dissolve, T6
hardsync, T7 axis, T8 multisampler. Engine values are 80 as in TE's art (dissolve 49/52/90/00, simple
80/80/00/00). The envelopes are TE's M2 art, play mode is poly / off / 1 semitone / 44, the filter is
svf fully open, and the metronome is off at full level.

**Areas and time.** Everything past the core pages lives in an area (`src/lib/sim/areas/types.ts`):
the areas are asked in turn (system, sample, sequencer, mixer, arrange, auxiliary) whether they own
the screen, every input goes to each area's `claim` first (for gestures that start anywhere, such
as holding `bar` or `shift` + a key on the punch-in track), and the owner handles the rest before
the core. Time comes in two kinds: `advance(ms)` is wall-clock time, always, for timers (holds,
flashing LEDs, the record countdown, the boot screen); `moved(from)` follows the transport as it
moves, by the page's clock, the sound's audio clock or a connected OP-XY's MIDI clock, so arrange
changes scenes on the same beat whichever clock drives it.

## 8. Accuracy against the art (measured)

Every drawn page has a scenario (`src/lib/sim/scenarios.ts` and each area's `scenarios.ts`) that puts
a fresh simulator into the state a guide picture shows. `scripts/compare-screens.mjs` renders it at
2×, aligns it with TE's guide PNG within ±3 px and reports the mean absolute luminance difference; it
writes a comparison sheet per scenario (ours, TE's, the difference). The /replica page shows the
same comparison live in dev (`?guide=<id>`). Scenarios for pages TE never drew have `png: null`.

| State            | MAD    | State              | MAD    | State          | MAD    |
| ---------------- | ------ | ------------------ | ------ | -------------- | ------ |
| aux-midi         | 0.09 % | wavetable          | 0.12 % | aux-audio      | 0.10 % |
| aux-cv           | 0.18 % | sample-drum-record | 0.18 % | duck           | 0.21 % |
| element          | 0.24 % | aux-fx             | 0.27 % | sample-library | 0.28 % |
| sampler          | 0.32 % | prism              | 0.35 % | arrange-song   | 0.38 % |
| tremolo          | 0.39 % | sample-file        | 0.41 % | tempo          | 0.44 % |
| sample-key       | 0.48 % | aux-brain          | 0.54 % | project-config | 0.54 % |
| organ            | 0.55 % | value              | 0.55 % | aux-punch      | 0.59 % |
| arrange-tracks   | 0.61 % | project            | 0.61 % | project-folder | 0.63 % |
| random           | 0.69 % | playmode           | 0.70 % | midi           | 0.73 % |
| com              | 0.80 % | preset-browser     | 0.80 % | sends          | 0.84 % |
| dissolve         | 0.87 % | project-usage      | 0.88 % | com-devices    | 0.95 % |
| preset-settings  | 0.97 % | aux-tape           | 0.98 % | arrange-scenes | 1.11 % |
| hardsync         | 1.31 % | sample-tap         | 1.51 % | epiano         | 1.54 % |
| sample-transient | 1.56 % | sample-slice       | 1.63 % | mix            | 1.70 % |
| drum             | 1.75 % | sample-even        | 1.98 % | sample-multi   | 2.06 % |
| aux-brain-song   | 2.08 % | com-mtp            | 2.41 % | com-controller | 2.59 % |
| sample-multi-rec | 3.36 % | simple             | 3.94 % | axis           | 4.25 % |
| com-system       | 5.58 % | sample-lib-keys    | 7.43 % |                |        |

Known causes above 1 %: TE's PNG for some pictures is slightly scaled or offset (com-controller and
com-mtp are 0.60 % and 0.50 % against the SVG cropped to the screen; drum, sample-even,
sample-multi and sample-multi-record measure 0.20–0.55 % that way); com-system's picture is filled
with placeholder rows; sample-library-keys dims the page to annotate it; aux-brain-song and
arrange-scenes use TE's later, lighter palette; axis and simple keep the grey header ramp their
art lacks; the slicer pages show a stand-in waveform; epiano's and hardsync's headers carry the
engines' real parameter names; mix meters are thin at rest where the art shows tracks playing.

## 9. Gaps: where the real screen would settle it

TE's guide has no art for these, or the art disagrees with the manual. A look at the unit settles
each (read-only; the list for the owner is in `docs/QUESTIONS.md`):

1. **Our layouts:** mix M2–M4, the midi engine's CC pages, the bar menu, step components, players,
   the lock view, the auxiliary routing / filter / LFO pages, naming, confirm, boot and history; on
   the LFO page, the envelope's ramp at other values than TE's full fade-in, element's source letters
   other than G, and duck's metronome source.
2. **Soft-key order:** arrange's patterns page and the projects folder (TE's text puts new / load on
   M1, its art the reverse; we follow the text).
3. **M2 envelopes and M3 filter without shift.** Reconstructed from the dimmed layers.
4. **Engine headers.** Is the grey ramp there on axis, organ and simple?
5. **Playback LEDs.** Does the playhead dim a step with notes and light an empty one?
6. **Groove abbreviations** (only "SH" is known) and the metronome with the click off.
7. **Glyphs** TE's art never shows: `%`, `(` and `)` draw in the fallback face.
8. **Rows 221–222.** Confirm that the panel's two extra rows are blank.

## 10. Where things live

| Path                                                 | What                                                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `scripts/extract-screen-font.mjs`                    | font + icon + pattern extraction (`--check`, `--runs`, `--instances`)                                   |
| `scripts/screen-art/<area>.mjs`                      | each area's icon table for the extraction                                                               |
| `knowledge/opxy/screen-font.json`                    | 63 glyphs, metrics, kerning, ligatures, coverage                                                        |
| `knowledge/opxy/screen-icons.json`, `screen-icons/`  | the core's pictograms and dissolve's pattern; one icon file per area                                    |
| `scripts/compare-screens.mjs`, `compare_screens.py`  | every scenario against TE's guide PNG: MAD and comparison sheets (§8)                                   |
| `src/lib/sim/screen/`                                | renderer: context, palette, font, icons, draw helpers, pages, `renderFrame`, recording and SVG contexts |
| `src/lib/sim/params.ts`, `frames.ts`                 | the core model and state → frame / LEDs                                                                 |
| `src/lib/sim/areas/<area>/`                          | each area's state, frames, input (`sim.ts`), drawing and scenarios; `registry.ts` orders them           |
| `src/lib/sim/sequencer.ts`, `sequencer-playback.ts`  | patterns, steps, components, locks; what a step plays and how the playhead walks                        |
| `src/lib/sim/opxy-sim.svelte.ts`                     | `OpxySim`: input, frame, LEDs, time (`advance`: timers; `moved`: transport)                             |
| `src/lib/sim/conformance/`, `src/lib/sim/testing/`   | conformance cases written from TE's guide, run by `SimDriver` (Node) and `AppDriver` (the app, browser) |
| `src/lib/app/simulator.svelte.ts`, `sound.svelte.ts` | the app's virtual OP-XY (page clock, LEDs, device clock) and its sound (`src/lib/sound/`)               |
| `src/lib/replica/Screen.svelte`                      | draws frames (lazy-loaded renderer), text fallback                                                      |
| `src/routes/replica/`                                | the dev bench: simulator wiring, compare card (`?guide=<id>`)                                           |

## Sources

| Key          | Source                                                                                                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TE-GUIDE     | Teenage Engineering, OP–XY guide, <https://teenage.engineering/guides/op-xy> (screen illustrations in `research/ui-reference/guide-svg/`, indexed by `guide-screens/index.json`) |
| manual units | `knowledge/manual/units/**` (our reworded manual; unit ids in square brackets above)                                                                                             |
| controls     | `knowledge/opxy/controls.json` (screen resolution, LED windows)                                                                                                                  |
| cc map       | `knowledge/midi/cc-map.json` (engine parameter names, default engines)                                                                                                           |
