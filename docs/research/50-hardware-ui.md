# 50 — OP–XY hardware & UI: the replica spec

> Research note for the OP–XY Agent (see `docs/VISION.md`). Scope: everything needed to build a
> **1:1 interactive replica** of the OP–XY (panel, keys, encoders, LEDs, legends, screen and its pages),
> plus a reference-asset inventory. Written 2026-09-26 by a research agent. **Nothing was sent to the
> device.** All text is our own wording; TE material is cited, never copied. Reference images live in
> the git-ignored `research/ui-reference/` and `research/web/ui/` (decision D1).
>
> **Confidence tags:** **measured** = derived by us from TE's own vector drawings or orthographic
> product renders (numbers reproducible with the scripts described in §7.4); **official** = stated by
> TE; **community** = third-party source; **inferred** = our reasoning; **unknown** = needs the owner's
> device (see §8). Citation keys resolve in the **Sources** table at the end.

---

## TL;DR

1. **Size.** Official 288 × 102 × 29 mm, 900 g [TE-STORE]. The 288 mm **includes the 3 mm power-switch
   tab**; the body itself is **285.0 × 102.0 mm**. The 29 mm runs from the feet to the top of the volume
   knob. The chassis slab is ≈ 9.5 mm thick and the keycaps stand ≈ 17.9 mm off the table
   (measured [TE-LAYOUT-SVG][TE-SIDE]).
2. **Grid.** The whole top panel is a **17 × 6 grid of square tiles at a 15.5 mm pitch**. The grid is
   inset 4.4 mm from the left, top and bottom edges, with a 16.9 mm right margin that holds the mic, the
   level meter and the logo. Every control snaps to this grid. The accidental (black) keys sit on
   **tile boundaries**, half a pitch off (measured).
3. **68 keys** [TE-PRODUCT], **4 grayscale encoders + 1 volume pot**, a pressure-sensitive pitch-bend
   pad on the front edge, and a 480 × 222 IPS screen (the guide says 480 × 220; see §3.1). **48 keys
   have a round LED window**: 8 tracks, 16 steps and all 24 keyboard keys (measured). The encoders are
   **tall knurled knobs with coloured caps** (dark grey, mid grey, light grey, white) rising from a
   17 mm dish, not flat discs (measured [TE-SIDE]).
4. **Colour system.** A black anodized body. A **grayscale ramp** is the design motif, and the same
   8 tones appear on the step tiles (as pairs), the encoder caps and the screen's parameter headers. Red
   is the only accent, used for record, aux tracks, the record cursor and alerts [TE-PRODUCT][TE-GUIDE].
5. **Screen UI.** Grayscale plus sparing red. A light Univers-style sans. Pages are built from a few
   primitives: an 8-tone header bar, white "cards", three-column lists, and soft-key labels in four
   quarters that line up with **M1–M4, which sit directly under the screen**. Each on-screen parameter
   carries a small dot whose fill names its encoder. **53 unique screen illustrations** exist in the
   guide (rendered in `research/ui-reference/guide-screens/`). Many pages have none.
6. **Fonts.** TE's house face is **Univers TE20 Light** (Linotype, licensed; the site's `TE20L.woff2`).
   We must not ship it, and Mitch's demo does. Use an OFL substitute (§4.2) and draw the key legends as
   our own vector paths.
7. **Recommendation.** Put **one parametric panel model in millimetres** at the core, with two
   renderers. First, an **SVG/DOM replica**: canonical, accessible, used for teaching overlays, and the
   default on mobile. Second, a lazy-loaded **Three.js studio view**, built procedurally from the same
   model, for the "gorgeous" moments. The screen is a **Canvas 2D renderer at logical 480 × 222 × DPR**
   shared by both, with pages written as pure draw functions of state (§6).
8. **Assets.** Draw everything ourselves: legends, icons, screen pictograms, speaker pattern. Geometry
   numbers and colour values are facts we may use. TE photos, guide SVGs/PDF, fonts and logos are
   **reference only**. `research/ui-reference/` is already git-ignored.
9. **Biggest unknowns** (§8): the LED colour set and dim/blink behaviour, whether legends are
   backlit, key travel, encoder detent count, the exact screen resolution (222 vs 220), the level-meter
   segment count, and the white tick on the front edge.

---

## 1. Physical overview

### 1.1 Dimensions

Coordinate system used throughout: **millimetres, origin at the body's top-left corner** (the back-left
corner when the unit lies in front of you), **x → right, y → toward the player** (SVG convention). The
switch tab is excluded.

| Quantity | Value | How we know |
| --- | --- | --- |
| Overall (official) | 288 × 102 × 29 mm, 900 g | official [TE-STORE] (product page: "matches the exact dimensions of OP–1 field" [TE-PRODUCT]) |
| Body footprint (without switch tab) | **285.0 × 102.0 mm** | measured: TE layout drawing outline 731.58 × 261.83 u; scale 0.38957 mm/u from 288 mm = body + tab [TE-LAYOUT-SVG] |
| Body corner radius (plan view) | 5.0 mm | measured [TE-LAYOUT-SVG] |
| Tile pitch **P** | **15.50 mm** (39.8 u) | measured; cross-checked on the 4096² orthographic render: 189.8 px at 12.25 px/mm → 15.49 mm [TE-TOPDOWN] |
| Tile grid | 17 × 6 tiles = 263.7 × 93.2 mm | measured |
| Grid origin (top-left of tile c0,r0) | (4.41, 4.39) | measured |
| Margins | left 4.4, top 4.4, bottom 4.4, **right 16.9** mm | measured |
| Tile corner radius | 1.25 mm; visible dark gap between tiles ≈ 0.8–1.0 mm (tile ≈ 14.6 mm square) | measured (gap on render ≈ 12 px) |
| Keycap (plan) | Ø 9.4 mm, centred on its tile | measured |
| LED window | Ø 1.75 mm, centre 3.05 mm above keycap centre (toward the back) | measured |
| Encoder dish / knob top ring / coloured cap | Ø 17.0 / 8.1 / 6.5 mm | measured (plan) [TE-LAYOUT-SVG] |
| Encoder & volume knob body | knurled cylinder ≈ Ø 10 mm | measured, side view [TE-SIDE] + guide side drawing |
| Volume knob (plan) | outer Ø 11.0 mm, top Ø 7.9 mm, pointer dimple Ø 1.4 mm | measured |
| Screen tile / active area | tile 62.0 × 31.0 mm (4 × 2 P); active ≈ **55.3 × 25.2 mm**, centred, ≈ 3 mm black bezel | measured on render [TE-TOPDOWN] |
| Speaker grille | 147 holes Ø 1.2 mm on a 2.0 mm square pitch, 13 rows (5, 11, 11, 13 × 7, 11, 11, 7), ≈ Ø 25 mm, centred in its 2 × 2 tile | measured [TE-LAYOUT-SVG] (row counts: verify, §8) |

**Side profile** (measured on TE's orthographic right-side render, 22.99 px/mm [TE-SIDE]; the guide's
side drawings agree to ±0.5 mm):

| Layer (bottom → top) | Height |
| --- | --- |
| Rubber feet (4, corners) | 1.9 mm (velcro rings 1.45 mm) |
| Bottom cover / base plate (inset) | ≈ 2.1 mm |
| Aluminium chassis slab (port panel lives here) | ≈ 9.5 mm |
| Tiles above chassis rim | ≈ 2.4 mm |
| Keycaps above tiles | ≈ 2.0 mm (**keycap top 4.4 mm above rim, 17.9 mm above table**) |
| Encoder cap top | 14.2 mm above rim (≈ 9.8 mm above keycaps) |
| Volume knob top | 15.7 mm above rim (≈ 11.3 mm above keycaps) → **29.2 mm total** ✓ official 29 mm |

### 1.2 Materials and finish

- **Chassis:** black anodized aluminium [TE-HW], bead-blast matte with a soft specular edge on the
  chamfered rim. A review warns it scuffs more easily than the silver OP–1 [MEHATRONIKA].
- **Tiles and keycaps:** matte dark plastic with a fine grain. Each round keycap rises from its square
  tile with a dark ring around its base; the renders suggest a shallow circular well (or a contact
  shadow; verify). Keycap tops are very slightly dished. "Ultra low profile mechanical
  buttons" [TE-PRODUCT], "clickier" than earlier TE devices [MEHATRONIKA], velocity-sensitive (a
  setting) [SOS][TE-GUIDE how-to 22.1].
- **Step row:** tiles *and* keycaps are tinted in an 8-step ramp (pairs of steps share a tone)
  [TE-PRODUCT][TE-TOPDOWN].
- **Encoders:** tall knurled black knobs with a coloured top cap, in a recessed dish. They are detented
  ("clicky", steppy for synth tweaking) [SOS] and push-to-click [TE-GUIDE conventions].
- **Volume knob:** tall knurled black pot with a pointer dimple, top-left [TE-HW].
- **Screen:** "custom made color lcd, mounted directly onto the keyboard" (i.e. a flush black glass
  tile) [TE-HW]; IPS TFT [TE-PRODUCT].
