# 65 — Video tutorials: what TE's and the community's videos show (to OS 1.1.33)

> What 30 YouTube videos teach about the OP-XY that TE's guide (OS 1.1.15) does not, or says
> differently: key combos, screens, values, defaults, edge cases and what changed in which release,
> each checked against our manual (`knowledge/manual/units/`), the replica and `docs/QUESTIONS.md`.
> Read 2026-10-02. Captions only, never video or audio; the raw transcripts are local in
> `research/videos/<id>.txt` (git-ignored, never committed or shipped). Everything below is in our
> own words.

## How the videos were chosen and read

- **Sources.** TE's channel (`@teenageengineering`) has only short promos and feature clips for the
  OP-XY, and one long livestream: **midnight operations ep 18**, where Jonas, the OP-XY product
  owner, presents OS 1.1.0. TE's education channel (`@teenageengineeringeducation`) has an
  "OP–XY video manual" playlist holding exactly one video, Mo chreach!'s 3½-hour **OP-XY Video
  Manual**, so we treat that one as TE-endorsed (made on 1.0.13, updated to 1.0.15 on camera at
  3:24:03). The rest came from YouTube searches by topic (updates 1.0.29–1.1.25, sequencer, step
  components, locks, bar card, players, brain, punch-in, tape, samplers and slicing, engines, LFOs,
  FX, mixer, scenes and songs, MIDI/CV). We preferred firmware-update videos, recent videos on 1.1.21–1.1.33 and long
  single-topic videos by experienced teachers: windowbed (tagged by TE's education channel), SON WU
  and Joseph "Pailo" Haley, who both have playlists on TE's education channel, and Shimmery.mp3,
  Dennis Cortes, Daddy Long Les and The Midlife Synthesist. Becky Santos's recent videos are in
  Spanish and were left out.
- **Transcripts.** YouTube's caption tracks, fetched through the player API (the web page's caption
  links now need a proof-of-origin token; the Android client's do not). 23 are auto-generated, 7
  (windowbed's) creator-written. Auto captions mishear names ("Yunas" for Jonas, "myestro"), so
  every finding was read in context; the strongest were re-read in the transcript by hand.
- **Firmware.** A video can only show releases out before its publish date. "stated" means the
  presenter or description names the version; otherwise it is the latest release by date. Old
  behaviour is reported as old: where a later changelog item changes it, that is said.
- **Tags.** `[new]` not in our manual or notes; `[confirms unit#fact]`; `[refines unit]` adds a
  value or detail; `[contradicts …]` names what differs and where; `[answers Qn]` an open question.
  "said" = the presenter says it; "shown" = done on the unit in the video; "heard" = audible;
  "guess" = the presenter's speculation. Every transcript was read in full (in ten batches by
  area); the findings were merged here and the load-bearing ones re-read in the transcripts.
  "Shown" still comes from captions: what the presenter says while doing it, not the picture.

## 1. The videos

| #   | Title (shortened)                                                 | Channel                | Id            | Date       | Firmware                     |
| --- | ----------------------------------------------------------------- | ---------------------- | ------------- | ---------- | ---------------------------- |
| 1   | midnight operations, ep 18 — OP–XY update with jonas (livestream) | teenage engineering    | `gY2IEjrh7Zg` | 2025-10-15 | 1.1.0 stated                 |
| 2   | OP-XY Video Manual (TE education's "OP–XY video manual" playlist) | Mo chreach!            | `SC7oJ6AqJdI` | 2024-12-21 | 1.0.13 → 1.0.15 stated       |
| 3   | OP-XY MIDI: What I've Learned So Far                              | windowbed (James)      | `2hzRP2SevVw` | 2024-11-17 | 1.0.9 stated                 |
| 4   | Teenage Engineering Op XY — Brain (Deep Dive) (livestream)        | Joseph "Pailo" Haley   | `cf35tXOKW8Y` | 2024-12-02 | 1.0.9 by date                |
| 5   | OP-XY Tutorial: Mixer Deep Dive                                   | windowbed (James)      | `bVLcqzkcgKo` | 2024-12-15 | 1.0.13 stated                |
| 6   | OP-XY Step Components Part 1 (drum tracks)                        | windowbed (James)      | `gvTgLEcCC-A` | 2024-12-28 | 1.0.15 stated                |
| 7   | OP-XY Step Components Part 2 (delaying, stopping, chaotic leads)  | windowbed (James)      | `XkzrwYYQOzo` | 2025-01-04 | 1.0.15 stated                |
| 8   | OP-XY deep dive: envelopes, filters and filter envelopes          | windowbed (James)      | `5RrjxcscbGA` | 2025-01-12 | 1.0.15 by date               |
| 9   | LINKING TRACKS = Super Underrated Feature!                        | SON WU                 | `ERex7ogcc7Q` | 2025-01-16 | 1.0.21 by date               |
| 10  | What is Maestro? // OP-XY Players Tutorial                        | SON WU                 | `a3A0OkI-5GA` | 2025-02-05 | 1.0.25 by date               |
| 11  | Demystifying the multi-out on the OP-XY                           | Sound Technology Ltd   | `O5SB6UC6rSY` | 2025-02-13 | 1.0.25 by date               |
| 12  | Breakdown of the NEW OP-XY Update!!!                              | SON WU                 | `a9DD2dvoXGk` | 2025-02-26 | 1.0.29 by date               |
| 13  | OP-XY Got Sample Chopping! (*Kinda) // New Firmware Update        | The Midlife Synthesist | `LebAQHf_TjY` | 2025-02-28 | 1.0.29 by date               |
| 14  | OP-XY Sampler Update! New Features You Need To Try!               | Shimmery.mp3           | `mhCC_je8xC0` | 2025-03-09 | 1.0.29 by date               |
| 15  | Video 5 — Understanding The Per Track Punch In Effects            | Daddy Long Les         | `3vOcs1VP9Tw` | 2025-05-20 | 1.0.40 stated                |
| 16  | OP-XY Arranger Deep(-ish) Dive: Scenes, Patterns, and Songs       | windowbed (James)      | `0wBY7895qPQ` | 2025-07-04 | 1.0.45 by date               |
| 17  | Advanced Tape Track Trickery                                      | windowbed (James)      | `P5czRVSYGQk` | 2025-08-06 | 1.0.45 stated                |
| 18  | OP-XY Just Got Better — New Slicing and Sidechain Features        | The Perfect Workflow   | `lLX1U5IzPRw` | 2025-10-21 | 1.1.0 stated                 |
| 19  | Edited stream: My favorite OP-XY Step Components!                 | windowbed (James)      | `J5rsaiZKaXw` | 2025-10-31 | 1.1.0 by date                |
| 20  | New UPDATE for OP-XY! // templates, subfolders & more…            | SON WU                 | `NB6aWKnRl7k` | 2026-07-01 | 1.1.15 by date               |
| 21  | My #1 OP-XY Wish Just Came True! (random presets)                 | The Perfect Workflow   | `M-bZe8a8wTw` | 2026-07-02 | 1.1.15 by date               |
| 22  | The OP-XY Update I've Been Waiting For...                         | Taylor Fiore           | `g3NQICq9tKY` | 2026-07-06 | 1.1.15–1.1.18                |
| 23  | My default OP-XY project template                                 | windowbed (James)      | `oBTL_sevDxM` | 2026-07-30 | 1.1.21 stated                |
| 24  | Live tutorial: OP-XY Punch-in FX Tips & Tricks                    | windowbed (James)      | `KXVWwwIIfBE` | 2026-08-03 | 1.1.21 by date               |
| 25  | Change Sounds & FX Between OP-XY Scenes                           | Khordmaster            | `n-ypkKaAjBM` | 2026-08-05 | 1.1.21 by date               |
| 26  | The OP-XY Received an UPDATE! (livestream)                        | Khordmaster            | `utFXjxN5LSc` | 2026-08-19 | 1.1.25 stated                |
| 27  | OP-XY Overview & Reference of ALL Features                        | Dennis Cortes          | `BpzAEUiRjYQ` | 2026-08-30 | 1.1.25 by date               |
| 28  | OP-XY Arrangement Mode Tutorial: How to Build Full Songs          | Dennis Cortes          | `l0nU1ZBJwpk` | 2026-09-13 | 1.1.33 by date               |
| 29  | Building a Beat With OP-XY Duck and Song Mode                     | Taylor Fiore           | `k6BI73cN-Vc` | 2026-09-14 | 1.1.0–1.1.33 (older footage) |
| 30  | Making an IDM Track from Scratch on the OP-XY (Sequencer)         | Jawn Doe               | `dVNWPgmmxVA` | 2026-09-22 | 1.1.33 by date               |

**TE's short clips** (no speech, so no captions; only their descriptions were read): `ob7xFFTuwCg`
pulse step component, `6aUDSj-7WUQ` bar parameters, `OPVnlbMrO8I` step sequencing, `v1r0msyY_Jo`
tape, `LOtWR6wC1BU` punch-in FX, `Q5emTSgWhTM` what's in the box, and the promos `YF-dpDuBt0c`,
`xceQgvssxeU`, `ukES66CtiAg`. Their descriptions repeat the guide (pulse takes 1–9 on the
accidentals; the bar parameters work while playing and shape smooths automation; the punch-in
keyboard's upper half is for synths and the lower for percussion; tape keys trigger loops of the
recorded audio).

## 2. Findings by area

### 2.1 Firmware history and changes

- **"Random presets" is a factory project template**, in 1.1.15's template support and named in
  neither the changelog nor the guide: `shift + project` → templates → "random presets" → load
  puts a random preset on each of the eight instrument tracks, a new draw on every load. The other
  factory template, "clean", is the ordinary new-project start — `M-bZe8a8wTw` 00:22, 01:00–01:44,
  05:54; `NB6aWKnRl7k` 03:37; `g3NQICq9tKY` 03:40; `BpzAEUiRjYQ` 06:29 (1.1.25) — [new]
- 1.1.0 was the 13th update in the unit's first year and the first one TE focused on new features
  rather than fixes — `gY2IEjrh7Zg` 02:27–03:14 — [confirms changelog]
- Before 1.1.15 the preset browser's views swapped with shift + turn; since then an encoder click —
  `SC7oJ6AqJdI` 1:58:27, `NB6aWKnRl7k` 01:51 — [confirms instrument.preset-browser#views]
- On 1.0.13 `shift + M1` opened a list of 12 bare engines (8 synths, 3 samplers, external) and a
  pick reset the track to that engine's default sound; the sampler engines arrived empty. By 1.1.25
  it opens the presets ("variations of the same instrument") — `SC7oJ6AqJdI` 1:25:16, 3:05:21;
  `BpzAEUiRjYQ` 08:14 — [refines instrument.engine#browser]
- Deleting a project took one press on 1.0.13 (1.0.38 made it a hold) — `SC7oJ6AqJdI` 1:12:35 —
  [refines project.projects-folder#delete]
- A CPU-chip icon already showed on the project screen on 1.0.13, white under load and red when
  voices are stolen — `SC7oJ6AqJdI` 1:18:39 — [refines project.system-usage-indicators: the three
  indicators are 1.1.15's, a CPU sign is older]
- Before 1.0.29 an empty scene started every track on pattern 1; since then it copies the current
  scene — `SC7oJ6AqJdI` 2:58:20, `a9DD2dvoXGk` 06:55 — [confirms arrange.scenes#empty]
- On 1.0.45 the tape's `M1` (pitch, speed, length, mix) could not be locked, while its LFO page could
  — `P5czRVSYGQk` 00:24 — [refines auxiliary.tape#p-locks; 1.1.15 only fixed locks not showing]
- The OP-Z's skip-counter reset digit was dropped on the OP-XY; 0 is random — `J5rsaiZKaXw` 11:38 —
  [new; fits 1.0.29's "remove old spark component functionality"]
- Roadmap remarks from TE (intent, not features): a second LFO per track, a duck that listens to one
  note, a rough time-stretch; more than 24 slices unlikely (a kit holds 24 sounds) — `gY2IEjrh7Zg`
  27:46, 28:26, 29:15, 40:54, 41:48 — [new]

### 2.2 Sequencer, recording and clearing

- `record + play` blinks red until the first note starts the take; pressing `play` again while it
  blinks gives a count-in — `BpzAEUiRjYQ` 04:23, `l0nU1ZBJwpk` 02:24, `3vOcs1VP9Tw` 05:44 —
  [confirms sequencer.live-recording#count-in]
- Pressing `play` again ends a latched recording — `SC7oJ6AqJdI` 10:13 — [new]
- **`record + hold stop` clears the current pattern only**: a copy pasted into pattern 3 kept its
  notes when pattern 1 was cleared — `l0nU1ZBJwpk` 07:16 (1.1.33) — [contradicts
  sequencer.clear-and-undo#track, "everything recorded on the current track"]
- `shift + record` undoes and a second press redoes, with a popup reading undo, redo or cannot undo
  — `BpzAEUiRjYQ` 05:39 — [refines sequencer.clear-and-undo#undo]
- Notes entered on a held step keep the velocity they were played with — `SC7oJ6AqJdI` 17:28 — [new]
- Step recording over steps that hold notes replaces them — `SC7oJ6AqJdI` 22:16 — [new; the replica
  agrees]
- A nudge made at quantise 100 is stored but not heard; lowering quantise makes it audible, and
  quantise acts at playback on live takes too — `SC7oJ6AqJdI` 18:47, `dVNWPgmmxVA` 07:47 —
  [confirms sequencer.nudge#quantise-at-playback, so far only derived]
- Holding a step and pressing another copies across bars when `bar` is tapped in between —
  `dVNWPgmmxVA` 03:34 — [refines sequencer.copy-step#paste]
- Bends from the strip are recorded into the pattern — `2hzRP2SevVw` 06:25 — [new]

### 2.3 Step components

- **Skips have four pass patterns.** Pressing the same black key again cycles: only the Nth of N
  passes, only the 1st, the first N−1, all but the 1st (2 has only the first two). Shown on all
  three skips; a new digit starts the cycle again; 9 exists — `J5rsaiZKaXw` 01:41–02:00, `gvTgLEcCC-A`
  04:37, `XkzrwYYQOzo` 06:15, `SC7oJ6AqJdI` 55:47–57:34, `KXVWwwIIfBE` 15:02 (1.1.21) —
  [refines sequencer.step-component-reference#skips; contradicts the replica, `playsOnPass` in
  `src/lib/sim/sequencer-playback.ts`, which knows only "every Nth"]
- The value display flashes the passes that will play; the screen names the component with a short
  description (skip trigger 2's reads as if every second trig were skipped, though it plays the
  second pass) — `gvTgLEcCC-A` 04:22–04:31, `J5rsaiZKaXw` 01:41 — [new; Q6]
- Skip trigger 0 drops a random subset of a step's notes on each pass, not the whole step —
  `gvTgLEcCC-A` 06:14, `J5rsaiZKaXw` 09:20 — [refines component-skip-trigger; contradicts the
  replica, which drops the whole step]
- The three skips count passes on their own and do not gate each other; skip component gates every
  other component (pulse … jump) — `J5rsaiZKaXw` 07:05, 08:48; `gvTgLEcCC-A` 07:40 — [refines
  component-skip-step-component]
- With a step selected under shift, the white keys of its components light; tapping a lit white key
  removes that component, holding it (about a second) keeps it for a new digit; a selected step
  cannot be deselected by pressing it again — `gvTgLEcCC-A` 02:12, 02:55, 19:08; `J5rsaiZKaXw` 08:12
  — [refines sequencer.step-components#remove]
- Components work on empty steps (pulse or hold 4 on a blank bar delays a track's entry; jump 8
  parks a track) — `SC7oJ6AqJdI` 35:23, `XkzrwYYQOzo` 01:41 — [new; our add procedure assumes notes]
- Defaults before a digit is pressed: multiply 2, velocity 5, ramp up/down and random 4, skip
  trigger 2, pulse and pulse hold 4, tonality fifth up — `gvTgLEcCC-A` 02:35, `SC7oJ6AqJdI` 08:56,
  33:49, 46:25 — [confirms sequencer.step-component-reference#defaults]
- **Pulse count disagrees between videos.** windowbed: pulse N plays N times in all, one step each
  (pulse 2 at scale 4 = two quarter notes, 2–9, 0 random) — `XkzrwYYQOzo` 09:45, `J5rsaiZKaXw`
  36:33. The video manual: digit 1 plays twice, i.e. N extra — `SC7oJ6AqJdI` 34:43. Our manual
  and the replica use 1 + N — [contradicts sequencer.component-pulse#add if windowbed is right;
  device check §5]
- Pulse with pulse hold: 4 + 4 one note over 4 steps, 8 + 4 two notes of 4, 8 + 2 four notes of 2,
  3 + 2 three notes of 2 (pulse sets the span, hold the note) — `XkzrwYYQOzo` 10:43–12:10,
  `J5rsaiZKaXw` 36:50 — [new; the replica adds 1 + pulse + hold]
- A pulsed step pushes the track behind the others, more each pass; jump 9 realigns it —
  `SC7oJ6AqJdI` 34:00, `P5czRVSYGQk` 24:01, `J5rsaiZKaXw` 38:11 — [confirms
  component-pulse#later-steps and component-jump#align, both only derived until now]
- Jump 1–4 go to steps 1, 5, 9, 13 of the current bar (jump 1 on step 32 lands on 17); 5 forward,
  6 back, 7 either, 8 stays (silent if the step is empty), 9 realigns, 0 random. Jump 6 on every
  step plays a pattern backwards — `gvTgLEcCC-A` 21:55, `XkzrwYYQOzo` 02:41, 05:45, 16:12,
  `SC7oJ6AqJdI` 1:03:26 — [confirms sequencer.component-jump#values]. On 1.0.13 the video manual
  found jump targets always in bar 1 — `SC7oJ6AqJdI` 53:07 — [history; 1.0.15 already shows the
  current bar]
- Changing a parked track's jump 8 to 9 while it plays snaps it back in place — `J5rsaiZKaXw` 34:35
  — [new]
- Multiply: 4 gives four even hits inside the step; hits divide the track-scaled step; 0 random. The
  video manual says the options run 1 to 9 hits but never plays 9 — `SC7oJ6AqJdI` 36:13–36:48 —
  [partly answers Q4 (multiply 9)]
- Ramps: the first pass plays the written note, then one stage per pass; options read 2–6 steps
  over one octave, then the same over three octaves; ramps and random move in the brain's scale —
  `SC7oJ6AqJdI` 39:38, 40:21, 40:44 — [refines sequencer.component-ramp-up]
- Ramp or random plus multiply on one step gives an arpeggiated flourish — `SC7oJ6AqJdI` 1:01:31 —
  [new, how each hit takes a stage is a guess]
- Velocity: 9 forces velocity 0 (a silent hit, used as a mute), 3 gives 16, 0 random; nothing is
  heard unless the preset's velocity sensitivity is up, and the component also feeds the mod tab's
  velocity routing — `gvTgLEcCC-A` 12:59, `J5rsaiZKaXw` 10:32–10:39, `oBTL_sevDxM` 03:09,
  `SC7oJ6AqJdI` 1:48:42 — [confirms sequencer.component-velocity]
- Tonality on a drum track moves the hit to another key of the kit (octave up = the key 12 above,
  6/7 the neighbouring key, an empty key plays nothing); 1 ignores the brain; 8/9/0 quantise to the
  brain's scale — `gvTgLEcCC-A` 18:55, `J5rsaiZKaXw` 21:33, 24:50, `SC7oJ6AqJdI` 47:28, 49:41 —
  [refines sequencer.component-tonality]
- Portamento component: with the track's portamento on, the `M2` shift card's portamento value moved
  as the component's steps played, as if each step set the track's own glide — `SC7oJ6AqJdI`
  43:02–44:01 — [refines component-portamento; the replica keeps a separate per-step glide]
- With bend range off and pitchbend routed in the mod tab, bend components move the routed target
  instead of pitch — `SC7oJ6AqJdI` 1:56:59 — [refines sequencer.component-bend#depth]
- Pass counts carried over from one chained pattern into the next on 1.0.15 — `gvTgLEcCC-A` 24:58 — [new, possibly a bug]
- The step-component menu cannot clear only the components; clearing the track was the way —
  `SC7oJ6AqJdI` 55:21 — [new]

### 2.4 Parameter locks

- **A lock holds until the next lock**: a level locked to 0 on step 1 and full on step 16 stays at 0
  until step 16 — `bVLcqzkcgKo` 02:24 — [refines sequencer.parameter-locks#playback; contradicts the
  replica, which returns to the track's value after a step without locks
  (`src/lib/sound/scheduler.ts`, `automate`)]
- With the bar card's shape at full the value ramps over the whole gap and arrives at the next
  lock; at half it holds for half the gap, then ramps; the ramp never wraps from the last lock back
  to the first — `bVLcqzkcgKo` 02:44–03:20, `2hzRP2SevVw` 11:18 — [refines sequencer.bar-menu; new]
- **Mixer values take locks** (mix `M1` level, pan, sends; hold a step in mix mode and turn), and
  live-recorded moves; fades are built this way. The master EQ cannot be locked — `SC7oJ6AqJdI`
  3:01:14, 3:03:06; `0wBY7895qPQ` 18:46; `gvTgLEcCC-A` 08:05 — [new]
- Since 1.1.0 drum steps lock tune, sample start and play mode; drum-page values are stored per key —
  `gY2IEjrh7Zg` 54:36–55:46, `J5rsaiZKaXw` 04:53 — [confirms sequencer.parameter-locks#samplers]
- External MIDI CC slots and a midi-engine track's channel can be locked per step (notes then
  alternate channels) — `SC7oJ6AqJdI` 2:29:31, `2hzRP2SevVw` 21:40 — [new]
- Holding a locked step shows its values; during playback the page follows each step's locks —
  `a9DD2dvoXGk` 06:03, `SC7oJ6AqJdI` 20:06 — [refines sequencer.parameter-locks#show-locks]
- The preview of a lock added to a step carrying skip parameter lock is not heard — `gvTgLEcCC-A`
  10:28 — [new]

### 2.5 Bar card, track scale, groove, quantise

- Bar card: `E1` quantise, `E2` length of step-entered notes only, `E3` this track's groove, `E4`
  shape (a right-angle glyph that turns diagonal); footer clr notes, clr params, clr all (held) —
  `SC7oJ6AqJdI` 27:05–28:27, `BpzAEUiRjYQ` 33:28–33:43 — [confirms sequencer.bar-menu]
- With the card pinned (`shift + bar`) the black keys alone set track scale and `[+]`/`shift + [+]`
  add or duplicate bars — `dVNWPgmmxVA` 02:43, `XkzrwYYQOzo` 04:17 — [refines sequencer.bar-menu#held]
- The card can be held from any mode — `BpzAEUiRjYQ` 30:58 — [new; our unit scopes it to
  instrument and auxiliary]
- Track scale: key 9 is 16 (a bar per step), key 0 is ½; 7 worked before 1.1.25's odd-scale grid;
  scale 16 with four bars lasts 1,024 sixteenths — `SC7oJ6AqJdI` 23:58, 24:17, 29:56;
  `XkzrwYYQOzo` 08:47 — [refines sequencer.track-scale]
- At quantise 100 the groove, swing and nudge are not heard — `dVNWPgmmxVA` 08:15 — [new for groove]
- Tempo page: `shift + turn E1` gives tenths (106 → 106.2); clicking the groove-amount encoder
  centres it; groove order shuffle, half shuffle, danish, bombora, wobbly, gaussian, accent, island
  nod, disfunk, roll over, prophetic; shuffle is the default; a negative amount plays early —
  `SC7oJ6AqJdI` 06:35, 31:14, 1:21:07–1:22:01 — [confirms tempo.grooves#types; new: fine tempo,
  groove reset]
- Groove raised on a track also changes velocities — `J5rsaiZKaXw` 18:23 — [confirms tempo.grooves#what]

### 2.6 Players

- **Arpeggio pattern order** heard by turning `E2`: up, down, up/down, up/repeat/down, play order,
  random last — `a3A0OkI-5GA` 05:10–06:17, `SC7oJ6AqJdI` 1:05:27 — [contradicts the replica's
  `ARP_PATTERNS` (`src/lib/sim/sequencer.ts`), random before play order; the guide's order]
- **Arpeggio styles** (`shift + E2`): off, then sub-sequences such as returning to the first note
  between each (1-2-1-3-1-4), each note twice, and three up then back to the first; the presenter
  warns the bar-chart icon is only a hint — `a3A0OkI-5GA` 08:59–10:58 — [refines players.arpeggio#style-vs-pattern;
  contradicts the replica's invented `ARP_STYLES` (converge, diverge, pinky, thumb)]
- Arpeggio shift layer: `E1` note length (anticlockwise short), `E3` glide, `E4` stereo alternating
  notes left and right; `E3` range 1–4 octaves — `a3A0OkI-5GA` 06:35, 07:47–08:33 — [confirms
  players.arpeggio]
- A freshly switched-on arpeggio plays very short notes: its length starts at the shortest —
  `oBTL_sevDxM` 11:42, `P5czRVSYGQk` 15:32 — [contradicts the replica's default length 50
  (`src/lib/sim/sequencer.ts`)]
- **Maestro's reference is the first note entered**, every later note an interval from it (C then
  C♯ adds a semitone above any key; C then the B♭ below adds a tone below); repeated notes are kept;
  eight notes fit — `KXVWwwIIfBE` 04:04, 06:03, 19:02; `SC7oJ6AqJdI` 1:07:32 — [confirms
  players.maestro#eight; contradicts the replica's `maestroNotes` (lowest note as root) and its
  de-duplicated chord entry]
- Maestro plays a triad before any chord is stored; `E2` order (up, down, up/down, random) matters
  only with roll above 0; roll higher = slower strum; in random order the pressed key's own note
  always sounds — `SC7oJ6AqJdI` 1:07:09, 1:07:51; `a3A0OkI-5GA` 02:53, 03:25; `KXVWwwIIfBE` 15:58 —
  [new; refines players.maestro]
- A maestro chord survived loading a preset of another engine — `utFXjxN5LSc` 17:14 — [new]
- `player` toggles the player; `shift + player` lists arpeggio, hold, maestro; stop or switching the
  player off releases held notes — `a3A0OkI-5GA` 00:43, 02:04; `SC7oJ6AqJdI` 1:04:39–1:08:43 —
  [confirms players.overview, players.hold#release]

### 2.7 Linked tracks

- Hold the primary's key and press the other: both keys light, the primary brighter; the link runs
  one way, and linking the other way too lets either track play both — `ERex7ogcc7Q` 00:35–02:15 —
  [confirms basics.linked-tracks#how; new: LEDs, two-way]
- **Several primaries can drive one track** (T2 and T3 both linked to T1); a muted primary sends
  nothing — `ERex7ogcc7Q` 05:39–08:14 — [new; contradicts the replica's `#link`
  (`src/lib/sim/opxy-sim.svelte.ts`), which removes a reverse link and lets a track follow only one
  primary]
- A silent midi-engine track linked to a synth track feeds it notes (polymeter with different
  lengths) — `ERex7ogcc7Q` 05:39–06:56, `2hzRP2SevVw` 15:34 — [new technique]
- Each linked track keeps its own envelopes, filter, LFO and player; four tracks at most; pressing a
  linked key again while holding the primary unlinks (said) — `ERex7ogcc7Q` 01:31, 10:20;
  `SC7oJ6AqJdI` 1:27:16 — [confirms basics.linked-tracks; refines #unlink]

### 2.8 Brain

- **The brain's keyboard shifts the music diatonically and by octave.** In auto mode on C major,
  pressing D reads "D dorian" and E "E phrygian"; G makes the progression start on the fifth; in
  E♭ major, C reads "C minor"; a key outside the scale gives stranger modes; the same root an octave
  or two lower moves everything down that far — `cf35tXOKW8Y` 05:43–07:16, 11:22–11:35, 14:02–14:19
  (1.0.9) — [new; contradicts the replica's `brainShift` (a chromatic shift of −5…+6 by pitch class)
  and `brainFrame` (title keeps the scale), `src/lib/sim/areas/auxiliary/sim.ts`]
- Detected keys are spelled with sharps (E♭ major read "D# major"); an ambiguous or out-of-scale
  harmony reads "C undefined" — `cf35tXOKW8Y` 10:01, 18:26; `SC7oJ6AqJdI` 49:12 — [new]
- Pressing a brain key with the transport stopped starts the sequencer — `SC7oJ6AqJdI` 2:20:59 — [new]
- Brain presses recorded live play back as transpositions per step — `cf35tXOKW8Y` 12:40, 20:41 —
  [confirms auxiliary.brain#sequence]
- `E4` link plays chords on the linked track while the routed tracks transpose — `SC7oJ6AqJdI`
  2:21:52 — [confirms auxiliary.brain]
- `M2` routing: an encoder click flips between tracks 1–4 and 5–8; the turning direction is not
  given — `BpzAEUiRjYQ` 12:41 — [confirms auxiliary.brain#routing-page; Q4 stays open]

### 2.9 Punch-in FX

- The per-track shortcut (`shift` + keys on an instrument track): any number of keys at once;
  `shift` can be let go while the keys stay down (the effect lasts while a key is held, through
  track and mode changes and a queued scene); lower octave = this track, upper = its group —
  `3vOcs1VP9Tw` 01:04–05:24, `KXVWwwIIfBE` 09:50, 12:49 — [confirms auxiliary.punch-in-fx#shortcut;
  new: shift release]
- Recorded with `record + play`, shortcut effects land on aux T2 and are erased there with `record
  - hold stop`(the red LEDs sweep) —`3vOcs1VP9Tw` 05:44–07:35 — [confirms punch-in-fx#record]
- While playing, `shift` + a white key + a step key stuck an effect to that step, removed with
  `shift` and the same key; the presenter calls it "divide", so it is most likely the step-component
  gesture done key first — `3vOcs1VP9Tw` 07:48–09:00 — [new; worth a check]
- **Lower G repeats on the drums** — `KXVWwwIIfBE` 30:35 — [answers Q8 (G on drums);
  settles punch-in-fx#repeat-drums]
- G, A and B change the rhythm; on drums B acts like a fill — `KXVWwwIIfBE` 02:41, 30:52 —
  [partly answers Q8 (B)]
- A maestro on T2 fans one press into several effects, across octaves (both groups) — `KXVWwwIIfBE`
  04:33, 09:29 — [new]
- Muting T2 silences its sequenced effects for the scene; live presses still pass — `KXVWwwIIfBE`
  17:36, `bVLcqzkcgKo` 06:57 — [new]
- Punch-in steps carry skips and bends like notes — `KXVWwwIIfBE` 03:23, 14:55 — [confirms
  auxiliary.overview#sequenced]

### 2.10 Tape (answers most of Q8's tape part)

- The tape records continuously while the sequencer plays; its keys replay that buffer whether the
  transport runs or not — `SC7oJ6AqJdI` 2:34:15–2:34:23, `BpzAEUiRjYQ` 16:11 — [answers Q8]
- **A key picks the start point in the recorded bar, one sixteenth per semitone from F**: F the
  downbeat, G the first eighth off-beat, A beat 2, C♯ beat 3, the upper F beat 4 — `P5czRVSYGQk`
  22:26 — [answers Q8]
- A note on a tape step starts playback at that step for the note's length; with length 16 an F on
  step 1 replays the bar just gone, so chord changes come back a bar late — `P5czRVSYGQk` 02:03,
  04:08, 09:10 — [answers Q8]
- `E3` length is the loop in steps (4 a beat, 3 lopsided, 2 eighths, 16 a bar); it counts source
  steps, so at 150 % eight steps last about 5⅓ — `P5czRVSYGQk` 05:00–05:35, 11:54 — [answers Q8]
- `E1` pitch is a whole-number speed multiple (x2 an octave, x4 two); the keyboard octave doubles or
  halves the rate rather than moving the start points; half and quarter speed sound lo-fi —
  `P5czRVSYGQk` 01:27–01:31, 08:02–10:17 — [answers Q8]
- `E2` speed is varispeed, 1 % per detent: 150 % a fifth up, 133 % a fourth, 125 % a major third;
  99 % at mix 50 gives a chorus — `P5czRVSYGQk` 01:37, 10:49–14:26; `a9DD2dvoXGk` 09:00 — [answers Q8;
  refines auxiliary.tape#ranges]
- Jumping back leaves audible seams and level steps on swelling pads — `P5czRVSYGQk` 03:54 —
  [answers Q8]
- The tape sends belong to the source tracks' patterns, and T6's `M2` shows the same values (a click
  of `E1` reaches tracks 5–8); T5 can feed the tape (off by default) — `P5czRVSYGQk` 21:01,
  `SC7oJ6AqJdI` 2:35:32–2:36:48 — [refines instrument.track-sends]
- The tape's filter acts on its playback; its `M4` LFO reaches synth parameters 1–3 (pitch, speed,
  length); pulse and hold on tape steps make stutters — `5RrjxcscbGA` 22:42, `P5czRVSYGQk` 05:57,
  27:22, `SC7oJ6AqJdI` 2:38:29 — [new]

### 2.11 Samplers, sampling and slicing

- Hold a drum key on `M1`: a menu with slice on `M1` (copy and paste existed from 1.0.29) —
  `gY2IEjrh7Zg` 13:44–13:50, `a9DD2dvoXGk` 02:05 — [confirms sampler.slicing#open]
- **Slices fill the sliced key and the keys to its right**, never to its left, up to 24; from a key
  near the top only a few fit and the count blinks — `gY2IEjrh7Zg` 14:24, 15:40–16:09 —
  [contradicts howto.slice-a-loop (fills from F3, the loop stays on E5), the replica's
  `applySlices` (`src/lib/sim/areas/sample/slicer.ts`, "from F3") and the agent's tool text
  (`src/lib/agent/tools/navigate.ts`:98)]
- The slicer opens in transient mode (then even, then tap on `E1`); in transient a slice's start is
  the previous slice's end; `shift + key` drops a slice in transient mode too, and done repacks the
  kept ones onto consecutive keys; no sensitivity control (the count stands in) — `gY2IEjrh7Zg`
  13:56, 14:53, 17:02, 17:54; `lLX1U5IzPRw` 00:40 — [refines sampler.slicing; contradicts the
  replica (tap-only deletion, separate start and end, no repack)]
- No time-stretch: slices keep their speed when the tempo changes — `gY2IEjrh7Zg` 22:54 — [new]
- Drum-key paste brings the key's settings with its sample, and works only inside the drum sampler
  — `mhCC_je8xC0` 04:01, `LebAQHf_TjY` 06:39 — [refines sampler.drum-sampler#copy-paste]
- **Drum key fade-out**: `shift + click E3` switches `E3` from the key's fade-in to its fade-out
  (release), which matters in key (gate) mode — `5RrjxcscbGA` 02:00–03:53 — [new; the replica does
  nothing for that click]
- **Synth sampler loop types** with `shift + click E3`: until release → ∞ (loops through the release)
  → off — `5RrjxcscbGA` 08:52–09:19 — [refines sampler.synth-sampler#loop-types; the replica cycles
  the reverse way]
- Sample sources on the sample page include the headset mic and resampling the unit's own output
  — `BpzAEUiRjYQ` 28:57, `SC7oJ6AqJdI` 07:20, 3:11:25 — [contradicts sampler.sampling#not-t5-inputs
  and the replica's mic / line in / USB list]
- The threshold shows as a red line on the meter; a take is named after the project and a note
  (P1 G3); line-in sampling picks L, R or both with shift and an encoder, no summed mono —
  `BpzAEUiRjYQ` 29:10, `SC7oJ6AqJdI` 3:05:00, `a9DD2dvoXGk` 04:10 — [refines sampler.sampling]
- `[-]`/`[+]` shift a drum key's pitch by octaves; multisampler zones can be recorded in any order;
  the top zone also plays the keys above it — `SC7oJ6AqJdI` 3:11:44, 3:13:26, 3:14:08 — [new;
  refines sampler.multisampler#fill-down]
- **Mono play mode on a kit does not choke**: overlapping keys kept sounding — `LebAQHf_TjY`
  05:44 — [contradicts instrument.play-mode#mono-legato for kits]
- The sample library shows subfolders as [name], one level deep (deeper fails over MTP), previews as
  you scroll (`stop` ends it), and starts with a presets folder — `NB6aWKnRl7k` 00:16–02:07,
  `g3NQICq9tKY` 06:13–06:52 — [confirms sampler.sample-library; refines sample-files#nesting]

### 2.12 Engines and preset settings

- Simple's pulse width acts only in the square half of shape — `SC7oJ6AqJdI` 2:11:54 — [refines
  instrument.engine-simple; matches note 57]
- Built-in tunings besides the 11 user slots: equal (default), bagpipe, guitar and more —
  `SC7oJ6AqJdI` 1:50:56 — [contradicts the replica's tuning row, equal and user 1–11 only
  (`src/lib/sim/areas/system/settings.ts`)]
- Preset transpose reaches three octaves each way and moves the keyboard too; global transpose
  moves only sequenced notes (1.0.13) and sits behind the project view's `M4` config — `SC7oJ6AqJdI`
  1:53:12–1:53:45, 1:14:19; `utFXjxN5LSc` 03:22 — [contradicts the replica's ±24]
- Mod targets name engine parameters as "synth 1", "synth 2" …; targets include amp release and LFO
  amount and speed; amounts ±50 — `SC7oJ6AqJdI` 1:54:52, `oBTL_sevDxM` 09:58, `2hzRP2SevVw` 03:30 —
  [contradicts the replica's `MOD_TARGETS` names (`src/lib/sim/areas/system/catalogue.ts`)]
- Preset width sounds moving, chorus-like rather than static — `SC7oJ6AqJdI` 1:49:59 — [new]
- Holding a track key offers scramble, copy, paste, save; save makes a snapshot under a snapshot
  category (empty folders are hidden, which explains note 59's missing entry) — `SC7oJ6AqJdI`
  1:59:17–2:00:57, `g3NQICq9tKY` 04:53 — [refines instrument.preset-browser#categories]

### 2.13 Envelopes, play mode, filter

- **Drum `M2` is not an ADSR on 1.0.15**: start, attack, hold and decay over the last-played
  waveform, one envelope at a time, a click to the filter envelope — `5RrjxcscbGA` 00:45, 18:26 —
  [contradicts instrument.envelopes (ADSR, both drawn; measured on synth tracks only); drum `M2` is
  unseen on 1.1.33]
- Bend range was 2 on a factory preset by default, with off and 1 … 12; portamento shows as a plain
  number — `SC7oJ6AqJdI` 1:32:03, `utFXjxN5LSc` 26:19 — [partly answers Q4]
- The preset high-pass lives under `shift + instrument`, has no resonance and survives scramble —
  `5RrjxcscbGA` 10:03–10:29 — [confirms instrument.preset-settings#open; corrects QUESTIONS item 15
  and note 62 §4, which say `shift + M2`]
- A click of `E1` on `M3` steps through the filter types (svf, ladder, z lowpass, z hipass) —
  `5RrjxcscbGA` 12:16 — [new]
- A kit shares one filter and envelope; key tracking opens higher keys more — `5RrjxcscbGA` 19:05,
  `gY2IEjrh7Zg` 28:58 — [refines instrument.filter#key-tracking-law]

### 2.14 LFOs and the duck

- **Duck release, by TE**: a higher release comes back more slowly — `gY2IEjrh7Zg` 35:14 —
  [contradicts instrument.lfo-duck#timing and note 60 §4 (higher CC recovers faster) and
  `DUCK_RELEASE_MS` in `src/lib/sound/mapping.ts`; device check §5]
- Duck defaults to track 1 as its source with note triggering (velocity ignored); a click of `E1`
  swaps notes and audio; past 16 comes the metronome; aux tracks 11 and 12 serve as trigger-only
  sources; loading another preset removes the duck — `gY2IEjrh7Zg` 36:57–39:30, `lLX1U5IzPRw`
  02:06–05:25 — [refines instrument.lfo-duck; contradicts the replica, which never ducks from aux
  sources (`DUCK_ON_NOTHING`)]
- Random's envelope is set with shift and fades the modulation in; random restarts per note on
  key-synced destinations — `SC7oJ6AqJdI` 1:42:37–1:43:16 — [contradicts note 60 §4, "no encoder
  reaches the env card"; Q5]
- Tremolo and value change shape with an encoder click (tremolo: square, narrow pulse, sine, saw;
  value: sine, square, reverse saw, saw) — `SC7oJ6AqJdI` 1:45:31, 1:46:21 — [contradicts
  instrument.lfo-tremolo#shape (`shift + turn E2`); the value unit and replica have no shapes]
- On 1.0.15 element's envelope source followed the filter envelope — `SC7oJ6AqJdI` 1:38:27 —
  [history; 1.1.0 fixed an element-envelope bug and note 60 measured the amp envelope on 1.1.33]

### 2.15 FX

- Labels on 1.0.13: chorus rate, depth, feedback, stereo; delay size, time, feedback, mix;
  distortion drive, clip, low cut, high cut; lofi rate, bits, quality, drift (our first sighting);
  phaser frequency, depth, rate, feedback (12-pole); reverb size, mod, tone, mix — `SC7oJ6AqJdI`
  2:43:03–2:46:06 — [confirms fx.*#labels]
- An FX track's `M2` sets each track's send amount, `M3` is a high/low-pass to switch on (`E1` HP,
  `E4` LP), the keyboard plays the last instrument track, and both slots may hold the same effect —
  `SC7oJ6AqJdI` 2:41:06–2:47:12, `5RrjxcscbGA` 22:07 — [refines auxiliary.routing-filter-lfo]
- Each FX-track pattern holds its own effect type — `0wBY7895qPQ` 07:45–12:42, `oBTL_sevDxM` 09:17
  — [refines auxiliary.fx-sends#choose; Khordmaster found the type project-wide but never gave T7
  its own pattern, `n-ypkKaAjBM` 09:26]

### 2.16 Mixer

- **Level, pan and sends are stored in the pattern; mutes in the scene** — `bVLcqzkcgKo` 04:34,
  `0wBY7895qPQ` 05:21, `n-ypkKaAjBM` 06:12 — [contradicts mix.overview#per-scene,
  arrange.scenes#what and basics.patterns-scenes-songs#scene; note 10 §3.3's file decoding agrees
  with the videos]
- Holding several track keys solos them and an encoder then moves that setting on all of them —
  `bVLcqzkcgKo` 01:00 — [new]
- At level 0 nothing reaches the FX (sends are post-level) and notes still go out over MIDI; the
  `E4` mute stops both; live notes on a muted active track still sound — `bVLcqzkcgKo` 04:21–06:00
  — [refines mix.mute-solo#notes-not-audio]
- A muted strip is drawn hatched (`shift + Tn` or `click E4`) — `BpzAEUiRjYQ` 24:48, `bVLcqzkcgKo`
  05:46 — [new screen fact]
- Saturator: `E1` gain, `E2` clip, `E3` tone, `E4` mix, a click resets; master chain EQ →
  saturator → compressor → limiter (no controls); the EQ resets per band on a click —
  `BpzAEUiRjYQ` 26:51, `SC7oJ6AqJdI` 3:04:17, `NB6aWKnRl7k` 03:15 — [new / refines mix.master]
- `mix` and `arrange` open on the instrument tracks first, a second press shows the aux tracks —
  `bVLcqzkcgKo` 10:08 — [refines mix.overview#toggle; the replica remembers the last side]

### 2.17 Arrange: patterns, scenes, songs, sound link

- Arrange: `E1`/`E2` nothing, `E3` sound link, `E4` pattern, `click E4` mute; `M1` adds an empty
  pattern and plays it; paste appends the copy as the last pattern; deleting needs a hold —
  `l0nU1ZBJwpk` 01:26, 03:03, 07:32; `BpzAEUiRjYQ` 20:17; `SC7oJ6AqJdI` 2:51:24 — [confirms / refines
  arrange.patterns]
- **In arrange, `shift + Tn` mutes and holding a track key solos** — `SC7oJ6AqJdI` 2:51:47, 2:52:52;
  `l0nU1ZBJwpk` 10:14 — [new; the replica does both only in mix]
- Holding shift lights the current scene's black key bright, used scenes dim, empty ones dark —
  `BpzAEUiRjYQ` 21:13, `l0nU1ZBJwpk` 09:10 — [new; the replica lights only the current one]
- `shift + [-]`/`[+]` step between scenes (an empty one arrives as a copy); clone goes to the next
  free scene and selects it — `0wBY7895qPQ` 02:51–04:00, `l0nU1ZBJwpk` 09:36, `k6BI73cN-Vc` 10:44 —
  [new; refines arrange.scenes#clone-reset]
- Muted tracks do not count toward scene length; a scene is at most 64 bars — `0wBY7895qPQ`
  14:41–15:29 — [refines arrange.scenes#length]
- **Queued scene**: `shift + play` puts a cue box right of the scene number, a digit fills it. TE
  says the switch lands at the end of the bar (`gY2IEjrh7Zg` 53:27; the stream's chapter text says
  the next downbeat), Dennis Cortes at the end of the scene (`l0nU1ZBJwpk` 11:13, 1.1.33) —
  [refines arrange.scene-queue#timing; the replica waits for the scene's end; device check §5]
- **Sound link**: a plain toggle makes pattern 1 the source; `shift` while toggling makes the
  current pattern the source; edits go to the source's sound; the other patterns are only bypassed,
  so switching off restores them; no pattern can opt out; the source pattern blinks in the stack,
  drawn as connected — `gY2IEjrh7Zg` 46:07–51:39 — [refines arrange.sound-link; contradicts the
  replica's "link" label (`src/lib/sim/areas/arrange/draw.ts`:170)]
- 14 songs, chosen with `shift` + a white key; song copy: hold shift and the lit song key, the footer
  shows copy and paste; a cued song entry (`shift + [-]/[+]`) blinks and switches when the scene ends
  — `l0nU1ZBJwpk` 13:46, 16:02, 16:40; `0wBY7895qPQ` 06:47 — [confirms arrange.songs#count; refines
  #cue; the replica draws a still ring]

### 2.18 MIDI, CV, external audio, Bluetooth

- **The OP-XY found and paired an advertising OP-Z itself** (com → devices) — `SC7oJ6AqJdI` 3:17:11,
  `2hzRP2SevVw` 08:15 — [contradicts com.bluetooth-midi#device-role]
- The devices page lists remembered devices that are not connected — `BpzAEUiRjYQ` 01:18 —
  [contradicts com.overview#m3]
- All tracks' MIDI goes to every output; per-device note and other switches are the only filter;
  pitch bend passes to outboard synths — `2hzRP2SevVw` 01:22, 07:07, 11:52 — [new]
- Multi-out: `com` + `E3` picks midi, CV, sync (8, 16, 24) or audio, locked while a cable is in; CV
  and gate come from T4 through a splitter — `O5SB6UC6rSY` 00:23–01:04 — [confirms com.multi-out]
- T5 inputs include the built-in mic, a headset mic, line in, USB and an internal resample; its
  input must be switched on with a click of `E1` — `SC7oJ6AqJdI` 2:32:39, `BpzAEUiRjYQ` 15:30 —
  [refines auxiliary.external-audio#inputs]

### 2.19 COM, projects, presets, templates, indicators

- **Projects folder (`shift + project`)**: factory, templates, user, autosaves; `M1` loads; the
  actions run load, history, duplicate, delete; a duplicate gets " 2" — `SC7oJ6AqJdI` 1:10:25,
  1:12:02; `BpzAEUiRjYQ` 06:29–06:46 — [answers Q4 (projects folder)]
- Own templates: save a project, then move it into `projects/templates` over MTP (on 1.1.15 users
  made that folder themselves); "make default" is in none of the videos — `NB6aWKnRl7k` 04:12–04:52,
  `g3NQICq9tKY` 02:33 — [refines project.templates#path, #copy-in]
- Preset folders are made in category view (hold shift → create, named "user 1" first); factory
  presets cannot move; cut then paste moves one's own — `g3NQICq9tKY` 00:39–01:34 — [refines
  instrument.preset-management#new-folder]
- Usage indicators sit top right, voice bars left of the CPU chip; voices show from 17 of 24 and the
  icon went solid red at 24 (before 1.1.25's rework); CPU shows from about 70 % — `g3NQICq9tKY`
  07:14–08:25 — [refines project.system-usage-indicators; contradicts #stealing for 1.1.15]
- MIDI monitor is `com → M1`'s last entry: incoming notes with channels, clock as a flashing mark —
  `g3NQICq9tKY` 10:46–11:25 — [refines com.midi-monitor]
- The com footer: settings, controller, devices, MTP (greyed without a computer); the com page also
  switches USB charging; delayed power-off asks to confirm while play continues — `BpzAEUiRjYQ`
  01:31, `SC7oJ6AqJdI` 3:18:48, 3:19:42 — [refines com.mtp#needs-computer, power-and-charging]
- Typing a name another project uses blanks "ok" — `SC7oJ6AqJdI` 06:08 — [new]
- One MTP drag of the projects folder onto the samples folder erased every project (1.0.40); 1.0.45
  blocks moves between root folders — `0wBY7895qPQ` 00:10–00:34 — [refines com.mtp#own-folders]

### 2.20 Screens and LEDs

- With shift held, steps without a component dim and selected steps blink; a step carrying a
  component lights a little brighter — `gvTgLEcCC-A` 01:43, `SC7oJ6AqJdI` 32:06 — [confirms
  sequencer.step-components#dim-and-blink]
- The playhead lights a step with no note (a track parked on jump 8) — `XkzrwYYQOzo` 07:36 — [partly
  answers Q4 (playhead)]
- Holding `instrument` lights the keys of unmuted tracks and `instrument + Tn` mutes from any mode —
  `SC7oJ6AqJdI` 17:37, 2:52:02 — [refines mix.mute-solo#shortcut]
- In arrange, muted tracks show dashed lines and grey out — `SC7oJ6AqJdI` 2:50:41 — [new; note 59
  never saw mute hatching]

## 3. Answers to open questions

| Question (docs/QUESTIONS.md)                                | Answer from the videos                                                                                                                                                            | Strength                        |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Q4 projects folder: `M1` load or delete?                    | `M1` loads; the list reads load, history, duplicate, delete (`SC7oJ6AqJdI` 1:10:25 on 1.0.15, `BpzAEUiRjYQ` 06:46 on 1.1.25)                                                      | answered                        |
| Q4 multiply black key 9                                     | The video manual says options run 1 to 9 hits; nobody plays 9 (`SC7oJ6AqJdI` 36:48)                                                                                               | partial                         |
| Q4 playhead over steps                                      | It lights an empty step (`XkzrwYYQOzo` 07:36); whether a step with notes dims is not shown                                                                                        | partial                         |
| Q4 T3 portamento and bend range                             | Bend range 2 on a factory preset, with off and 1 … 12 (`SC7oJ6AqJdI` 1:32:03); portamento a plain number (`utFXjxN5LSc` 26:19)                                                    | partial                         |
| Q4 headphones and speaker; brain routing direction          | Not answered (`BpzAEUiRjYQ` 12:41 shows only the 1–4 / 5–8 click)                                                                                                                 | open                            |
| Q5 random LFO's env card                                    | Shift reaches it and it fades the modulation in (`SC7oJ6AqJdI` 1:43:16, 1.0.15)                                                                                                   | partial                         |
| Q6 step-component and recording screens                     | Name plus description; flashing pass marks; lit white keys for a step's components; red blink until the first note (§2.3, §2.2)                                                   | partial (no pictures)           |
| Q7 loop crossfade                                           | Qualitative only; the loop-type order is until release → ∞ → off (`5RrjxcscbGA` 09:03)                                                                                            | open                            |
| Q8 G on the drums                                           | It loops the drums (`KXVWwwIIfBE` 30:35)                                                                                                                                          | answered                        |
| Q8 B (follow)                                               | On drums it reads as a fill or rhythm change (`KXVWwwIIfBE` 02:41, 30:52)                                                                                                         | partial                         |
| Q8 the tape's sounds                                        | Start points per semitone, length, octave, multiplier, varispeed ratios, seams, replay with the transport stopped (§2.10)                                                         | answered (to confirm on 1.1.33) |
| Q8 tilt, fills while stopped, ramp ranges, random intervals | Not shown                                                                                                                                                                         | open                            |
| Q9 eighth wavetable name                                    | Not in these videos                                                                                                                                                               | open                            |
| Q10 where `shift + Tn` opens                                | On the track's current preset (`l0nU1ZBJwpk` 05:25, 1.1.33)                                                                                                                       | answered                        |
| Q10 the midi engine                                         | On 1.0.15, `shift + M1` and scroll down to midi (`SC7oJ6AqJdI` 2:30:17); on 1.1.21 a template still kept T8 as a midi track (`oBTL_sevDxM` 15:03); the loading key is never named | partial                         |
| Q15 the preset high-pass                                    | It is under `shift + instrument`, not `shift + M2` (`5RrjxcscbGA` 10:03); the question's wording needs fixing                                                                     | correction                      |
| Q16 harvest                                                 | Sound link must be off on every track, or each load writes into the source pattern's sound (`gY2IEjrh7Zg` 46:32)                                                                  | caveat                          |

## 4. Contradictions with our manual or replica

**Our manual** (units to fix once the device confirms):

| Unit                                                                            | We say                                    | The videos show                                                      | Evidence                                   |
| ------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------ |
| howto.slice-a-loop                                                              | slices fill from F3, the loop stays on E5 | they fill from the sliced key rightwards, as many as fit             | `gY2IEjrh7Zg` 14:24, 15:44 (TE)            |
| instrument.lfo-duck#timing, note 60 §4                                          | higher release recovers faster            | higher release comes back slower                                     | `gY2IEjrh7Zg` 35:14 (TE, said)             |
| mix.overview#per-scene, arrange.scenes#what, basics.patterns-scenes-songs#scene | scenes store the mix                      | levels, pans, sends live in the pattern; scenes store mutes          | `bVLcqzkcgKo` 04:34, `0wBY7895qPQ` 05:21   |
| sequencer.clear-and-undo#track                                                  | clears everything on the track            | clears the current pattern                                           | `l0nU1ZBJwpk` 07:16 (1.1.33)               |
| sequencer.step-component-reference#skips                                        | every Nth only                            | four pass patterns per digit                                         | `J5rsaiZKaXw` 01:41 and four more          |
| sequencer.component-pulse#add                                                   | N extra plays                             | N plays in all (windowbed; the video manual disagrees)               | `XkzrwYYQOzo` 09:45 vs `SC7oJ6AqJdI` 34:43 |
| instrument.envelopes (drum tracks)                                              | ADSR, both envelopes drawn                | start, attack, hold, decay over the waveform, one at a time (1.0.15) | `5RrjxcscbGA` 00:45, 18:26                 |
| instrument.play-mode#mono-legato (kits)                                         | mono plays one note at a time             | kit keys still overlap in mono                                       | `LebAQHf_TjY` 05:44                        |
| instrument.lfo-tremolo#shape                                                    | `shift + turn E2`                         | an encoder click                                                     | `SC7oJ6AqJdI` 1:45:31 (1.0.15)             |
| note 60 §4 (random env card)                                                    | no encoder reaches it                     | shift reaches it                                                     | `SC7oJ6AqJdI` 1:43:16 (1.0.15)             |
| sampler.sampling#not-t5-inputs                                                  | no headset or resample source             | headset and resampling on the sample page                            | `BpzAEUiRjYQ` 28:57, `SC7oJ6AqJdI` 3:11:25 |
| com.bluetooth-midi#device-role                                                  | the OP-XY only advertises                 | it found and paired an OP-Z itself                                   | `SC7oJ6AqJdI` 3:17:11, `2hzRP2SevVw` 08:15 |
| com.overview#m3                                                                 | devices connected now                     | remembered devices listed too                                        | `BpzAEUiRjYQ` 01:18                        |
| project.system-usage-indicators#stealing                                        | blinks red on a steal                     | solid red at 24 voices (1.1.15, before 1.1.25's rework)              | `g3NQICq9tKY` 07:26                        |
| QUESTIONS item 15, note 62 §4                                                   | preset high-pass at `shift + M2`          | `shift + instrument`                                                 | `5RrjxcscbGA` 10:03                        |

**The replica** (code that disagrees; each "ours" until the device settles it):

| Where                                                                                    | Replica                                                       | Videos                                                                 |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `src/lib/sim/areas/sample/slicer.ts` `applySlices`, `src/lib/agent/tools/navigate.ts`:98 | slices from F3; tap-only deletion; separate boundaries        | from the sliced key; shared boundaries; delete and repack in transient |
| `src/lib/sim/areas/auxiliary/sim.ts` `brainShift`, `brainFrame`                          | chromatic shift by pitch class (−5…+6), scale kept            | diatonic (modal) shift by degree, octave-aware, mode named             |
| `src/lib/sim/opxy-sim.svelte.ts` `#link`                                                 | one direction, one primary per track                          | links both ways; several primaries per track                           |
| `src/lib/sim/sequencer.ts` `ARP_PATTERNS`, `ARP_STYLES`, arp length 50                   | random before play order; invented styles; 50                 | play order, then random; return-to-first, doubled notes; shortest      |
| `src/lib/sim/sequencer-playback.ts` `maestroNotes`, `players.ts`                         | lowest note is the root; duplicates dropped                   | the first note is the reference; duplicates kept                       |
| `src/lib/sim/sequencer-playback.ts` pulse, pulse hold, `playsOnPass`, skip trigger 0     | 1 + N plays; added holds; every Nth; whole step               | N in all; span and note rule; four patterns; per-note random           |
| `src/lib/sound/scheduler.ts` (`automate`)                                                | a lock lasts one step                                         | a lock holds until the next lock; smoothing never wraps                |
| `src/lib/sound/mapping.ts` `DUCK_ON_NOTHING`, `DUCK_RELEASE_MS`                          | no ducking from aux sources; measured release law             | aux 11/12 trigger the duck; TE's release direction differs             |
| `src/lib/sim/areas/arrange/model.ts` `sceneEnded`                                        | a queued scene waits for the scene's end                      | TE: the end of the bar; Dennis Cortes: the end of the scene            |
| `src/lib/sim/areas/arrange/draw.ts`:170                                                  | a "link" label                                                | the source pattern blinks; the stack is drawn connected                |
| arrange input, scene LEDs, song cue                                                      | mute/solo only in mix; only the current scene lit; still ring | `shift + Tn` mutes, hold solos; used scenes dim; cued entry blinks     |
| drum key `shift + click E3`; synth sampler loop cycle                                    | nothing; forever → until release → off                        | fade-in ↔ fade-out; until release → ∞ → off                            |
| `src/lib/sim/areas/system/settings.ts`, `catalogue.ts` `MOD_TARGETS`                     | equal + user tunings; transpose ±24; engine names             | bagpipe, guitar … ; ±36; "synth 1–4"                                   |

## 5. Things worth verifying on the device in the next camera session

Throwaway project; camera on the screen at 10 fps and USB audio recording; anything that changes
state announced first and logged in `90-device-probe.md`. Ordered by what it would change.

1. **Slices.** Put a loop on F4, hold the key, `M1` → slice, even, count 16: film the count (blink?)
   and press done; play every key. Which keys hold slices, does F4 become slice 1, are keys left of
   it untouched? Repeat from E5 (one slice?). In transient mode press slice 3, turn `E2`: does slice
   2's end follow? `shift + key` on slice 3, then done: do 4–8 move down a key?
2. **Brain shift.** Routed C-major chords; on aux T1 press D, E, G, then C♯, then the C an octave
   lower. Film the title each time and record: D dorian and a scale-step shift (diatonic), or D major
   and a whole tone (chromatic)? Does the low C drop everything an octave? Press a key while stopped:
   does playback start?
3. **Links.** Hold T7, press T8; then hold T8, press T7: does each play both? Then link T2 → T1 and
   T3 → T1: do both drive T1? Mute T2: does T1 still get T2's notes? Film the track LEDs while holding.
4. **Locks.** On mix `M1`, lock T1's level to 0 on step 1 and 99 on step 16, shape 0: silent from 2
   to 15 (latch) or back to the track's level at step 2 (replica)? Then shape full and half, and watch
   for a wrap from 16 to 1. Also lock `E3` pan: does the lock box turn orange in mix mode?
5. **Timing laws.** (a) Duck: metronome source, amount max, hold 0; turn `E4` by hand to each end and
   record (TE says higher is slower; our CC sweep said faster). (b) Queued scene with 4-bar patterns:
   `shift + play`, queue during bar 1; switch after bar 1 or bar 4? Under each scene-length setting.
   (c) Pulse: kick on step 1, hat on step 2; pulse 2, then pulse 1, then hold 2: two kicks or three?
   Then pulse 4 + hold 6 and pulse 3 + hold 2, counting step-times before the hat.
6. **Skips.** One chord on step 1; `shift + step 1 → natural 14 → accidental 4` pressed one to five
   times: photograph the description and flashing marks after each press, log 8 passes each. Then
   `accidental 0`: do single notes of the chord drop? Tap versus hold the lit `natural 14`.
7. **Mix per pattern or scene.** Scenes 1 and 2 on the same T1 pattern; in scene 2 set level 20 and
   FX I send 50; back to scene 1: do they follow? Then the same with a mute (`click E4`).
8. **Clear scope.** T1 with notes in patterns 1 and 2; on pattern 1 `record + hold stop`; is pattern
   2 intact?
9. **Drum `M2` and keys.** On T1 press `M2`: labels (start/attack/hold/decay or ADSR), one or two
   envelopes, waveform behind? `shift + click E3` on `M1`: does `E3` switch to a fade-out? Mono on a
   kit: two overlapping long one-shots, cut or not?
10. **Players.** New T3, `player` twice, hold shift: is the length tie empty? Turn arpeggio `E2` one
    detent at a time: is play order before random? Photograph each style and record a triad with
    each. Maestro: `shift` + C, then the B♭ below: does every key play its note and a tone below?
    Enter C, C, C, G: are repeats kept?
11. **Arrange keys.** `shift + T3` (mute? hatched?), hold T3 (solo?), `shift + [+]` (next scene?),
    `shift + M1` from scene 5 with 2–4 free (lands on 2?); hold shift and film the black keys
    (current bright, used dim?); with sound link on, film the stack (blinking source).
12. **Tape (Q8 on 1.1.33).** T1 beat with distinct hits on steps 1, 3, 5, 9, 13 and only T1 sent to
    tape; on T6 x1, 100 %, length 16, mix 99: tap natural 1, 2, 3, accidental 4, natural 8, then the
    upper keys; record. Then `E2` at 125/133/150 % on a sustained sine (pitch ratios), `[+]`/`[-]`
    (rate), length 4 held for two bars (window or loop?), and keys with the transport stopped.
13. **Bluetooth and devices.** Open `com → M3` with a BLE MIDI peripheral advertising: does the
    OP-XY list it and connect? Are past devices listed while disconnected?
14. **Quick reads.** Tuning list (bagpipe, guitar?), preset transpose ends (±36?), mod-tab target
    names (synth 1–4?), the sample page's `E1` sources (headset, resample?), the templates folder
    ("clean", "random presets"; load random presets twice), the punch-in `shift` release with an
    effect held through a track change, and `shift` + white key + step while playing (a component?).

## 6. Reproducing

The video list and metadata come from YouTube's search and channel pages; each transcript is the
video's English caption track (auto or creator), saved as `[mm:ss] text` lines under
`research/videos/<id>.txt` with a header (title, channel, date, length, caption kind). The folder is
git-ignored (`.gitignore` `/research/videos`). Captions are third-party text: keep them local, quote
at most a few words, and cite by id and time.