- **Pitch bend:** black rubber pill on the front face, piezo pressure sensing, left half bends down and
  right half bends up [TE-HW][MEHATRONIKA].
- **Underside:** 4 round rubber feet, 2 fabric velcro rings, glossy TE logo, a bass-vent grille under
  the speaker end [MEHATRONIKA][TE-BACK]. Printed text runs along the port edge: port labels with
  in/out arrows, "OP–XY portable synthesizer" in four languages, model TE033AS001 [TE-PORTS].
- **Power switch:** light-grey slider tab on the right edge; green charge LED next to USB-C [TE-PORTS].

### 1.3 Colour palette

Two token sets: **physical** (for the device renderer) and **screen** (for the display). Physical
values are sampled from TE's studio render [TE-TOPDOWN] under a top-to-bottom light gradient.
Treat them as starting points to calibrate against the owner's photos (§8).

| Token | Render-sampled | Suggested token | Notes |
| --- | --- | --- | --- |
| body (anodized) | #232426 – #2b2e33 | `#26282c` | rim highlight ≈ `#45484f` |
| tile gap / recess | #060709 | `#08090b` | |
| tile / keycap (standard) | #2d2e30 – #3f4044 | `#2e2f32` / `#2b2c2f` | keycap a hair darker than tile |
| legend print | #ffffff (render) | `#ecebe7` | real print is warm off-white (verify) |
| step ramp, steps 1–2 → 15–16 | #434448 · #5a6066 · #707479 · #8e9698 · #9a9fa3 · #afafaf · #b7b5b3 · #cecbc9 | same | render gamma/lighting; 3–8 read slightly cool, 11–16 warm (verify) |
| encoder caps 1–4 | #45484c · #7c828c · #b5b5b6 · #e9e9ea | same | dark / mid / light grey / white [TE-LAYOUT] |
| encoder dish | #393b3e – #46484c | `#3a3c3f` | |
| screen bezel glass | #1c1d20 | `#141517` | |
| LED white (lit) | #fdfdfd | `#ffffff` + glow | |
| record legend | #ff2f0e | `#ff3a14` | printed or lit? (§8) |
| power switch | #d0cecb | same | |
| charge LED | #00f551 | same | green |

**TE's own design tokens** (colours used in the guide's vector art [TE-GUIDE-SVG]; they recur
consistently, so they are the best guess at the firmware palette):

| Role | Hex |
| --- | --- |
| ink / outline (also TE web background `rgba(15,14,18)`) | `#0F0E12` |
| warm white | `#F7F5F5` |
| near-black panel | `#16161E` |
| **8-tone ramp** (step tiles, header bars) | `#16161E` `#2F2F37` `#484850` `#616169` `#7A7A82` `#96969B` `#AFAFB4` `#F7F5F5` |
| encoder colours as drawn | `#2F2F37` · `#7A7A82` · `#AFAFB4` · `#F7F5F5` |
| extra greys | `#CDCDCD` `#C4C5C5` `#4B4B4B` `#646464` `#AFAFAF` |
| LED red / record / alerts (orange-red) | `#FF4D00` |
| screen red (active pattern box) | `#E5371B` · tape playhead `#D3472D` |

### 1.4 The grid (plan view)

Columns c0–c16 (x centre = 12.2 + 15.5·c mm) and rows r0–r5 (y centre = 12.1 + 15.5·r mm).
`[ ]` = one tile; wider items span tiles.

```
      c0    c1    c2    c3    c4    c5    c6    c7    c8    c9    c10   c11   c12   c13   c14   c15   c16  | margin
r0  [ speaker   ][ vol knob · · ][          screen           ][  enc1     ][  enc2     ][  enc3     ][  enc4     ][sample]|  mic ∘
r1  [  (2×2)    ][proj][tempo][         (4×2)             ][  (2×2)    ][  (2×2)    ][  (2×2)    ][  (2×2)    ][ com  ]|
r2  [inst][aux ][arr ][mix ][ M1 ][ M2 ][ M3 ][ M4 ][ T1 ][ T2 ][ T3 ][ T4 ][ T5 ][ T6 ][ T7 ][ T8 ][plyr]|  level
r3  [ s1 ][ s2 ][ s3 ][ s4 ][ s5 ][ s6 ][ s7 ][ s8 ][ s9 ][ s10][ s11][ s12][ s13][ s14][ s15][ s16][ bar]|  meter "+"
r4  [ rec][play][stop][num · 1  ][ 2 ][  3     ][    4   ][   5    ][  6     ][ 7 ][   8    ][   9    ][   0    ]|
r5  [  − ][  + ][shft][ F  ][ G  ][ A  ][ B  ][ C  ][ D  ][ E  ][ F  ][ G  ][ A  ][ B  ][ C  ][ D  ][ E  ]|  OP XY
                   ▔▔pitch bend (front face, under c1–c2)▔▔            ▲ white tick (x 144 mm)
```

- The r4 **accidental tiles** split at tile units 3.0 | 4.5 | 5.5 | 7.0 | 8.5 | 10 | 11.5 | 12.5 | 14 | 15.5 | 17.
  That gives widths 1.5, 1, 1.5, 1.5, 1.5, 1.5, 1, 1.5, 1.5, 1.5 P. Each accidental keycap sits **on
  the boundary** between the two naturals below it: F♯ between F and G, and so on. So both keyboard
  rows use the same key size, and the naturals are "shrunk to the size of the accidentals" [SOS].
- The keyboard spans **F to E, two octaves** (naturals F G A B C D E F G A B C D E). This is confirmed
  by the controller-mode note census (F3 = 53 … E5 = 76) [DECK] and the remote-key order "low F →
  high E" [REACT].
- The 14 naturals double as the **14 step-component keys**. The 10 accidentals double as **number keys
  1–9, 0** (the "num" label is printed on the first accidental tile) [TE-GUIDE layout, step components].
- **M1–M4 (c4–c7) sit directly under the screen (c4–c7)**, so on-screen soft labels in four quarters
  line up with them. Each encoder spans two track keys (enc1 over T1–T2, and so on) (measured).
- TE's guide also ships a **portrait** version of this drawing (140 × 391 u, rotated 90°), a useful
  precedent for phone layouts [TE-GUIDE layout, img 2].

### 1.5 Edges, ports and non-key features

| Feature | Position / size | Notes |
| --- | --- | --- |
| **Right edge**, front → back: power switch | centre 20.0 mm from front, 9.9 mm long slider, tab proud 3.0 mm | "flip up" = on [TE-HW]; direction to verify |
| charge LED | ≈ 28 mm from front | green |
| USB-C | centre ≈ 37 mm, ≈ 8.6 mm wide | audio/MIDI host & device [TE-PRODUCT] |
| 3.5 mm **audio in** | 51.0 mm | stereo line-in |
| 3.5 mm **MIDI in** | 61.4 mm | TRS MIDI |
| 3.5 mm **multi-out** | 71.6 mm | printed "MIDI / SYNC"; modes midi, cv+gate, sync8/16/24, audio [TE-HW] |
| 3.5 mm **audio out** | 82.0 mm | headphone/line, headset-mic support [TE-PRODUCT] |
| port row height | 4.6 mm below chassis rim | all measured on [TE-SIDE], jack pitch ≈ 10.3 mm; order confirmed by guide drawing |
| **Front face**: pitch bend | x 20.1–51.1 mm (31 × ≈7.5 mm pill), under the + and shift keys | pressure: left = down, right = up [TE-HW] |
| front white tick | x ≈ 144 mm (in line with enc1's axis and accidental "5"), ≈ 1.2 mm wide, visible from top and bottom | **purpose unknown** (§8) |
| **Right margin (top face)**: mic hole | (276.6, 12.2) Ø 1.2 mm | built-in mic [TE-HW] |
| level meter | x 276.7, y 34.5–52.0 mm; a column of small LEDs crossed by a printed horizontal hairline (the "+" cross) | ≈ 16–18 segments (count, §8). Shows battery while **com** is held [TE-HW] |
| logo | "OP" in a rounded box + "XY", rotated 90°, x ≈ 274–279, y ≈ 77–92 mm | trademark: see §7 |
| **Underside** | 4 feet, 2 velcro rings, logo, bass vent under the speaker | [TE-BACK] |

---

## 2. Complete control inventory

**Conventions.** `id` = proposed canonical id for code and agent. Grid = (col, row) of the tile, with
spans. Centre = keycap centre in mm (§1.1 system). **LED** = has an LED window. **ctrl** = what the key
emits in COM → M2 controller mode (bench census by opxy-deck, OS 1.1.x) [DECK]. **rk** = remote-key
index for `CC106` (down) / `CC107` (up) (community; firmware-dependent; see
`docs/research/20-midi-control.md` §7 and `knowledge/midi/remote-keys.json`) [MIDI-DOC][REACT].
The legends were read from TE's top-down render and the guide [TE-TOPDOWN][TE-GUIDE].

### 2.1 Top area (rows 0–1)

| id | Official name | Type | Grid | Centre (mm) | Size | Legend (primary) | Shift / context | LED | ctrl | rk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `speaker` | internal speaker | grille | c0–1, r0–1 | 19.9, 19.9 | 2×2 tile, grille Ø25 | 147-hole pattern | – | – | – | – |
| `volume` | volume | analog pot (knob in left half of a 2×1 tile) | c2–3, r0 | 43.3, 12.2 | Ø ≈ 10–11, 15.7 mm tall | pointer dimple | recalibrate in te-boot | – | none (stays hardware volume) | – |
| `project` | project(s) | key | c2, r1 | 43.2, 27.7 | Ø 9.4 | fountain-pen nib | shift = projects folder | no | CC5 | 0 |
| `tempo` | tempo | key | c3, r1 | 58.7, 27.7 | Ø 9.4 | metronome | tap repeatedly = tap tempo | no | CC6 | 1 |
| `screen` | display | 480×222 IPS | c4–7, r0–1 | 97.4, 19.9 | tile 62 × 31; active ≈ 55.3 × 25.2 | – | – | – | – | – |
| `enc1` | dark gray encoder | detented endless encoder + push | c8–9, r0–1 | 144.0, 19.9 | dish Ø17, cap Ø6.5 | cap `#45484c` | click; shift+turn | – | turn CC1 · click CC15 | click 10 |
| `enc2` | mid gray encoder | 〃 | c10–11 | 175.0, 19.9 | 〃 | cap `#7c828c` | 〃 | – | CC2 · CC16 | 11 |
| `enc3` | light gray encoder | 〃 | c12–13 | 206.0, 19.9 | 〃 | cap `#b5b5b6` | 〃 | – | CC3 · CC17 | 12 |
| `enc4` | white encoder | 〃 | c14–15 | 237.0, 19.9 | 〃 | cap `#e9e9ea` | 〃 | – | CC4 · CC18 | 13 |
| `sample` | sample | key | c16, r0 | 260.2, 12.1 | Ø 9.4 | waveform (·ı\|ı·· bars) | shift = sample library; note+sample = browse | no | CC28 | 23 |
| `com` | com | key | c16, r1 | 260.2, 27.7 | Ø 9.4 | text "com" | hold = battery on level meter; hold at power-on = te boot; shift+com leaves controller mode | no | CC29 | 24 |

### 2.2 Track row (row 2, y = 43.2 mm)

| id | Name | Col / x | Legend | Shift / hold / context | LED | ctrl | rk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `mode.instrument` | instrument | c0 / 12.2 | sine wave over "1–8" | shift = preset settings; hold + track = mute instrument track | no | CC7 | 2 |
| `mode.auxiliary` | auxiliary | c1 / 27.7 | jack plug over "1–8" | hold + track = mute aux track | no | CC8 | 3 |
| `mode.arrange` | arrange | c2 / 43.2 | chain of 4 blocks (2nd filled) | press again = inst ↔ aux tracks; shift + arrange (in arrange) = song mode | no | CC9 | 4 |
| `mode.mix` | mix | c3 / 58.7 | bank of faders | press again = inst ↔ aux | no | CC10 | 5 |
| `m1`–`m4` | M1–M4 (modules) | c4–c7 / 74.2, 89.7, 105.2, 120.7 | large digits 1, 2, 3, 4 | soft-key actions per screen; shift layers (e.g. shift+M1 = engine select) | no | CC11–14 | 6–9 |
| `track1` | track 1 / aux brain | c8 / 136.2 | "1" + head-with-brain | shift = preset browser; hold + track = link; hold + M1–M4 = scramble/copy/paste/save | **yes** | CC19 | 14 |
| `track2` | track 2 / punch-in FX | c9 / 151.7 | "2" + mushroom push-button | 〃 | yes | CC20 | 15 |
| `track3` | track 3 / external MIDI | c10 / 167.2 | "3" + 5-pin DIN | 〃 | yes | CC21 | 16 |
| `track4` | track 4 / external CV | c11 / 182.7 | "4 cv" | 〃 | yes | CC22 | 17 |
| `track5` | track 5 / external audio | c12 / 198.2 | "5" + jack plug over two dots | 〃 | yes | CC23 | 18 |
| `track6` | track 6 / tape | c13 / 213.7 | "6" + tape reels (oo) | 〃 | yes | CC24 | 19 |
| `track7` | track 7 / FX I | c14 / 229.2 | "7" + boxed "FX", "I" below | shift (in aux) = choose FX | yes | CC25 | 20 |
| `track8` | track 8 / FX II | c15 / 244.7 | "8" + boxed "FX", "II" below | 〃 | yes | CC26 | 21 |
| `players` | player | c16 / 260.2 | stepped dots (arpeggio) | press = open, press again = enable; shift = style | no | CC27 | 22 |

The same 8 track keys address **instrument tracks 1–8** in instrument mode and **aux tracks 1–8** in
auxiliary mode. Some menus number the aux tracks **9–16**: the duck LFO source, and CC102 track select
0–15 [TE-GUIDE instrument][REACT]. The icon on each key names its aux function, and the digit names
the instrument slot [TE-GUIDE track buttons].

### 2.3 Step row (row 3, y = 58.7 mm)

| id | Name | Cols / x | Tile + keycap tone | Legend | Context | LED | ctrl | rk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `step1`–`step16` | sequencer steps | c0–c15 / 12.2 … 244.7 | ramp pairs 1-2, 3-4 … 15-16 (dark → near white) | none, just the LED window | hold = view/edit step, p-lock by turning, extend by pressing another step, nudge with −/+; shift + step = step-component select; bar + step = pattern length | **yes** | CC61–76 | 56–71 |
| `bar` | bar | c16 / 260.2 | standard dark | "1–4" over inverted box "BAR" | hold: + adds a bar (up to 4; + shift duplicates), accidental = track scale, step = pattern length, M1/M2/M4 = clear notes/p-locks/all, white = smoothing; shift + bar = latch bar screen | no | CC30 | 25 |

### 2.4 Transport + accidentals (row 4, y = 74.2 mm)

| id | Name | x (mm) | Tile | Legend | Context | LED | ctrl / note | rk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `record` | record | 12.2 | 1 P | solid red dot | hold + play = live rec (count-in with 2nd play); hold while stopped = step rec; hold + stop = clear track; shift + record = undo; hold + turn = automation | no* | CC55 | 50 |
| `play` | play | 27.7 | 1 P | ▶ | again = restart | no | CC56 | 51 |
| `stop` | stop | 43.2 | 1 P | square filled with diagonal hatching | twice = all sound off | no | CC57 | 52 |
| `key.fs3` | accidental 1 (F♯) | 66.4 | 1.5 P (with "num" label) | "1" | value 1 for step components; scene 1 (shift, arrange) | yes | note 54 | 27 |
| `key.gs3` | accidental 2 (G♯) | 81.9 | 1 P | "2" | value 2 | yes | 56 | 29 |
| `key.as3` | accidental 3 (A♯) | 97.4 | 1.5 P | "3" | 〃 | yes | 58 | 31 |
| `key.cs4` | accidental 4 (C♯) | 128.5 | 1.5 P | "4" | bar + "4" = track scale 4 | yes | 61 | 34 |
| `key.ds4` | accidental 5 (D♯) | 144.0 | 1.5 P | "5" | | yes | 63 | 36 |
| `key.fs4` | accidental 6 (F♯) | 175.0 | 1.5 P | "6" | | yes | 66 | 39 |
| `key.gs4` | accidental 7 (G♯) | 190.5 | 1 P | "7" | | yes | 68 | 41 |
| `key.as4` | accidental 8 (A♯) | 206.0 | 1.5 P | "8" | | yes | 70 | 43 |
| `key.cs5` | accidental 9 (C♯) | 237.0 | 1.5 P | "9" | | yes | 73 | 46 |
| `key.ds5` | accidental 0 (D♯) | 252.5 | 1.5 P | "0" | "random" value for step components | yes | 75 | 48 |

\* The record dot is red in every render; whether it is an LED or red print is unknown (§8).

### 2.5 Octave, shift and naturals (row 5, y = 89.7 mm)

| id | Name | x (mm) | Legend (step-component icon) | Step component (shift + step, then this key) | LED | note | rk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `minus` | minus | 12.2 | "—" | octave down; step-rec back; nudge a held step; shift = sequence octave; shift + −/+ in song mode = cue scene | no | CC58 | 53 |
| `plus` | plus | 27.7 | "+" | octave up; step-rec skip; bar + plus = add bar | no | CC59 | 54 |
| `shift` | shift | 43.2 | text "shift" | modifier for sub-pages | no | CC60 | 55 |
| `key.f3` | natural F | 58.7 | four dots •••• | pulse | yes | 53 | 26 |
| `key.g3` | natural G | 74.2 | open hand | hold | yes | 55 | 28 |
| `key.a3` | natural A | 89.7 | ÷ | multiply | yes | 57 | 30 |
| `key.b3` | natural B | 105.2 | rising wedge ◢ | velocity | yes | 59 | 32 |
| `key.c4` | natural C | 120.7 | stairs up | ramp up | yes | 60 | 33 |
| `key.d4` | natural D | 136.2 | stairs down | ramp down | yes | 62 | 35 |
| `key.e4` | natural E | 151.7 | italic "rnd" | random | yes | 64 | 37 |
| `key.f4` | natural F | 167.2 | ♩ ~ ♪ glide | portamento | yes | 65 | 38 |
| `key.g4` | natural G | 182.7 | twin curved fins | bend | yes | 67 | 40 |
| `key.a4` | natural A | 198.2 | four-petal fan | tonality | yes | 69 | 42 |
| `key.b4` | natural B | 213.7 | → • | jump | yes | 71 | 44 |
| `key.c5` | natural C | 229.2 | 8-spoke wheel | skip parameter lock | yes | 72 | 45 |
| `key.d5` | natural D | 244.7 | ring of radial wedges | skip step component | yes | 74 | 47 |
| `key.e5` | natural E | 260.2 | sun (disc with rays) | skip trigger | yes | 76 | 49 |

Notes are the controller-mode defaults at the default octave [DECK]. In normal use the keys play on
the track's channel, shifted by −/+. Within the device and the guide, black keys are called
**accidentals** and white keys **naturals**, because all caps are the same colour [TE-GUIDE layout 2.6].
The changelog mentions key repeat in song mode for "M2, M3, Left, Right" [TE-CHANGELOG]. "Left/Right"
probably means −/+ acting as arrows (verify).

### 2.6 Non-key controls and indicators

| id | Type | Behaviour to mirror |
| --- | --- | --- |
| `pitchbend` | pressure pad (front) | continuous −1…+1 from pressing the left/right half; springs back; calibratable (COM → system) [TE-COM] |
| `levelMeter` | LED column | audio level; battery level while **com** is held [TE-HW] |
| `imu` | 6-axis accelerometer / gyro | modulation source (element LFO, punch-in FX) [TE-PRODUCT][TE-GUIDE instrument]. The replica can map `DeviceOrientation` on phones |
| `mic` | built-in microphone | sample source [TE-HW] |
| `power` | slider (right edge) | on/off [TE-HW] |
| `chargeLed` | LED (right edge) | charging state |

### 2.7 Sanity checks

- Key count: 2 top keys (project, tempo) + sample + com + 17 (track row) + 17 (step row) +
  13 (transport + accidentals) + 17 (−, +, shift + naturals) = **68** ✓ official "68 ultra low profile
  mechanical buttons" [TE-PRODUCT].
- LED windows (measured in the guide layout drawing): 8 track + 16 step + 10 accidental + 14 natural =
  **48**. Mode keys, M1–M4, transport, −/+/shift, project, tempo, sample, com, players and bar show no
  window in either TE's drawing or the renders.
- Controller-mode ids cover all 68 keys plus 4 encoder turns and 4 encoder clicks. Only the volume pot
  sends nothing [DECK].

---

## 3. Screen

### 3.1 Hardware facts

| Property | Value | Confidence |
| --- | --- | --- |
| Type | IPS TFT colour LCD, custom, flush-mounted | official [TE-PRODUCT][TE-HW] |
| Resolution | **480 × 222** (product page) vs **480 × 220** (guide specs, one review) | official, conflicting |
| Aspect on render | active area 677 × 309 px → **2.19:1** (220 → 2.18; 222 → 2.16) | measured; slightly favours 220 |
| Guide art frame | 215 × 99 u (→ 480 × 221); Mitch's PDF extraction uses 480 × 222 with **≈ 9 px corner radius** | measured [MITCH] |
| Physical active area | ≈ 55.3 × 25.2 mm, ≈ 60.8 mm (2.4") diagonal, ≈ 0.115 mm pitch (≈ 220 ppi) | measured |
| Colour depth / refresh | unknown (UI uses only ~12 greys + 2–3 reds) | unknown |
| Brightness | adjustable in COM → system | official [TE-COM] |

**Decision for the replica:** a logical canvas of **480 × 222 px** (product-page figure). The height is
a single constant; if the owner confirms 220 we crop 1 px top and bottom. Rounded active-area corners
use r ≈ 9 px.

### 3.2 Visual language

- **Palette:** black background, warm white `#F7F5F5`, the 8-tone ramp, and **red only for recording,
  record-armed states, the active pattern, alerts and parameter locks** ("all grayscale, with a bright
  red to indicate recording and parameter locks" [TE-PRODUCT]; "Red means recording" [SOS]).
- **Encoder-colour dots:** every editable parameter carries a small circle whose fill names its
  encoder: dark filled, mid-grey filled, light-grey filled, or white/hollow. This is the core link
  between screen and hardware and the replica must reproduce it exactly (guide art: play mode, sends,
  every LFO card).
- **4-way structure:** most pages divide into four columns or cards (one per encoder), four soft-key
  labels along the bottom (one per M-key quarter), or both. Soft labels read white when available and
  grey when not (inferred from project/arrange art).
- **8-tone header bar** on engine pages: 8 cells of 60 × 20 px running the ramp black → white. Each
  encoder gets a *label* cell followed by a *value* cell, so label/value pairs are [black|#2F2F37],
  [#484850|#616169], [#7A7A82|#96969B], [#AFAFB4|#F7F5F5]. Values are two digits (00–99) (measured
  [TE-GUIDE-SVG] synth-engines/016; matches [MITCH] prism data).
- **Lists:** 20 px rows in three columns. Menu at x ≈ 0–105 (selection = 1 px white rounded outline),
  names at x ≈ 115–285 (selection = `#2F2F37` fill), values at x ≈ 295–460 (selection = `#F7F5F5` fill
  with black text). A thin scrollbar at the far right has a white thumb (measured on
  project/019, instrument/103).
- **Cards:** white rounded rectangles (r ≈ 3–4 px) with black pictograms. Rulers show "amount". A
  pictogram of a knob on a curve stands for "parameter" (LFO pages).
- **Illustration pages:** each synth engine has a signature, animated, mostly isometric picture: prism
  and lenses, cube cluster, noise grid, stacked pianos, hair-dryer, slinky on stairs, waveform, drawbar
  digits. Aux tracks have their own: brain head, VU meter, tape reels, DIN socket, dot-matrix
  punch-in art.
- **Typography:** a single light, Univers-style grotesque. Single-storey g, straight-tailed y, angled
  t. Body text is ≈ 18 px on a 20 px line, big titles ≈ 30–40 px, labels ≈ 9–10 px. All lower case,
  like TE's copy (§4).

### 3.3 Page catalogue

"Art" = a guide illustration exists, rendered at 960 × 444 in `research/ui-reference/guide-screens/`
(file prefix given). Encoder columns are **dark / mid / light / white**. Built from the guide text
[TE-GUIDE] and art [TE-GUIDE-SVG]. The guide describes OS 1.1.15; OS 1.1.17–1.1.33 changed some screens
(see `docs/research/60-firmware.md` and decision D3), so every page spec must carry a "verified on"
firmware tag.

**Global and system**

| Page | Reach | Content | Art |
| --- | --- | --- | --- |
| `boot` | power on | logo + installed firmware version | – |
| `teboot` | hold com at power-on | options: 1 upload firmware, 7 factory reset, 8 system menu (function test, volume-pot calibration) | – |
| `dialog.confirm` | destructive actions | "DELETE?" on a black band, orange ✕, light background | sample#144 (light bg, not in screen set) |

**Instrument mode** (press *instrument*; tracks 1–8)

| Page | Reach | Encoders | M-keys / soft | Look | Art |
| --- | --- | --- | --- | --- | --- |
| `inst.engine.axis` | M1 | tone / ratio / shape / tremolo | – | header bar + isometric cube cluster with a slider line | synth-engines-007 |
| `inst.engine.dissolve` | M1 | swarm / am / fm / detune | – | header + 48 × ~20 grid of 10 px grey noise cells | synth-engines-016 |
| `inst.engine.epiano` | M1 | tone / texture / punch / tine | – | header + stacked isometric keyboards | synth-engines-025 |
| `inst.engine.hardsync` | M1 | freq / sub / noise / lowcut | – | header + hair-dryer, stepped grey blocks, filter curve | synth-engines-048 |
| `inst.engine.organ` | M1 | type / bass / trem amount / trem speed | – | four drawbar columns (digits 8…1) each ending in an icon chip | synth-engines-057 |
| `inst.engine.prism` | M1 | shape / ratio / detune / stereo | – | header + prism, lenses, light ray | synth-engines-066 |
| `inst.engine.simple` | M1 | shape / pw / noise / stereo | – | header + slinky on isometric steps | synth-engines-075 |
| `inst.engine.wavetable` | M1 | table / position / warp / drift | – | header + waveform trace | synth-engines-084 |
| `inst.engine.midi` ("external") | M1 | channel / bank / program / – | M2–M3 = 8 CCs | "midi" title, DIN card, channel, bank ✕, program | synth-engines-034 |
| `inst.engine.drum` | M1 | tune / start / end / play mode (shift: direction / tune / crossfade / gain) | – | L/R waveform lanes with markers, per-key | sample-056 |
| `inst.engine.sampler` / `multisampler` | M1 | sample start / loop start / loop end / sample end (click = fine; shift: direction / tune / xfade / gain; shift+click light = loop type) | – | L/R lanes, hatched loop region, tune header (♩ −1.22), root key box; multi adds a zone strip | sample-025, sample-113 |
| `inst.engine.select` | shift + M1 | dark scrolls | click or M1 = confirm | engine list | – |
| `inst.envelope` | M2 | attack / decay / sustain / release; click any = amp ↔ filter env | – | envelope graph | – (seen faintly behind play mode) |
| `inst.playmode` | hold shift in M2 | poly-mono-legato / portamento / bend range / preset volume | – | four stacked white cards: icon · value · encoder dot | instrument-012 |
| `inst.filter` | M3 | cutoff / resonance / env amount / key tracking | shift + M3 = filter type (ladder, svf, z lowpass, z hipass [REACT]) | filter-response graph, 50 Hz–20 kHz axis | – (visible behind sends) |
| `inst.sends` | hold shift in M3 | aux out / tape / FX I / FX II | – | four cards over the filter graph (the art orders FX II above FX I, while the text says light = FX I: verify) | instrument-032 |
| `inst.lfo.{duck,element,random,tremolo,value}` | M4 (shift + M4 = type) | source-or-speed / amount / destination / parameter (duck: source / amount / hold / release) | click = sub-functions (e.g. duck audio/note source) | four square white cards with labels above; amount as a vertical ruler with pointer | instrument-052, -062, -071, -082, -093 |
| `inst.presetSettings` | shift + instrument | tab settings↔mod / setting / value / value | M1–M4 or instrument = exit; M4 = edit tuning | three-column list | instrument-103 |
| `inst.presetBrowser` | shift + track | click dark = category↔engine; dark = type; others = preset; click = load | M1 cut, M2 paste, M3 rename, M4 delete; shift+M1/M3/M4 folder new/rename/delete | three columns + scrollbar | instrument-118 |
| `text.rename` | M3 in browsers/project | dark = character position, others = edit | M1 confirm, M2 next, M3 cancel, M4 delete | – | – |

**Auxiliary mode** (press *auxiliary*; each aux track has M1 main, M2 routing, M3 filter, M4 LFO unless noted)

| Page | Encoders (M1) | Look | Art |
| --- | --- | --- | --- |
| `aux.brain` (T1) | auto/manual / key / scale / link track. M2 = routing (click switches tracks 1–4 ↔ 5–8) | title "c lydian"; row: brain-head card, root cell, piano-keys + scale name, track number | auxiliary-004, how-to-102 |
| `aux.punch` (T2) | – (keyboard plays effects; low octave = percussion, high = melodic) | full-screen dot-matrix pictogram per effect | auxiliary-021 |
| `aux.midi` (T3) | channel / bank / program; M2–M3 = 8 CCs (shift = enable/select CC) | "midi", DIN card; bottom tabs main / set I / set II / modulation | auxiliary-031 |
| `aux.cv` (T4) | – | "CV" title + analog voltmeter −5…+5 V | auxiliary-057 |
| `aux.audio` (T5) | input / drive / level / mix | flow diagram: mic card → drive → level → mix → out jack | auxiliary-064 |
| `aux.tape` (T6) | pitch / speed / length / mix | reels + value, speed "X2", waveform strip with red playhead, dry value, keyboard strip + length | auxiliary-099 |
| `aux.fx` (T7/T8) | per FX type: chorus rate/depth/feedback/stereo · delay size/fine/amount/dry · distortion drive/clip/low/high · lofi rate/bits/quality/stereo · phaser freq/depth/rate/feedback · reverb size/mod/tone/mix | "FX I  chorus" title; four columns of horizontal bars on the ramp, values below (10 ms, 32, …) | auxiliary-130 (chorus only) |

**Arrange, mix, tempo, project**

| Page | Reach | Encoders / keys | Look | Art |
| --- | --- | --- | --- | --- |
| `arrange.patterns` | arrange (again = inst ↔ aux) | white = pattern, click white = mute, light = link sound; text says M1 new, M2 copy, M3 paste, M4 clear; shift + accidentals = scene (d♯ then digits = 10–99); shift + M1–M4 = scene clone/copy/paste/reset | track icons across the top; per-track stacks of grey pattern boxes; big red box with the active number; soft labels read **clear / copy / paste / new** left → right, which conflicts with the text for M1/M4 (verify) | arrange-003, arrange-020 |
| `arrange.song` | shift + arrange (in arrange) | dark = loop; shift + M1 clear all, shift + M2/M3 navigate, shift + M4 delete; shift + accidentals = scenes; shift + naturals = song | header "song 9", loop icon, "count 06"; 8-column grid of scene circles, white cursor bar; soft labels clear all / ← / → / delete | arrange-028 |
| `mix.levels` | mix → M1 | FX I send / FX II send / pan (click = centre) / level (click = mute); hold tracks = solo; shift + track = mute | 8 vertical strips shaded black → white, level bars, pan dot, hatched = muted(?) | mix-003 |
| `mix.eq` | M2 | low / mid / high / blend (clicks reset) | – | – |
| `mix.saturator` | M3 | gain / clip / tone / mix | – | – |
| `mix.master` | M4 | percussion group / melodic group / compression / output (into limiter) | – | – |
| `tempo` | tempo | bpm / groove type / swing-shuffle (centre = 0) / metronome level (click = on/off) | **grey background**; big BPM, metronome with pendulum, speaker + waves, jack, centre-marked slider | tempo-005 |
| `project` | project | M1 new (hold), M2 save (shift = save as), M3 rename, M4 config | big pen-nib pictogram + name; system-usage icons top right (voices, CPU, stealing); soft labels new / save / rename / config | project-003, project-004 |
| `project.folder` | shift + project | text says M1 load, M2 history, M3 duplicate (printed as "M2"), M4 delete (hold) | two columns factory / templates / user → projects; soft labels read **delete / history / duplicate / load** left → right, the same M1/M4 inversion as arrange (verify) | project-014 |
| `project.settings` | M4 | section / setting / value / value; M1 back | three-column list (general, tempo, voices, midi) | project-019 |

**Sample** (press *sample* from anywhere; shift + sample = library)

| Page | Encoders / keys | Look | Art |
| --- | --- | --- | --- |
| `sample.record.quick` | source / – / gain / threshold; shift + dark = input channel | "press key to sample", filename, white waveform card, mic icon, vertical VU with orange threshold, gain "+11" | sample-003 |
| `sample.record.file` | 〃; hold M1 = record, M2 = listen, M4 = discard | "press ● to record to file", empty card; soft ● ▶ clear | sample-004 |
| `sample.record.synth` / `.drum` / `.multi` | 〃; M2/M3 = previous/next recorded key, M4 = clear key | orange ● with time "20:00", waveform, keyboard zone strip (multi), soft ● ← → clear | sample-017, sample-100 |
| `sample.slice.{transient,even,tap}` | dark = mode; mid/light = slice start/end; white = slice count; tap M1 = mark | mode name + count header, one big waveform with slice lines, soft cancel / done | sample-076, -080, -087, -094 |
| `sample.library` | dark/others browse; click = enter/assign | big waveform tile; folder column (bass, drum, keys, lead, organ, pad, pluck, sampler); file column; soft ← → clear | sample-132, sample-140 |

**COM** (press *com*)

| Page | Reach | Content | Art |
| --- | --- | --- | --- |
| `com` | com | dark = Bluetooth advertise ("adv" badge), light = multi-out mode (radio column: midi, cv+gate, sync8/16/24, audio), charge state; soft system / ctrl / devices / mtp | com-004 |
| `com.system` | M1 | section (system, keyboard, midi, clock, battery, legal…) / setting / value; pitch-bend calibration (M4) | com-014 |
| `com.ctrl` | M2 | controller-mode picture (device → laptop + keys); shift + dark = channel, shift + mid = abs/rel, shift + light = −/+ enable; shift + com = exit | com-022 |
| `com.devices` | M3 | device list (wireless icons) / setting (clock, notes, other, timestamp) / value (out, in, both, off); M2 forget | com-030 |
| `com.mtp` | M4 | device → laptop picture; M4 eject | com-039 |

**Sequencer overlays with no art (must be designed from the text and owner photos):** the bar page
(quantisation / note length / groove / smoothing; M1/M2/M4 clears), the step-hold note display, the
step-component chooser (shift + step → natural → accidental value), players (arpeggio: speed /
pattern / range / hold, plus a shift layer of note length / style / glide / stereo; maestro: roll /
pattern / – / hold; hold), scene select, the track-scale popup and the drum-key popup (1.1.x
changelog).

**Coverage:** 53 guide screens cover about 45 page types. Roughly 20 page types have no art: envelope,
filter, EQ, saturator, master, five FX types, bar, step component, players, engine/LFO selectors, text
entry, boot. **Owner photos of these screens are the single most valuable input** (§8).

---

## 4. Typography and iconography

### 4.1 What TE uses

| Where | Face | Evidence |
| --- | --- | --- |
| Website and guide | **Univers TE20 Light** ("oct 2022"), © Linotype, Adrian Frutiger & Linotype Design Studio, served as `TE20L.woff2` | font name table (fontTools) of the file bundled by [MITCH], identical to TE's asset hash `B96qqQct` [TE-GUIDE HTML] |
| Site header art | Univers Next Pro Thin | CSS inside the store page's inline SVG [TE-STORE] |
| Device screen | a light Univers-style grotesque: single-storey g, straight-tailed y, flat-cut terminals, tabular-looking figures | visual, guide screen art [TE-GUIDE-SVG] (text is outlined, so no font name) |
| Key legends | the same family, light weight; "rnd" italic; "BAR" in caps, reversed out of a light box | [TE-TOPDOWN] |
| OP–1 lineage | Univers TE / Univers Next used in earlier TE products | community (dafont forum, OP–1 manual metadata) |

### 4.2 Open-licensed substitutes

We cannot ship Univers TE20, and Mitch's demo does. Candidates under the OFL, to rank by rendering the
same strings at 480 × 222 next to the guide art (a quick visual-diff test page):

1. **Inter** (weights 300/400, tabular figures). Its default letterforms already match (double-storey
   a, single-storey g, straight-tailed y). The safest all-rounder, with excellent hinting at 18 px.
2. **Roboto Flex** (variable, has optical size and grade). Close to the Univers proportions at light
   weights.
3. **Archivo** or **Hanken Grotesk** (grotesques with a similar colour at Light).

For **key legends**, do not depend on a web font at all: draw each legend as SVG paths once (text
legends such as "shift", "com", "num", "cv", "rnd", "BAR", "1–8", "1–4" and digits can be outlined from
the chosen OFL face, which the OFL permits in artwork), then reuse the same paths in SVG, in 3D (MSDF
atlas) and in the diagram theme.

### 4.3 Legend style

- Colour: off-white print (`#ecebe7`) on dark caps. On the light step caps there are no legends, only
  the LED window, which reads dark when off.
- Size relative to a Ø 9.4 mm cap: M-key digits ≈ 4.5 mm cap height. Track digit + icon side by side
  ≈ 3 mm. Mode icons ≈ 5 mm wide with a "1–8" subscript ≈ 1.8 mm. Step-component icons ≈ 4–5 mm. Text
  legends ≈ 2.2 mm x-height.
- LED window: a Ø 1.75 mm hole at 12 o'clock (3.05 mm above centre); legends sit centred or slightly
  lower on LED keys.
- "num" is printed **on the tile**, top-left of the first accidental tile, not on a cap.

### 4.4 Icon inventory (to draw ourselves)

- **Keycaps (34 pictograms):** sine, jack plug, block chain (arrange), fader bank (mix), brain head,
  mushroom button, DIN socket, jack + dots (audio), tape reels, boxed FX + I/II, stepped dots (players),
  waveform (sample), pen nib (project), metronome (tempo), record dot, play triangle, hatched stop,
  minus, plus, and the 14 step components (four dots, hand, ÷, wedge, stairs up, stairs down, "rnd",
  glide notes, fins, fan, →•, spoked wheel, radial wedges, sun). TE's guide has clean standalone SVGs of
  the step-component icons (65 × 65) and every key, which are good references
  (`guide-svg/step-components/`, `guide-svg/layout/`).
- **Screen pictograms (~30):** engine art (8), aux art (brain, dot-matrix sets, voltmeter, mic, reels,
  DIN), LFO glyphs (note values, triplets, clock dial, ruler, knob-on-curve, destination icons syn /
  free / env / filter), sends icons, system-usage icons, pen nib, metronome, loop, arrows, bluetooth,
  battery, device silhouettes, laptop and keyboard, eject.
- **Diagram conventions** (TE guide style, reused for teaching overlays): single press, combo "+",
  sequence "→", "hold" label, rotate arrows, click triangle, a gray-fill highlight of a panel region,
  and LED states drawn as black dot = lit white, orange dot = lit red, grey dot = dim
  [TE-GUIDE conventions].

---

## 5. Interaction model (what the replica must mirror)

### 5.1 Input primitives

| Primitive | Device semantics | Replica input |
| --- | --- | --- |
| press / release | every key; the sequencer, keyboard and transport act on down, holds act while down | pointer down/up (multi-touch), keyboard mapping, MIDI echo |
| hold | long-press gestures: "hold M1 to create a project", "hold M4 to delete", record + stop "until LEDs fill" | the timer lives in the device model, not the view. Threshold unknown (~0.5 s?, §8) |
| combo | hold A + press B (shift layers, bar menu, track copy/paste, step edit, link tracks) | multi-pointer, or a "sticky modifier" toggle (tap shift to latch) for touch and accessibility |
| sequence | press A then B (e.g. shift, step, natural, accidental) | as is |
| chord | several keyboard keys at once, velocity-sensitive when enabled | multi-touch. Velocity from pointer pressure if available, else vertical tap position on the cap |
| encoder turn | detented relative steps. **Hold click + turn = fine** (sampler points) | wheel, vertical drag (1 detent ≈ 6 px), arrow keys |
| encoder click | toggles and resets (envelope amp/filter, EQ reset, mute, confirm, browser sort) | tap on the cap |
| shift + turn | alternate parameter sets | as is |
| volume | absolute analog pot | rotary drag; show the dimple angle (≈ 300° travel, verify) |
| pitch bend | pressure left/right, springs back | horizontal drag on the pill with spring-back |
| motion | IMU as a modulation source | optional `DeviceOrientation` on phones |

The encoders are endless and have no pointer mark, so turning them is not visible on the hardware.
The replica shows motion through the knurl highlight and a transient on-screen value. That is a place
where the replica can be *clearer* than the device without being *different*.

### 5.2 LED model

Per LED-bearing key: `off | dim | white | red`, plus `blink(rate)` and `flash`. Semantics from the
guide [TE-GUIDE]:

- **Track keys:** the active track is **white for instrument, red for aux**. While shift is held in mix,
  unmuted tracks light (white/red) and muted ones go dark. Arrange/mix use the same colour coding.
- **Steps:** a note present shows white. During live recording, steps with notes turn red. The step
  playhead chases. The step-record cursor is **red** and moves with −/+. "Record + stop" floods the
  row red while clearing. With shift held, steps that have components are bright and others dim (they
  flash when selected). After a track-scale change, steps blink at the scaled rate. "Step 1 flashes
  red" while waiting for count-in.
- **Keyboard:** keys light when played. Holding a step lights its recorded notes. Drum-sampler keys
  with samples, or the selected key, light. In the step-component flow, the natural of an applied
  component is lit. In arrange/song, accidentals show scenes (inferred).
- **Level meter:** audio level; battery while com is held.
- **CPU/voice overload:** shown **on screen** (blinks red), not on an LED [TE-GUIDE project].

### 5.3 State skeleton

`mode ∈ {instrument, auxiliary, arrange, mix}` × `module ∈ {M1…M4}` × `track ∈ 1…8` (per mode) ×
`page overlays` (tempo, project, sample, com, bar, players, browsers, dialogs), plus `shiftHeld`,
`heldKeys` (a set with timestamps), `transport {playing, recording, recordLocked}`, `octave`, and a
per-track `ledPattern`. Pages are a pure function `render(state) → screen primitives`, and LEDs are a
pure function `leds(state) → Uint8Array[48]`.

### 5.4 Mirror vs simulate (important for honesty in the UI)

- **The device does not stream its screen or LEDs.** Normal-mode encoder moves mostly don't go out over
  MIDI [MIDI-DOC]. So the replica's screen and LEDs are **simulated** from our model plus whatever we
  can observe (notes, CCs, transport, clock, and `.xy` project state when available). The UI must say
  which it is: "mirroring" (confirmed by device events) vs "simulated".
- **Controlling the device from the replica:** a key press can send `CC106 v` / `CC107 v` (remote keys,
  indices in §2), gated on a UI-only probe per firmware. Parameters go through the official per-track
  CCs rather than simulated encoder turns (there is no remote-turn message). Follow the safety rules in
  `docs/research/20-midi-control.md` §7.4 (held-key ledger, risk classes, confirm destructive M-keys).
- **Controller mode** (COM → M2) turns the real device into an input surface *for the replica*. Every
  physical control has an id (§2), so the replica can light up the key the user just pressed.

### 5.5 Teaching overlays

Encode TE's conventions as an animation vocabulary: `press(id)`, `combo(hold, press)`,
`sequence(a, b)`, `hold(id, ms)`, `rotate(enc, ±n)`, `click(enc)`, `chord(ids)`, `highlight(region)`.
Regions come from the grid (§1.4) and from `knowledge/official/images/layout-hotspots.json` (the guide's
14 numbered zones). The agent emits these; the replica plays them.

---

## 6. Implementation recommendation

### 6.1 Decision: model first, two renderers, one screen

| | SVG / DOM | Canvas 2D | WebGL / Three.js |
| --- | --- | --- | --- |
| Fidelity of a top view | excellent; crisp at any zoom | good, but hand-rolled hit tests | excellent, with real materials and light |
| "Gorgeous" | high with care (gradients, grain, glow) | medium | **highest** (PBR, bloom, depth) |
| Accessibility | native buttons, focus, ARIA | none (needs a DOM twin) | none (needs a DOM twin) |
| Teaching overlays / callouts | trivial (same DOM) | manual | projected overlay layer |
| Mobile battery / perf | very good | good | costly unless render-on-demand |
| Bundle | ~0 (ours) | ~0 | three ≈ 150 KB gz + our code |

**Recommendation.**

1. **`panel` model in millimetres** (one TypeScript module): every control with id, grid cell, spans,
   centre, shape, legend-glyph id, LED slot, MIDI ids, primary/shift/hold actions. It is generated from
   the numbers in §1–2 and unit-tested (counts, positions, no overlaps).
2. **SVG replica = the canonical interactive device.** Orthographic top view, styled like TE's
   product shot: grain texture we generate, soft cap shadows, key-press depth (translate 0.4 mm and
   shrink the shadow), LED glow via pre-baked radial gradients with `mix-blend-mode: screen`. The same
   geometry has a second **"guide" theme**: line art in `#0F0E12` on `#F7F5F5`, like TE's diagrams,
   for teaching cards and printable how-tos.
3. **Screen = Canvas 2D** at logical 480 × 222, backing store × DPR (cap 3). Pages are pure draw
   functions over a tiny primitive set (text, rect with radius, ramp header, card, list, ruler,
   waveform lane, pictogram). Redraw on dirty state; run requestAnimationFrame only while animating.
   Overlay the canvas exactly on the SVG screen tile. It also feeds a large **"screen mirror"** panel
   next to the chat and the 3D view's `CanvasTexture`.
4. **Three.js "studio" view (lazy, optional):** procedural geometry from the same model. Rounded-box
   chassis (`ExtrudeGeometry` from a rounded-rect shape with bevel); instanced tiles; keycaps and
   encoders from `LatheGeometry` profiles (knurl as a normal map we generate); a velcro/foot underside
   for orbiting. `MeshPhysicalMaterial` for anodized aluminium (metalness ≈ 0.8, roughness ≈ 0.5, with
   grain in the roughness map), plastic caps, and a glass screen with a subtle clearcoat. Legends as an
   MSDF atlas from our SVG paths. LEDs are emissive discs with selective bloom. Lighting is
   `RoomEnvironment` + PMREM (no third-party HDR needed) plus one `RectAreaLight`, with AgX/Neutral tone
   mapping. Camera defaults to **orthographic top-down** (legible), with orbit and tilt for showing off.
   Render on demand, cap the pixel ratio at 2, and fall back to SVG when there is no WebGL2, on
   low-power devices, or under `prefers-reduced-motion`.

This gives a replica that is correct and accessible everywhere, and beautiful where it counts.
Mitch's demo shows the 3D path is feasible in a browser.

### 6.2 Sketch

```
src/lib/device/
  panel.ts              # geometry + inventory (mm) — single source of truth (+ panel.test.ts)
  legends/              # our SVG path data per glyph id (+ MSDF atlas build script)
  state.svelte.ts       # Svelte 5 runes: heldKeys, leds, encoders, mode/module/track, transport
  input.ts              # pointer/keyboard/MIDI → normalized ControlEvent {id, kind, t, value}
  svg/Panel.svelte      # SVG replica (themes: 'product' | 'guide')
  screen/
    renderer.ts         # 480×222 canvas, primitives, DPR, dirty-rect loop
    pages/*.ts          # one pure function per page id (§3.3), versioned by firmware
  three/Studio.svelte   # lazy import; builds meshes from panel.ts
```

### 6.3 Getting exact geometry

1. **Start from the numbers here.** They come from TE's own vector drawing (scale fixed by 288 mm =
   body + tab, which reproduces 102.0 mm exactly) and are cross-checked on the orthographic renders to
   within 1%.
2. **Build a dev-only calibration page** (`/dev/replica`) that overlays our SVG on a local reference
   image (git-ignored), with an opacity slider and a difference blend. Iterate cap sizes, legends and
   tones until the diff is near zero.
3. **Owner validation:** caliper measurements plus a perspective-corrected top photo (§8). Correct the
   photo with a homography from the four body corners; then it can serve as the calibration reference.
   If the owner agrees, *their* photos can even be committed, unlike TE's.
4. **Icons:** redraw on a 24-unit grid per cap. Compare at 800% against the 4096 px render crops.

### 6.4 Screen rendering details

- Use one font-loading promise before the first paint to avoid a flash of fallback text in the canvas.
  Use `ctx.fontKerning = 'normal'` and tabular figures for values.
- Snap 1 px strokes to half-pixels in logical space. Draw the header ramp and cards with integer
  coordinates. Match the guide metrics (header 20 px high; list rows 20 px; soft-label baseline
  ≈ 16 px above the bottom edge).
- Optional "glass" pass in the SVG/3D layer only (a faint reflection gradient). Never blur the pixels.
- Golden-image tests: Playwright renders each page for fixed states and compares against our own
  approved PNGs (not TE's art). Keep a side-by-side reviewer page against `guide-screens/` locally.

### 6.5 Responsive and mobile

- **Desktop/tablet landscape:** device full width (≈ 1100–1400 px ⇒ P ≈ 60–75 px) above or beside the
  agent chat, with the screen mirror at 2–3× next to it.
- **Phone landscape:** device fills the width (≈ 800 px ⇒ P ≈ 43 px, caps ≈ 26 px, tiles are the hit
  targets). Chat goes in a sheet.
- **Phone portrait:** rotate the *device* 90°, following TE's own portrait diagram, and keep **legends
  upright** (a per-glyph counter-rotation option) and all UI text upright. Put a large, upright
  **screen mirror at the top**. Mitch rotates the entire UI including text, which hurts legibility; we
  should not. Also offer a "focus" mode that zooms to the relevant rows (keyboard, tracks + encoders)
  with pan/zoom.
- Hit area = the whole tile (15.5 mm scaled), never just the cap.

### 6.6 Accessibility

- Every control is a real `<button>` (or `role="slider"` for encoders and volume) with its official
  name ("track 3, external MIDI", "M1", "dark gray encoder"), `aria-pressed` for held/latched state,
  and `aria-valuetext` from the current screen value.
- Full keyboard operation: a computer-keyboard-to-OP–XY map, sticky shift and hold gestures, arrow keys
  and PageUp/PageDown on encoders, and visible focus rings.
- The screen renderer also produces a **text description** of each page (the page functions return a
  semantic summary), exposed through `aria-live` on meaningful changes.
- Colour-safe LED states: white vs red also differ in the glow shape or a tiny ring, so red/white is
  never the only cue in our UI.
- Respect `prefers-reduced-motion` (no camera tours or glow pulsing) and `prefers-contrast`.

### 6.7 Performance budgets

- SVG replica: under 1,500 DOM nodes, static and dynamic layers split, LED/press updates through CSS
  custom properties (compositor-friendly transforms), and no per-frame Svelte work while idle.
- Screen: under 2 ms per page draw on a mid-range phone. Animate only on active pages (dissolve noise,
  tape, punch-in, meters).
- 3D: under 60 draw calls through instancing (68 caps are about 4 instanced meshes), textures ≤ 2K, and
  zero frames rendered while idle.
- Initial JS for the replica stays under 120 KB gz. Three.js is a separate chunk loaded on demand.

---

## 7. Asset plan and licensing

### 7.1 We draw ourselves (committed, our own)

The panel geometry model, and every tile, cap, knob, dish and edge profile. All 34 keycap pictograms
and text legends as paths. The speaker and bass-vent hole patterns (procedural). The level meter,
tick, ports and underside for the 3D view. All screen primitives and every screen page, including the
~30 screen pictograms. The grain/knurl/velcro textures (procedural). The diagram-theme renderings.
Everything is drawn to measured dimensions, **not traced or copied** from TE artwork.

### 7.2 We may derive (facts, not expression)

Dimensions, grid, positions and counts; the control inventory, names, functions and MIDI ids; colour
values as hex numbers; page structures and parameter names. This is factual information from public
sources, reworded (decision D2).

### 7.3 Never ship

- TE photos, renders and press images; guide SVGs and the printable PDF (all © teenage engineering).
- **Univers TE20 / Univers Next** fonts (Linotype licence).
- The **"OP–XY" and teenage engineering logos**, and "punch-in FX™" / "brain™" as marks beyond
  nominative use. Default the replica's logo area to a plain, neutral "op–xy" set in our own type, or
  leave it blank, until TE is asked (they are supportive, §8).
- Code or assets from `mitchivin/te-opxy` (no licence, so all rights reserved; it also redistributes
  TE's font and vector art extracted from TE's PDF) and TE's panel SVG bundled in `kazuochi/opxy-deck`
  (`assets/opxy.svg`, shipped "removed on request").
- The Figma community recreation by Lorenzo de Lijser (Figma community files are normally CC BY 4.0;
  verify) is a *legitimate reference*, but it recreates TE's trade dress. Use it only for comparison,
  and credit it if we ever do.

### 7.4 Reference assets collected (git-ignored, internal only)

| Path | What |
| --- | --- |
| `research/ui-reference/guide-svg/<chapter>/NNN_<id>.svg` + `manifest.json` | all **471 unique guide illustrations** (key diagrams, full-panel drawings, 53 screens), with caption context |
| `research/ui-reference/guide-svg/classify.json`, `screens.json` | our screen/non-screen classification |
| `research/ui-reference/guide-screens/*.png` + `index.json` | the 53 screen illustrations rendered at 960 × 444 |
| `research/ui-reference/guide-pdf/op-xy-guide-v1.1.15.pdf` | printable guide (135 pp., vector art; Mitch's page ids = PDF page numbers) |
| `research/ui-reference/photos/` | `op-xy_top-down_4096.png` (orthographic top render, the calibration master), hero 7k, left close-up, right ports, vertical/box |
| `research/ui-reference/product/` | product-page images and inline icon SVGs (step components, etc.) |
| `research/web/ui/` | raw HTML + `.data` (turbo-stream) + decoded JSON + text outlines + image lists for all 25 guide pages, product, store, Figma page |
| `knowledge/official/images/press/` (other agent) | TE press set, incl. **`OP-XY_side.jpg`** (orthographic side, the source of §1.1 heights), `OP-XY_back.jpg`, `op-xy_screen_7k.jpg` |

Measurements are reproducible: TE image URLs are `https://assets.teenage.engineering/_img/<id>_<suffix>`
(ids from the pages' `.data` loader payload). The layout drawing is id `6731e8d7f430b9ee1a804922`, 740 ×
265 u. We parsed it with `svgelements` (outline 731.58 × 261.83 u, tiles 39.8 u, caps 24.11 u, LED
rings 4.5 u), and measured the renders with Pillow and NumPy profiles.

### 7.5 Mitch Ivin's WebGL simulation: what to learn, what to avoid

- **Good:** layout and legends are faithful, and encoders are modelled as tall knurled knobs, which is
  correct. Screen pages lazy-load. Camera presets (overview, screen, surface, top, bottom, left, right).
  RectAreaLight + AgX + bloom for LEDs. A CanvasTexture screen at 480 × 222 with rounded clip.
  Keyboard shortcuts and screen-reader help text. It works on phones.
- **Bad or risky:** no licence; ships TE's font; screen pages are TE's PDF vector paths (ids like
  `p103f0` = PDF page 103 = prism), so they are illustrations, not a parametric UI. Coverage is ≈ 55
  page modules. The bundle is heavy (865 KB main + 900 KB vendor + a 1.9 MB boot-logo module). Portrait
  rotates all UI text. The device is one opaque canvas (`role="application"`), so there are no
  per-control semantics. The UI chrome uses Martian Mono, which is not TE's typography.

---

## 8. Open questions for the owner (measure, photograph, observe)

**Measure (calipers)**

1. Body length × depth without the switch tab (expect 285.0 × 102.0) and chassis thickness (≈ 9.5).
2. Tile pitch across 10 keys (expect 155.0 mm), keycap diameter (9.4) and cap height above the tile
   (≈ 2.0), tile gap.
3. Key travel and actuation feel (for press animation depth and sound design of clicks).
4. Encoder: knob diameter and height above the caps (≈ 9.8), cap diameter (6.5), **detents per
   revolution**, whether acceleration exists. Volume knob: diameter, height, and rotation range.
5. Screen active area (≈ 55.3 × 25.2 mm) and bezel.

**Photograph** (these photos are yours, so they can be committed if you agree)

6. A straight-down top photo from 1.5–2 m with a long lens, in diffuse daylight, with a grey card in
   frame, device off. Then the same photo in a dark room with the device on (LED and screen colours).
7. Macro shots: a step key lit white, lit red and dim; a track key red (aux) vs white; the **level
   meter** lit (count its segments); the **front-edge white tick**; the record key (printed red dot or
   LED?); legends in the dark (are they backlit?).
8. The screen, straight on: every page listed "no art" in §3.3 (envelope, filter, EQ, saturator, master,
   the other five FX, bar, step component, players, selectors, rename, boot). Include one macro at the
   screen edge so we can count pixels (222 vs 220 rows). Also shoot the **arrange** and **projects
   folder** screens: TE's art shows the M1/M4 soft labels swapped relative to the guide text, and the
   **track-send** page (FX I/FX II order).
9. Right edge, bottom, and front edge with the pitch bend.

**Observe (behaviour)**

10. Which LED colours exist (white, red, dim white — anything else?) and blink rates (selected track,
    step flashes, count-in).
11. Do mode keys, M1–M4, transport, shift, bar, players, sample, com, project or tempo ever light?
12. Long-press threshold for "hold" gestures (M1 new project, M4 delete).
13. Firmware version on the device when screens are photographed (expected 1.1.33).
14. Later, with explicit consent in a probe session: whether remote keys `CC106/107` work on 1.1.33,
    including encoder clicks 10–13 (plan in `20-midi-control.md` §11).

**Decide**

15. Should the replica show the "OP–XY" logo, or stay neutral until TE says yes?
16. Is ~1% dimensional accuracy (current state) enough for v1, or should we wait for caliper data
    before freezing `panel.ts`?

---

## Sources

| Key | Source |
| --- | --- |
| TE-PRODUCT | https://teenage.engineering/products/op-xy (specs: 480 × 222 px IPS TFT, 68 buttons, 4 grayscale encoders, "exact dimensions of OP–1 field", "all grayscale … bright red") — local `research/web/ui/product-op-xy.*` |
| TE-STORE | https://teenage.engineering/store/op-xy (288 × 102 × 29 mm, 900 g) — `research/web/ui/store-op-xy.html` |
| TE-GUIDE | https://teenage.engineering/guides/op-xy and chapters (layout, hardware-overview, guide-conventions, main-modes, track-buttons, instrument, auxiliary, synth-engines, fx, sequencer, step-components, players, arrange, mix, project, sample, tempo, com, te-boot, how-to) — `research/web/ui/<slug>.{html,data,outline.txt}` |
| TE-HW | https://teenage.engineering/guides/op-xy/hardware-overview (materials, display, ports order, pitch bend, level meter, 480 × 220) |
| TE-COM | https://teenage.engineering/guides/op-xy/com |
| TE-CHANGELOG | https://teenage.engineering/downloads/op-xy (OS release notes) — `research/web/firmware/downloads-op-xy.txt` |
| TE-LAYOUT | https://teenage.engineering/guides/op-xy/layout ("encoders are coloured dark grey, mid grey, light grey and white") |
| TE-GUIDE-SVG | guide illustrations, `https://assets.teenage.engineering/_img/<id>_original.svg` — local `research/ui-reference/guide-svg/` |
| TE-LAYOUT-SVG | full-panel line drawing, id `6731e8d7f430b9ee1a804922` (740 × 265 u) — `research/ui-reference/guide-svg/layout/001_*.svg` |
| TE-GUIDE-PDF | printable guide v1.1.15, `https://assets.teenage.engineering/_img/6a452a3b31b95d1c6dbb44bb_original.pdf` — `research/ui-reference/guide-pdf/` |
| TE-TOPDOWN | orthographic top render 4096², id `6735138db0f88c1a719dbd38` — `research/ui-reference/photos/op-xy_top-down_4096.png` (also press `OP-XY_front.jpg`) |
| TE-SIDE | press image `OP-XY_side.jpg` (orthographic right side) from https://teenage.engineering/press/op-xy — `knowledge/official/images/press/` |
| TE-BACK | press image `OP-XY_back.jpg` — same folder |
| TE-PORTS | product image id `67361db01db2feb0839f4196` (right edge + underside print) — `research/ui-reference/photos/op-xy_right-side-ports_4096.webp` |
| SOS | https://www.soundonsound.com/reviews/teenage-engineering-op-xy (keys "shrunk to the same size as the accidentals", clicky encoders, level meter = vertical part of the cross, red = recording) |
| MEHATRONIKA | https://magazinmehatronika.com/en/teenage-engineering-op-xy-review/ (black anodized finish, clickier keys, piezo pitch-bend pill, bass vent, 480 × 220) |
| DECK | https://github.com/kazuochi/opxy-deck — `opxy-controls.json`, `OpxyMapper.swift` (controller-mode census, keyboard base F = 53) |
| REACT | https://github.com/jshph/opxy-reactive — `maps/opxy-1.1.21.json` (remote keys, engine/filter names), `DESIGN.md` |
| MIDI-DOC | `docs/research/20-midi-control.md` §7 (remote keys, risk classes, firmware history) |
| MITCH | https://github.com/mitchivin/te-opxy (compiled, unlicensed) and https://mitchivin.github.io/te-opxy/ — reference only |
| FIGMA-LORENZO | https://www.figma.com/community/file/1440982544324019665/teenage-engineering-op-xy |
| NTS | https://github.com/arnaudgreiner/nts-radio (OP–XY-inspired PWA; 3×6/6×3 adaptive tile grid) |
| CHEAT | https://github.com/chrisyoung0101/op-xy-cheat-sheet (community naming of combos) |
