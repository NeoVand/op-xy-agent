# OP-XY manual

Our own reworded, agent-oriented manual for the teenage engineering OP-XY, written for OS 1.1.33. It is derived from TE's online guide (v1.1.15), the OS changelog and checks on a real unit; 163 units, 1098 facts, 196 procedures, 207 parameters.

## How to read this manual

- Key combos: `A + B` = hold A, then press B (every key but the last is held); `A → B` = press A, release, then press B; `→ +` = keep the earlier keys held; `hold A` = long press; `turn E1` / `click E1` = rotate / push an encoder. E1–E4 are the dark gray, mid gray, light gray and white encoders.
- Controls: `T1`…`T8` track keys, `step 1`…`step 16` step keys, `M1`…`M4` module keys under the screen, `[-]` / `[+]` minus / plus, `key F#3` a keyboard key, `natural 1`…`natural 14` white keys and `accidental 1`…`accidental 0` black keys counted from the left. Placeholders: `Tn`, `step n`, `key`, `natural`, `accidental` = any one; `steps`, `keys`, `naturals`, `accidentals` = one or more.
- Status: current = the guide (v1.1.15) still matches; outdated-in-guide = firmware after the guide changed it; changelog-only = the guide is silent and the OS changelog documents it; unverified = community or inferred, not yet confirmed.
- Tags: (since X) = needs OS X or newer; (verified X) = observed on a real unit running OS X; (community), (derived), … = confidence below official.
- Cite a unit as [unit-id] and a fact as [unit-id#fact-id]. Items end with [sN], a source listed at the end of their unit; send users to TE’s page for the original.
- Sources: guide:X = https://teenage.engineering/guides/op-xy/X (guide:#Y = https://teenage.engineering/guides/op-xy#Y); changelog:V = the OS V entry at https://teenage.engineering/downloads/op-xy; note N = our research note N (docs/research in the op-xy-agent repository, e.g. note 90, the device probe log), not a page to link. Link a release with https://teenage.engineering/downloads/op-xy#1.1.21 (1.0.29 is the one exception: https://teenage.engineering/downloads/op-xy#1.0.28).

## Basics

How the OP-XY is organised: main modes and module pages, track keys, the pattern/scene/song model, key notation and firmware versions.

### How key presses are written [basics.key-notation]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: notation, key combos, guide conventions, combo press, sequence press, shortcut notation

The press types TE's guide draws (single, combo, sequence, hold, turn, click, hold and turn, keyboard, chords) and the text notation this manual uses for them, such as `shift + M1` or `record + play → play`.

TE's guide draws its shortcuts as highlighted keys; this manual writes the same gestures as text,
which the agent can say and the replica can animate.

Facts:
- TE's diagrams show a few press types: single, combo (hold one key, press another), sequence (one after the other), hold, turn or click an encoder, hold a key while turning, keyboard notes and chords. [#press-types] [s1]
- When a diagram highlights all four encoders, any of them will do. [#all-encoders] [s1]
- A diagram that shows the whole keyboard is there for orientation, not as a request to play it. [#whole-keyboard] [s1]
- The guide's legend labels its hold-and-turn picture as a second sequence press and swaps two captions (all encoders, keyboard). [#guide-errata] (derived) [s2]
- This manual writes a combo with a plus sign (`shift + M1` = hold shift, press M1) and a sequence with an arrow (`record + play → play` = release, then press play again). [#combos] (derived) [s3]
- `hold com` is a long press, `turn E2` and `click E4` move an encoder, and `Tn`, `step n` or `key` stand for any track, step or keyboard key. [#gestures] (derived) [s3]

Related: [hardware.layout], [basics.modules]

Sources: s1 guide:guide-conventions#guide-conventions · s2 note 40 · s3 note 40

### Main modes [basics.main-modes]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: modes, mode keys, instrument mode, auxiliary mode, arrange mode, mix mode, mixer

Four mode keys switch the whole unit between making sounds (instrument), the utility tracks (auxiliary), building the song (arrange) and balancing it (mix).

The track keys, module keys and encoders keep their jobs in every mode — pick a track, open a page,
turn a knob — but what they address changes with the mode.

Facts:
- Each main mode has its own key, and TE frames them as stages of a track's life — compose in `instrument`, transpose and process in `auxiliary`, assemble in `arrange`, balance in `mix`. [#lifecycle] [s1]
- In instrument mode `T1`…`T8` select and edit the eight instrument tracks, each running a synth engine or a sampler. [#instrument] [s2]
- In auxiliary mode the same keys reach the eight auxiliary tracks, which transpose other tracks, play punch-in FX, handle external inputs and outputs and hold the send effects. [#auxiliary] [s3]
- Arrange groups the tracks' patterns into scenes and chains scenes into songs. [#arrange] [s3]
- Mix sets each track's level and pan and holds the master EQ and compressor. [#mix] [s3]
- In arrange, pressing `arrange` again swaps the track keys between instrument and auxiliary tracks. [#toggle-arrange] [s4]
- In mix, pressing `mix` again swaps the track keys between instrument and auxiliary tracks. [#toggle-mix] [s5]
- `shift + instrument` opens the preset settings of the selected instrument track. [#shift-instrument] [s6]
- In arrange, `shift + arrange` opens song mode. [#shift-arrange] [s7]

Related: [basics.modules], [basics.track-buttons], [hardware.layout]

Sources: s1 guide:main-modes · s2 guide:instrument#project · s3 guide:main-modes#5.1%20main-modes · s4 guide:arrange#switching-tracks-and-patterns · s5 guide:mix#levels-pans-and-sends · s6 guide:instrument#preset-settings · s7 guide:arrange#song-mode

### Module pages (M1–M4) [basics.modules]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: modules, module keys, pages, sub modes, shift layer, extra parameters
Where: modes instrument, auxiliary, mix; screens M1, M2, M3, M4

In instrument, auxiliary and mix mode the keys M1–M4 under the screen open four pages (modules), and the encoders edit what the open page shows. Arrange has no modules.

The mode decides what the pages are about and the track keys which track they edit. Any module-page
parameter of an instrument or auxiliary track can be parameter-locked per step.

Facts:
- Every main mode except arrange splits its controls into four modules, opened with the keys printed 1 to 4 under the screen (`M1`…`M4`). [#what] [s1]
- On a module page, `E1`…`E4` edit the parameters shown for the selected track. [#encoders] [s1]
- Pages with more than four parameters show the rest while `shift` is held. [#shift-layer] [s1]
- On instrument tracks the pages are engine (M1), envelopes (M2), filter (M3) and LFO (M4); `shift + M3` and `shift + M4` choose the filter type and LFO type, and `shift + M1` brings up the preset browser, where OS 1.1.33 changes the engine. [#instrument-pages] [s2]
- Auxiliary tracks use the pages their own way; on the brain track, M1 sets key and scale and M2 routes tracks into it. [#aux-pages] [s3]
- In mix mode, M1 holds levels, pans and sends per track, M2 the master EQ, M3 the master saturator and M4 the master section. [#mix-pages] [s4]
- On screen, each parameter carries a small dot or cap in its encoder's shade — dark for `E1`, mid grey for `E2`, light grey for `E3`, white for `E4` — so a glance tells which knob moves what. [#encoder-marks] (verified 1.1.33) [s5]
- Brief popups, such as the octave card or the mixer's send display, sit over the page and fade away on their own after a second or two. [#popups] (verified 1.1.33) [s6]
- On some auxiliary tracks the next page slides in sideways — the brain's routing page from its `M1`, and the external MIDI track's CC pages from `M1` to `M2` to `M3`. [#slide] (verified 1.1.33) [s6]

Procedures:
- Edit a page's shift-layer parameters [#shift-params] [s1]
  1. `shift + turn E1…E4`

Related: [basics.main-modes], [instrument.engine-prism], [sequencer.parameter-locks]

Sources: s1 guide:main-modes#5.2%20modules · s2 guide:instrument · s3 guide:auxiliary#brain · s4 guide:mix · s5 note 59 · s6 note 59

### Track keys and the active track [basics.track-buttons]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: track buttons, T1-T8, select track, active track, track colours, sixteen tracks

The eight track keys select which track you play, sequence and edit — instrument tracks or auxiliary tracks, depending on the mode. The lit key marks the active track.

The mode sets whether the track keys mean instrument or auxiliary tracks; holding one track key
while pressing others links tracks instead of switching.

Facts:
- The OP-XY has sixteen sequencer tracks in two sets of eight, instrument and auxiliary; `T1`…`T8` address the set the current mode shows. [#two-sets] [s1]
- In auxiliary mode the keys stand for brain (T1), punch-in FX (T2), external MIDI (T3), external CV (T4), external audio (T5), tape (T6), FX I (T7) and FX II (T8). [#aux-order] [s2]
- Notes you play, steps you enter and pages you edit all belong to the active track; pressing another track key makes that track active. [#active] [s3]
- The active track's key lights white for an instrument track and red for an auxiliary track. [#colours] [s3]
- `shift + Tn` opens the preset browser for that track; on instrument tracks it also picks a synth engine or sample pack. [#presets] [s4]
- Over MIDI, CC102 on channel 1 selects a track counting from zero; value 2 selected track 3. [#cc102] (verified 1.1.33) [s5]

Procedures:
- Load a preset onto a track [#preset] [s3]
  1. `shift + Tn` — opens the preset browser for that track

Related: [basics.linked-tracks], [basics.main-modes], [instrument.save-to-same-snapshot]

Sources: s1 guide:track-buttons · s2 guide:auxiliary · s3 guide:track-buttons#6.1%20using-the-track-buttons · s4 guide:instrument#project · s5 note 90

### Linking tracks [basics.linked-tracks]
current · OS ≥ 1.0.9 · changed in 1.0.15, 1.1.15 · guide v1.1.15
Also called: link tracks, linked tracks, track link, layer sounds, stack tracks, primary track

Hold one track key and press up to three others to link them; whatever you play on the held (primary) track then drives every linked track, which is how you layer sounds.

Linking is the layering tool: hold `T3` and press `T4`, and a bass line played on track 3 also
sounds through track 4's synth, each track keeping its own sound and settings.

Facts:
- To link tracks, keep one track key held and press the keys of the tracks to join it; four tracks at most can be linked. [#how] [s1]
- The track whose key you held becomes the primary track, and playing or sequencing it controls all linked tracks. [#primary] [s1]
- A linked track still plays on its own when you select it directly rather than the primary track. [#separate] [s1]
- Pitchbend from the primary track reaches the linked tracks. [#pitchbend] (since 1.0.15) [s2]
- Arpeggiator notes are not passed on to linked tracks. [#no-arp] (since 1.0.15) [s2]
- OS 1.1.15 reworked how octave offsets behave on linked tracks; the changelog gives no details. [#octave] (since 1.1.15) [s3]
- The guide does not describe how to undo a link. [#unlink] (derived) [s1]
- Linking tracks is unrelated to sound link in arrange, which keeps one sound across a track's patterns. [#not-sound-link] [s4]

Procedures:
- Link tracks so that one track plays several [#link] [s1]
  1. `Tn + Tm` — keep the first key held and press up to three more track keys
  Result: The held track is the primary; playing it also plays the linked tracks.

Related: [basics.track-buttons]

Sources: s1 guide:track-buttons#6.2%20linking-tracks · s2 changelog:1.0.15 · s3 changelog:1.1.15 · s4 guide:arrange#sound-link

### Patterns, scenes, songs and projects [basics.patterns-scenes-songs]
outdated-in-guide · OS ≥ 1.0.9 · changed in 1.1.15, 1.1.25 · guide v1.1.15
Also called: song structure, data model, how many patterns, pattern limit, scene limit, song limit

A project holds everything; each track has up to 16 patterns, a scene says which pattern every track plays, and a song is an ordered list of scenes. The guide's workflow chapter still gives older limits.

Nested boxes: patterns per track, scenes that freeze a combination of patterns and mutes, songs
that play scenes in order, all inside one project.

Facts:
- A pattern is one track's sequence of notes or sounds and holds at most 120 notes. [#pattern] [s1]
- Each track holds up to 16 patterns since OS 1.1.15 (the workflow chapter still says nine). [#sixteen-patterns] (since 1.1.15) [s2]
- A pattern has up to four bars; with track scale it can last up to 64 bars. [#length] [s3]
- Each pattern can carry its own sound unless sound link (arrange) holds one sound for the track. [#sound-per-pattern] [s4]
- A pattern added since OS 1.1.25 starts with the player type the track is using. [#new-pattern-player] (since 1.1.25) [s5]
- A scene records which pattern each track plays, plus the track volumes and mutes, and lasts as long as its longest pattern; a project has 99 scenes. [#scene] [s1]
- A song plays up to 96 scenes in order; a project holds up to 14 songs, one per white key (the workflow chapter says nine). [#song] [s6]
- A project contains the tracks with their patterns, scenes and songs; the unit stores thousands of projects. [#project] [s1]

Related: [basics.workflow], [project.settings], [project.project-view]

Sources: s1 guide:workflow#patterns-scenes-songs-and-projects · s2 changelog:1.1.15 · s3 guide:sequencer#extend-with-bar · s4 guide:arrange#sound-link · s5 changelog:1.1.25 · s6 guide:arrange#song-mode

### From first notes to a song [basics.workflow]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: workflow, how to make a song, song workflow, getting started, basic workflow, layering

The usual path on the OP-XY — sequence one track at a time, make pattern variations in arrange, capture them as scenes, then order the scenes into a song and mix it.

The suggested path mirrors the modes — write in instrument, vary and combine in arrange, balance in
mix — but nothing forces that order.

Facts:
- The OP-XY is built around sequencing one track at a time and stacking tracks into the layers of a song. [#layers] [s1]
- TE's workflow chapter offers one suggested way of working, not the only one. [#many-ways] [s2]
- A song starts with sequencing the tracks in instrument mode. [#sequence-first] [s3]
- In arrange you then add new patterns, or copy existing ones and change them, to get the variations for different parts. [#variations] [s3]
- Moving between scenes and giving each its own pattern combination builds the sections of the song. [#scenes] [s3]
- Once a few scenes work, song mode puts them in playing order. [#song-mode] [s3]

Procedures:
- Put a first note into a track's sequence [#first-notes] [s1]
  1. `instrument`
  2. `T1…T8` — choose the track
  3. `key → step n` — play a note on the keyboard, then press the step where it should go
  Result: The note plays on that step every time the pattern comes round.
- Order finished scenes into a song [#to-song] [s4]
  Needs: arrange mode; a few scenes are ready
  1. `shift + arrange` — opens song mode
  2. `shift + accidentals` — type the scene numbers in playing order

Related: [basics.patterns-scenes-songs], [basics.main-modes], [sequencer.step-components]

Sources: s1 guide:layout#interface-overview · s2 guide:workflow#workflow · s3 guide:workflow#creating-a-song · s4 guide:arrange#song-mode

### Firmware versions and this manual [basics.firmware-versions]
current · OS ≥ 1.0.9 · changed in 1.1.33 · guide v1.1.15
Also called: os version, firmware version, which version, changelog, updates, guide version, errata

TE's guide describes OS 1.1.15, while this manual targets OS 1.1.33; facts that changed later carry the release that changed them. How to see which OS your unit runs.

OS 1.1.17 to 1.1.33 added features and fixes that TE's guide does not mention yet. When an answer
depends on the version, check the boot screen first; this manual assumes 1.1.33.

Facts:
- TE's online guide is labelled v1.1.15 and describes OS 1.1.15. [#guide] [s1]
- The newest release is OS 1.1.33 (2 September 2026); the releases after the guide are 1.1.17, 1.1.18, 1.1.21, 1.1.25, 1.1.32 and 1.1.33. [#latest] (since 1.1.33) [s2]
- The owner's unit runs OS 1.1.33, hardware revision 2. [#owner] (verified 1.1.33) [s3]
- The installed OS version appears on screen, with the logo, every time the unit starts. [#boot-screen] [s4]
- Over USB MIDI the unit reports its OS version when asked with TE's own SysEx greeting; the standard MIDI identity request leaves the version blank. [#over-midi] (verified 1.1.33) [s3]

Related: [hardware.firmware-update], [hardware.te-boot]

Sources: s1 guide: · s2 changelog:1.1.33 · s3 note 90 · s4 guide:hardware-overview#power-on-charging

## Hardware

The physical unit: panel layout, power and battery, sockets, specifications, and the TE boot recovery menu.

### Panel layout [hardware.layout]
current · OS ≥ 1.0.9 · changed in 1.0.36 · guide v1.1.15
Also called: top panel, front panel, control map, where is a key, buttons and knobs

A map of the top panel — mode keys, module keys, track and step keys, transport, keyboard, function keys, encoders, screen and sockets — and the names this manual uses for each.

The OP-XY packs everything into one flat grid of square keys, so a few landmarks make it easy to
find your way. The left block is about _where you are_: the four mode keys (`instrument`,
`auxiliary`, `arrange`, `mix`) and, below them, the transport. The middle is about _what you edit_:
the module keys `M1`…`M4` under the screen choose a page, the track keys under the encoders choose a
track, and the step keys below them are the sequencer. The right-hand column holds the utility keys
(`sample`, `com`, `player`, `bar`).

Most editing follows one pattern: pick a mode, pick a track, pick a page, then turn `E1`…`E4`.
`shift` reaches a second layer of almost every key and page, and the keyboard's white and black keys
double as step-component and number keys when a page asks for them.

Facts:
- Seen from above, the controls sit on a grid of 17 columns and 6 rows. The top two rows hold the speaker, the volume knob, the screen and the four encoders; keys fill the four rows below. [#grid] (measured) [s1]
- Row three runs mode keys, `M1`…`M4`, then `T1`…`T8`; row four is `step 1`…`step 16`; the bottom two rows put `record`, `play`, `stop` above `[-]`, `[+]`, `shift` on the left, with the keyboard to their right. [#rows] (measured) [s1]
- The rightmost column holds `sample`, `com`, `player` and `bar`, top to bottom; `project` and `tempo` sit just below the volume knob. [#right-column] (measured) [s1]
- Four keys pick the main mode: `instrument` for the eight sound tracks, `auxiliary` for the eight utility tracks (brain, punch-in FX, external gear, tape, send effects), `arrange` for patterns, scenes and songs, and `mix` for levels, pans, EQ and the master compressor. [#mode-keys] [s2]
- The keys printed 1 to 4 directly under the screen are the module keys, written `M1`…`M4`. Each opens one page of the current mode, and the four encoders then edit what that page shows. [#module-keys] [s3]
- Arrange is the only main mode without module pages. [#arrange-no-modules] [s3]
- Some pages keep a second set of parameters on a shift layer, reached by holding `shift`. [#shift-layer] [s3]
- The eight track keys under the encoders choose which track you edit — an instrument track in instrument mode, an auxiliary track in auxiliary mode. [#track-keys] [s4]
- The sixteen step keys across the middle form the step sequencer, the grid you program notes and sounds into. [#step-keys] [s5]
- `record` arms recording of notes and knob moves, `play` starts playback and `stop` halts it. [#transport] [s6]
- Pressing `play` again during playback jumps back to the start of the pattern. [#play-again] [s6]
- A second press of `stop` cuts off every note and sound that is still ringing. [#stop-again] [s6]
- `[-]` and `[+]` move the keyboard one octave down or up; several pages give them other jobs. [#octave-keys] [s6]
- On an instrument page, `[-]` and `[+]` bring up a small white card low in the middle of the screen, with a mini keyboard and the octave offset in thin digits (+0, +1, −1, −3 …); it fades after a second or two. On the external CV page the offset appears inside the meter card instead. [#octave-popup] (verified 1.1.33) [s7]
- `shift` does nothing alone: held with another key it opens that key's secondary function or page. [#shift-key] [s6]
- The two-octave keyboard of 24 keys lies right of the transport keys, below the step keys. [#keyboard] [s8]
- Every white key carries the icon of one step component; counted from the left they are `natural 1`…`natural 14`. [#naturals] [s9]
- The ten black keys double as number keys, marked 1–9 and 0 from the left; this manual calls them `accidental 1`…`accidental 0`. [#accidentals] [s10]
- `sample` (top right corner) starts sampling from any screen. [#sample-key] [s11]
- `project` opens the list of projects, where you create, open and manage them. [#project-key] [s12]
- `tempo` sets the song speed, the swing and the metronome. [#tempo-key] [s13]
- `com` is the hub for system settings, wired and wireless connections and output routing. [#com-key] [s14]
- `player` turns the notes of a track into arpeggios, chords and other note effects. [#player-key] [s15]
- `bar` lengthens the sequence and holds sequence-wide settings such as quantisation. [#bar-key] [s16]
- The volume knob is at the top left, next to the speaker. [#volume] [s17]
- The four encoders shade from dark to light: dark gray, mid gray, light gray and white. This manual calls them `E1`, `E2`, `E3` and `E4` in that order. [#encoders] [s18]
- The pitchbend strip on the lower left edge responds to pressure — push its left end to bend down, its right end to bend up. [#pitchbend] [s19]
- The right side carries the power switch, the USB-C port and four 3.5 mm jacks — audio out, multi-out, MIDI in and audio in. [#sockets] [s20]
- A small built-in microphone and a vertical LED level meter sit in the top right margin. [#mic-and-meter] [s20]
- Holding `com` turns the level meter into a rough battery gauge. [#battery] (since 1.0.36) [s21]

Procedures:
- Switch to another main mode [#switch-mode] [s2]
  1. `instrument/auxiliary/arrange/mix`
- Open one of the current mode's module pages [#open-page] [s3]
  1. `M1…M4`
- Show the shift-layer parameters of the current page [#shift-page] [s3]
  1. `hold shift` — the extra parameters stay while shift is down
- Choose the track to edit [#select-track] [s4]
  1. `T1…T8`
- Restart playback from the top of the pattern [#restart] [s6]
  Needs: playback is running
  1. `play`
- Stop and silence everything [#silence] [s6]
  1. `stop → stop`
- Move the keyboard an octave down or up [#octave] [s6]
  1. `[-]/[+]`
- Check the battery level [#battery] (since 1.0.36) [s21]
  1. `hold com` — read the level meter in the top right margin

Related: [sequencer.step-components], [com.midi-settings]

Sources: s1 note 50 · s2 guide:layout#main-modes · s3 guide:layout#modules · s4 guide:layout#track-buttons · s5 guide:layout#sequencer · s6 guide:layout#transport-controls · s7 note 59 · s8 guide:layout#keyboard · s9 guide:step-components#adding-step-components-to-a-sequence · s10 guide:step-components#step-components-ref-table · s11 guide:layout#sample · s12 guide:layout#projects · s13 guide:layout#tempo · s14 guide:layout#com · s15 guide:layout#players · s16 guide:layout#bar · s17 guide:layout#volume · s18 guide:layout#encoders · s19 guide:hardware-overview#speaker-volume-pitchbend · s20 guide:hardware-overview#inputs-outputs · s21 changelog:1.0.36

### Power, battery and charging [hardware.power-and-charging]
current · OS ≥ 1.0.9 · changed in 1.0.36 · guide v1.1.15
Also called: power on, switch on, turn off, battery, charging, charge, battery life, usb power

The power switch on the right side turns the unit on (up) and off (down); work is kept automatically. The battery charges over USB-C from 5 V USB power.

There is no need to save before switching off; the OP-XY writes your work as you go.

Facts:
- The power switch sits on the right side; push it up to switch on and down to switch off. [#switch] [s1]
- At start-up the screen shows the logo and the OS version, then the last selected track. [#boot] [s1]
- Switching off loses nothing; the unit stores your work automatically and comes back exactly as you left it. [#nothing-lost] [s1]
- The system settings offer an instant or a delayed power-off; delayed guards against accidental switch-offs. [#power-off-type] [s2]
- The battery charges over USB-C from a computer or USB charger; the level meter shows when it is full. [#charge] [s1]
- Charge only from 5 V USB power; TE's warranty excludes damage caused by any other charging method. [#five-volt] [s3]
- Charge the battery at least every six months; a battery left unused for a long time may no longer charge. [#six-months] [s3]
- The battery page of the system settings shows the charge level and the input current limit. [#battery-page] [s2]

Procedures:
- Switch the OP-XY on or off [#power-on] [s1]
  1. `power` — up is on, down is off
- Check the battery level [#check] (since 1.0.36) [s4]
  1. `hold com` — read the level meter at the top right

Related: [hardware.specifications], [hardware.safety-and-care], [hardware.layout]

Sources: s1 guide:hardware-overview#power-on-charging · s2 guide:com#system-settings · s3 guide: · s4 changelog:1.0.36

### Connectors and jacks [hardware.connectors]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: inputs, outputs, jacks, sockets, headphone out, line in, line out, midi in, multi out, ports

The right edge carries four 3.5 mm jacks — audio out, multi-out, MIDI in, audio in — plus the USB-C port and the power switch. What each one is for.

None of the jacks is a dedicated MIDI out: wired MIDI and sync leave through the multi-out, in the
mode picked on the com page, or over USB. Levels for each jack are listed under the specifications.

Facts:
- Along the right edge, starting at the back, sit audio out, multi-out, MIDI in and audio in, then the USB-C port, the charge LED and the power switch near the front. [#order] (measured) [s1]
- The 3.5 mm stereo audio out feeds headphones or speakers. [#audio-out] [s2]
- The audio out also supports headsets with a built-in microphone. [#headset] [s3]
- The 3.5 mm stereo audio in records line-level sources directly into the OP-XY. [#audio-in] [s2]
- The 3.5 mm MIDI in lets other MIDI gear play and control the OP-XY. [#midi-in] [s2]
- The multi-out jack works in one of six modes at a time — audio, MIDI, CV and gate, or sync pulses at sync8, sync16 or sync24. [#multi-out] [s2]
- The USB-C port charges the battery and carries audio and MIDI in both directions. [#usb] [s3]

Related: [com.usb], [hardware.specifications], [hardware.layout]

Sources: s1 note 50 · s2 guide:hardware-overview#inputs-outputs · s3 guide:hardware-overview#technical-specifications

### Technical specifications [hardware.specifications]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: specs, dimensions, weight, screen resolution, storage, battery life, output level, electrical, build

Size, build, screen, storage, battery, processing and the electrical figures of the audio, CV and sync connections.

Where TE's pages disagree (the screen height), both figures are given.

Facts:
- The body is black anodised aluminium, the low-profile keyboard is backlit, and the custom colour LCD sits directly on the keyboard. [#build] [s1]
- It measures 288 × 102 × 29 mm and weighs 900 g. [#size] [s2]
- There are 68 mechanical keys (the keyboard included), four encoders and a pressure-sensitive pitchbend strip. [#controls] [s3]
- The guide lists a 480 × 220 pixel IPS TFT screen. [#screen] [s4]
- TE's product page gives the screen as 480 × 222 pixels. [#screen-alt] [s3]
- There are 8 GB of user storage. [#storage] [s4]
- Over MTP the owner's unit shows an 8.59 GB volume. [#storage-seen] (verified 1.1.33) [s5]
- The rechargeable battery is rated for 16 hours. [#battery] [s4]
- Bluetooth LE MIDI is built in. [#wireless] [s4]
- Inside are two Blackfin processor cores, a three-core DSP co-processor and a 6-axis motion sensor. [#processing] [s3]
- Polyphony is 24 voices, shared by all tracks. [#voices] [s6]
- The model number is TE033AS001; the owner's unit reports hardware revision 2. [#model] (verified 1.1.33) [s7]
- Audio out: 8 dBu (2 Vrms) level, 124 dBA signal-to-noise ratio. [#audio-out] [s8]
- Audio in: 8 dBu (2 Vrms) level, 98 dBA signal-to-noise ratio, 13 kΩ impedance, 0–31 dB of analogue gain. [#audio-in] [s8]
- Multi-out: audio at 2 dBu (1 Vrms), CV within ±5 V, sync and gate pulses at 5.2 V. [#multi-out] [s8]

Related: [hardware.connectors], [hardware.power-and-charging], [hardware.layout]

Sources: s1 guide:hardware-overview#hardware · s2 teenage.engineering/store/op-xy · s3 teenage.engineering/products/op-xy · s4 guide:hardware-overview#technical-specifications · s5 note 90 · s6 guide:project#project-settings · s7 note 90 · s8 guide:hardware-overview#electrical-characteristics

### TE boot (bootloader menu) [hardware.te-boot]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: te boot, bootloader, boot menu, recovery menu, boot mode
Where: screens te boot

The bootloader menu, reached by holding `com` while switching on. `T1` installs firmware, `T7` factory-resets and `T8` opens the system menu with the key test; switching off and on leaves.

TE boot sits underneath the normal OS, so it is reachable even when the OS itself misbehaves.
Updating (`T1`) and resetting (`T7`) have their own units, and the system menu (`T8`) is for
checking faulty keys or recalibrating the volume knob.

Nothing in TE boot happens by accident: every action needs a track key, and a power cycle leaves.
This app never switches the unit into TE boot; you do it on the device.

Facts:
- TE boot is the OP-XY's bootloader, the program that loads and starts its firmware. [#what] [s1]
- Firmware updates, factory resets and hardware tests all run from TE boot rather than from the normal OS. [#jobs] [s2]
- To reach it, switch the unit off, then keep `com` held while switching it back on. [#enter] [s2]
- The TE boot screen offers three numbered choices, each picked with the track key of its number: firmware upload (1), factory reset (7) and the system menu (8). [#menu] [s2]
- Switching the unit off and on again leaves TE boot without changing anything. [#exit] [s3]

Procedures:
- Start the OP-XY in TE boot [#enter] [s2]
  1. `power` — switch off
  2. `com + power` — hold com while switching back on
  Result: The TE boot menu lists its three options.
- Leave TE boot [#exit] [s3]
  1. `power → power` — off, then on again

Related: [hardware.firmware-update], [hardware.factory-reset], [hardware.system-menu]

Sources: s1 teenage.engineering/downloads/op-xy · s2 guide:te-boot#te-boot · s3 guide:te-boot#exiting-te-boot

### Updating the OS [hardware.firmware-update]
current · OS ≥ 1.0.9 · changed in 1.0.32 · guide v1.1.15
Also called: firmware update, os update, update firmware, midi updater, update utility
Where: screens te boot

TE offers two ways to install a new OS — its web updater over USB, or copying the firmware file onto the unit while it sits in TE boot. Back up first and never install 1.0.29.

Updating is always your action, done with TE's tools; this app shows which OS the unit runs but
never installs firmware or starts TE boot. Features tagged "since 1.1.x" in this manual need that
version or newer.

Facts:
- The screen shows the installed OS version while the unit starts up. [#see-version] [s1]
- TE's OP-XY downloads page lists every release with its notes and, except for the withdrawn 1.0.29, a firmware file; the newest is OS 1.1.33, the version this manual describes. [#downloads] [s2]
- The easy route is TE's MIDI updater, a web page that updates the connected unit straight from the browser. [#web-updater] [s2]
- The manual route goes through TE boot, where `T1` makes the OP-XY show up on a computer as a removable disk. [#disk-route] [s3]
- Copy the firmware file onto that disk and eject it; the update then runs by itself — let it finish and follow the screen. [#copy-eject] [s3]
- Never install OS 1.0.29, which TE withdrew because it could corrupt files over 64 KB copied off the unit over MTP. [#avoid-1029] (since 1.0.32) [s4]
- Copy your projects, samples and presets to a computer before updating. [#backup] (derived) [s5]

Procedures:
- Install an OS file through TE boot [#disk-update] [s3]
  Needs: the firmware file from TE's downloads page is on the computer; your work is backed up
  1. `power` — switch off
  2. `com + power` — hold com while switching on — TE boot appears
  3. `T1` — connect the USB-C cable; the unit mounts as a disk
  Result: Copy the file, eject the disk, and the update runs.

Related: [hardware.te-boot], [basics.firmware-versions], [howto.back-up-projects]

Sources: s1 guide:hardware-overview#power-on-charging · s2 teenage.engineering/downloads/op-xy · s3 guide:te-boot#firmware-update · s4 changelog:1.0.32 · s5 guide:how-to#how-to-back-up-your-projects

### Factory reset [hardware.factory-reset]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: reset to factory, factory default, wipe the unit, erase everything, restore defaults
Where: screens te boot

`T7` in TE boot erases every user setting and all user content and rebuilds the original file structure. There is no undo: copy everything you want to keep to a computer first.

Treat a reset as a last resort, for instance before passing the unit on. Copy the whole drive over
MTP first: the reset also removes the samples and presets you added. This app never triggers a
reset.

Facts:
- A factory reset wipes all user settings and user content, recreates the original folder structure and returns the unit to its factory state. [#what] [s1]
- Anything not copied off the unit beforehand — projects, your own samples, saved presets — cannot be recovered after a reset. [#no-undo] [s1]
- TE advises backing up first and points to its project backup recipe. [#backup] [s1]
- The reset starts from TE boot with `T7`; the screen then guides you through it. [#how] [s1]

Procedures:
- Return the OP-XY to its factory state [#reset] [s1]
  Needs: everything you want to keep is copied to a computer
  1. `power` — switch off
  2. `com + power` — hold com while switching on to reach TE boot
  3. `T7` — factory reset; follow the on-screen instructions
  Result: User settings and content are gone and the factory file structure is back.

Related: [hardware.te-boot], [howto.back-up-projects], [com.mtp]

Sources: s1 guide:te-boot#factory-reset

### Function test and pot calibration (system menu) [hardware.system-menu]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: system menu, function test, key test, button test, pot calibration, recalibrate, potentiometer
Where: screens te boot

TE boot's option 8 opens the system menu, with a function test for the keys and a reset of the volume pot calibration.

Both tools are for hardware doubts: the function test checks the keys, and the calibration reset is
for a volume control whose range seems wrong.

Facts:
- `T8` in TE boot opens the system menu, which starts with the function test. [#open] [s1]
- In the function test, a key that still shows red after you have pressed it points to a fault; contact TE support. [#red-keys] [s1]
- In the system menu, `M2` or `T2` selects reset volume pot calibration; afterwards the unit returns to TE boot. [#pot-reset] [s2]
- OS 1.0.9 improved the response curve of the volume pot. [#pot-curve] [s3]

Procedures:
- Run the key function test [#test] [s1]
  Needs: the unit is switched off
  1. `com + power` — opens TE boot
  2. `T8` — then follow the on-screen instructions
- Reset the volume pot calibration [#pot] [s2]
  Needs: the unit is switched off
  1. `com + power`
  2. `T8`
  3. `M2/T2` — reset volume pot calibration
  Result: The calibration is reset and TE boot is shown again.

Related: [hardware.te-boot], [hardware.layout]

Sources: s1 guide:te-boot#function-test · s2 guide:te-boot#reset-volume-potentiometer · s3 changelog:1.0.9

### Safety, care and warranty [hardware.safety-and-care]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: warnings, safety, cleaning, temperature, warranty, phantom power, hearing, battery safety

TE's safety notes for connecting, charging, temperature, cleaning and the battery, and what the 12-month warranty covers.

The two that catch people out: phantom power on a mixer or interface channel the OP-XY is plugged
into, and charging from anything but plain 5 V USB.

Facts:
- Switch every device off before cabling them together; when you have to plug in while running, plug the lead into the OP-XY before the other device. [#connect] [s1]
- Never run a cable from the OP-XY's jacks into a microphone input with phantom power switched on; it can damage the unit. [#phantom] [s1]
- Charge only from 5 V USB power, such as a computer's USB port or a USB charger. [#charging] [s1]
- Use the unit between 10 and 35 °C (50–95 °F) and store it between 0 and 35 °C (32–86 °F). [#temperature] [s1]
- Wipe the shell with a slightly damp cloth and let it dry before use. [#cleaning] [s1]
- Do not charge or use a unit whose battery looks damaged; replacement batteries must come from TE and be fitted by qualified staff, and heat, fire or crushing can make a battery explode or leak. [#battery] [s1]
- Avoid long listening sessions at high volume to protect your hearing. [#hearing] [s1]
- The unit is factory tested and has a 12-month warranty from the purchase date; it does not cover misuse (drops, crushing, wrong voltages on the connectors, faulty modifications) or shipping costs. [#warranty] [s1]

Related: [hardware.power-and-charging], [hardware.in-the-box]

Sources: s1 guide:

### Box contents and the factory-sound licence [hardware.in-the-box]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: whats in the box, box contents, accessories, cable, sample licence, royalty free, copyright, factory sounds

The box holds the unit, a quick start guide, a USB-C cable and velcro fasteners. You may use the built-in sounds in your own music, but not redistribute them as sounds.

In short: making and releasing tracks with the factory sounds is fine; passing the sounds themselves
on (as a sample pack, for example) is not. This is a summary of TE's notice, not legal advice.

Facts:
- The box contains the OP-XY, a quick start guide, a USB-C cable and a pair of velcro fasteners for the underside. [#contents] [s1]
- The velcro rings on the underside hold the unit on a surface, in a case or on a stand. [#velcro] [s2]
- The samples, sounds and other built-in material may be used to create, perform, record and release your own music. [#sound-use] [s1]
- Sharing, selling or publishing that material itself, as is or edited, is not allowed unless it has been turned into a substantially new original work. [#no-redistribution] [s1]
- Samples you bring in yourself remain your responsibility with respect to other people's copyrights. [#third-party] [s1]

Related: [hardware.safety-and-care], [hardware.specifications]

Sources: s1 guide:#whats-in-the-box · s2 guide:hardware-overview#hardware

## Sequencer

Step and live recording, editing steps, parameter locks, the bar menu and the step components.

### Step sequencer overview [sequencer.overview]
current · OS ≥ 1.0.9 · changed in 1.1.32 · guide v1.1.15
Also called: sequencer, step sequencer, sequencing, step keys
Where: modes instrument, auxiliary

The 16 step keys program the selected track's pattern — up to four bars and 120 notes — by pressing steps, recording live or step recording; the bar menu, parameter locks and step components refine it.

Every track keeps its own patterns. Choose the input that suits the part: press steps for drums and
exact lines, record live to keep your feel, or step record a melody without the sequencer running.
Then the bar menu sets length and timing for the whole pattern, parameter locks change the sound on
single steps, and step components change how single steps behave on each pass.

Facts:
- The row of 16 step keys is the step sequencer, the grid that stores the notes and sounds of every track. [#grid] [s1]
- The step keys light up with the pattern of the selected track. [#shows-track] [s2]
- Auxiliary tracks such as punch-in FX are sequenced with the same techniques as instrument tracks. [#aux-too] [s3]
- A pattern can grow to four bars of 16 steps, 64 steps in all. [#bars] [s4]
- A pattern holds at most 120 notes. [#notes] [s5]
- Notes get in three ways: pressing steps after choosing a note, recording live while the pattern plays, or step recording with playback stopped. [#three-ways] [s6]
- Step components attach rules to single steps — repeats, ratchets, random notes, skips — without re-recording anything. [#components] [s7]
- OS 1.1.32 fixed occasional sequencer stalls while browsing presets and samples. [#stall-fix] (since 1.1.32) [s8]

Procedures:
- Show a track's pattern on the step keys [#show-track] [s9]
  1. `instrument/auxiliary`
  2. `Tn`

Related: [sequencer.step-entry], [sequencer.live-recording], [sequencer.step-recording], [sequencer.bar-menu], [basics.patterns-scenes-songs]

Sources: s1 guide:sequencer#sequencer · s2 guide:arrange#switching-tracks-and-patterns · s3 guide:get-started#4.4.%20adding-punch-in-fx · s4 guide:sequencer#extend-with-bar · s5 guide:workflow#patterns-scenes-songs-and-projects · s6 guide:sequencer#live-recording · s7 guide:step-components#step-components · s8 changelog:1.1.32 · s9 guide:layout#track-buttons

### Entering notes on steps [sequencer.step-entry]
current · OS ≥ 1.0.9 · changed in 1.1.25 · guide v1.1.15
Also called: step sequencing, step entry, program a step, chord on a step, edit a step
Where: modes instrument, auxiliary

Play a note on the keyboard, then press steps to place it; hold a step to see and change its notes, or hold several keys while pressing a step for a chord.

Step entry works like a pen that holds the last note you played: tap a key, then tap the steps where
it should sound. To add one drum sound to steps that already carry others, use the one-sound view.

Facts:
- The OP-XY remembers the last note or sound you played on the keyboard, and pressing a step stores that note on it; the step then lights. [#last-note] [s1]
- Holding a step lights the keyboard keys of every note stored on it. [#check] [s1]
- To store a chord, keep its notes held and press the step, or hold the step and play the notes. [#chord] [s1]
- With a step held, pressing a key adds that note to the step, or takes it off if the step already has it. [#toggle-note] [s1]
- On a drum track each of the 24 keys is a different sound, so step entry places sounds rather than pitches. [#drums] [s2]
- Since OS 1.1.25 a chord entered by holding keys and pressing a step can contain one note in two octaves. [#same-note-octaves] (since 1.1.25) [s3]
- Pressing or holding a step shows its number in a small box on the screen. [#step-popup] (verified 1.1.33) [s4]

Procedures:
- Put a note on a step [#enter] [s1]
  1. `key → step n` — further steps get the same note
- Put a chord on a step [#chord] [s1]
  1. `keys + step n`
- Add or remove a note on a step [#edit] [s1]
  1. `step n + key`

Related: [sequencer.single-sound], [sequencer.extend-notes], [sequencer.copy-step]

Sources: s1 guide:sequencer#step-sequencing · s2 guide:get-started#4.1%20sequencing%20a%20drum%20beat · s3 changelog:1.1.25 · s4 note 59

### Step recording [sequencer.step-recording]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: step record, step input, record while stopped
Where: modes instrument, auxiliary

With the sequencer stopped, keep `record` held and play; each note lands on the next step, `record + [+]` leaves a rest and `record + [-]` goes back one step.

The quickest way to type in a line with a simple rhythm: notes fill consecutive steps in the order you
play them, with no need to keep time. Shape longer notes afterwards by extending them.

Facts:
- Holding `record` while playback is stopped starts step recording; the step 1 key turns red to mark where the next note goes. [#start] [s1]
- Each note played while `record` stays held fills the step under the red cursor, which then moves on; filled steps light white. [#fill] [s1]
- `record + [+]` moves the red cursor forward without writing anything. [#rest] [s1]
- `record + [-]` moves the cursor back one step; a sound already there plays and its key lights, ready to change. [#back] [s1]
- Tapping a step you have recorded deletes it from the recording. [#remove] [s1]

Procedures:
- Enter a line note by note [#record] [s1]
  Needs: playback is stopped
  1. `record + keys` — each note takes the next step
- Delete a step entered by mistake [#remove] (derived) [s1]
  1. `record + step n` — TE only says to tap the step; keeping record held is our assumption

Related: [sequencer.step-entry], [sequencer.live-recording], [sequencer.clear-and-undo]

Sources: s1 guide:sequencer#step-recording

### Live recording [sequencer.live-recording]
current · OS ≥ 1.0.9 · changed in 1.0.38 · guide v1.1.15
Also called: live record, real-time recording, overdub, latch recording, count-in
Where: modes instrument, auxiliary

`record + play` arms recording, which begins with your first note; during playback, hold `record` to overdub or press `record + play` to latch recording. `record + play → play` adds a count-in.

Arming means nothing runs until your first note, so a take starts exactly on the downbeat. Once a
pattern loops, holding `record` layers new notes on each pass. Live takes are pulled onto the grid by
the track's quantisation in the bar menu.

Facts:
- `record + play` arms live recording: the step 1 key flashes red while the sequencer waits. [#arm] [s1]
- The first note you play starts playback and recording together. [#first-note] [s1]
- Steps that receive notes turn red while recording and show white after `stop`. [#red-white] [s1]
- While a pattern plays, holding `record` records into it until you let go. [#overdub] [s1]
- Pressing `record + play` during playback latches recording on without holding `record`. [#latch] [s1]
- Encoder moves made while recording are stored per step, like parameter locks; `bar + turn E4` smooths them. [#automation] [s1]
- `record + play → play` plays a count-in before recording starts. [#count-in] (since 1.0.38) [s1]
- A take longer than the pattern wraps round and plays over itself, so lengthen the pattern first. [#too-long] [s2]
- Notes arriving over MIDI while recording is armed land in the pattern too, according to community test tools. [#midi-in] (community) [s3]

Procedures:
- Record a part live [#record] [s1]
  1. `record + play`
  2. `keys` — recording starts with the first note
  3. `stop`
- Add notes to a playing pattern [#overdub] [s1]
  Needs: the pattern is playing
  1. `record + keys`
- Record with a count-in [#count-in] (since 1.0.38) [s1]
  1. `record + play → play`

Related: [sequencer.bar-menu], [sequencer.parameter-locks], [sequencer.bars-and-length]

Sources: s1 guide:sequencer#live-recording · s2 guide:get-started#4.2%20recording%20a%20baseline · s3 note 20

### Extended notes and note length [sequencer.extend-notes]
current · OS ≥ 1.0.9 · changed in 1.0.45 · guide v1.1.15
Also called: extend a note, long note, tie, note duration, overlap, gate length
Where: modes instrument, auxiliary

Hold a step and press a later step to stretch its notes up to there; pressing the later step again switches between "full step" and "overlap". Other step-entered notes take the bar menu's note length.

The bar menu's length suits drums and plucked lines; anything that has to sustain is better stretched
note by note. Pulse hold is related but also pauses the track.

Facts:
- Holding a step and pressing a later step stretches the step's note or chord until the later step; this is how chords and pads span several steps. [#extend] [s1]
- Pressing that end step a second time switches the note between two endings, "full step" and "overlap". [#ending] (since 1.0.45) [s1]
- TE does not define them; presumably "full step" stops at the step boundary and "overlap" runs into the next step, which matters for legato and glides. [#overlap-meaning] (since 1.0.45) (derived) [s2]
- Notes placed by pressing steps take their length from `bar + turn E2`; live-recorded and extended notes keep their own. [#default-length] [s3]
- In a new project that setting reads 50, about half a step, according to decoded project files. [#default-50] (community-verified) [s4]

Procedures:
- Make a note last several steps [#extend] [s1]
  1. `step n + step m` — press the step where the note should end; press it again to switch the ending

Related: [sequencer.bar-menu], [sequencer.component-pulse-hold], [instrument.play-mode]

Sources: s1 guide:sequencer#step-sequencing · s2 changelog:1.0.45 · s3 guide:sequencer#extend-with-bar · s4 note 10

### Nudging steps off the grid [sequencer.nudge]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: nudge, micro timing, microtiming, off-grid, late note, early note
Where: modes instrument, auxiliary

Hold a step and press `[-]` or `[+]` to move its notes slightly earlier or later; this needs the track's quantisation below 100.

If `[-]` and `[+]` seem to do nothing while a step is held, quantisation is at 100. For the feel of a
whole track rather than single steps, use groove instead.

Facts:
- Holding a step and pressing `[-]` or `[+]` moves the step's notes earlier or later, off the step grid. [#how] [s1]
- Each press is a fine adjustment; keeping `[-]` or `[+]` held moves faster. [#speed] [s1]
- Nudging only works while the track's quantisation (`bar + turn E1`) is below 100. [#quantise-rule] [s1]
- Decoded project files show quantisation at 100 in a new project, so turn it down before nudging. [#quantise-default] (community-verified) [s2]

Procedures:
- Move a step's notes slightly off the grid [#nudge] [s1]
  Needs: the track's quantisation is below 100
  1. `step n + [-]/[+]`

Related: [sequencer.bar-menu], [sequencer.rotate]

Sources: s1 guide:sequencer#step-sequencing · s2 note 10

### Sequencing one sound at a time [sequencer.single-sound]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: one-sound view, single note view, drum lane, drum sequencing
Where: modes instrument, auxiliary

Hold a keyboard key and tap `record` to see only the steps that play that note or drum sound; with the key still held, press steps to sequence just that sound.

Made for drum tracks, where all 24 sounds share the same 16 steps: hold the hi-hat, set its steps,
let go, hold the snare, and so on. On melodic tracks it shows where one pitch is used.

Facts:
- Holding a key and tapping `record` makes the step keys show only the steps where that note or sound is recorded. [#view] [s1]
- While the key stays held, pressing steps sequences that one sound, even on steps that already carry other sounds. [#sequence] [s2]
- Holding a key and pressing a step enters the same view directly, recording the note on that step. [#direct] [s1]
- Letting go of the key appears to end the view; TE's drum walkthrough just says to let go when done. [#release] (derived) [s2]

Procedures:
- Program one drum sound without seeing the others [#one-sound] [s2]
  1. `key + record → + steps` — keep the key held throughout

Related: [sequencer.step-entry]

Sources: s1 guide:sequencer#step-sequencing · s2 guide:get-started#4.1%20sequencing%20a%20drum%20beat

### Shifting a sequence (rotate) [sequencer.rotate]
outdated-in-guide · OS ≥ 1.1.15 · changed in 1.1.21 · guide v1.1.15
Also called: sequence shift, rotate trigs, rotate pattern, offset a pattern
Where: modes instrument, auxiliary

Hold a track key and press `[-]` or `[+]` to slide that track's whole sequence by one step, wrapping at the ends. Added in OS 1.1.15; since 1.1.21 step components and parameter locks move too.

A quick way to hear a part in a new place, such as moving a hi-hat figure from on-beat to off-beat.
On 1.1.15–1.1.18 locks and components stayed behind on their old steps.

Facts:
- Holding a track key and pressing `[-]` or `[+]` moves that track's whole sequence by one step, the two keys choosing the direction. [#shift] [s1]
- Notes pushed past the end of the sequence come back in at its start. [#wrap] [s1]
- Rotating arrived with OS 1.1.15. [#added] [s2]
- Since OS 1.1.21 step components and parameter locks travel with their notes; the guide mentions only notes. [#carries] (since 1.1.21) [s3]
- The rotation covers the whole pattern length, not only the bar on screen, according to decoded project files. [#whole-pattern] (community) [s4]

Procedures:
- Slide a track's sequence by one step [#rotate] [s1]
  1. `Tn + [-]/[+]`

Related: [sequencer.transpose-sequence], [sequencer.nudge]

Sources: s1 guide:sequencer#rotate-trigs-functionality · s2 changelog:1.1.15 · s3 changelog:1.1.21 · s4 note 10

### Copying and pasting steps [sequencer.copy-step]
current · OS ≥ 1.0.13 · guide v1.1.15
Also called: copy a step, paste a step, duplicate a step
Where: modes instrument, auxiliary

Hold a step to copy its notes, step components and parameter locks, let go, then press an empty step to paste.

Repeats a finished hit — say a snare with a ratchet and a filter lock — without rebuilding it. For
larger chunks, duplicate a bar or copy the pattern in arrange mode.

Facts:
- Holding a step copies everything on it — notes, step components and parameter locks. [#copy] [s1]
- After you let go, pressing an empty step pastes the copy onto it. [#paste] [s1]
- Copying by holding a step arrived in OS 1.0.13. [#since] [s2]
- When a held step is copied, its number box on the screen adds the word copied. [#copied] (verified 1.1.33) [s3]
- The copy is taken while you are still holding the step, about half a second in, which is when copied appears; the word stays for a second or two after you let go. [#copy-during-hold] (verified 1.1.33) [s3]

Procedures:
- Copy one step to another [#copy-paste] [s1]
  1. `hold step n → step m` — the target must be empty

Related: [sequencer.bars-and-length], [arrange.patterns]

Sources: s1 guide:sequencer#step-sequencing · s2 changelog:1.0.13 · s3 note 59

### Transposing a track's sequence [sequencer.transpose-sequence]
current · OS ≥ 1.0.9 · changed in 1.0.45 · guide v1.1.15
Also called: sequence octave, transpose a pattern, semitone shift
Where: modes instrument

`shift + [-]` or `shift + [+]` moves every note of the current sequence down or up — an octave on synth and sampler tracks, a semitone on drum-sampler tracks.

Handy when a bass line sits too high. In a drum kit each semitone is another sound, so on drums it
tries the same rhythm on the neighbouring hits.

Facts:
- Holding `shift` and pressing `[-]` or `[+]` moves the current sequence an octave down or up on synth and sampler tracks. [#octave] [s1]
- On drum-sampler tracks the same keys move the sequenced notes by one semitone instead. [#drum-semitone] (since 1.0.45) [s1]
- Without `shift`, `[-]` and `[+]` only change the keyboard's octave and leave recorded notes alone. [#keyboard-only] [s2]

Procedures:
- Move a track's recorded notes down or up [#transpose] [s1]
  1. `shift + [-]/[+]`

Related: [sequencer.rotate], [sequencer.component-tonality]

Sources: s1 guide:sequencer#step-sequencing · s2 guide:layout#transport-controls

### Parameter locks [sequencer.parameter-locks]
current · OS ≥ 1.0.9 · changed in 1.0.15, 1.1.0, 1.1.3, 1.1.21, 1.1.33 · guide v1.1.15
Also called: p-lock, p-locks, plock, parameter lock, locked parameter, step automation, per-step value
Where: modes instrument, auxiliary; screens M1, M2, M3, M4

Store a module-page value on individual steps; whenever such a step plays, the parameter jumps to the stored value.

A parameter lock pins one value of one parameter to one step. Hold a hi-hat step and open the
filter a little, hold the next one and close it, and the pattern gains movement without any
recording pass. Locks work on everything the module pages show — engine, envelopes, filter, LFO —
but not on player settings.

Locks and live-recorded knob moves share their storage and their smoothing: both change the value
in steps unless the bar menu's shape control (`bar + turn E4`) blends between them. To thin locks
out over time, pair them with the skip parameter lock step component.

Firmware history matters here: sampler tracks gained locks in 1.1.0, rotating a sequence has
carried its locks along since 1.1.21, and locks on empty steps work reliably from 1.1.33.

Facts:
- To lock a value, keep a step held and turn an encoder; the step remembers the value you dial in. [#record] (verified 1.1.33) [s1]
- Each time the sequencer reaches a locked step, the parameter takes that step's stored value. [#playback] [s2]
- Any parameter on the four module pages can carry locks; the settings of players cannot. [#scope] [s2]
- By default the value jumps at each locked step. The shape control in the bar menu (`bar + turn E4`) smooths the movement between locks. [#stepped] [s3]
- Knob moves recorded live while holding `record` are also stored step by step, so they play back stepped until you add smoothing. [#live-automation] [s4]
- Copying a step to an empty step brings its locks along with its notes and step components. [#copy] [s2]
- `bar + M2` removes every lock in the pattern and leaves the notes in place. [#clear-pattern] [s3]
- Clearing the whole track with `record + hold stop` removes its locks too. [#clear-track] (since 1.0.15) [s5]
- The skip parameter lock step component (`natural 12`) lets a step's locks play only on every Nth pass, for automation that appears once every few repeats. [#skip-component] [s6]
- Tracks using the drum or synth sampler accept locks as well. [#samplers] (since 1.1.0) [s7]
- Duplicating a bar with `bar + shift + [+]` copies its locks and step components too. [#duplicate-bar] (since 1.1.3) [s8]
- Shifting a track's sequence with `Tn + [-]/[+]` moves the locks together with the notes. [#rotate] (since 1.1.21) [s9]
- A lock can sit on a step that has no note; before OS 1.1.33 a bug prevented adding one there. [#empty-steps] (since 1.1.33) [s10]
- While you record a lock, the held step's number box on the screen turns orange. [#lock-box] (verified 1.1.33) [s1]
- Holding a locked step shows its locked values in the page's top bar instead of the track's own — shape 00 and detune 06, say, on a track set to 15 and 05. [#show-locks] (verified 1.1.33) [s1]

Procedures:
- Lock a parameter value on one step [#add] [s2]
  Needs: the track is selected; the module page with the parameter is on screen
  1. `step n + turn E1…E4` — keep holding the step while turning; any page parameter works
  Result: The step plays back with the new value from now on.
- Record knob movements into the pattern while it plays [#record-live] [s4]
  Needs: the pattern is playing
  1. `record + turn E1…E4`
  Result: The movement is stored per step, like locks.
- Glide between locked values instead of jumping [#smooth] [s3]
  1. `bar + turn E4`
- Remove all locks from the pattern but keep its notes [#clear] [s3]
  1. `bar + M2`
- Copy a step, locks included, to another step [#copy-step] [s2]
  1. `hold step n → step m` — let go of the first step, then press the target step, which must be empty

Related: [sequencer.step-components], [sequencer.component-skip-parameter-lock], [sequencer.bar-menu], [instrument.engine-prism]

Sources: s1 note 59 · s2 guide:sequencer#step-sequencing · s3 guide:sequencer#extend-with-bar · s4 guide:sequencer#live-recording · s5 changelog:1.0.15 · s6 guide:step-components · s7 changelog:1.1.0 · s8 changelog:1.1.3 · s9 changelog:1.1.21 · s10 changelog:1.1.33

### Clearing a sequence and undo [sequencer.clear-and-undo]
current · OS ≥ 1.0.9 · changed in 1.0.15 · guide v1.1.15
Also called: clear a track, erase a track, clear a pattern, clear parameter locks, undo
Where: modes instrument, auxiliary

`record + hold stop` wipes the current track; `bar + M1` clears only notes, `bar + M2` only parameter locks, `bar + M4` both; `shift + record` undoes the last change.

`bar + M1` keeps a filter movement while you record a new melody over it; `bar + M2` keeps the notes
but drops the automation. Save a project version before a big clear.

Facts:
- Holding `record` and `stop` until the step LEDs fill red clears everything recorded on the current track. [#track] [s1]
- That clear takes the parameter locks as well; OS 1.0.15 fixed it leaving them behind. [#track-locks] (since 1.0.15) [s2]
- The same gesture clears the track during step recording. [#step-rec] [s3]
- In the bar menu, `M1` deletes the pattern's notes but keeps its parameter locks, `M2` deletes the locks but keeps the notes, and `M4` deletes both. [#bar-clears] [s4]
- `shift + record` undoes the last change; there is one undo level and not every action can be undone. [#undo] [s1]

Procedures:
- Wipe the current track [#clear-track] [s1]
  1. `record + hold stop` — until the whole step row is red
- Clear only the notes, only the locks, or both [#clear-part] [s4]
  1. `bar + M1/M2/M4`
- Undo the last change [#undo] [s1]
  1. `shift + record`

Related: [sequencer.parameter-locks], [sequencer.bar-menu]

Sources: s1 guide:sequencer#step-sequencing · s2 changelog:1.0.15 · s3 guide:sequencer#step-recording · s4 guide:sequencer#extend-with-bar

### Step components [sequencer.step-components]
current · OS ≥ 1.0.9 · changed in 1.1.3, 1.1.21, 1.1.32 · guide v1.1.15
Also called: components, step modifiers, step conditions, trig conditions, step effects, ratchets
Where: modes instrument, auxiliary

Per-step modifiers — repeats, ratchets, fixed velocity, pitch ramps, randomness, glides, bends, transposition, jumps and skip rules — added by holding `shift`, choosing a white key for the component and a black key for its value.

Step components are the OP-XY's answer to trig conditions and ratchets: small rules attached to a
step that change how it plays every time the pattern comes round. The keyboard becomes their control
surface while `shift` is held — the 14 white keys choose _which_ component, the 10 black keys choose
_how much_.

The components fall into a few families. Timing: pulse, pulse hold and multiply. Level: velocity.
Pitch: ramp up, ramp down, random, portamento, bend and tonality. Flow: jump moves the playhead to
another step. The three skip components thin things out, letting locks, components or the whole
trigger through only on some passes, which keeps long loops from sounding repetitive.

Because one step can stack several components, simple patterns grow into evolving ones quickly. The
value each digit selects is listed per component in the step-component reference.

Facts:
- A step component changes how a step plays — repeating it, splitting it into rapid retriggers, bending, randomising or skipping it — while the recorded notes stay as they are. [#what] [s1]
- There are 14 components, one per white key; the icon printed on each natural names its component. [#fourteen] [s2]
- From the left, the naturals are: 1 pulse, 2 pulse hold, 3 multiply, 4 velocity, 5 ramp up, 6 ramp down, 7 random, 8 portamento, 9 bend, 10 tonality, 11 jump, 12 skip parameter lock, 13 skip step component, 14 skip trigger. [#order] [s3]
- The black keys then pick the component's value. Each component reads the ten digits its own way, and the screen spells out what the chosen digit does. [#values] [s2]
- For ten of the 14 components, `accidental 0` (the last black key) picks a random amount, count or shape; ramp up, ramp down, random and tonality use it for their strongest setting instead. [#random-digit] [s3]
- While `shift` is down, steps that hold notes turn dim to show they carry no component yet, and steps you select blink. [#dim-and-blink] [s2]
- A single step can carry any combination of the 14 components at the same time. [#combine] [s2]
- To take a component off, select the same steps with `shift` held and press that component's white key again. [#remove] [s2]
- Pulse and pulse hold stretch time — the step repeats or holds for extra steps before the sequence moves on — whereas multiply fits several triggers inside the one step, the classic ratchet. [#repeat-vs-multiply] [s4]
- Duplicating a bar copies its notes together with their step components and locks. [#duplicate-bar] (since 1.1.3) [s5]
- Shifting a track's sequence with `Tn + [-]/[+]` carries the step components along with the notes. [#rotate] (since 1.1.21) [s6]
- Holding a step and changing its note no longer wipes the step's components; OS 1.1.32 fixed that. [#hold-step-fix] (since 1.1.32) [s7]

Procedures:
- Add a step component to one or more steps [#add] [s2]
  Needs: the track already has notes in its sequence
  1. `shift + steps → + natural → + accidental` — keep shift down throughout — select the steps, choose the component, then its value
  Result: Once `shift` is released, the chosen steps play with the component.
- Remove a step component [#remove] [s2]
  1. `shift + steps → + natural` — select the same steps, then press the white key of the component to take off

Related: [sequencer.step-component-reference], [sequencer.parameter-locks], [hardware.layout]

Sources: s1 guide:step-components#what-are-step-components · s2 guide:step-components#adding-step-components-to-a-sequence · s3 guide:step-components#step-components-ref-table · s4 guide:step-components · s5 changelog:1.1.3 · s6 changelog:1.1.21 · s7 changelog:1.1.32

### Step component values [sequencer.step-component-reference]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: step component table, component values, accidental values, what the number keys do
Where: modes instrument, auxiliary

What each black key (1–9, then 0) selects for each of the 14 step components, in white-key order.

A pass is one time the playhead reaches the step. For most components 0 means chance; the ramps,
random and tonality use it for their strongest setting instead. The screen names the chosen value
while `shift` is held; each component has its own unit with an example.

Facts:
- Pulse (`natural 1`): 1–9 repeats; 0 a random number. [#pulse] [s1]
- Pulse hold (`natural 2`): held for 1–9 steps; 0 a random number. [#pulse-hold] [s1]
- Multiply (`natural 3`): 1–8 hits inside the step; 0 a random number; for 9 see the multiply unit. [#multiply] [s1]
- Velocity (`natural 4`): 1–8 give 4, 8, 16, 32, 64, 100, 112, 127; 9 gives 0; 0 a random velocity. [#velocity] [s1]
- Ramp up (`natural 5`), ramp down (`natural 6`) and random (`natural 7`): 1–5 mean 2–6 steps within one octave; 6–9 and 0 mean 2–6 steps over three octaves. [#ramps-random] [s1]
- Portamento (`natural 8`): 1–9 give 10–90%; 0 a random amount. [#portamento] [s1]
- Bend (`natural 9`): 1 down-up, 2 up-down, 3 bump down, 4 bump up, 5 spring out, 6 spring in, 7 fade down, 8 fade up, 9 random 1, 0 random 2. [#bend] [s1]
- Tonality (`natural 10`): 1 ignore chord progression, 2 transpose only, 3 octave up, 4 fifth up, 5 third up, 6 chromatic up, 7 chromatic down, 8/9/0 quantize 33/66/100%. [#tonality] [s1]
- Jump (`natural 11`): 1–4 go to step 1, 5, 9 or 13; 5 one forward; 6 one back; 7 forward or back; 8 stay; 9 align the track position; 0 a random step. [#jump] [s1]
- Skip parameter lock (`natural 12`), skip step component (`natural 13`) and skip trigger (`natural 14`): 1 every pass, 2–9 every 2nd to 9th pass, 0 at random. [#skips] [s1]
- Added without a digit, a component keeps a default value; decoded device files show 4 for most, 2 for multiply and the skips, 5 for velocity and 1 for bend. [#defaults] (community) [s2]
- The ramps and random stay in the current scale, presumably the song scale set on the brain track. [#scale] (derived) [s3]
- Key icons from `natural 1` to `natural 14`: four dots, open hand, ÷, rising wedge, stairs up, stairs down, "rnd", glide sign, twin fins, four-petal fan, arrow to a dot, spoked wheel, ring of wedges, sun. [#icons] (measured) [s4]

Related: [sequencer.step-components]

Sources: s1 guide:step-components#step-components-ref-table · s2 note 10 · s3 guide:auxiliary#brain · s4 note 50

### Pulse (step component) [sequencer.component-pulse]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: pulse, repeat step, stutter step
Where: modes instrument, auxiliary

Step component on `natural 1` that repeats a step before the track moves on.

Use pulse for rolls and stumbles built from one hit. To fit extra hits inside the step without
delaying anything, use multiply.

Facts:
- Pulse replays a step a chosen number of times while the track stays on it; then the sequence continues. [#what] [s1]
- The black keys 1–9 give 1–9 repeats; 0 a random number. [#values] [s2]
- Because the track waits during the repeats, the steps after a pulsed step play later than written. [#later-steps] (derived) [s1]

Procedures:
- Make a step play three extra times [#add] [s3]
  1. `shift + steps → + natural 1 → + accidental 3`

Related: [sequencer.component-multiply], [sequencer.step-component-reference]

Sources: s1 guide:step-components · s2 guide:step-components#step-components-ref-table · s3 guide:step-components#adding-step-components-to-a-sequence

### Pulse hold (step component) [sequencer.component-pulse-hold]
current · OS ≥ 1.0.9 · changed in 1.0.29 · guide v1.1.15
Also called: hold component, hold step, wait on a step
Where: modes instrument, auxiliary

Step component on `natural 2` that holds a step for extra steps while the sequence waits.

Where pulse re-triggers the step, pulse hold lets its note ring while the rest of the pattern waits.
For a long note that delays nothing, extend the note instead.

Facts:
- Pulse hold keeps the track on a step for a chosen number of steps before the sequence moves on. [#what] [s1]
- The black keys 1–9 hold the step for 1–9 steps; 0 for a random number. [#values] [s2]
- Since OS 1.0.29 the length of the held note is set from the track scale. [#note-length] (since 1.0.29) [s3]
- Since OS 1.0.29 pulse hold leaves the length of arpeggio notes alone. [#arp] (since 1.0.29) [s3]

Procedures:
- Hold a step for two steps [#add] [s4]
  1. `shift + steps → + natural 2 → + accidental 2`

Related: [sequencer.component-pulse], [sequencer.extend-notes]

Sources: s1 guide:step-components · s2 guide:step-components#step-components-ref-table · s3 changelog:1.0.29 · s4 guide:step-components#adding-step-components-to-a-sequence

### Multiply (step component) [sequencer.component-multiply]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: multiply, ratchet, retrigger, roll, divide a step
Where: modes instrument, auxiliary

Step component on `natural 3` that splits a step into several quick hits inside its own length, a ratchet.

Unlike pulse, multiply does not delay the next step. Pair it with skip step component so the burst
fires only every few passes.

Facts:
- Multiply divides a step into several shorter hits that fit inside the step, the ratchet effect common on hi-hats. [#what] [s1]
- The black keys 1–8 split the step into 1–8 hits (1 leaves it unchanged); 0 picks a random number. [#values] [s2]
- `accidental 9` most likely gives 9 hits; TE's table prints 3 for it, apparently a slip. Not checked on a unit. [#nine] (derived) [s2]

Procedures:
- Turn a hi-hat step into a three-hit ratchet [#ratchet] [s3]
  1. `shift + steps → + natural 3 → + accidental 3` — the screen reads "divide into 3 trigs"

Related: [sequencer.component-skip-step-component], [sequencer.step-component-reference]

Sources: s1 guide:step-components · s2 guide:step-components#step-components-ref-table · s3 guide:get-started#4.1%20sequencing%20a%20drum%20beat

### Velocity (step component) [sequencer.component-velocity]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: velocity component, fixed velocity, accent, ghost note
Where: modes instrument, auxiliary

Step component on `natural 4` that plays a step at a fixed or random velocity.

Use it for accents and ghost notes — 127 on the backbeat, 16 or 32 on the hi-hats between — or the
random setting for a looser feel.

Facts:
- The velocity component makes a step play at a set velocity, whatever velocity was recorded. [#what] [s1]
- The black keys 1–8 set 4, 8, 16, 32, 64, 100, 112 or 127; 9 sets 0; 0 picks a random velocity. [#values] [s2]
- How much velocity changes the sound depends on the preset's velocity sensitivity, set in its preset settings. [#sound] (derived) [s3]

Procedures:
- Accent a step at full velocity [#accent] [s4]
  1. `shift + steps → + natural 4 → + accidental 8` — 8 gives 127

Related: [sequencer.step-component-reference], [howto.enable-velocity]

Sources: s1 guide:step-components · s2 guide:step-components#step-components-ref-table · s3 guide:instrument#preset-settings · s4 guide:step-components#adding-step-components-to-a-sequence

### Ramp up (step component) [sequencer.component-ramp-up]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: ramp up, rising ramp, climbing step
Where: modes instrument, auxiliary

Step component on `natural 5` whose note climbs one stage of an in-scale ramp each time the step plays.

One repeated note becomes a figure that rises from pass to pass, such as a bass note climbing each
time the loop comes round.

Facts:
- Each time the step plays, ramp up moves its note one stage higher along a ramp that stays inside the current scale. [#what] [s1]
- The black keys 1–5 give a ramp of 2–6 steps within one octave; 6–9 and 0 give 2–6 steps over three octaves, so 0 is the widest ramp rather than random. [#values] [s2]

Procedures:
- Make a step climb in four stages through an octave [#add] [s3]
  1. `shift + steps → + natural 5 → + accidental 3`

Related: [sequencer.component-ramp-down], [sequencer.step-component-reference]

Sources: s1 guide:step-components · s2 guide:step-components#step-components-ref-table · s3 guide:step-components#adding-step-components-to-a-sequence

### Ramp down (step component) [sequencer.component-ramp-down]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: ramp down, falling ramp, falling step
Where: modes instrument, auxiliary

Step component on `natural 6` whose note drops one stage of an in-scale ramp each time the step plays.

The mirror of ramp up, for falling bass lines and cascades built from a single step.

Facts:
- Each time the step plays, ramp down moves its note one stage lower along a ramp that stays inside the current scale. [#what] [s1]
- The black keys 1–5 give a ramp of 2–6 steps within one octave; 6–9 and 0 give 2–6 steps over three octaves, so 0 is the widest ramp rather than random. [#values] [s2]

Procedures:
- Make a step fall in two large stages [#add] [s3]
  1. `shift + steps → + natural 6 → + accidental 6`

Related: [sequencer.component-ramp-up], [sequencer.step-component-reference]

Sources: s1 guide:step-components · s2 guide:step-components#step-components-ref-table · s3 guide:step-components#adding-step-components-to-a-sequence

### Random (step component) [sequencer.component-random]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: random note, random pitch, randomise, randomize
Where: modes instrument, auxiliary

Step component on `natural 7` that gives a step a random note from the current scale.

A narrow range keeps a melody recognisable while it shifts; a wide one scatters notes. Add skip
step component so the randomness strikes only on some passes.

Facts:
- Random replaces the step's note with one picked at random inside the current scale. [#what] [s1]
- The digit sets the range: 1–5 give 2–6 steps within one octave, 6–9 and 0 give 2–6 steps over three octaves, so 0 is the widest range rather than random. [#values] [s2]

Procedures:
- Let a step wander between nearby notes [#add] [s3]
  1. `shift + steps → + natural 7 → + accidental 1`

Related: [sequencer.component-skip-step-component], [sequencer.step-component-reference]

Sources: s1 guide:step-components · s2 guide:step-components#step-components-ref-table · s3 guide:step-components#adding-step-components-to-a-sequence

### Portamento (step component) [sequencer.component-portamento]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: portamento component, step glide, slide
Where: modes instrument, auxiliary

Step component on `natural 8` that glides the pitch into and out of a step.

It puts a slide exactly where you want it, such as the one bass note that should swoop.

Facts:
- The portamento component makes the pitch glide into the step and out of it again. [#what] [s1]
- The black keys 1–9 set the amount from 10% to 90%; 0 picks a random amount. [#values] [s2]
- It acts on single steps, whereas the portamento setting on the `M2` shift page glides every note of the track. [#vs-track] (derived) [s3]

Procedures:
- Slide into one step [#add] [s4]
  1. `shift + steps → + natural 8 → + accidental 5`

Related: [instrument.play-mode], [sequencer.step-component-reference]

Sources: s1 guide:step-components · s2 guide:step-components#step-components-ref-table · s3 guide:instrument#envelopes · s4 guide:step-components#adding-step-components-to-a-sequence

### Bend (step component) [sequencer.component-bend]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: bend component, pitch curve, pitch envelope on a step
Where: modes instrument, auxiliary

Step component on `natural 9` that runs one of ten pitch-bend curves over a step.

A small pitch envelope for one step: dips, falling kicks, chirps on percussion.

Facts:
- Bend runs a pitch-bend curve over the step; the black key chooses the shape. [#what] [s1]
- 1 down-up, 2 up-down, 3 bump down, 4 bump up, 5 spring out, 6 spring in, 7 fade down, 8 fade up, 9 random 1, 0 random 2. [#values] [s2]
- The depth may follow the track's bend range (`M2` shift page), in which case bend range off would silence the effect. Not confirmed. [#depth] (speculative) [s3]

Procedures:
- Give a step a dip-and-return bend [#add] [s4]
  1. `shift + steps → + natural 9 → + accidental 1`

Related: [instrument.play-mode], [sequencer.step-component-reference]

Sources: s1 guide:step-components · s2 guide:step-components#step-components-ref-table · s3 guide:instrument#envelopes · s4 guide:step-components#adding-step-components-to-a-sequence

### Tonality (step component) [sequencer.component-tonality]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: tonality, transpose a step, step interval
Where: modes instrument, auxiliary

Step component on `natural 10` that transposes a step by a fixed interval or changes how it follows the brain's key.

Intervals add harmony to single steps, such as an octave jump on every fourth bass note. Tonality
has no random setting.

Facts:
- Tonality transposes the step by a set interval. [#what] [s1]
- 1 ignore chord progression, 2 transpose only, 3 octave up, 4 fifth up, 5 third up, 6 chromatic up, 7 chromatic down, 8 quantize 33%, 9 quantize 66%, 0 quantize 100%. [#values] [s2]
- Options 1, 2 and 8–0 appear to set how the step follows the brain track's transposition and scale; TE does not explain them. [#brain] (derived) [s3]

Procedures:
- Lift a step by a fifth [#add] [s4]
  1. `shift + steps → + natural 10 → + accidental 4`

Related: [auxiliary.brain], [sequencer.step-component-reference]

Sources: s1 guide:step-components · s2 guide:step-components#step-components-ref-table · s3 guide:auxiliary#brain · s4 guide:step-components#adding-step-components-to-a-sequence

### Jump (step component) [sequencer.component-jump]
current · OS ≥ 1.0.9 · changed in 1.0.50 · guide v1.1.15
Also called: jump, go to step, playhead jump, loop inside a pattern
Where: modes instrument, auxiliary

Step component on `natural 11` that sends the playhead from a step to another one.

Jumping back to step 1 halfway through shortens one track's loop; a random target makes a part
reshuffle itself as it plays.

Facts:
- Jump overrides the order of steps, sending the playhead from this step to a chosen one instead of the next in line. [#what] [s1]
- 1–4 go to step 1, 5, 9 or 13; 5 one step forward; 6 one step back; 7 forward or back; 8 stay on the step; 9 align the track position; 0 a random step. [#values] [s2]
- Align presumably returns the track to where it would be without jumps, in line with the other tracks. [#align] (derived) [s2]
- Jumps land in the bar that is playing; OS 1.0.50 fixed them landing in the bar shown for editing. [#playing-bar] (since 1.0.50) (derived) [s3]

Procedures:
- Send the playhead back to step 1 from chosen steps [#back-to-one] [s4]
  1. `shift + steps → + natural 11 → + accidental 1`

Related: [sequencer.bars-and-length], [sequencer.step-component-reference]

Sources: s1 guide:step-components · s2 guide:step-components#step-components-ref-table · s3 changelog:1.0.50 · s4 guide:step-components#adding-step-components-to-a-sequence

### Skip parameter lock (step component) [sequencer.component-skip-parameter-lock]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: skip p-lock, conditional lock, lock every nth pass
Where: modes instrument, auxiliary

Step component on `natural 12` that lets a step's parameter locks apply only on some passes.

For automation that turns up now and then, such as a filter opening on one pass in four. The notes
play on every pass.

Facts:
- The step's parameter locks take effect only on some passes of the pattern; on the others the step plays with the track's normal settings. [#what] [s1]
- 1 applies the locks every time, 2–9 only on every 2nd to 9th pass, and 0 at random. [#values] [s2]

Procedures:
- Let a step's locks play only every fourth pass [#add] [s3]
  1. `shift + steps → + natural 12 → + accidental 4`

Related: [sequencer.parameter-locks], [sequencer.step-component-reference]

Sources: s1 guide:step-components · s2 guide:step-components#step-components-ref-table · s3 guide:step-components#adding-step-components-to-a-sequence

### Skip step component (step component) [sequencer.component-skip-step-component]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: skip component, conditional component, component every nth pass
Where: modes instrument, auxiliary

Step component on `natural 13` that lets a step's other components apply only on some passes.

A ratchet, bend or random note that appears only every few passes sounds like a deliberate variation
rather than a loop.

Facts:
- The step's other components act only on some passes of the pattern; on the rest the step plays without them. [#what] [s1]
- 1 applies them every time, 2–9 only on every 2nd to 9th pass, and 0 at random. [#values] [s2]

Procedures:
- Ratchet a step only every second pass [#sometimes-ratchet] [s3]
  1. `shift + steps → + natural 3 → + accidental 2` — multiply, two hits
  2. `shift + steps → + natural 13 → + accidental 2` — same steps

Related: [sequencer.component-multiply], [sequencer.step-component-reference]

Sources: s1 guide:step-components · s2 guide:step-components#step-components-ref-table · s3 guide:step-components#adding-step-components-to-a-sequence

### Skip trigger (step component) [sequencer.component-skip-trigger]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: skip trig, trig condition, conditional trig, probability
Where: modes instrument, auxiliary

Step component on `natural 14` that lets a step's notes play only on some passes.

A one-in-N trig condition: a crash on a step with value 4 lands once every four passes, turning a
one-bar loop into a four-bar phrase. Value 0 leaves each pass to chance.

Facts:
- Skip trigger lets the step's notes sound only on some passes of the pattern. [#what] [s1]
- 1 plays the step every time, 2–9 only on every 2nd to 9th pass, and 0 at random. [#values] [s2]

Procedures:
- Play a step only every second pass [#add] [s3]
  1. `shift + steps → + natural 14 → + accidental 2`

Related: [sequencer.component-skip-step-component], [sequencer.step-component-reference]

Sources: s1 guide:step-components · s2 guide:step-components#step-components-ref-table · s3 guide:step-components#adding-step-components-to-a-sequence

### Bar menu [sequencer.bar-menu]
current · OS ≥ 1.0.9 · changed in 1.1.15, 1.1.25 · guide v1.1.15 · verified on 1.1.33
Also called: bar page, bar screen, quantise, quantize, quantisation, note length, track groove, lock smoothing
Where: modes instrument, auxiliary; screens bar

Holding `bar` shows the selected track's pattern settings; the encoders set quantisation, note length, groove and lock smoothing, and other keys handle bars, track scale, length and clearing.

Everything here acts on the whole pattern, whereas step edits and locks act on single steps. The
keys handle structure — `[+]` and `[-]` add and remove bars, black keys set the track scale, step
keys set the length, `M1`, `M2` and `M4` clear — while the encoders handle feel.

Facts:
- The bar page stays on screen only while `bar` is held; `shift + bar` pins it until you press `bar` again. [#held] [s1]
- In a new project the card reads quant 100, length 50 and track scale 1, with groove shown as a dash and shape as a small step symbol. [#quantise-default] (verified 1.1.33) [s2]
- Since OS 1.1.25, tracks with an odd track scale (3, 5, 6 or 7) quantise to a grid made for that scale. [#odd-grid] (since 1.1.25) [s3]
- The groove type (shuffle, bombora and the rest) is picked on the tempo page; the bar menu sets only this track's amount. [#groove-type] [s1]
- Decoded project files store length, track scale, quantisation, groove and smoothing in each pattern, so a track's patterns can differ. [#per-pattern] (community-verified) [s4]
- Holding `bar` lays a white card over the dimmed page — bar numbers 1 to 4 along the top with the current one inverted, the track scale beside them, then rows for quant, length, groove and shape, each marked with its encoder's dot. The card fades when `bar` is let go. [#card] (verified 1.1.33) [s2]
- A faint mini piano roll on the right of the card shows a dash for each note in the shown bar, as long as the note. [#roll] (verified 1.1.33) [s2]
- With the card up, `bar + [+]` or `bar + [-]` adds or removes a bar box at once; the shown bar's box is filled and the other bars are outlined. [#boxes-live] (verified 1.1.33) [s2]
- The card's footer names the clearing keys — clr notes on `M1`, clr params on `M2`, clr all on `M4`. [#clear-labels] (verified 1.1.33) [s2]

Procedures:
- Change a pattern-wide setting [#adjust] [s1]
  1. `bar + turn E1…E4`

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| bar | `turn E1` | quantisation | – | – | – | pulls live-recorded notes onto the steps; at 100 nothing can be nudged s1 |
| bar | `click E1` | quantisation on/off | – | – | – | 1.1.15 added a click that toggles quantisation; that it is this encoder is assumed (since 1.1.15) (derived) s5 |
| bar | `turn E2` | note length | – | – | – | for notes entered by pressing steps s1 |
| bar | `turn E3` | groove | – | – | – | this track's amount; replaces the tempo page's swing s1 |
| bar | `turn E4` | shape | – | no smoothing | – | smooths between parameter locks and recorded automation s1 |

Related: [sequencer.track-scale], [sequencer.bars-and-length], [sequencer.clear-and-undo]

Sources: s1 guide:sequencer#extend-with-bar · s2 note 59 · s3 changelog:1.1.25 · s4 note 10 · s5 changelog:1.1.15

### Track scale [sequencer.track-scale]
outdated-in-guide · OS ≥ 1.0.9 · changed in 1.0.15, 1.1.25 · guide v1.1.15
Also called: step resolution, time division, track speed, half speed, double speed
Where: modes instrument, auxiliary; screens bar

`bar + accidental` sets how long one step of the selected track lasts: at 1 a sixteenth note, at 4 a quarter note, at 1/2 a thirty-second. Each track has its own scale.

Tracks at different scales share a scene: a slow pad at 4 next to hi-hats at 1/2. TE ties only the
key marked 4 to a value; which keys give 16 and the fractions is not documented.

Facts:
- Holding `bar` and pressing a black key sets the track scale, the time one step takes; every track keeps its own. [#set] [s1]
- The scale multiplies the length of every step; at 4 a step lasts four normal steps, so four steps fill a 4/4 bar. [#meaning] [s2]
- `bar + accidental 4`, the black key marked 4, sets scale 4; the step lights then move four times slower. [#four] [s2]
- Raising the scale is how a pattern outgrows four bars; 64 steps at scale 16 last 64 bars. [#longer] [s1]
- TE's guide lists the scales 1, 2, 3, 4, 6, 8, 16 and 1/2. [#guide-list] [s1]
- The changelog also names 1/5 and 1/7, repaired in OS 1.0.15. [#fractions] (since 1.0.15) [s3]
- OS 1.1.25 gave the odd scales 3, 5, 6 and 7 their own quantisation grid, so 5 and 7 exist too. [#odd-scales] (since 1.1.25) [s4]

Procedures:
- Change how long each step of the track lasts [#set] [s1]
  1. `bar + accidental`

Related: [sequencer.bar-menu], [sequencer.bars-and-length]

Sources: s1 guide:sequencer#extend-with-bar · s2 guide:get-started#4.3%20adding-chords · s3 changelog:1.0.15 · s4 changelog:1.1.25

### Bars and pattern length [sequencer.bars-and-length]
current · OS ≥ 1.0.9 · changed in 1.1.3 · guide v1.1.15
Also called: add a bar, duplicate a bar, switch bars, pages, sequence length, pattern length, number of steps
Where: modes instrument, auxiliary; screens bar

`bar + [+]` adds a 16-step bar (four at most), `bar + [-]` removes one, `bar + shift + [+]` duplicates, tapping `bar` switches bars, and `bar + step n` sets how many steps the last bar plays.

Duplicate the first bar, then change a detail in the copy. Length makes odd patterns easy: 12 steps
for a bar of 3/4. The OS changelog calls bars "pages".

Facts:
- `bar + [+]` adds a bar of 16 steps and `bar + [-]` removes one; a pattern holds at most four bars. [#add-remove] [s1]
- `bar + shift + [+]` duplicates the current bar; in a two-bar pattern it doubles the phrase, copying bar 1 to bar 3 and bar 2 to bar 4. [#duplicate] [s1]
- Since OS 1.1.3, duplicated bars keep their step components and parameter locks. [#duplicate-content] (since 1.1.3) [s2]
- Tapping `bar` changes which bar the step keys show; a bar picked during playback or recording stays on the keys instead of following the playhead. [#switch] [s1]
- Holding `bar` and pressing a step key sets how many steps the pattern plays; with several bars it trims the final bar only. [#length] [s1]
- Bars and length together allow any pattern length from 1 to 64 steps. [#range] (community-verified) [s3]

Procedures:
- Add or remove a bar [#add] [s1]
  1. `bar + [+]/[-]`
- Duplicate the current bar [#duplicate] [s1]
  1. `bar + shift + [+]`
- Set the pattern's length in steps [#length] [s1]
  1. `bar + step n`

Related: [sequencer.bar-menu], [sequencer.track-scale], [basics.patterns-scenes-songs]

Sources: s1 guide:sequencer#extend-with-bar · s2 changelog:1.1.3 · s3 note 10

## Players

Per-track note players: arpeggio, maestro chords and hold.

### Players [players.overview]
outdated-in-guide · OS ≥ 1.0.9 · changed in 1.1.25 · guide v1.1.15 · verified on 1.1.33
Also called: player, player key, note player, player type, player style
Where: modes instrument, auxiliary; screens player

A player reworks the notes a track plays — into arpeggios, transposed chords (maestro) or latched notes (hold) — and is switched on per track with the player key.

Players sit between what you play and what the track sounds: the arpeggio spells a chord out note
by note, maestro plays whole chords from one finger, and hold keeps notes ringing after you let go.
The sequence is untouched, so switching the player off brings the original notes back. Since new
patterns copy the current player type (1.1.25), the type seems to belong to the pattern.

Facts:
- A player takes the notes a track receives, from the keyboard or its sequence, and turns them into a variation such as an arpeggio or a chord hit; the recorded notes stay as they are. [#what] [s1]
- Every instrument track and every auxiliary track can run a player of its own. [#tracks] [s1]
- The first press of `player` shows the selected track's player page, dimmed under an off box; a second press switches the player on. [#enable] (verified 1.1.33) [s2]
- `shift + player` opens the player list, headed with the track number and the word player: arpeggio, hold and maestro, the current type boxed. [#types] (verified 1.1.33) [s2]
- The first `shift + player` only opens the list. Each further press of `player`, with shift still held, moves the box to the next type (arpeggio → hold → maestro → arpeggio); letting go of shift opens the chosen player's page. [#list-steps] (verified 1.1.33) [s2]
- Player settings cannot be parameter-locked; only module-page parameters can. [#no-locks] [s3]
- Since OS 1.1.25, a pattern you add to a track starts out with the player type that is selected at that moment. [#new-pattern] (since 1.1.25) [s4]

Procedures:
- Switch on a player for the selected track [#enable] [s1]
  Needs: instrument or auxiliary mode; the track is selected
  1. `player` — opens the player page
  2. `player` — switches the player on
- Choose another player type [#change-type] (verified 1.1.33) [s2]
  1. `shift + player` — opens the list with the current type boxed; keep shift held
  2. `shift + player` — each further press of player moves to the next type (arpeggio, hold, maestro)
  Result: Letting go of shift opens the chosen player's page.

Related: [players.arpeggio], [players.maestro], [players.hold], [arrange.patterns], [sequencer.parameter-locks]

Sources: s1 guide:players#players · s2 note 59 · s3 guide:sequencer#step-sequencing · s4 changelog:1.1.25

### Arpeggio player [players.arpeggio]
outdated-in-guide · OS ≥ 1.0.9 · changed in 1.0.15, 1.1.0, 1.1.17, 1.1.21 · guide v1.1.15
Also called: arpeggio, arp, arpeggiator, arp speed, arp pattern, arp hold, latch
Where: modes instrument, auxiliary; screens player

Plays held or sequenced notes one after another; the encoders set speed, note order, range and hold, and the shift layer adds note length, style, glide and stereo spread.

The arpeggio steps through a chord, played live or sequenced, at the speed of `E1`, in the order of
`E2`, across the span of `E3`; hold (`E4`) keeps it going hands-free. The shift layer adds note
length, style, glide and stereo spread. Since the guide, arpeggios ignore the sustain pedal and
follow the brain (1.1.17), and a pattern change cuts held notes (1.1.21).

Facts:
- The arpeggio player breaks the notes a track receives into a repeating run, playing them one at a time instead of together. [#what] [s1]
- The guide says that both pattern (`E2`) and the shift-layer style change the order of the notes, without explaining how the two differ. [#style-vs-pattern] [s1]
- Notes made by the arpeggio are not passed on to linked tracks. [#linked] (since 1.0.15) [s2]
- Since OS 1.1.0, held arpeggio notes still sound when their track is muted. [#muted] (since 1.1.0) [s3]
- Since OS 1.1.17, a sustain pedal has no effect on arpeggiated notes. [#sustain] (since 1.1.17) [s4]
- Since OS 1.1.17, the brain transposes arpeggios along with the rest of the track. [#brain] (since 1.1.17) [s4]
- Since OS 1.1.21, moving to another pattern stops any arpeggio notes that were being held. [#pattern-switch] (since 1.1.21) [s5]
- The arpeggio page shows four boxes in the encoders' greys — a note value for speed, the pattern as a small staircase (or peak, arrow, scattered blocks), a ladder with the octave count for range, and a hand for hold, pale when off and black when on — then a small arrow meaning the page has a shift layer. Under the word arpeggio, fourteen pale blue bars picture the run, one per note, taller for higher notes; a range of 4 over a triad makes a twelve-step staircase. [#screen] (verified 1.1.33) [s6]
- Speed shows only a note symbol. It runs from a quarter note (slowest) to a 64th (fastest), with triplets among them; there is no number. [#speeds] (verified 1.1.33) [s6]
- With `shift` held the boxes change to the shift controls — two tied notes whose tie fills white as the note length grows, the style (the first reads off, the others are small bar charts), a squiggle that darkens from the left as glide rises, and a ring that splits into two as stereo rises. [#shift-screen] (verified 1.1.33) [s6]

Procedures:
- Keep an arpeggio running without holding the keys [#latch] [s1]
  Needs: the arpeggio player is on for the selected track
  1. `turn E4` — switch hold on
  2. `keys` — play the notes, then let go

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| player | `turn E1` | speed | – | – | – | rate of the run s1 |
| player | `turn E2` | pattern | – | – | – | random, play order, up, down, up/down or up/repeat/down s1 |
| player | `turn E3` | range | – | – | – | span of the run s1 |
| player | `turn E4` | hold | off / on | – | – | keeps the run going after the keys are released s1 |
| player | `shift + turn E1` | note length | – | – | – | s1 |
| player | `shift + turn E2` | style | – | – | – | playback order of the notes s1 |
| player | `shift + turn E3` | glide | – | – | – | slide between notes s1 |
| player | `shift + turn E4` | stereo | – | – | – | pans successive notes apart s1 |

Related: [players.overview], [players.hold], [basics.linked-tracks]

Sources: s1 guide:players#arpeggio · s2 changelog:1.0.15 · s3 changelog:1.1.0 · s4 changelog:1.1.17 · s5 changelog:1.1.21 · s6 note 59

### Maestro player [players.maestro]
current · OS ≥ 1.0.9 · guide v1.1.15 · verified on 1.1.33
Also called: maestro, chord player, one-finger chords, chord memory, strum
Where: modes instrument, auxiliary; screens player

Maestro remembers a chord you enter with shift held and then plays it from any single key, shifted up or down to that key; roll strums it, pattern sets the strum order and hold latches it.

Maestro turns the keyboard into a chord trigger. Enter a chord once with `shift` held — a minor
seventh, a stacked fifth, anything — and a single key then plays the whole shape wherever you press,
which makes progressions quick to play and record with one hand. The guide leaves open whether a new
chord fully replaces the old one.

Facts:
- Maestro stores a chord; afterwards every key you press plays that chord, moved up or down so it follows the key. [#what] [s1]
- To store the chord, keep `shift` held and play its notes on the keyboard. [#record] (verified 1.1.33) [s2]
- The light gray encoder (`E3`) has no job on the maestro page; its box is crossed out. [#no-e3] (verified 1.1.33) [s2]
- Maestro's page shows roll as a wavy arpeggio sign with a number (0, 10, 12 …), pattern as up, down, up/down or random icons, and hold as a hand that fills in when on. [#screen] (verified 1.1.33) [s2]
- Under the word maestro two stacks of four pale blue slabs picture the stored chord. A slab stands up for each stored note, filling the left stack from the back and then the right one, and lies flat where there is none; while you enter a new chord they rise one by one, and they stand taller while the chord sounds. [#slabs] (verified 1.1.33) [s2]
- With eight slabs on the page, maestro seems to keep at most eight notes per chord. [#eight] (derived) [s2]

Procedures:
- Store a chord in maestro [#record] [s1]
  Needs: the maestro player is on for the selected track
  1. `shift + keys` — keep shift down while you play every note of the chord
  Result: From now on each key plays the stored chord.

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| player | `turn E1` | roll | – | – | – | strums the notes, from block chord to slow spread s1 |
| player | `turn E2` | pattern | – | – | – | strum order — up, down, up/down or random s1 |
| player | `turn E4` | hold | off / on | – | – | the chord rings on after the key is released s1 |

Related: [players.overview], [players.hold]

Sources: s1 guide:players#maestro · s2 note 59

### Hold player [players.hold]
outdated-in-guide · OS ≥ 1.0.9 · changed in 1.1.3, 1.1.25 · guide v1.1.15
Also called: hold, latch, sustain notes, drone, held notes
Where: modes instrument, auxiliary; screens player

The hold player keeps the notes you play sounding until you play the next ones; stop or switching the player off releases them.

Hold is the simplest player: whatever you play stays on until the next thing you play replaces it —
a droning bass note under the pattern, or a chord that pads on while you tweak. Press `stop` or switch
the player off to clear it. Since 1.1.25 the held notes fade through their release when you stop.

Facts:
- With the hold player on, notes keep sounding after you let go of the keys, until you play the next note or chord. [#what] [s1]
- Hold suits bass notes and chords that should ring on while your hands are busy elsewhere. [#use] [s1]
- Pressing `stop`, or switching the player off with `player`, releases every held note. [#release] [s1]
- Since OS 1.1.3, pressing a key that is already held does not switch that note off, which makes held chords easier to play. [#no-toggle] (since 1.1.3) [s2]
- Since OS 1.1.25, stopping the hold player ends its notes with an ordinary note-off, so each note fades out through its release. [#note-off] (since 1.1.25) [s3]
- The hold page shows the word hold over a large infinity ribbon of concentric bands; its encoders have nothing to set. [#screen] (verified 1.1.33) [s4]

Procedures:
- Latch notes with the hold player [#use] [s1]
  Needs: the player type of the selected track is hold
  1. `player → player` — open the player page and switch the player on
  2. `keys` — play a note or chord and let go
  Result: The notes ring on until you play new ones.
- Release the held notes [#silence] [s1]
  1. `stop` — pressing `player` to switch hold off works too

Related: [players.overview], [players.maestro]

Sources: s1 guide:players#hold · s2 changelog:1.1.3 · s3 changelog:1.1.25 · s4 note 59

## Instrument

Instrument tracks: engines (synths, samplers, MIDI), envelopes, filter, LFO, preset settings and presets.

### Instrument mode [instrument.overview]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: instrument tracks, sound tracks, tracks 1–8, instrument pages, instrument modules
Where: modes instrument; screens M1, M2, M3, M4

Instrument mode holds the eight tracks that make sound. Each track runs one engine — a synth, a sampler or the midi engine — and is shaped on four pages: engine, envelopes, filter and LFO.

Pick a track, then work through its pages: the engine creates the tone, the envelopes shape each
note, the filter colours it and the LFO adds movement; every value can be parameter-locked per step.
A track's complete sound travels as one preset, so a load from the browser (`shift + Tn`, or
`shift + M1` for the selected track) changes everything at once, the engine included. Brain, send
effects, external gear and tape live in auxiliary mode.

Facts:
- Instrument mode holds eight instrument tracks, one per track key `T1`…`T8`; the eight auxiliary tracks have a mode of their own. [#eight-tracks] [s1]
- `M1` shows the engine, `M2` the amp and filter envelopes, `M3` the filter and `M4` the LFO. [#pages] [s2]
- On OS 1.1.33, `shift + M1` brings up the preset browser for the selected track, where loading one of an engine's presets changes the engine. [#choose-engine] (verified 1.1.33) [s3]
- `shift + Tn` opens the preset browser for that track, where a preset, sample pack or engine can be loaded in one go. [#browse] [s1]
- `shift + instrument` opens the preset settings: tuning, velocity sensitivity, width and modulation routing of the track's sound. [#preset-settings] [s4]
- With a track key held, the module keys act on that track's whole sound: `Tn + M1` scrambles it, `Tn + M2` copies it, `Tn + M3` pastes onto it and `Tn + M4` saves it as a preset. [#sound-actions] [s5]
- A fresh project puts drums on tracks 1 and 2, a bass on 3, a pluck on 4, a lead on 5, a soft pluck on 6, strings on 7 and a pad on 8. [#defaults] [s6]
- Community captures name the engines behind those sounds as the drum sampler on tracks 1 and 2, then prism, epiano, dissolve, hardsync, axis and multisampler on tracks 3 to 8. [#default-engines] (community) [s7]

Procedures:
- Open instrument mode and select a track [#enter] [s1]
  1. `instrument`
  2. `T1…T8`

Related: [instrument.engine], [instrument.envelopes], [instrument.filter], [instrument.lfo], [instrument.preset-browser], [instrument.preset-settings], [instrument.save-copy-scramble], [basics.modules], [auxiliary.overview]

Sources: s1 guide:instrument#project · s2 guide:instrument · s3 note 59 · s4 guide:instrument#preset-settings · s5 guide:instrument#view-and-create-preset · s6 guide:get-started#4.%20get%20started · s7 note 20

### Engine page and changing engine (M1) [instrument.engine]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: engine page, engine list, change engine, choose engine, sound source, synth engines, load an engine
Where: modes instrument; screens M1, preset browser

`M1` is the engine page: its encoders edit the loaded engine's own parameters. On OS 1.1.33 `shift + M1` brings up the preset browser by engine, and loading one of an engine's presets changes the engine — along with the whole sound. Twelve engines: eight synths, three samplers and midi.

Synth engines build tones from oscillators, samplers play recorded audio, and the midi engine stays
silent and drives outside gear. Only `M1` belongs to the engine, but on OS 1.1.33 an engine arrives
with one of its presets, so a swap resets the envelopes, filter and LFO too: choose the engine first,
then shape the other pages. `shift + Tn` opens the same browser for any track.

Facts:
- On `M1` the four encoders edit the loaded engine's own parameters, so what each one does depends on the engine. [#m1-controls] [s1]
- There are eight synth engines — axis, dissolve, epiano, hardsync, organ, prism, simple and wavetable — each with its own character. [#synths] [s2]
- Three sampler engines play recorded audio — the synth sampler, the drum sampler and the multisampler. [#samplers] [s3]
- The midi engine makes no sound of its own; it turns the track into a MIDI sequencer for external gear and uses `M2` and `M3` for CC controls. [#midi] [s4]
- Twelve engines in all — the eight synths, the three samplers and midi. [#list] (derived) [s5]
- Over MIDI, CC12–15 on the track's channel move the four `M1` parameters of every synth engine; the drum sampler, synth sampler and multisampler pages ignore them. [#midi-ccs] (verified 1.1.33) [s6]
- A synth engine page lists its four values in a top bar — coloured cells on prism, epiano and wavetable, plain text on simple and axis, none on organ — above a picture drawn from the four values; prism, dissolve and hardsync animate while notes sound, organ's drawbars glide to new values and wavetable's drift keeps its copies turning. [#top-bar] (verified 1.1.33) [s7]
- On OS 1.1.33 there is no separate engine list; `shift + M1` brings up the preset browser on the track's current preset — the track number over the word preset at the left, the engines in the middle with the track's engine boxed, and that engine's presets on the right. [#browser] (verified 1.1.33) [s8]
- The owner's unit listed eleven engines there, alphabetically (axis, dissolve, drum, epiano, hardsync, multisampler, organ, prism, sampler, simple, wavetable) and no midi engine; how OS 1.1.33 puts an instrument track on midi is still open, and this app's replica lists midi last. [#browser-engines] (verified 1.1.33) [s8]
- Turning `E1` to an engine highlights its first preset; loading a preset changes the engine with the whole sound (all four pages) and returns to the track's `M1` page. [#load-changes-engine] (verified 1.1.33) [s8]
- In the browser a click of `E1` swaps between by engine and by category (a popup says which) instead of confirming, as it did in the older engine list the guide describes. [#e1-click] (verified 1.1.33) [s8]

Procedures:
- Change the engine of the selected instrument track [#choose] (verified 1.1.33) [s8]
  Needs: instrument mode; the track is selected
  1. `shift + M1` — the preset browser opens on the track's preset
  2. `click E1` — only if it lists categories; a click swaps to by engine
  3. `turn E1` — highlight an engine; its first preset is highlighted
  4. `turn E2` — optional; another of its presets
  5. `click E2` — loads it
  Result: The track runs the new engine with that preset's sound, and M1 shows the engine's parameters.

Related: [instrument.overview], [instrument.engine-axis], [instrument.engine-dissolve], [instrument.engine-epiano], [instrument.engine-hardsync], [instrument.engine-midi], [instrument.engine-organ], [instrument.engine-prism], [instrument.engine-simple], [instrument.engine-wavetable], [instrument.preset-browser], [sampler.overview], [com.midi-track-ccs]

Sources: s1 guide:instrument#engine · s2 guide:synth-engines · s3 guide:sample · s4 guide:synth-engines#external · s5 note 20 · s6 note 59 · s7 note 59 · s8 note 59

### Amp and filter envelopes (M2) [instrument.envelopes]
current · OS ≥ 1.0.9 · guide v1.1.15 · verified on 1.1.33
Also called: envelope, envelopes, adsr, amp envelope, amplitude envelope, filter envelope, attack, release
Where: modes instrument; screens M2

`M2` holds two ADSR envelopes per track: the amp envelope shapes each note's level over time, the filter envelope moves the filter cutoff. Click any encoder to flip between them.

Envelopes give every note a shape in time: short and snappy amp settings for plucks and drums, slow
ones for pads. Read the graph as time running left to right: a peak far to the right is a slow
attack, a release handle far to the left is a long release (release turned down), one sitting on
the end is none (release turned all the way up). The filter envelope runs the same four stages but moves the cutoff instead, as far as
envelope amount on `M3` allows. The shift layer of `M2` holds the voice settings (play mode,
portamento, bend range, preset volume).

Facts:
- Every instrument track has two envelopes, one for amplitude and one that drives the filter. [#two] [s1]
- Clicking any encoder on `M2` flips the page between the amp and the filter envelope, on drum tracks as well as synth tracks. [#switch] [s1]
- How far the filter envelope moves the cutoff is set by envelope amount, `E3` on the filter page `M3`. [#depth] [s2]
- Over MIDI, CC20–23 set the amp envelope and CC24–27 the filter envelope, each in attack, decay, sustain, release order, whichever envelope the page shows. [#midi-ccs] (verified 1.1.33) [s3]
- The page draws both envelopes at once. The one the encoders edit is bright, with five square handles (start, peak, decay end, release start, end) and thin lines dropping from the inner three; the other is grey, without handles. Each is named, "amp" or "filter", just left of its release handle. [#screen] (verified 1.1.33) [s3]
- Each encoder slides one handle. Attack moves the peak right along the top, decay moves the decay end right of the peak, sustain raises the level, and release moves the release start right toward the end. [#handles] (verified 1.1.33) [s3]
- Release is set by where its handle sits, so turning E4 clockwise (a higher value) gives a shorter release; fully clockwise the handle sits on the end and the note stops at once. Turn it counter-clockwise for a long fade. [#release-direction] (verified 1.1.33) [s3]
- There is no plateau after the attack; the decay starts at the peak. The attack rises steeply and bends into the peak, and decay and release fall steeply and level off. [#shape] (verified 1.1.33) [s3]
- The filter envelope is always drawn at full height; its real reach is set by envelope amount on `M3`. [#full-height] (verified 1.1.33) [s3]

Procedures:
- Show the other envelope on M2 [#switch] [s1]
  Needs: instrument mode; M2 is open
  1. `click E1…E4` — any encoder

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| M2 | `turn E1` | attack | – | – | 20 | time to reach full level s1 |
| M2 | `turn E2` | decay | – | – | 21 | time to fall to the sustain level s1 |
| M2 | `turn E3` | sustain | – | – | 22 | level held while the key is down s1 |
| M2 | `turn E4` | release | – | – | 23 | fade-out after the key is let go; clockwise moves the release handle right, a shorter release s1 |
| M2 | `turn E1` (alternate page) | filter attack | – | – | 24 | s1 |
| M2 | `turn E2` (alternate page) | filter decay | – | – | 25 | s1 |
| M2 | `turn E3` (alternate page) | filter sustain | – | – | 26 | s1 |
| M2 | `turn E4` (alternate page) | filter release | – | – | 27 | clockwise is shorter, as for the amp release s1 |

Related: [instrument.play-mode], [instrument.filter], [instrument.overview]

Sources: s1 guide:instrument#envelopes · s2 guide:instrument#filter · s3 note 59

### Play mode, portamento, bend range and preset volume (M2 + shift) [instrument.play-mode]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: voice mode, poly, mono, legato, glide, portamento, pitch bend range, preset volume, preset level
Where: modes instrument; screens M2

Holding `shift` on `M2` reveals four voice settings — poly, mono or legato play mode, portamento (glide time), pitchbend range and a preset volume kept apart from the mixer level.

These settings decide how a sound responds to playing. Play mode separates chord parts (poly) from
single-note lines (mono, legato), portamento adds slides between notes, bend range sets the reach of
the pitchbend strip, and preset volume evens out loudness between presets without touching the
mixer. All four are saved with the preset.

Facts:
- Play mode (poly, mono or legato) sets both how notes are articulated and how many can sound at once. [#play-mode] [s1]
- The curve of the portamento glide (portamento style) is set separately in the preset settings. [#portamento-style] [s2]
- Turning bend range fully anti-clockwise switches pitch bending off, which is what you want when the pitchbend strip is routed to another target. [#bend-off] [s3]
- Over MIDI, CC28–31 reach these four settings; play mode reads the value as one of three steps. [#midi-ccs] (community-verified) [s4]
- Holding `shift` on `M2` brings up a white card of four rows over the dimmed page, each with its encoder's dot — play mode (poly, mono or legato), portamento (off, then numbers), bend range (semitones, up to an octave) and preset volume (a number). [#card] (verified 1.1.33) [s5]

Procedures:
- Switch a track between poly, mono and legato [#set-mode] [s1]
  Needs: instrument mode; the track is selected
  1. `M2`
  2. `shift + turn E1`

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| M2 | `shift + turn E1` | play mode | poly / mono / legato | – | 28 | s1 |
| M2 | `shift + turn E2` | portamento | – | – | 29 | how long a note takes to slide to the next s1 |
| M2 | `shift + turn E3` | bend range | – | – | 30 | pitch reach of the pitchbend strip s1 |
| M2 | `shift + turn E4` | preset volume | – | – | 31 | level stored with the sound, apart from the mixer, for matching presets s1 |

Related: [instrument.envelopes], [instrument.preset-settings], [instrument.overview]

Sources: s1 guide:instrument#envelopes · s2 guide:instrument#preset-settings · s3 guide:how-to#pitch-bend · s4 note 20 · s5 note 59

### Filter (M3) [instrument.filter]
current · OS ≥ 1.0.9 · guide v1.1.15 · verified on 1.1.33
Also called: filter page, cutoff, resonance, filter type, lowpass, highpass, ladder filter, key tracking
Where: modes instrument; screens M3

`M3` is the track's filter: cutoff, resonance, filter-envelope amount and key tracking. `shift + M3` picks one of four types — ladder, svf, z hipass or z lowpass — and then returns to `M1`.

The filter is a track's main tone control. Lower the cutoff to darken a sound, add resonance for a
sharper edge, and raise envelope amount so the filter envelope sweeps the cutoff on every note — the
classic plucky bass. The shift layer of this page holds the track's sends, not filter settings.

Facts:
- The filter takes away part of the frequency range and can emphasise the frequencies around its cutoff. [#purpose] [s1]
- `shift + M3` opens the choice of filter types, each with its own character. [#type] [s1]
- The type list, headed with the track number and the word filter, offers ladder, svf, z hipass and z lowpass, the current one boxed. [#type-names] (verified 1.1.33) [s2]
- Picking a type takes you back to the engine page (`M1`); `M3` then shows the new type. [#type-return] (verified 1.1.33) [s2]
- Presets also store whether the filter is switched on at all. [#on-off] (community-verified) [s3]
- With the filter off, the page is dimmed under an off box; pressing `M3` again switches the filter on. [#off] (verified 1.1.33) [s2]
- The page draws the filter's curve over tinted bands, with the type name at the top left, a frequency axis marked 50, 1k, 2k, 5k and 20kHz, and a small black box on the curve that shows the resonance, 00–99, rising as resonance goes up. [#screen] (verified 1.1.33) [s2]
- Cutoff slides the curve's slope along the axis, key tracking moves an arrow along the bottom from left to right, and any envelope amount above 0 adds a hatched ghost of the curve to its right; z hipass mirrors the drawing. [#drawn] (verified 1.1.33) [s2]
- Envelope amount runs from none at 0 to full at 99; there is no negative setting that would sweep the cutoff down. [#env-range] (verified 1.1.33) [s2]
- Over MIDI, CC32–35 on the track's channel move cutoff, resonance, envelope amount and key tracking, and the page redraws as they arrive. [#midi-ccs] (verified 1.1.33) [s4]
- No MIDI CC is known for the filter type. [#no-type-cc] (community-verified) [s5]

Procedures:
- Change the filter type of the selected track [#type] [s1]
  Needs: instrument mode; the track is selected
  1. `shift + M3` — opens the filter types

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| M3 | `turn E1` | cutoff | – | – | 32 | frequency where the filter acts s1 |
| M3 | `turn E2` | resonance | – | – | 33 | peak at the cutoff that exaggerates the filter s1 |
| M3 | `turn E3` | envelope amount | – | – | 34 | how far the M2 filter envelope sweeps the cutoff s1 |
| M3 | `turn E4` | key tracking | – | – | 35 | ties the cutoff to the pitch of each note s1 |

Related: [instrument.envelopes], [instrument.track-sends], [instrument.lfo]

Sources: s1 guide:instrument#filter · s2 note 59 · s3 note 30 · s4 note 59 · s5 note 20

### Track sends to aux out, tape, FX I and FX II (M3 + shift) [instrument.track-sends]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: sends, send levels, fx send, reverb send, delay send, tape send, aux send, aux out
Where: modes instrument; screens M3

Holding `shift` on `M3` turns the encoders into the track's four send levels — to the aux output, to the tape track and to the FX I and FX II send effects.

Sends copy part of a track's audio to the auxiliary tracks and leave the dry sound as it is: FX I and
FX II for the shared send effects, tape for replaying tricks, aux out for the external audio track
and the multi-out jack. Sends are set per track and can be parameter-locked.

Facts:
- Holding `shift` while `M3` is open brings up a white card of four send rows, worked by `E1`…`E4` from the top — aux out (a plug icon), tape (a reel icon), FX I and FX II; a row reads no send at zero. [#where] (verified 1.1.33) [s1]
- Aux out feeds the external audio track (auxiliary `T5`), whose output leaves through the multi-out jack when that jack is set to audio. [#aux-out] (derived) [s2]
- The tape send makes the track's audio available to the tape track (auxiliary `T6`), which replays and mangles it. [#tape] (derived) [s3]
- FX I and FX II are the two send-effect tracks (auxiliary `T7` and `T8`); what the send does depends on the effect loaded there. [#fx] [s4]
- Over MIDI, CC36–39 set the four sends in the same order. [#midi-ccs] (community-verified) [s5]

Procedures:
- Send part of a track to the FX I effect [#fx-send] [s6]
  Needs: instrument mode; the track is selected
  1. `M3`
  2. `shift + turn E3`

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| M3 | `shift + turn E1` | aux out | – | – | 36 | s6 |
| M3 | `shift + turn E2` | tape | – | – | 37 | s6 |
| M3 | `shift + turn E3` | fx i | – | – | 38 | s6 |
| M3 | `shift + turn E4` | fx ii | – | – | 39 | s6 |

Related: [instrument.filter], [auxiliary.fx-sends], [auxiliary.tape], [auxiliary.external-audio], [mix.levels-pans-sends]

Sources: s1 note 59 · s2 guide:auxiliary#external-audio · s3 guide:auxiliary#tape · s4 guide:auxiliary#fx-i-and-fx-ii · s5 note 20 · s6 guide:instrument#filter

### LFO page and LFO types (M4) [instrument.lfo]
current · OS ≥ 1.0.9 · changed in 1.0.15, 1.1.0, 1.1.3 · guide v1.1.15 · verified on 1.1.33
Also called: lfo, low frequency oscillator, modulation, lfo type, modulation source, M4 page
Where: modes instrument; screens M4

`M4` holds one LFO per track in five types — duck, element, random, tremolo and value. `shift + M4` changes the type; most types share one layout: source or speed, amount, destination page, parameter.

An LFO rides a knob for you. Choose what drives the movement — a repeating wave (value), random steps
(random), the unit's motion, microphone or envelope (element), another track's rhythm (duck) — then
aim it at an encoder on the track's pages. Tremolo skips the aiming: it is wired to pitch and volume.

Facts:
- `shift + M4` switches the LFO type between duck, element, random, tremolo and value. [#types] [s1]
- Duck arrived in OS 1.1.0; the guide's sentence listing the LFO types still counts four and leaves it out. [#five-not-four] (since 1.1.0) [s2]
- In element, random and value, `E1` sets the source or speed, `E2` the amount, `E3` the destination page and `E4` the parameter on that page; duck and tremolo use their own layouts. [#layout] [s1]
- The destination is one of the track's module pages and the parameter is one of that page's four encoders; `E4` can be turned or clicked to choose it. [#target] [s1]
- Extra settings sit behind encoder clicks or `shift` plus a turn; on some types a click on `E1` changes the waveform shape. [#sub-functions] [s1]
- Speed controls are tempo-synced over their anti-clockwise range; turned clockwise until a dial icon appears, they run at a free rate. [#speed] [s1]
- On screen a synced speed reads as a count beside a note value, 8 with a 32nd at the slow end, then 6 with a 16th, 4 with a quarter and 2 with a whole note as it turns; from the middle of its range a clock dial shows the free rate. [#speed-screen] (verified 1.1.33) [s3]
- The amount can go below zero to invert the modulation; OS 1.1.3 fixed how negative amounts are drawn. [#negative] (since 1.1.3) (derived) [s4]
- On drum tracks the LFO restarts with every new note. [#drum-reset] (since 1.0.15) [s5]
- Over MIDI, CC40–43 on the track's channel drive the four `M4` encoders in order, in all five LFO types. [#midi-ccs] (verified 1.1.33) [s6]
- No MIDI CC is known for the LFO type. [#no-type-cc] (community-verified) [s7]
- With the LFO off, the page is dimmed under an off box; pressing `M4` again switches the LFO on. [#off] (verified 1.1.33) [s3]

Procedures:
- Change the LFO type of the selected track [#type] [s1]
  Needs: instrument mode; the track is selected
  1. `shift + M4`

Related: [instrument.lfo-duck], [instrument.lfo-element], [instrument.lfo-random], [instrument.lfo-tremolo], [instrument.lfo-value], [sequencer.parameter-locks]

Sources: s1 guide:instrument#lfo · s2 changelog:1.1.0 · s3 note 59 · s4 changelog:1.1.3 · s5 changelog:1.0.15 · s6 note 59 · s7 note 20

### Duck LFO (sidechain pumping) [instrument.lfo-duck]
current · OS ≥ 1.1.0 · changed in 1.1.3 · guide v1.1.15 · verified on 1.1.33
Also called: duck, ducking, sidechain, sidechain compression, pumping, duck lfo
Where: modes instrument; screens M4

Since OS 1.1.0, the duck LFO dips a track's volume whenever another track or the metronome plays — the pumping sound of sidechain compression — triggered by audio or by notes.

Duck is the OP-XY's sidechain: choose the track that should push this one out of the way, and the
level drops every time the source plays. Note data reacts to each trigger, audio to the source's
sound. Hold and release shape the dip — short for tight pumping under a kick, longer for slow,
breathing swells.

Facts:
- Duck lowers the track's own volume in response to a source, giving the pumping effect usually made with a sidechain compressor. [#what] [s1]
- The duck LFO type was added in OS 1.1.0. [#new] [s2]
- Any of the 16 tracks can be the source — instrument tracks 1–8 or auxiliary tracks 9–16 — and so can the metronome, for an even duck on every beat. [#sources] [s1]
- OS 1.1.3 fixed using a MIDI track as the duck source. [#midi-source] (since 1.1.3) [s3]
- Duck shows its source as a track number (tr 1 and on), the last position a metronome icon, then amount, a live signal box and cards for hold and release. [#screen] (verified 1.1.33) [s4]

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| M4 | `turn E1` | source | – | – | 40 | track 1–16 or the metronome s1 |
| M4 | `click E1` | source type | audio / note | – | – | s1 |
| M4 | `turn E2` | amount | – | – | 41 | depth of the dip s1 |
| M4 | `turn E3` | hold | – | – | 42 | how long the dip lasts s1 |
| M4 | `turn E4` | release | – | – | 43 | how long the level takes to recover s1 |

Related: [instrument.lfo], [instrument.lfo-tremolo]

Sources: s1 guide:instrument#duck · s2 changelog:1.1.0 · s3 changelog:1.1.3 · s4 note 59

### Element LFO (gyroscope, microphone, envelope) [instrument.lfo-element]
current · OS ≥ 1.0.9 · changed in 1.0.50, 1.1.0 · guide v1.1.15 · verified on 1.1.33
Also called: element, gyro, gyroscope, tilt, motion control, microphone modulation, mic lfo
Where: modes instrument; screens M4

The element LFO turns the unit's own sensors into a modulation source — tilt (gyroscope), the built-in microphone, the amp envelope, or all three summed.

Element makes the instrument physical. With the gyroscope, tilting the OP-XY sweeps whatever you aim
it at; with the microphone, sound in the room becomes modulation; the amp envelope source follows
the shape of each note. It suits live performance more than programmed patterns.

Facts:
- Element takes its modulation from the OP-XY itself rather than from an oscillator. [#what] [s1]
- OS 1.0.50 raised the maximum depth of gyroscope modulation. [#gyro-depth] (since 1.0.50) [s2]
- OS 1.1.0 fixed a bug that affected element when the amp envelope was its source. [#envelope-fix] (since 1.1.0) [s3]
- Element shows its source as an icon — G for the gyroscope, a microphone, ^ for the envelope, or sum — then amount on a tick ladder, destination cards (synth wave, env, filter, amp) and a card naming the parameter, such as attack, cutoff, pitch or pan. [#screen] (verified 1.1.33) [s4]

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| M4 | `turn E1` | source | gyroscope / microphone / amp envelope / sum | – | 40 | sum mixes all three s1 |
| M4 | `turn E2` | amount | – | – | 41 | s1 |
| M4 | `turn E3` | destination | – | – | 42 | module page to modulate s1 |
| M4 | `turn E4` | parameter | – | – | 43 | encoder on that page; clicking also selects s1 |

Related: [instrument.lfo]

Sources: s1 guide:instrument#lfo · s2 changelog:1.0.50 · s3 changelog:1.1.0 · s4 note 59

### Random LFO [instrument.lfo-random]
current · OS ≥ 1.0.9 · changed in 1.0.38 · guide v1.1.15 · verified on 1.1.33
Also called: random, sample and hold, random modulation, random values
Where: modes instrument; screens M4

The random LFO feeds random values to one parameter at a tempo-synced or free speed, with an envelope that fades the effect in or out.

Random gives a part small changes that never repeat exactly: a wandering filter, drifting pitch,
jumping pans. Synced to the tempo it produces stepped, rhythmic changes; free-running it drifts. Pick
a free destination when the movement should carry on across notes instead of restarting on each one.

Facts:
- Random modulates its target with values from a random generator. [#what] [s1]
- Every page appears twice as a destination, normal and free. On a normal one the modulation restarts with each key press; on a free one it keeps running. [#free] [s1]
- Since OS 1.0.38, a random LFO on a free destination is not reset by new notes, and a reset snaps it to the correct value. [#reset] (since 1.0.38) [s2]
- Random's page looks like the value LFO's, plus an animated random step wave under speed and an envelope-ramp card under the destination. [#screen] (verified 1.1.33) [s3]

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| M4 | `turn E1` | speed | – | – | 40 | synced when turned anti-clockwise, free past the dial icon s1 |
| M4 | `turn E2` | amount | – | – | 41 | s1 |
| M4 | `turn E3` | destination | – | – | 42 | module page, normal or free s1 |
| M4 | `turn E4` | parameter | – | – | 43 | s1 |
| M4 | `shift + turn E2` | envelope | – | – | – | fades the modulation in or out s1 |

Related: [instrument.lfo], [instrument.lfo-value]

Sources: s1 guide:instrument#lfo · s2 changelog:1.0.38 · s3 note 59

### Tremolo LFO (vibrato and tremolo) [instrument.lfo-tremolo]
current · OS ≥ 1.0.9 · guide v1.1.15 · verified on 1.1.33
Also called: tremolo, vibrato, tremolo lfo, pitch wobble, volume wobble
Where: modes instrument; screens M4

The tremolo LFO is wired straight to pitch and volume — one depth for vibrato, one for tremolo — plus speed, a fade envelope and a waveform shape.

Tremolo is the quickest way to make a sound move: no routing, just two depths. A little vibrato at a
moderate speed gives leads and strings a natural wobble, while the volume depth makes the classic
throbbing tremolo. Use the envelope so the effect grows in after the note starts instead of arriving
at once.

Facts:
- Tremolo varies the track's pitch and volume directly, so it has no destination or parameter to choose. [#what] [s1]
- `shift + turn E2` sets the tremolo's waveform shape. TE's caption for that control repeats the random LFO's envelope text; its title and diagram point to shape. [#shape] (derived) [s1]
- The tremolo page labels its fields rate, vib, vol and env, with a card labelled shape under env that shows the waveform (sine, square …); vib and vol are pointers on tick ladders. [#screen] (verified 1.1.33) [s2]
- While synced, rate shows a note-value icon with a multiplier (8, 6, 4, 2 …); turned further clockwise it becomes a clock dial whose hand turns, and the rate runs free. [#rate-drawn] (verified 1.1.33) [s2]
- Env is drawn as a line that rises at 0, lies flat at 64 and falls at 127. [#env-drawn] (verified 1.1.33) [s2]

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| M4 | `turn E1` | speed | – | – | 40 | synced when turned anti-clockwise, free past the dial icon s1 |
| M4 | `turn E2` | amount | – | – | 41 | vibrato depth (pitch) s1 |
| M4 | `turn E3` | volume | – | – | 42 | tremolo depth (level) s1 |
| M4 | `turn E4` | envelope | – | – | 43 | fades the effect in or out s1 |
| M4 | `shift + turn E2` | shape | – | – | – | waveform of the LFO (derived) s1 |

Related: [instrument.lfo], [instrument.engine-organ], [instrument.engine-axis]

Sources: s1 guide:instrument#lfo · s2 note 59

### Value LFO [instrument.lfo-value]
current · OS ≥ 1.0.9 · changed in 1.1.15 · guide v1.1.15 · verified on 1.1.33
Also called: value, classic lfo, periodic lfo, lfo wave
Where: modes instrument; screens M4

The value LFO is a classic low-frequency oscillator, continuous or retriggered by notes, that sweeps any page parameter at a synced or free speed.

Value is the general-purpose LFO: a repeating wave aimed at one parameter. Synced to the tempo it
makes rhythmic filter sweeps or pulsing levels; slow and free it gives gradual drift. With a normal
destination every note starts the wave from the same point, so repeated notes sound alike.

Facts:
- Value drives its target with a low-frequency oscillator that either runs continuously or is triggered. [#what] [s1]
- Every page appears twice as a destination, normal and free. On a normal one the modulation restarts with each key press; on a free one it keeps running. [#free] [s1]
- The normal destinations give the triggered behaviour and the free ones the continuous behaviour. [#modes] (derived) [s1]
- Before OS 1.1.15, the slowest free-running speed stopped the value LFO altogether. [#slow-fix] (since 1.1.15) [s2]
- The value page shows speed, amount on a tick ladder, a scrolling column of destination cards and a large card naming the target parameter (attack, cutoff, res, key …) over an animated knob. [#screen] (verified 1.1.33) [s3]
- The destination column holds six cards, syn (the engine), env and filter, each followed by a twin labelled free with the same icon; there is no LFO destination. [#free-cards] (verified 1.1.33) [s3]

Procedures:
- Sweep a track's filter cutoff in time with the tempo [#sweep] [s1]
  Needs: instrument mode; M4 shows the value LFO
  1. `turn E3` — choose the filter page
  2. `turn E4` — choose cutoff
  3. `turn E1` — stay in the synced range and pick a rate
  4. `turn E2` — set the depth

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| M4 | `turn E1` | speed | – | – | 40 | synced when turned anti-clockwise, free past the dial icon s1 |
| M4 | `turn E2` | amount | – | – | 41 | s1 |
| M4 | `turn E3` | destination | – | – | 42 | module page, normal or free s1 |
| M4 | `turn E4` | parameter | – | – | 43 | s1 |

Related: [instrument.lfo], [instrument.lfo-random]

Sources: s1 guide:instrument#lfo · s2 changelog:1.1.15 · s3 note 59

### Axis synth engine [instrument.engine-axis]
current · OS ≥ 1.0.9 · guide v1.1.15 · verified on 1.1.33
Also called: axis, axis engine, fm strings, fm synth
Where: modes instrument; screens M1

An FM engine made for lush strings; its M1 page sets tone, the ratio of one oscillator (detune or fifths), wave shape and a built-in tremolo.

In an FM engine one oscillator modulates another, and the ratio between them sets the timbre. Keep
axis's ratio in the detune half for chorused, ensemble-like strings; move into the fifths half for
stacked, interval-rich tones. Tone controls brightness, and the built-in tremolo adds movement
without using the LFO. Load it from the preset browser, `shift + M1`.

Facts:
- Axis is a frequency-modulation engine whose home ground is rich, full string sounds. [#character] [s1]
- Ratio retunes one of the oscillators; values 0–50 detune it and 51–100 move it up in steps of a fifth. [#ratio-halves] [s1]
- Axis's picture is an isometric three-armed structure of cubes under a plain-text top bar; each encoder lengthens or reshapes one arm. [#picture] (verified 1.1.33) [s2]

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| M1 | `turn E1` | tone | – | – | 12 | darker ↔ brighter s1 |
| M1 | `turn E2` | ratio | 0–100 | – | 13 | 0–50 detune, 51–100 fifths s1 |
| M1 | `turn E3` | shape | – | – | 14 | wave shape of the oscillators s1 |
| M1 | `turn E4` | tremolo | – | – | 15 | speed and depth of a volume wobble, on one control s1 |

Related: [instrument.engine], [instrument.lfo-tremolo]

Sources: s1 guide:synth-engines#axis · s2 note 59

### Dissolve synth engine [instrument.engine-dissolve]
current · OS ≥ 1.0.9 · guide v1.1.15 · verified on 1.1.33
Also called: dissolve, dissolve engine, noise synth, tonal noise
Where: modes instrument; screens M1

A tonal-noise engine for airy ambient pads and bright, gritty leads; its M1 page sets swarm (noise modulation), AM, FM and detune.

Dissolve starts from oscillators and lets noise eat into them. Little swarm keeps a clear pitch with
a breath of air; a lot turns the tone into textured noise that still follows the keys. AM roughens,
FM adds harmonics, detune widens. Pair it with slow envelopes for pads or a short amp envelope for
noisy plucks. Load it from the preset browser, `shift + M1`.

Facts:
- Dissolve mixes noise into pitched oscillators, which suits ambient pads and bright, rough-edged leads. [#character] [s1]
- Dissolve fills the screen with a mosaic of squares, re-dealt many times a second while notes sound and frozen when they stop; am raises the share of lit squares, fm lifts the brightest grey to white and swarm evens the greys. [#picture] (verified 1.1.33) [s2]

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| M1 | `turn E1` | swarm | – | – | 12 | noise modulating the oscillators s1 |
| M1 | `turn E2` | am | – | – | 13 | amplitude modulation, for grit s1 |
| M1 | `turn E3` | fm | – | – | 14 | frequency modulation, for more tonal colour s1 |
| M1 | `turn E4` | detune | – | – | 15 | slight pitch offsets between oscillators, for a fuller sound s1 |

Related: [instrument.engine]

Sources: s1 guide:synth-engines#dissolve · s2 note 59

### Epiano synth engine [instrument.engine-epiano]
outdated-in-guide · OS ≥ 1.0.9 · changed in 1.1.25 · guide v1.1.15 · verified on 1.1.33
Also called: epiano, e-piano, electric piano, epiano engine, keys engine
Where: modes instrument; screens M1

An electric-piano model that also reaches plucks, strong leads and thick basses; its M1 page sets tone, texture, tine and punch.

Epiano recreates the struck-tine electric piano. Tine sets how much bell-like attack each note has,
tone the overall brightness, texture adds dirt and punch adds movement. With the tine up and a medium
decay it sounds like classic keys; the guide also pitches it for leads and basses, so try it outside
piano parts. The guide (1.1.15) lists punch before tine; on 1.1.33, after the 1.1.25 fix to the
epiano's labels, tine sits on `E3` and punch on `E4`. Load it from the preset browser, `shift + M1`.

Facts:
- Epiano imitates an electric piano and stretches to plucky keys, strong leads and heavy basses. [#character] [s1]
- OS 1.1.25 corrected wrongly named parameters on the epiano screen, so older firmware may label its encoders differently. [#label-fix] (since 1.1.25) [s2]
- On OS 1.1.33 the third encoder is tine and the fourth punch — the guide lists them the other way round. [#order] (verified 1.1.33) [s3]
- Epiano's picture is an isometric stack of layers with tines, under a top bar of coloured cells labelled tone, texture, tine and punch. [#picture] (verified 1.1.33) [s3]

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| M1 | `turn E1` | tone | – | – | 12 | darker ↔ brighter s1 |
| M1 | `turn E2` | texture | – | – | 13 | adds grit s1 |
| M1 | `turn E3` | tine | – | – | 14 | bright, metallic attack at the start of each note; the guide puts it on `E4` (verified 1.1.33) s3 |
| M1 | `turn E4` | punch | – | – | 15 | adds movement; the guide puts it on `E3` (verified 1.1.33) s3 |

Related: [instrument.engine]

Sources: s1 guide:synth-engines#epiano · s2 changelog:1.1.25 · s3 note 59

### Hardsync synth engine [instrument.engine-hardsync]
current · OS ≥ 1.0.9 · guide v1.1.15 · verified on 1.1.33
Also called: hardsync, hard sync, hardsync engine, oscillator sync
Where: modes instrument; screens M1

A hard-sync engine for punchy stabs and firm basses; its M1 page sets freq (a harmonic sweep), sub, noise and low cut.

Hard sync restarts one oscillator from another, so sweeping freq produces the tearing, vocal sweep
sync sounds are known for — try a different freq lock on each step. Sub reinforces the bottom for
basses or thickens pads, noise brightens, and lowcut thins the sound so it sits above a bass line.
Load it from the preset browser, `shift + M1`.

Facts:
- Hardsync is built for short stabs and firm, solid bass lines. [#character] [s1]
- Hardsync's picture is a hair dryer whose blocks blow away while notes sound (fast at each note's start, slower as it holds), smaller as freq rises, with two dots for sub and an S-curve for the low cut that slides right as lowcut rises. [#picture] (verified 1.1.33) [s2]

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| M1 | `turn E1` | freq | – | – | 12 | shifts the harmonics, changing the tone s1 |
| M1 | `turn E2` | sub | – | – | 13 | adds a sub-bass layer underneath s1 |
| M1 | `turn E3` | noise | – | – | 14 | adds noise to brighten the sound s1 |
| M1 | `turn E4` | lowcut | – | – | 15 | removes low frequencies s1 |

Related: [instrument.engine]

Sources: s1 guide:synth-engines#hardsync · s2 note 59

### Midi engine (called external in the guide) [instrument.engine-midi]
outdated-in-guide · OS ≥ 1.0.9 · changed in 1.0.15, 1.0.45, 1.0.50, 1.1.15, 1.1.32 · guide v1.1.15
Also called: midi engine, external, external engine, external midi engine, sequence an external synth
Where: modes instrument; screens M1, M2, M3

The midi engine makes an instrument track sequence outside gear — `M1` sets channel, bank and program, `M2` and `M3` hold eight CCs. TE's guide still calls it external, its name before OS 1.0.15.

Record or step-sequence on the track as usual and the notes play the connected synth; bank and
program pick its sound, and the CC slots send controller values that can be locked per step.

Facts:
- The midi engine makes no sound; the track's notes and settings go out as MIDI to an external instrument. [#what] [s1]
- OS 1.0.15 renamed the engine from external to midi; the guide (v1.1.15) and its MIDI how-to still use the old name. [#renamed] (since 1.0.15) [s2]
- `M2` and `M3` hold eight CC slots: turn an encoder to set a value, or hold `shift` and turn it to switch the slot on and choose its CC number. [#cc-slots] [s1]
- Several instrument tracks can run the midi engine at once, one per device or channel, where the external MIDI track in auxiliary mode offers only one. [#several-devices] [s3]
- Since OS 1.0.45, presets saved from a midi-engine track keep their CC settings. [#presets-keep-ccs] (since 1.0.45) [s4]
- Since OS 1.0.50, switching a track to the midi engine and back keeps its synth settings. [#switch-back] (since 1.0.50) [s5]
- Program changes can be parameter-locked per step; OS 1.1.15 fixed such locks not working. [#program-locks] (since 1.1.15) [s6]
- On OS 1.1.33 the preset browser that `shift + M1` brings up listed no midi engine on the owner's unit, so how that firmware puts an instrument track on midi is still open; the external MIDI track (auxiliary `T3`) always works, and this app's replica lists midi last in the browser. [#browser-1133] (verified 1.1.33) [s7]
- OS 1.1.32 fixed the arpeggiator disturbing a midi-engine parameter. [#arp-fix] (since 1.1.32) [s8]

Procedures:
- Sequence an external synth from an instrument track [#setup] [s1]
  Needs: instrument mode; the synth is connected over USB or to the multi-out jack in MIDI mode
  1. `shift + M1` — the preset browser on OS 1.1.33 (the guide's engine list before)
  2. `turn E1` — choose midi, where it is listed
  3. `click E2` — loads it (the old engine list took a click of `E1`)
  4. `turn E1` — set the synth's MIDI channel
  5. `M2` — CC slots (more on `M3`)
  6. `shift + turn E1` — switch a slot on and pick its CC number
  Result: Notes played or sequenced on the track now play the external synth.

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| M1 | `turn E1` | channel | – | – | – | MIDI channel the track sends on s1 |
| M1 | `turn E2` | bank | – | – | – | s1 |
| M1 | `turn E3` | program | – | – | – | s1 |

Related: [instrument.engine], [auxiliary.external-midi], [howto.control-synth-midi], [com.midi-settings], [sequencer.parameter-locks]

Sources: s1 guide:synth-engines#external · s2 changelog:1.0.15 · s3 guide:how-to#how-to-control-a-synth-with-midi · s4 changelog:1.0.45 · s5 changelog:1.0.50 · s6 changelog:1.1.15 · s7 note 59 · s8 changelog:1.1.32

### Organ synth engine [instrument.engine-organ]
current · OS ≥ 1.0.9 · guide v1.1.15 · verified on 1.1.33
Also called: organ, organ engine, combo organ, church organ, transistor organ
Where: modes instrument; screens M1

An organ engine that spans transistor combos to church organs; its M1 page sets organ type, bass, tremolo amount and tremolo speed.

Organ is a quick route to a whole family of sounds: type swaps the organ model, bass adds weight, and
the built-in tremolo gives the familiar pulsing movement — slow for gentle swells, fast for a
shimmer. Because the tremolo lives on `M1`, the `M4` LFO stays free for something else. Load it from the preset browser,
`shift + M1`.

Facts:
- Organ covers a wide spread of organ sounds, from transistor instruments to church organs, chosen with the type control. [#character] [s1]
- Organ's picture is four drawbars, each with a scale from 8 to 1 and an icon on its cap; each encoder slides one drawbar, and the bars glide into place. [#picture] (verified 1.1.33) [s2]

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| M1 | `turn E1` | type | – | – | 12 | organ model s1 |
| M1 | `turn E2` | bass | – | – | 13 | adds or removes low end s1 |
| M1 | `turn E3` | tremolo amount | – | – | 14 | depth of the volume wobble s1 |
| M1 | `turn E4` | tremolo speed | – | – | 15 | slow swells ↔ fast, dizzy wobble s1 |

Related: [instrument.engine], [instrument.lfo-tremolo]

Sources: s1 guide:synth-engines#organ · s2 note 59

### Prism synth engine [instrument.engine-prism]
current · OS ≥ 1.0.9 · guide v1.1.15 · verified on 1.1.33
Also called: prism, prism engine, prism synth
Where: modes instrument; screens M1

A general-purpose synth engine for bass lines, leads and most other parts; its M1 page covers waveform, oscillator ratio, detune and stereo width.

Prism runs several oscillators and gives you four controls over how they relate: their waveform,
their tuning ratio, how far apart they drift in pitch and how wide they spread. Little detune and a
narrow image keep it tight for bass; more of both makes it broad enough for leads and pads.

Everything else about the sound — how notes start and fade (M2), the filter (M3) and modulation
(M4) — is shared by all engines, so a prism patch is shaped the same way as any other synth patch.
TE's guide gives no numeric ranges or defaults for prism's parameters; the screen shows them as you
turn, and the CC numbers are confirmed on the owner's unit.

Facts:
- Prism is one of the eight built-in synth engines. Each instrument track runs one engine, chosen per track. [#one-of-eight] [s1]
- Prism is the everyday workhorse among the engines, suited to bass lines, leads and most parts in between. [#character] [s2]
- Only the M1 page belongs to the engine. Envelopes (M2), filter (M3) and LFO (M4) work the same whichever synth engine a track uses. [#m1-is-engine] [s3]
- Like every module-page parameter, prism's four M1 settings can be parameter-locked per step. [#lockable] [s4]
- Over MIDI, CC12, CC13, CC14 and CC15 on the track's channel move shape, ratio, detune and stereo. [#midi-ccs] (verified 1.1.33) [s5]
- Prism's picture is a row of four optics — a triangle, a convex lens, a concave lens and a wedge — with light rays passing through the lenses on every note. [#picture] (verified 1.1.33) [s6]
- Shape grows the triangle, ratio thickens the convex lens, detune slides the concave lens and stereo opens the wedge into an arrowhead. [#drawn] (verified 1.1.33) [s6]
- Ratio moves in ten equal steps and reads as the oscillators' frequency ratio — 2:1, 1:1, 2:3, 1:2, 1:3, 1:4, 1:6, 1:8, 1:12 and 1:16. [#ratio-steps] (verified 1.1.33) [s7]

Procedures:
- Put the prism engine on the selected instrument track [#choose] [s8]
  Needs: instrument mode; the track is selected
  1. `shift + M1` — opens the preset browser by engine (OS 1.1.33)
  2. `turn E1` — scroll to prism; its first preset is highlighted
  3. `click E2` — loads it, the whole sound with it
  Result: The track now plays through prism and M1 shows its four parameters.

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| M1 | `turn E1` | shape | – | – | 12 | waveform of the oscillators s2 |
| M1 | `turn E2` | ratio | – | – | 13 | tuning ratio between the oscillators s2 |
| M1 | `turn E3` | detune | – | – | 14 | small pitch offset between the oscillators, for a thicker sound s2 |
| M1 | `turn E4` | stereo | – | – | 15 | how far the oscillators spread across the stereo field s2 |

Related: [sequencer.parameter-locks], [instrument.save-to-same-snapshot]

Sources: s1 guide:synth-engines#arrange · s2 guide:synth-engines#prism · s3 guide:instrument#engine · s4 guide:sequencer#step-sequencing · s5 note 59 · s6 note 59 · s7 note 57 · s8 guide:synth-engines#change-engine

### Simple synth engine [instrument.engine-simple]
current · OS ≥ 1.0.9 · guide v1.1.15 · verified on 1.1.33
Also called: simple, simple engine, basic synth, pulse width, subtractive synth
Where: modes instrument; screens M1

A basic engine for building leads and plucks quickly; its M1 page sets waveform shape, pulse width, noise and stereo spread.

Simple is the plain starting point: pick a waveform, narrow the pulse width for a hollow, nasal tone,
add noise for breath or buzz, and widen the stereo image. With the filter and envelopes doing most of
the shaping, it is the easiest engine to learn sound design on. Load it from the preset browser, `shift + M1`.

Facts:
- Simple is meant for fast, basic patches, with leads and plucks as its strengths. [#character] [s1]
- Simple's picture is an isometric glass jar on stacked slabs under a plain-text top bar; stereo splits the jar into two. [#picture] (verified 1.1.33) [s2]

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| M1 | `turn E1` | shape | – | – | 12 | oscillator waveform s1 |
| M1 | `turn E2` | pw | – | – | 13 | pulse width s1 |
| M1 | `turn E3` | noise | – | – | 14 | noise level, from buzzy leads to soft pads s1 |
| M1 | `turn E4` | stereo | – | – | 15 | stereo spread of the oscillators s1 |

Related: [instrument.engine], [instrument.filter]

Sources: s1 guide:synth-engines#simple · s2 note 59

### Wavetable synth engine [instrument.engine-wavetable]
current · OS ≥ 1.0.9 · guide v1.1.15 · verified on 1.1.33
Also called: wavetable, wavetable engine, wavetables, morphing oscillator
Where: modes instrument; screens M1

An engine that morphs through a table of stored waveforms; its M1 page picks one of nine tables and sets position, warp and drift.

Wavetable suits evolving sounds: choose a table, then move the position to travel through its
waveforms. Position is the parameter to animate — lock it per step or aim the LFO at it — while warp
reshapes whatever waveform is current. Drift pulls the warping away from the played pitch for
metallic, unstable results. Load it from the preset browser, `shift + M1`.

Facts:
- A wavetable is a row of waveforms stored one after another; moving through it morphs the oscillator smoothly from shape to shape. [#what] [s1]
- The engine offers nine wavetables. [#nine] [s1]
- The first cell of the top bar names the current table; turning `E1` steps through basic, buzz, crush, drawbars, fibonacci, fractal, geometric, primes and zap. [#tables] (verified 1.1.33) [s2]
- The picture is the waveform itself, morphing and leaving trails as it changes; drift fans it out into moving ghost copies. [#picture] (verified 1.1.33) [s2]

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| M1 | `turn E1` | table | 9 tables | – | 12 | s1 |
| M1 | `turn E2` | position | – | – | 13 | place within the table s1 |
| M1 | `turn E3` | warp | – | – | 14 | bends the shape of the waveform s1 |
| M1 | `turn E4` | drift | – | – | 15 | lets the warp wander from the note's pitch, for inharmonic tones s1 |

Related: [instrument.engine], [instrument.lfo-value]

Sources: s1 guide:synth-engines#wavetable · s2 note 59

### Preset settings (tuning, velocity, width, mod routing) [instrument.preset-settings]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: sound settings, mod routing, velocity sensitivity, modwheel, aftertouch, stereo width, preset transpose
Where: modes instrument; screens preset settings

`shift + instrument` opens settings stored with the track's sound: tuning and transpose, a high-pass, velocity sensitivity, portamento style and width, plus a mod tab routing modwheel, aftertouch, pitchbend and velocity.

Preset settings are the parts of a sound you rarely touch while playing, and they travel with the
preset. The mod tab is how outside expression reaches the sound: aim a MIDI keyboard's modwheel or
aftertouch, or the pitchbend strip, at a parameter. To stop the strip also bending pitch, set bend
range (`M2`, shift layer) to off.

Facts:
- `shift + instrument` opens the preset settings of the selected instrument track; `instrument` or any of `M1`…`M4` leads back to the pages. [#open] [s1]
- The settings tab covers tuning (user tunings and transposition), a basic high-pass for trimming lows, velocity sensitivity, the portamento style and stereo width. [#settings-tab] [s1]
- The preset high-pass is separate from the `M3` filter, so a track can use both. [#separate-hp] (community-verified) [s2]
- The mod tab assigns the modwheel, aftertouch, pitchbend and velocity to parameters of the sound. [#mod-tab] [s1]
- Each mod source has a target entry and an amount entry; a negative amount inverts the modulation. [#target-amount] [s3]
- Whether the built-in keys send velocity at all is a system setting (`com → M1`, keyboard section) with the choices off, soft and hard. [#keyboard-velocity] [s4]
- No MIDI CC is known for any preset setting. [#no-cc] (community-verified) [s5]

Procedures:
- Route a mod source such as the pitchbend strip to a parameter [#route] [s3]
  Needs: instrument mode; the track is selected
  1. `shift + instrument`
  2. `turn E1` — mod tab
  3. `turn E2` — the source's target entry, for example pitchbend target
  4. `turn E3` — choose the parameter, then set the matching amount entry the same way

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| preset settings | `turn E1` | tab | settings / mod | – | – | s1 |
| preset settings | `turn E2` | setting | – | – | – | s1 |
| preset settings | `turn E3` | value | – | – | – | `E4` does the same s1 |

Related: [instrument.user-tunings], [instrument.play-mode], [howto.enable-velocity]

Sources: s1 guide:instrument#preset-settings · s2 note 30 · s3 guide:how-to#pitch-bend · s4 guide:how-to#how-to-enable-velocity · s5 note 20

### User tunings (microtonal) [instrument.user-tunings]
current · OS ≥ 1.0.9 · changed in 1.1.25 · guide v1.1.15
Also called: tuning, microtuning, microtonal tuning, custom tuning, temperament, cents, tuning slots
Where: modes instrument; screens preset settings

The preset settings hold 11 user tuning slots; in each, every note can be retuned in cents and finer micro-cent steps.

User tunings take the OP-XY outside twelve-tone equal temperament — just intervals, non-Western
scales or a gently detuned vintage feel. Each slot stores per-note offsets; select the slot as a
sound's tuning and the keyboard and sequencer play in it. Save the preset afterwards so the tuning
choice travels with the sound.

Facts:
- There are 11 user tuning slots, found under settings → tuning in the preset settings. [#slots] [s1]
- `E3` picks a slot and `M4` opens it; in the editor, play a key to choose the note, then turn `E1` for cents and `E2` for micro-cents. [#edit] [s1]
- Presets store a user tuning as 12 offsets, one per pitch class, so the same pattern repeats in every octave. [#per-pitch-class] (derived) [s2]
- OS 1.1.25 fixed user tunings not loading reliably into their user slots. [#load-fix] (since 1.1.25) [s3]

Procedures:
- Create a user tuning [#create] [s1]
  Needs: instrument mode; the track is selected
  1. `shift + instrument` — preset settings
  2. `turn E1` — settings tab
  3. `turn E2` — tuning
  4. `turn E3` — pick a user slot
  5. `M4` — edit the slot
  6. `key` — play the note to retune
  7. `turn E1` — cents; `turn E2` for micro-cents
  Result: The note plays at its new pitch wherever this tuning is selected.

Related: [instrument.preset-settings]

Sources: s1 guide:instrument#preset-settings · s2 note 30 · s3 changelog:1.1.25

### Preset browser (find and load sounds) [instrument.preset-browser]
current · OS ≥ 1.0.9 · changed in 1.1.15 · guide v1.1.15
Also called: presets, preset list, load preset, browse presets, sound browser, patches, categories
Where: modes instrument; screens preset browser

`shift + Tn` in instrument mode opens that track's preset browser (on OS 1.1.33 `shift + M1` opens it for the selected track). Browse by engine or by category — a click of `E1` swaps them — and load a preset with a click of `E2`.

The browser changes a track's whole sound in one step. Category view groups sounds by role; engine
view lists everything built on one engine, handy when you know the character you want. Your own
presets and folders sit beside the factory ones and are managed from the same screen.

Facts:
- In instrument mode, `shift + Tn` opens the preset browser for track n. [#open] [s1]
- The unit ships with factory presets across the engines and the sound categories. [#factory] [s1]
- Loading a preset replaces the track's whole sound and copies it into the project, so later changes to the preset file leave existing tracks alone. [#whole-sound] (community-verified) [s2]
- On OS 1.1.33 the category view lists bass, drum, keys, lead, organ, pad, pluck and strings, after any preset pack of the owner's (the owner's Nostalgic Synths came first). [#categories] (verified 1.1.33) [s3]
- Top-level folders under presets on the unit's storage show up as categories. [#folders] (community-verified) [s4]
- Since OS 1.1.15, user preset folders can be nested more deeply. [#deeper-folders] (since 1.1.15) [s5]
- The browser shows the track number over the word preset on the left, the engine list in the middle and that engine's presets on the right, the current preset highlighted. [#screen] (verified 1.1.33) [s3]
- A click of `E1` swaps between by engine and by category, and a popup names the view for a moment; the highlighted preset stays highlighted in the other view. [#views] (verified 1.1.33) [s3]
- Presets sort by name, factory and user ones together; moving to another engine or category starts its list from the top with the first preset highlighted, and a list scrolls only as far as the highlight needs. [#sorting] (verified 1.1.33) [s3]
- With one of your own presets highlighted the footer reads cut, paste, rename and delete over `M1`…`M4`; a factory preset shows none. [#footer] (verified 1.1.33) [s3]
- Loading leaves the browser for the track's `M1` page, showing the new sound's engine values. [#loads-to-m1] (verified 1.1.33) [s3]
- On OS 1.1.33, `shift + M1` brings up this browser for the selected track, opening on its current preset in engine view; it is how that firmware changes engine. [#shift-m1] (verified 1.1.33) [s3]

Procedures:
- Load a preset on a track [#load] [s1]
  Needs: instrument mode
  1. `shift + Tn` — the track to change
  2. `click E1` — optional; swaps between engine and category view
  3. `turn E1` — choose a category or engine
  4. `turn E2` — choose a preset
  5. `click E2` — load it
  Result: The track plays the preset; all four pages and the preset settings change with it.

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| preset browser | `turn E1` | category / engine | – | – | – | s1 |
| preset browser | `click E1` | view | category / engine | – | – | s1 |
| preset browser | `turn E2` | preset | – | – | – | `E3` and `E4` scroll too s1 |
| preset browser | `click E2` | load | – | – | – | clicking `E3` or `E4` also loads s1 |

Related: [instrument.preset-management], [instrument.save-copy-scramble], [instrument.save-to-same-snapshot], [com.mtp]

Sources: s1 guide:instrument#view-and-create-preset · s2 note 30 · s3 note 59 · s4 note 30 · s5 changelog:1.1.15

### Organise presets (cut, paste, rename, delete, folders) [instrument.preset-management]
current · OS ≥ 1.0.9 · changed in 1.1.15, 1.1.25 · guide v1.1.15
Also called: move preset, rename preset, delete preset, preset folder, new folder, manage presets
Where: modes instrument; screens preset browser

In the preset browser, `M1`–`M4` cut, paste, rename and delete user presets; `shift + M1`, `shift + M3` and `shift + M4` create, rename and delete folders. Folders and moving presets arrived in OS 1.1.15.

User presets can be tidied without a computer: cut and paste move a preset between folders, rename
edits names with the encoders, and folders keep your own sounds apart from the factory library. The
actions apply to your own presets only.

Facts:
- The preset actions work on user presets; highlight one in the browser first. [#user-only] [s1]
- `M1` cuts the highlighted preset and `M2` pastes it into the current folder, unless a preset of that name is already there — then nothing is overwritten. [#cut-paste] (since 1.1.15) [s1]
- `M3` renames the preset. `E1` moves between characters and the other encoders change the one selected; then `M1` confirms, `M2` goes to the next character, `M3` cancels and `M4` deletes. [#rename] [s1]
- `M4` deletes the highlighted user preset. [#delete] [s1]
- `shift + M1` creates a preset folder. [#new-folder] (since 1.1.15) [s1]
- `shift + M3` renames a preset folder and `shift + M4` deletes it, which only works once the folder is empty. [#edit-folder] [s1]
- Adding preset folders and moving presets between them came with OS 1.1.15. [#since] (since 1.1.15) [s2]
- OS 1.1.25 improved the behaviour when a user preset folder has the same name as factory presets. [#name-clash] (since 1.1.25) [s3]

Procedures:
- Move a user preset into another folder [#move] (since 1.1.15) (derived) [s1]
  Needs: the preset browser is open
  1. `turn E2` — highlight the preset
  2. `M1` — cut
  3. `turn E1` — go to the target folder; the guide does not say how nested folders are entered
  4. `M2` — paste
- Create a preset folder [#new-folder] (since 1.1.15) [s1]
  Needs: the preset browser is open
  1. `shift + M1`

Related: [instrument.preset-browser], [instrument.save-copy-scramble]

Sources: s1 guide:instrument#view-and-create-preset · s2 changelog:1.1.15 · s3 changelog:1.1.25

### Save, copy, paste and scramble a track's sound [instrument.save-copy-scramble]
current · OS ≥ 1.0.9 · changed in 1.0.38, 1.1.32 · guide v1.1.15
Also called: save preset, save sound, copy sound, paste sound, copy track sound, scramble, randomise sound
Where: modes instrument

Hold a track key and press a module key — `Tn + M1` scrambles the sound, `Tn + M2` copies it, `Tn + M3` pastes onto that track and `Tn + M4` saves it as a new preset.

These shortcuts act on a track's complete sound, preset settings included, without opening a menu.
Copy and paste duplicate a sound onto another track for layering or variations; scramble throws the
settings around for happy accidents, so save first if you may want the original back. A save never
overwrites: it adds a snapshot, unless you use the shift variant described in the related unit.

Facts:
- `Tn + M1` scrambles the track's sound, a quick way to wreck a patch or audition random variations. [#scramble] [s1]
- `Tn + M2` copies the sound of the held track and `Tn + M3` pastes it onto the held track. [#copy-paste] [s1]
- `Tn + M4` saves the track's current sound as a preset. [#save] [s1]
- Each save becomes a new dated preset in the snapshot folder, named like 2026-06-15 (1). [#snapshot-name] (community-verified) [s2]
- Saving copies the track's samples into the new preset, so it no longer depends on the original files. [#samples-copied] (community-verified) [s3]
- A copied and pasted track takes its active octave along. [#octave] (since 1.0.38) [s4]
- OS 1.1.32 fixed pasted tracks sometimes missing some of their settings. [#paste-fix] (since 1.1.32) [s5]

Procedures:
- Save the selected track's sound as a new preset [#save] [s1]
  1. `Tn + M4`
- Duplicate one track's sound onto another track [#copy] [s1]
  1. `Tn + M2` — hold the source track's key
  2. `Tn + M3` — hold the destination track's key

Related: [instrument.save-to-same-snapshot], [instrument.preset-browser], [instrument.preset-management]

Sources: s1 guide:instrument#view-and-create-preset · s2 note 30 · s3 note 30 · s4 changelog:1.0.38 · s5 changelog:1.1.32

### Save over the same preset snapshot [instrument.save-to-same-snapshot]
changelog-only · OS ≥ 1.1.17 · changed in 1.1.18 · guide v1.1.15
Also called: overwrite preset, save preset in place, resave preset, update snapshot
Where: modes instrument

Since OS 1.1.17, holding shift while saving a track's sound overwrites the snapshot it was loaded from instead of adding a new one. TE's guide does not mention it.

Every regular save of a track's sound adds another snapshot, which is safe but fills the preset
folders with near-copies while you refine a patch. OS 1.1.17 added the alternative: hold `shift`
while saving and the snapshot you are working on is updated instead.

The guide (v1.1.15) predates the feature, so the exact gesture comes from the changelog alone.
Mind the order of the keys: starting with `shift` and then the track key opens the preset browser,
where `M4` means delete. Update to 1.1.18 or later before relying on it, because the first release
of the feature could drop the preset's samples.

Facts:
- The regular save, `Tn + M4` in instrument mode, stores the track's current sound as a preset. [#plain-save] [s1]
- A regular save creates a new snapshot instead of replacing the one the sound came from. [#new-by-default] (derived) [s2]
- Keeping `shift` held while you save writes the sound back into the snapshot it came from. [#hold-shift] [s2]
- Press the keys in the right order. `shift + Tn` on its own opens the preset browser, where `M4` deletes the selected user preset — so hold the track key first, then add `shift`. [#key-order] (derived) [s1]
- On OS 1.1.17, saving into the same snapshot could lose the preset's samples; 1.1.18 fixed it, so use the feature on 1.1.18 or later. [#samples-bug] (since 1.1.18) [s3]
- Over MTP, the unit's storage shows a presets/snapshot folder next to the folders of user sound packs. [#snapshot-folder] (verified 1.1.33) [s4]

Procedures:
- Overwrite the loaded snapshot with the track's current sound [#save-in-place] (derived) [s2]
  Needs: instrument mode; the track's sound was loaded from a saved snapshot
  1. `Tn + shift + M4` — hold the track key as for a normal save, add shift, then press M4 — the changelog only says to hold shift, so this order is not yet confirmed on a unit
  Result: The snapshot is updated in place; no new snapshot appears.

Related: [instrument.engine-prism]

Sources: s1 guide:instrument#view-and-create-preset · s2 changelog:1.1.17 · s3 changelog:1.1.18 · s4 note 90

### Sustain pedal [instrument.sustain-pedal]
changelog-only · OS ≥ 1.1.15 · changed in 1.1.17 · guide v1.1.15
Also called: sustain, damper pedal, cc64, hold pedal, pedal
Where: modes instrument

Since OS 1.1.15 a sustain pedal holds notes until it is let up, and since 1.1.17 it leaves arpeggiated notes alone. TE's guide never mentions it; with no pedal jack on the unit, the pedal arrives over MIDI.

The sustain pedal arrived with OS 1.1.15 and is absent from TE's guide, so what is known comes from
the changelog: held notes ring on until the pedal goes up, and arpeggios have ignored the pedal
since 1.1.17. Whether it works on every engine, and whether sustained notes are recorded, is not
documented.

Facts:
- A sustain pedal keeps notes sounding until the pedal is released. [#holds] [s1]
- Since OS 1.1.17, the sustain pedal does not affect arpeggiated notes. [#not-arp] (since 1.1.17) [s2]
- The OP-XY has no pedal socket, so a pedal has to reach it as MIDI — for example through a keyboard with a pedal input, connected over USB or MIDI in. [#no-jack] (derived) [s3]
- Over MIDI, sustain is controller 64 on the track's channel. [#cc64] (derived) [s4]

Related: [players.arpeggio], [com.midi-settings]

Sources: s1 changelog:1.1.15 · s2 changelog:1.1.17 · s3 guide:hardware-overview#inputs-outputs · s4 note 20

## Sampler

Sampling audio, the synth, drum and multi samplers, slicing and the sample library.

### Samplers at a glance [sampler.overview]
current · OS ≥ 1.0.9 · changed in 1.1.0 · guide v1.1.15
Also called: sample engines, sampler engines, sample tracks, which sampler
Where: modes instrument

Three instrument engines play samples — the synth sampler, the drum sampler and the multisampler; the sample key records into whichever one the selected track uses.

Use the synth sampler to make one sound playable, the drum sampler for kits and one-shots (slicing
lives there too), and the multisampler when an instrument should sound natural across its range.

Facts:
- The synth sampler (sampler among the browser's engines) plays one sample across the keyboard, with loop points for sustained sounds. [#synth-sampler] [s1]
- The drum sampler (drum among the browser's engines) gives each of the 24 keys its own one-shot sample. [#drum-sampler] [s2]
- The multisampler lays up to 24 samples of one instrument over zones of the keyboard. [#multisampler] [s3]
- On sampler tracks M1 edits the sample; M2–M4 work as on any instrument track. [#m1] [s4]
- In the mix, the drum sampler feeds the percussion group and the synth sampler the melodic group. [#groups] [s5]
- Drum sampler and synth sampler settings can be parameter-locked. [#p-locks] (since 1.1.0) [s6]
- A blank project has drum samplers on tracks 1 and 2 and a multisampler on track 8. [#default-tracks] (community-verified) [s7]
- Over MIDI, M1's encoders answer CC12–15 — start, loop start, loop end, end on the synth sampler and multisampler; tune, start, end, play mode on the drum sampler. [#ccs] (community) [s8]

Procedures:
- Put a sampler engine on the selected track [#choose] [s9]
  Needs: instrument mode
  1. `shift + M1` — the preset browser by engine (OS 1.1.33)
  2. `turn E1` — sampler, drum or multisampler
  3. `click E2` — loads its highlighted preset

Related: [sampler.sampling], [sampler.synth-sampler], [sampler.drum-sampler], [sampler.multisampler], [instrument.preset-browser]

Sources: s1 guide:sample#one-shot-synth-sampler · s2 guide:sample#drum-sampler · s3 guide:sample#multisampler · s4 guide:instrument#engine · s5 guide:mix#master · s6 changelog:1.1.0 · s7 note 10 · s8 note 20 · s9 guide:synth-engines#change-engine

### Sampling with the sample key [sampler.sampling]
current · OS ≥ 1.0.9 · changed in 1.0.29 · guide v1.1.15
Also called: record a sample, sample key, sample mode, sampling threshold
Where: screens sample

`sample` opens a record page from any screen: pick the input, set gain and threshold, then hold `M1` to capture up to 20 seconds into the current sampler or the sample library.

The recorder waits for the sound, so set the threshold just above the room noise and the take
starts with the first note. On sampler tracks the page adds key handling: the synth sampler tunes to
the key you press; the drum sampler and multisampler record onto a selected key.

Facts:
- On a sampler track, `sample` opens that engine's record page; on other tracks it records a stand-alone sample for the library. [#which-page] [s1]
- A sample can be at most 20 seconds long, in every sampler. [#limit] [s1]
- Holding `M1` arms the recorder; capture starts once the input passes the threshold. [#threshold] [s1]
- `M2` plays the take back; `M4` deletes it before it reaches the library. [#keep-or-bin] [s1]
- Pressing the lit track key closes the record page. [#exit] [s1]
- The built-in microphone can be the source, so sampling needs no cable. [#mic] [s2]
- Picking the input channel for line in and USB arrived in OS 1.0.29. [#channel-since] (since 1.0.29) [s3]
- TE's audio-interface how-to picks the USB channel with `turn E2` instead; not yet checked on a unit. [#channel-conflict] (conflicting) [s4]

Procedures:
- Record a sample into the library [#record] [s1]
  Needs: the selected track does not use a sampler engine
  1. `sample`
  2. `hold M1` — after setting source, gain and threshold
  Result: The take is saved to the library unless you press `M4`.

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| sample | `turn E1` | source | – | – | – | s1 |
| sample | `shift + turn E1` | input channel | – | – | – | line in and USB only s1 |
| sample | `turn E3` | gain | – | – | – | shown on the meter s1 |
| sample | `turn E4` | threshold | – | – | – | s1 |

Related: [sampler.overview], [sampler.drum-sampler], [sampler.sample-files]

Sources: s1 guide:sample#arrange · s2 teenage.engineering/products/op-xy · s3 changelog:1.0.29 · s4 guide:how-to#use-an-audio-interface-with-op-xy

### Synth sampler [sampler.synth-sampler]
current · OS ≥ 1.0.9 · changed in 1.1.0 · guide v1.1.15
Also called: sampler engine, one shot synth sampler, loop points, loop type
Where: modes instrument; screens M1

Plays one sample across the keyboard; M1 sets start, loop and end points, and its shift layer sets direction, tune, loop crossfade, gain and loop type.

TE's guide calls it the one shot synth sampler. Loop forever suits drones and pads, loop until
release leaves a natural tail when you let go, and loop off makes the sample a one-shot.

Facts:
- On the synth sampler's record page, pressing a key starts sampling, and that key becomes the note the sample is tuned to. [#record-key] [s1]
- Pushing the encoder in while moving one of the four points gives finer steps. [#fine] [s1]
- Loop start at the very end of the sample means no loop. [#no-loop] [s1]
- Loop forever keeps cycling after release, loop until release stops cycling when you let go, loop off plays straight through. [#loop-types] [s1]
- After sampling on the unit, the loop runs from 20 % to 80 % of the sample, set to loop forever. [#defaults] (community-verified) [s2]
- Tune works in cents; sample gain spans −30 to +20 dB. [#ranges] (community-verified) [s2]
- Synth sampler settings accept parameter locks. [#p-locks] (since 1.1.0) [s3]
- The page shows an overview strip of the sample on top (base layer only), the left and right waveforms, and start, loop and end markers. [#screen] (verified 1.1.33) [s4]
- With `shift` held it shows direction, tune as a note symbol and a value such as −12.00, crossfade as a percentage drawn as a dark wedge at the loop, and gain. [#shift-screen] (verified 1.1.33) [s4]
- CC12–15 on the track's channel move nothing on this page. [#no-cc] (verified 1.1.33) [s4]

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| M1 | `turn E1` | sample start | – | – | – | s1 |
| M1 | `turn E2` | loop start | – | – | – | s1 |
| M1 | `turn E3` | loop end | – | – | – | s1 |
| M1 | `turn E4` | sample end | – | – | – | s1 |
| M1 | `shift + turn E1` | direction | forward / backward | – | – | s1 |
| M1 | `shift + turn E2` | tune | – | – | – | s1 |
| M1 | `shift + turn E3` | loop crossfade | – | – | – | smooths the loop, e.g. for pads s1 |
| M1 | `shift + turn E4` | sample gain | – | – | – | s1 |
| M1 | `shift + click E3` | loop type | loop forever / loop until release / loop off | – | – | s1 |

Related: [sampler.overview], [sampler.sampling], [sampler.multisampler]

Sources: s1 guide:sample#one-shot-synth-sampler · s2 note 30 · s3 changelog:1.1.0 · s4 note 59

### Drum sampler [sampler.drum-sampler]
current · OS ≥ 1.0.9 · changed in 1.0.29, 1.0.32 · guide v1.1.15
Also called: drum engine, drum kit, drum keys, copy drum key
Where: modes instrument; screens M1, sample

Gives each of the 24 keys its own one-shot sample; record straight onto a chosen key, step between filled keys, and copy, paste or multi-select keys on the M1 page.

Treat the keyboard as 24 pads: select a key, hold `M1`, make the sound, move on. Takes also land in
the library, so clearing a key never loses a recording.

Facts:
- Each key holds its own one-shot sample — built for kits, fine for any set of separate sounds. [#what] [s1]
- Over MIDI the 24 keys are notes 53–76 (F3–E5 with C4 = 60), left to right. [#notes] (community-verified) [s2]
- Every drum sampler recording is also saved to the samples folder named user. [#saved] [s1]
- On the record page, `M2` and `M3` jump to the previous or next key holding a sample; `M4` clears the current key but keeps its file. [#step-keys] [s1]
- On M1, `key + M2` copies that key's sample and `key + M3` pastes the last copy onto the held key. [#copy-paste] [s1]
- Drum key copy and paste exists since OS 1.0.29. [#copy-since] (since 1.0.29) [s3]
- `key + M4` selects several keys so one edit changes them all; the guide does not say how more keys join. [#multi-select] [s1]
- Long samples default to the key play mode (sound only while held) rather than oneshot. [#long-samples] (since 1.0.32) [s4]
- TE's factory kits share one layout, left to right: kick, kick, snare, snare, rim, clap, tambourine, shaker, closed hat, closed hat, open hat, clave, low tom, ride, mid tom, crash, high tom, triangle, low conga, high conga, cowbell, guiro, metal, chi. [#te-layout] (community-verified) [s5]

Procedures:
- Record a sample onto one key [#record] [s1]
  Needs: the track uses the drum sampler
  1. `sample`
  2. `key` — the key lights up
  3. `hold M1`

Related: [sampler.drum-key-settings], [sampler.slicing], [sampler.sampling]

Sources: s1 guide:sample#drum-sampler · s2 note 20 · s3 changelog:1.0.29 · s4 changelog:1.0.32 · s5 note 30

### Drum sampler key settings [sampler.drum-key-settings]
current · OS ≥ 1.0.9 · changed in 1.0.45, 1.1.15 · guide v1.1.15
Also called: drum play mode, mute group, choke, drum pan, sample fade
Where: modes instrument; screens M1

The drum sampler's M1 page shapes the selected key — tune, start, end and play mode, with direction, pan, fade and gain on the shift layer.

Trim each hit with start and end, retune it, and pick its behaviour: oneshot for drums, key for
held sounds, loop for textures, mute group for sounds that should cut each other off.

Facts:
- The settings belong to the selected key, so every key keeps its own values. [#per-key] [s1]
- Key plays only while held, oneshot always to the end, mute group is cut off by another mute-group key, loop repeats. [#play-modes] [s1]
- A kit has a single mute group, so all mute-group keys choke each other — handy for open and closed hats. [#one-group] (community) [s2]
- The mute group applies across live and sequenced notes alike. [#choke-live] (since 1.0.45) [s3]
- Pan runs from −100 to +100, sample fade from 0 to 99, sample gain from −30 to +20 dB. [#ranges] (community-verified) [s4]
- The screen draws the sample fade over the waveform. [#fade-drawn] (since 1.1.15) [s5]
- The guide's texts for pan and sample fade describe tune and loop crossfade — copied from the synth sampler by mistake. [#guide-errors] (derived) [s6]
- The page shows the selected key's waveform with the skipped parts tinted blue and start and end markers; tune reads as a note symbol and a signed value such as −16.10, moving in steps of 0.1, and play mode as one of four icons — an arrow to a bar, a plain arrow, an arrow with G, or a loop. [#screen] (verified 1.1.33) [s7]
- With `shift` held the page shows direction, pan as a bar from L to R, fade as a dark ramp that rises from the start marker over the wave, and gain, which scales the drawn wave. [#shift-screen] (verified 1.1.33) [s7]
- Tune is always signed, so no transposition reads +0.00, and it reaches well past an octave (−16.10 was seen on a key). [#tune-reading] (verified 1.1.33) [s7]
- CC12–15 on the track's channel move nothing on this page. [#no-cc] (verified 1.1.33) [s7]

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| M1 | `turn E1` | tune | – | – | – | s1 |
| M1 | `turn E2` | sample start | – | – | – | push in for finer steps s1 |
| M1 | `turn E3` | sample end | – | – | – | s1 |
| M1 | `turn E4` | play mode | key / oneshot / mute group / loop | – | – | s1 |
| M1 | `shift + turn E1` | direction | forward / backward | – | – | s1 |
| M1 | `shift + turn E2` | pan | – | – | – | s1 |
| M1 | `shift + turn E3` | sample fade | – | – | – | s1 |
| M1 | `shift + turn E4` | sample gain | – | – | – | s1 |

Related: [sampler.drum-sampler], [sampler.slicing]

Sources: s1 guide:sample#drum-sampler · s2 note 30 · s3 changelog:1.0.45 · s4 note 30 · s5 changelog:1.1.15 · s6 note 40 · s7 note 59

### Slicing a sample across the keys [sampler.slicing]
current · OS ≥ 1.1.0 · guide v1.1.15
Also called: slice mode, sample slicer, chop, transient slicing, tap slicing
Where: modes instrument; screens M1

On a drum sampler track, `key + M1` cuts that key's sample into slices spread over the keyboard — at its transients, into equal parts, or where you tap.

Slicing turns one recording into a playable kit. Transient suits drums with clear hits, even suits
loops cut to the grid, and tap marks musical phrases by ear while the sample plays.

Facts:
- Slice mode arrived in OS 1.1.0. [#since] [s1]
- On a drum sampler track, `key + M1` opens the slicer for that key's sample. [#open] [s2]
- `turn E1` chooses the mode: transient, even or tap. [#modes] [s2]
- The slices fill the keyboard on their own and choke each other, so one slice sounds at a time. [#layout] [s2]
- With one slice per key, a sample gives at most 24 slices. [#max] (derived) [s3]
- Transient mode cuts at the loudest hits; `turn E4` sets how many slices, and after pressing a slice's key `turn E2` and `turn E3` move its start and end. [#transient] [s2]
- Even mode splits a section into equal parts; `turn E2` and `turn E3` set where the section starts and ends, `turn E4` the count. [#even] [s2]
- In tap mode, tap `M1` to start the sample and again wherever a slice should begin; `M2` stops and lets the last slice run to the end. [#tap] [s2]
- In tap mode, press a slice's key and `turn E2` to move its start (the previous slice's end); `shift + key` deletes that slice. [#tap-edit] [s2]
- The slicer screen offers cancel and done; which keys they sit on is not documented. [#confirm] (derived) [s4]

Procedures:
- Slice a drum loop at its hits [#slice-loop] [s2]
  Needs: the loop is on a key of a drum sampler track; M1 page
  1. `key + M1` — hold the key with the loop
  2. `turn E1` — transient
  3. `turn E4` — number of slices

Related: [sampler.drum-sampler], [sampler.drum-key-settings]

Sources: s1 changelog:1.1.0 · s2 guide:sample#sample-slicer · s3 note 30 · s4 note 50

### Multisampler [sampler.multisampler]
current · OS ≥ 1.0.9 · changed in 1.1.25 · guide v1.1.15
Also called: multisample, multi sampler, key zones, sampled instrument
Where: modes instrument; screens M1, sample

Up to 24 samples of one instrument, each on its own zone of the keyboard; a sample also plays the empty keys below it, and M1 edits the selected zone like the synth sampler.

Sample the instrument every few notes and let the zones fill the gaps below each one.

Facts:
- Each range of notes plays from a recording made near its pitch, which sounds truer than stretching one sample. [#what] [s1]
- While recording, select keys from left to right; every key that gets a sample becomes a zone. [#zones] [s1]
- Zones fill downwards — a sample also covers the empty keys below it, pitched down, as far as the next zone. [#fill-down] [s1]
- Up to 24 zones fit, about three samples per octave. [#max] [s1]
- The record page works like the drum sampler's — `M1` records, `M2` / `M3` step through filled keys, `M4` unassigns; takes go to the user folder. [#record-keys] [s1]
- The multisampler's M1 page has the synth sampler's layout, loop type included (`shift + click E3`). [#editing] [s1]
- The guide titles `shift + turn E2` and `shift + turn E3` pan and sample fade but describes tune and loop crossfade; zones store tune and crossfade, not pan. [#caption-mixup] (derived) [s2]
- There are no velocity layers or round robins — one sample per zone. [#no-layers] (community) [s3]
- OS 1.1.25 improved how multisamples follow global transpose. [#transpose] (since 1.1.25) [s4]
- The top strip is a full keyboard on which the zone of the sample being played lights up, jumping with the octave; each zone brings its own waveform and markers, and the shift layer matches the synth sampler's. [#screen] (verified 1.1.33) [s5]
- CC12–15 on the track's channel move nothing on this page. [#no-cc] (verified 1.1.33) [s5]

Procedures:
- Multisample an instrument [#record-zones] [s1]
  Needs: the track uses the multisampler
  1. `sample`
  2. `key` — start low, work to the right
  3. `hold M1` — play the matching note, then repeat on the next key

Related: [sampler.synth-sampler], [sampler.sampling]

Sources: s1 guide:sample#multisampler · s2 note 30 · s3 note 30 · s4 changelog:1.1.25 · s5 note 59

### Sample library [sampler.sample-library]
outdated-in-guide · OS ≥ 1.0.9 · changed in 1.1.0, 1.1.15, 1.1.17 · guide v1.1.15
Also called: sample browser, browse samples, load a sample, sample preview
Where: modes instrument; screens sample library

`shift + sample` opens the library of every sample on the unit: pick a folder, hear each sample as you land on it, and click an encoder to load it into the sampler.

The library is the shared pool behind all three samplers: your recordings, factory sounds and files
copied from a computer. Browsing auditions as you turn.

Facts:
- The library holds every sample on the unit and loads any of them into any of the three samplers. [#what] [s1]
- In the library a sample plays as soon as it is selected; `stop` ends the preview. [#preview] [s1]
- Clicking any encoder opens a subfolder or loads the selected sample; subfolder names are in square brackets. [#enter] [s1]
- New folders are made on a computer, inside the samples folder, in MTP mode. [#new-folders] [s1]
- For the drum sampler and multisampler, `M2` and `M3` step through filled keys and `M4` clears a key without deleting its file. [#key-controls] [s1]
- Holding a keyboard key and pressing `sample` browses samples for that key. [#from-key] (since 1.1.0) [s2]
- Samples used by your own presets are gathered in one group. [#preset-samples] (since 1.1.15) [s3]
- A system setting controls the sample preview; the changelog does not say where it is. [#preview-setting] (since 1.1.17) [s4]

Procedures:
- Load a sample into the current sampler [#load] [s1]
  1. `shift + sample`
  2. `turn E1` — folder
  3. `turn E2` — sample
  4. `click E2`

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| sample library | `turn E1` | folder | – | – | – | s1 |
| sample library | `turn E2` | sample | – | – | – | E3 and E4 do the same s1 |

Related: [sampler.sample-files], [sampler.drum-sampler]

Sources: s1 guide:sample#sample-folder · s2 changelog:1.1.0 · s3 changelog:1.1.15 · s4 changelog:1.1.17

### Sample files, pitch and memory [sampler.sample-files]
current · OS ≥ 1.0.9 · changed in 1.0.25, 1.0.45, 1.1.15 · guide v1.1.15
Also called: wav, aiff, sample format, root note, sample memory, import samples

The samplers read WAV and AIFF files copied into the samples folder over MTP; pitch comes from the file's metadata or a note in its name, and a project can load up to 64 MB of samples.

Anything copied into the samples folder shows up in the library, sorted by folder. Give files a root
note in their metadata, or a note name in the file name, so the samplers play them in tune.

Facts:
- The OP-XY reads WAV and AIFF files. [#formats] [s1]
- To add samples, connect a computer, put the unit in MTP mode and copy the files into the sample library. [#copy-in] [s1]
- Over MTP the unit shows a samples folder containing user, next to presets and projects. [#tree] (verified 1.1.33) [s2]
- Deleting a sample for good needs MTP; clearing a key on the unit only removes the assignment. [#delete] [s1]
- Pitch is read from the WAV metadata; failing that, from a note name such as a3 in the file name. [#pitch] [s1]
- The unit writes the root note into the metadata of the WAVs it records. [#base-note] (since 1.0.45) [s3]
- Current factory and device files name notes with C4 = 60, older device files with C3 = 60; metadata avoids the mix-up. [#octave] (community-verified) [s4]
- Recordings examined so far are 16-bit, 44.1 kHz mono WAV files. [#device-format] (community-verified) [s5]
- File names should use only letters, digits, spaces, - and #. [#names] [s6]
- Folders can nest more than one level deep. [#nesting] (since 1.1.15) [s7]
- A project can have up to 64 MB of samples loaded at once. [#memory] (since 1.0.25) [s8]

Related: [sampler.sample-library], [com.mtp], [project.system-usage-indicators]

Sources: s1 guide:sample#sample-folder · s2 note 90 · s3 changelog:1.0.45 · s4 note 30 · s5 note 30 · s6 guide:how-to#how-to-load-samples · s7 changelog:1.1.15 · s8 changelog:1.0.25

## Auxiliary

The eight auxiliary tracks: brain, punch-in FX, external MIDI, CV and audio, tape, and the FX I/II sends.

### Auxiliary mode and its eight tracks [auxiliary.overview]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: aux mode, aux tracks, auxiliary tracks
Where: modes auxiliary

`auxiliary` turns the track keys into eight fixed utility tracks — brain, punch-in FX, external MIDI, external CV, external audio, tape, FX I and FX II — sequenced like instrument tracks.

Instrument mode is for composing; auxiliary mode is for transposing, effects and reaching outside
the box. The eight roles never change, and because the tracks sequence like any other, transpositions,
effect moves and outside gear can all be programmed per step.

Facts:
- Aux tracks vary the built-in sounds or control and feed outside gear. [#purpose] [s1]
- `T1` brain, `T2` punch-in FX, `T3` external MIDI, `T4` external CV, `T5` external audio, `T6` tape, `T7` FX I, `T8` FX II. [#tracks] [s2]
- The selected aux track lights its key red; instrument tracks light white. [#red] [s3]
- External audio, tape and the FX tracks put main controls on M1, routing on M2, a filter on M3 and an LFO on M4; the brain has M1 and routing, external MIDI puts CCs on M2 and M3. [#pages] [s2]
- Aux tracks have their own patterns, notes, parameter locks and step components, like instrument tracks. [#sequenced] (community-verified) [s4]
- By default the aux tracks answer MIDI channels 9–16 in order, brain on 9 up to FX II on 16. [#channels] (community-verified) [s5]
- In mix mode, pressing `mix` again switches between instrument and aux tracks. [#mix] [s6]

Procedures:
- Open an auxiliary track [#open] [s1]
  1. `auxiliary → T1…T8`

Related: [auxiliary.brain], [auxiliary.punch-in-fx], [auxiliary.external-midi], [auxiliary.external-cv], [auxiliary.external-audio], [auxiliary.tape], [auxiliary.fx-sends], [auxiliary.routing-filter-lfo]

Sources: s1 guide:auxiliary#auxiliary · s2 guide:auxiliary · s3 guide:track-buttons#6.1%20using-the-track-buttons · s4 note 10 · s5 note 20 · s6 guide:mix#levels-pans-and-sends

### Brain [auxiliary.brain]
current · OS ≥ 1.0.9 · changed in 1.0.25, 1.0.29, 1.1.17 · guide v1.1.15 · verified on 1.1.33
Also called: brain track, key detection, auto transpose, chord changes
Where: modes auxiliary; screens M1, M2

The brain (`T1`) works out the key and scale of the tracks routed into it, and its keyboard transposes them in key — live, or sequenced as notes on the brain track.

A fast way to write: sequence a beat, a bassline and one chord, then play or sequence root changes
on the brain track. Take leads and drums out of the routing when they should stay put.

Facts:
- The brain detects the key and scale of the routed tracks and transposes them musically — the whole song or only some tracks. [#what] [s1]
- On the brain track, the keyboard transposes every routed track. [#keyboard] [s1]
- Brain notes recorded into its sequence play back as transpositions, so a one-bar idea follows a chord progression. [#sequence] [s2]
- The brain's manual mode lets you set the key yourself when detection gets it wrong. [#manual] [s1]
- Tracks left out of the routing on M2 are neither transposed nor used for key detection. [#routing] [s1]
- In a new project tracks 3–8 are routed to the brain and drum tracks 1 and 2 are not. [#default-routing] (community) [s3]
- The brain has seven scales, shown in this order as major, dorian, phrygian, lydian, mixo (mixolydian), minor and locrian. [#scales] (verified 1.1.33) [s4]
- Brain settings are stored per pattern. [#per-pattern] (since 1.0.25) [s5]
- The brain's routing is stored per pattern, not per scene. [#routing-per-pattern] (since 1.0.29) [s6]
- Arpeggiator notes follow the brain; OS 1.1.17 fixed arpeggios ignoring it. [#arp] (since 1.1.17) [s7]
- The brain's `M1` is headed with the current key, such as c major, and draws a mini keyboard marking the scale's notes. Manual mode shows a hand and the root and scale fields; auto mode shows a brain head instead. [#screen] (verified 1.1.33) [s4]
- Link reads a crossed box when off and a two-digit number otherwise; with CC15 at 32, 64, 96 and 127 it showed 02, 04, 06 and 08. [#link-values] (verified 1.1.33) [s4]
- `M2` slides in from `M1` and shows an in bracket running from the brain to track boxes 1–8, each on or off. [#routing-page] (verified 1.1.33) [s4]
- The brain has no filter page; CC32 and CC35 on its channel change nothing. [#no-filter] (verified 1.1.33) [s4]
- Over MIDI, CC12–15 on the brain's channel (9) drive its four `M1` encoders; CC12 shows manual at 0 and auto at 127. [#midi] (verified 1.1.33) [s4]

Procedures:
- Take a track into or out of the brain [#route] [s1]
  1. `auxiliary → T1`
  2. `M2`
  3. `turn E1…E4` — the track's encoder; an encoder click toggles the page, tracks 1–4 or 5–8

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| M1 | `turn E1` | manual / auto | – | – | 12 | s1 |
| M1 | `turn E2` | root | 12 notes, c … b | – | 13 | the guide calls it key (verified 1.1.33) s4 |
| M1 | `turn E3` | scale | major / dorian / phrygian / lydian / mixo / minor / locrian | – | 14 | (verified 1.1.33) s4 |
| M1 | `turn E4` | link | – | – | 15 | links an instrument track, to riff over the song as it transposes s1 |

Related: [auxiliary.overview], [auxiliary.routing-filter-lfo]

Sources: s1 guide:auxiliary#brain · s2 guide:how-to#write-a-song-fast-with-brain · s3 note 10 · s4 note 59 · s5 changelog:1.0.25 · s6 changelog:1.0.29 · s7 changelog:1.1.17

### Punch-in FX [auxiliary.punch-in-fx]
current · OS ≥ 1.0.9 · changed in 1.0.32, 1.0.50 · guide v1.1.15
Also called: punch-in, punch in effects, performance effects
Where: modes auxiliary, instrument

The punch-in FX track (`T2`) turns the keyboard into 24 momentary effects — lower octave for percussion tracks, upper for melodic ones; `shift + key` fires them from any instrument track.

Punch-in FX are for performing: hold a key for a moment of change, let go and the track snaps back.
Recorded passes live on their own track, so they can be edited without touching the parts below.

Facts:
- On `T2` each of the 24 keys is a different effect that lasts while held; held keys combine. [#keys] [s1]
- The lower octave acts on the percussion tracks, the upper octave on the melodic tracks. [#octaves] [s2]
- Some effects also respond to moving the unit (gyroscope) or to the pitchbend strip. [#motion] [s2]
- On an instrument track, `shift + key` plays punch-in FX; the lower octave affects only that track, the upper octave its whole group. [#shortcut] [s2]
- Shortcut effects played while recording are written to the punch-in FX track. [#record] [s2]
- Percussive engines such as the drum sampler form the percussion group; synth engines and the synth sampler the melodic group. [#groups] [s3]
- When effects conflict, the mute effect takes priority. [#mute-wins] (since 1.0.50) [s4]
- OS 1.0.32 stopped `shift + key` from triggering punch-in FX while external MIDI is in use. [#midi-shortcut] (since 1.0.32) [s5]
- Notes on MIDI channel 10 trigger punch-in FX; which note fires which effect is unpublished. [#midi-notes] (community-verified) [s6]
- On `T2` each of the 24 keys plays its own animation on the screen — planets, a digit clock, noise, hands, waves, sweeping lines and bars, and more. [#animations] (verified 1.1.33) [s7]
- With no effect held, the page shows a single dot tracing a heartbeat line across the dot grid, about every three seconds; it starts again from the left edge each time an effect ends. [#idle-heartbeat] (verified 1.1.33) [s7]

Procedures:
- Record punch-in FX from an instrument track [#record-shortcut] [s2]
  Needs: instrument mode
  1. `record + play` — start a live recording
  2. `shift + keys`

Related: [auxiliary.overview], [howto.first-punch-in]

Sources: s1 guide:get-started#4.4.%20adding-punch-in-fx · s2 guide:auxiliary#punch-in-fx · s3 guide:mix#master · s4 changelog:1.0.50 · s5 changelog:1.0.32 · s6 note 20 · s7 note 59

### External MIDI track [auxiliary.external-midi]
current · OS ≥ 1.0.9 · changed in 1.1.15 · guide v1.1.15 · verified on 1.1.33
Also called: midi track, ext midi, control a synth, midi cc slots
Where: modes auxiliary; screens M1, M2, M3, M4

`T3` plays and sequences outside MIDI gear over USB-C or the multi-out; M1 sets channel, bank and program, M2 and M3 hold eight CC slots, and M4 has an LFO.

`T3` is a track whose sound lives in another box: set its channel, pick a sound with bank and
program, and map the CC slots to the controls you want to move. For more devices at once, use
instrument tracks with the midi engine.

Facts:
- The external MIDI track (`T3`) sends its keyboard and sequencer notes to connected MIDI gear. [#track] [s1]
- Gear connects through the USB-C port, or through the multi-out jack set to midi. [#ports] [s1]
- M2 and M3 hold four CC slots each; turning sends a slot's value, `shift + turn E1…E4` switches a slot on and picks its CC number, and the values can be sequenced and recorded. [#slots] [s1]
- The external MIDI track's LFO (M4) modulates the track's own parameters, such as a CC slot. [#lfo] [s1]
- Program changes can be parameter-locked; OS 1.1.15 fixed such locks not working. [#program-locks] (since 1.1.15) [s2]
- Community charts put the slot values on CC20–23 and CC32–35 of channel 11 and the slot numbers on CC28–31 and CC36–39. [#ccs] (community) [s3]
- Over MIDI on channel 11, CC12–14 set channel, bank and program and CC40–43 drive the `M4` LFO; CC15 does nothing. [#midi] (verified 1.1.33) [s4]
- The `M1` page is headed midi with a DIN socket icon; channel reads 01–16, and bank and program show a crossed box at 0, then 1–128. [#screen] (verified 1.1.33) [s4]
- `M2` and `M3` slide in sideways from `M1`; each CC slot is a crossed box while off, or a large value with cc and its number underneath. [#slot-pages] (verified 1.1.33) [s4]
- The `M4` LFO offers the CC slots as its destinations; a slot without a CC shows no cc set as the parameter. [#lfo-screen] (verified 1.1.33) [s4]

Procedures:
- Play an outside synth from the OP-XY [#setup] [s5]
  Needs: the synth is connected over USB-C or the multi-out
  1. `auxiliary → T3`
  2. `turn E1` — the synth's MIDI channel, on M1
  3. `keys`

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| M1 | `turn E1` | channel | 1–16 | – | 12 | s1 |
| M1 | `turn E2` | bank | off, 1–128 | – | 13 | (verified 1.1.33) s4 |
| M1 | `turn E3` | program | off, 1–128 | – | 14 | (verified 1.1.33) s4 |

Related: [instrument.engine-midi], [com.multi-out], [sequencer.parameter-locks]

Sources: s1 guide:auxiliary#external-midi · s2 changelog:1.1.15 · s3 note 20 · s4 note 59 · s5 guide:how-to#how-to-control-a-synth-with-midi

### External CV track [auxiliary.external-cv]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: cv track, cv gate, control voltage, modular, eurorack
Where: modes auxiliary

`T4` sends note pitch as control voltage and a gate from the multi-out jack, so the keyboard and sequencer can play modular and vintage synths.

The simplest aux track: the guide gives it no page settings, only notes, and on the unit its page is
just a voltmeter. Set the multi-out to cv
before plugging in, patch pitch and gate into the synth, then play `T4` like any other track.

Facts:
- Modular and vintage synths take pitch as a control voltage (CV) and note on/off as a gate. [#why] [s1]
- On the external CV track (`T4`) the keyboard and sequencer play the connected CV device. [#track] [s1]
- The multi-out carries CV on its tip (left) and gate on its ring (right). [#jack] [s1]
- Use a splitter cable that separates left and right, not one that keeps stereo — tip to the CV input, ring to the gate input. [#cable] [s2]
- The CV track's page is a voltmeter labelled CV, reading from −5 to +5 V. [#screen] (verified 1.1.33) [s3]
- CC12–15 on its channel (12) move nothing on that page. [#no-ccs] (verified 1.1.33) [s3]

Procedures:
- Set the multi-out to CV and gate [#multi-out] [s2]
  Needs: nothing plugged into the multi-out
  1. `com`
  2. `turn E3` — until cv shows

Related: [com.multi-out], [howto.control-cv-synth]

Sources: s1 guide:auxiliary#external-cv · s2 guide:how-to#how-to-control-an-analog-synth%20with%20cv%20and%20gate · s3 note 59

### External audio track [auxiliary.external-audio]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: audio in, audio input, line in, aux out, external effects
Where: modes auxiliary; screens M1, M2

`T5` brings an input — mic, headset, line, USB or the main output — into the mix, and routes instrument tracks out of the multi-out jack, for example through an outboard effect.

Two jobs share this track: as an input it puts a mic, synth or computer audio into the mix; as an
output it sends chosen tracks out of the multi-out, so an outboard effect can process them and come
back through the input. Instrument tracks can also feed the aux output from their send page.

Facts:
- The 3.5 mm audio input takes line sources or a microphone, for vocals, horns and the like. [#line-in] [s1]
- On `T5`, choose the input with `turn E1`, then click `E1` to switch it on. [#activate] [s2]
- Sending audio out needs the multi-out set to audio. [#out] [s1]
- M2 sends instrument tracks to the aux output on the multi-out; only routed tracks leave there, each at an amount independent of the main mix. [#routing] [s1]
- For an outboard effect, send tracks out of the multi-out, return the effect into the audio input, and balance the return with drive, level and mix. [#outboard] [s2]
- Community charts give CC12 on channel 13 as the input select and suggest the level is the track level, CC7. [#ccs] (community) [s3]
- Over MIDI on channel 13, CC13 sets drive and CC15 mix, and CC32, CC35 and CC40–43 reach the filter and LFO pages; CC12, the input select, was left untried so the microphone could not open. [#midi] (verified 1.1.33) [s4]
- `M1` draws the signal path — a microphone box marked fdbk block (crossed out while it blocks feedback), a line labelled input, then boxes for drive, level and mix. [#screen] (verified 1.1.33) [s5]
- Drive reads 00–20 and mix 00–99; level showed 75 in a new project. [#ranges] (verified 1.1.33) [s5]
- Its `M2` routing page shows track boxes 1–8 and an out box, and its `M4` LFO aims at syn, filter or amp, with parameters such as param1, hi pass, volume and pan. [#other-pages] (verified 1.1.33) [s5]

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| M1 | `turn E1` | input | mic / headset / audio input / USB audio / main output | – | – | s1 |
| M1 | `click E1` | input on / off | – | – | – | s2 |
| M1 | `turn E2` | drive | – | – | – | preamp gain, analog inputs only s1 |
| M1 | `turn E3` | level | – | – | – | the input's volume in the main mix s1 |
| M1 | `turn E4` | mix | – | – | – | how much of the routed tracks returns to the main output s1 |

Related: [auxiliary.routing-filter-lfo], [instrument.track-sends], [com.multi-out]

Sources: s1 guide:auxiliary#external-audio · s2 guide:how-to#send-audio-to-and-from-an-external-effect · s3 note 20 · s4 note 59 · s5 note 59

### Tape track [auxiliary.tape]
current · OS ≥ 1.0.9 · changed in 1.1.15 · guide v1.1.15
Also called: tape, tape loop, glitch, tape stop
Where: modes auxiliary; screens M1, M2

`T6` grabs and rearranges audio playing in the unit: its keyboard plays clips of the tracks routed into the tape, and pitch, speed, loop length and mix shape the result.

Route a drum track into the tape, then play `T6`'s keyboard to fire back fragments of what just
played; shorten the loop for stutters, drop the pitch for slow-downs.

Facts:
- Tape picks out and rearranges audio playing inside the OP-XY, which makes glitchy effects easy. [#what] [s1]
- On the tape track (`T6`) the keyboard plays clips of whatever tracks are routed into the tape. [#keyboard] [s1]
- Only tracks routed on M2 run through the tape, each at its own amount, independent of the main mix. [#routing] [s1]
- Community charts read tape pitch as a speed multiple, x1 by default. [#values] (community) [s2]
- The tape page shows a reel icon with the speed as a percentage, a tape strip carrying a mini keyboard and the loop length as a number, and a mix box. [#screen] (verified 1.1.33) [s3]
- Speed runs from 50 % to 200 %, length from 1 to 16 and mix from 00 to 99. Over MIDI, CC13 at 63 gives 99 % and at 64 gives 101 %, so exactly 100 % cannot be sent. [#ranges] (verified 1.1.33) [s3]
- Tape settings can be parameter-locked; OS 1.1.15 fixed locks not showing on the tape screen. [#p-locks] (since 1.1.15) [s4]
- Over MIDI on channel 14, CC13 moves speed, CC14 length and CC15 mix on the tape page, and CC12 changes it only slightly. [#ccs] (verified 1.1.33) [s3]

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| M1 | `turn E1` | pitch | – | – | – | big jumps, for drastic effects s1 |
| M1 | `turn E2` | speed | – | – | – | finer and gentler than pitch s1 |
| M1 | `turn E3` | length | – | – | – | length of the tape loop s1 |
| M1 | `turn E4` | mix | – | – | – | tape against the original audio s1 |

Related: [auxiliary.routing-filter-lfo], [instrument.track-sends]

Sources: s1 guide:auxiliary#tape · s2 note 20 · s3 note 59 · s4 changelog:1.1.15

### FX I and FX II send tracks [auxiliary.fx-sends]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: send effects, fx tracks, reverb send, delay send
Where: modes auxiliary

`T7` and `T8` hold the two send effects: any sounding track can feed them, FX I can feed FX II, and `shift + T7` or `shift + T8` swaps the effect in a slot.

One reverb on FX II can serve every track, each sending as much as it needs, and chaining FX I
into FX II lets a delay fade into reverb. The effects themselves are described in the effects area.

Facts:
- FX I and FX II are the two send effects; every track that makes sound can send to both, and FX I can send on into FX II. [#what] [s1]
- On an FX track the keyboard plays the last selected instrument track, so you hear the effect on that sound. [#audition] [s1]
- `shift + T7` or `shift + T8` changes the effect in that slot; the encoders then pick one. [#choose] [s1]
- On an FX track, M1 shows the loaded effect's parameters. [#m1] [s1]
- On FX I, `shift + turn E4` on the M3 page sets the send into FX II. [#fx1-to-fx2] [s1]
- Instrument tracks send from their send page (`shift` held on M3, `E3` for FX I, `E4` for FX II). [#track-sends] [s2]
- In mix mode, M1 sets each track's FX I send with `turn E1` and FX II send with `turn E2`. [#mix-sends] [s3]
- The guide's FX routing card repeats a CV sentence and its filter card names the tape track — copy slips. [#guide-slips] (derived) [s1]
- The FX I page is headed with a boxed FX I and the effect's name, then four columns with labels above and values below, each a bar split by a marker at the value's height. [#screen] (verified 1.1.33) [s4]
- On FX I, `shift + T7` lists the effects — chorus, delay, dist, lofi, phaser and reverb. [#type-list] (verified 1.1.33) [s4]
- Over MIDI, CC12–15 on channel 15 move the four columns of FX I. [#midi] (verified 1.1.33) [s5]

Related: [fx.overview], [auxiliary.routing-filter-lfo], [mix.levels-pans-sends]

Sources: s1 guide:auxiliary#fx-i-and-fx-ii · s2 guide:instrument#filter · s3 guide:mix#levels-pans-and-sends · s4 note 59 · s5 note 59

### Aux routing, filter and LFO pages [auxiliary.routing-filter-lfo]
current · OS ≥ 1.0.9 · changed in 1.1.32 · guide v1.1.15
Also called: aux routing, aux filter, aux lfo, aux sends
Where: modes auxiliary; screens M2, M3, M4

Pages shared by several aux tracks — M2 routes instrument tracks in, M3 is a high-pass and low-pass filter with sends on its shift layer, and M4 is an LFO aimed at one of the track's own parameters.

These pages behave alike on every aux track that has them. The filter trims the lows and highs of
what the track outputs, keeping a reverb return clean; the LFO moves one of the track's own settings.

Facts:
- The brain, external audio, tape and both FX tracks have a routing page on M2. [#routing-where] [s1]
- On a routing page, an encoder click toggles the page between tracks 1–4 and tracks 5–8; turning a track's encoder adds or removes it, and on tape and external audio sets how much goes in. [#routing-use] [s2]
- External audio, tape and both FX tracks have the filter on M3; those four plus external MIDI have the LFO on M4. [#which-tracks] [s1]
- OS 1.1.32 fixed aux track LFOs failing to affect the page parameters. [#lfo-fix] (since 1.1.32) [s3]
- Community charts put the aux sends on CC37–39 of the track's channel. [#ccs] (community) [s4]
- Over MIDI, CC32 and CC35 move the external audio track's high-pass and low-pass and CC40–43 its LFO; the external MIDI track's LFO answers CC40–43 too. [#midi] (verified 1.1.33) [s5]
- On external audio the `M3` filter starts switched off; its high-pass is drawn rising from the left and its low-pass falling from the right. [#filter-drawn] (verified 1.1.33) [s6]

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| M3 | `turn E1` | high-pass cutoff | – | – | 32 | s2 |
| M3 | `turn E4` | low-pass cutoff | – | – | 35 | s2 |
| M3 | `shift + turn E2` | tape send | – | – | – | external audio only s7 |
| M3 | `shift + turn E3` | FX I send | – | – | – | external audio and tape s7 |
| M3 | `shift + turn E4` | FX II send | – | – | – | external audio, tape, and FX I (into FX II) s7 |
| M4 | `turn E1` | LFO speed | – | – | – | s2 |
| M4 | `turn E2` | LFO amount | – | – | – | s2 |
| M4 | `turn E3` | destination | – | – | – | the page to modulate s2 |
| M4 | `turn E4` | parameter | – | – | – | the encoder on that page s2 |

Related: [auxiliary.overview], [auxiliary.external-audio], [auxiliary.tape], [auxiliary.fx-sends]

Sources: s1 guide:auxiliary · s2 guide:auxiliary#tape · s3 changelog:1.1.32 · s4 note 20 · s5 note 59 · s6 note 59 · s7 guide:auxiliary#external-audio

## Effects

The send effects that can sit on FX I and FX II, and what each encoder does.

### Send effects [fx.overview]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: fx, send fx, fx types, change fx, effect list, FX I, FX II
Where: modes auxiliary; screens M1

Six built-in send effects — chorus, delay, distortion, lofi, phaser and reverb — can be loaded on the two FX tracks, FX I (T7) and FX II (T8); M1 of an FX track shows the effect's four controls.

Send effects work like the return channels of a mixing desk: tracks send a share of their signal to
FX I or FX II, and the FX track plays the processed result back into the mix, so one reverb can serve
every track. Each slot runs one effect at a time. The FX tracks themselves — sends, routing, filter,
LFO and defaults — are covered with the auxiliary tracks; the units here list what each effect's
`M1` encoders do.

Facts:
- The OP-XY has six built-in send effects — chorus, delay, distortion, lofi, phaser and reverb. [#six] [s1]
- Two slots hold them, the FX tracks FX I and FX II, which are auxiliary tracks `T7` and `T8`; either slot can take any of the six. [#slots] [s1]
- The loaded effect's four parameters sit on the FX track's `M1` page. [#m1] [s2]
- No MIDI CC is known that changes the effect type; choose it on the unit. [#no-type-cc] (community) [s3]
- The effect list on the unit spells them chorus, delay, dist, lofi, phaser and reverb. [#list-names] (verified 1.1.33) [s4]

Procedures:
- Load a different effect on FX I or FX II [#change] [s1]
  1. `auxiliary`
  2. `T7/T8` — select FX I or FX II
  3. `shift + T7/T8` — opens the list of effects for that slot
  4. `turn E4` — scroll to the effect
  5. `click E4` — pressing `M1` confirms as well
  Result: The slot now runs the chosen effect and `M1` shows its parameters.

Related: [fx.chorus], [fx.delay], [fx.distortion], [fx.lofi], [fx.phaser], [fx.reverb], [auxiliary.fx-sends], [mix.levels-pans-sends]

Sources: s1 guide:fx#fx · s2 guide:auxiliary#fx-i-and-fx-ii · s3 note 20 · s4 note 59

### Chorus effect [fx.chorus]
current · OS ≥ 1.0.9 · guide v1.1.15 · verified on 1.1.33
Also called: chorus, chorus fx, ensemble, widening
Where: modes auxiliary; screens M1

A chorus for FX I or FX II that layers pitch-wobbled copies over the sound to widen it; M1 sets rate, depth, feedback and stereo width.

A chorus makes one voice sound like several by adding detuned, slightly late copies. Keep rate and
depth low for a subtle widening of pads and keys; raise them for seasick vibrato. Feedback adds
resonance and, at the top of its range, a pitch-wobbling echo. Stereo decides how far the copies
spread across the field.

Facts:
- The chorus layers copies of the incoming sound whose pitch and timing drift a little against the original, which thickens and widens it; pushed far, the drift becomes an obvious effect. [#what] [s1]
- High feedback settings turn the chorus into a short delay with wobbling pitch. [#feedback-echo] [s1]
- The chorus's columns read rate, depth, feedback and stereo, as the guide names them. [#labels] (verified 1.1.33) [s2]

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| M1 | `turn E1` | rate | – | – | 12 | speed of the pitch modulation s1 |
| M1 | `turn E2` | depth | – | – | 13 | how far the pitch is modulated s1 |
| M1 | `turn E3` | feedback | – | – | 14 | how much of the output returns into the chorus s1 |
| M1 | `turn E4` | stereo | – | – | 15 | width of the chorus image s1 |

Related: [fx.overview], [fx.phaser]

Sources: s1 guide:fx#chorus · s2 note 59

### Delay effect [fx.delay]
current · OS ≥ 1.0.9 · changed in 1.1.25 · guide v1.1.15 · verified on 1.1.33
Also called: delay, echo, delay fx, delay time, repeats
Where: modes auxiliary; screens M1

An echo for FX I or FX II; M1 sets the repeat spacing as a note value, fine-tunes it, and sets the feedback and the amount of dry signal.

Set the rough echo distance with size, then fine-tune it and choose how long the echoes keep coming
back. For a classic send, keep dry at 0 so the FX track returns only the echoes. TE's guide calls the
middle controls amount and fine and describes size as eight named steps from micro to insane; on
1.1.33 the screen reads fine and feedback, and size shows note values, so the spacing follows the
tempo.

Facts:
- The delay plays back what it receives as a series of echoes. [#what] [s1]
- Size (`E1`) sets the spacing of the repeats and reads as a note value, such as 1/8 dotted. [#size] (verified 1.1.33) [s2]
- The delay's columns read size, fine, feedback and dry — `E2` fine-tunes the spacing and `E3` sets the feedback. [#labels] (verified 1.1.33) [s2]
- Dry (`E4`) sets the untreated signal against the echoes; at 0 only the repeats are heard. [#dry] [s1]
- Since OS 1.1.25 the delay stays steady when the tempo of an external clock wobbles. [#jitter] (since 1.1.25) [s3]

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| M1 | `turn E1` | size | note values, e.g. 1/8 dotted | – | 12 | coarse spacing between repeats (verified 1.1.33) s2 |
| M1 | `turn E2` | fine | – | – | 13 | fine-tunes the spacing; the guide calls it amount (verified 1.1.33) s2 |
| M1 | `turn E3` | feedback | – | – | 14 | how many repeats come back; the guide calls it fine (verified 1.1.33) s2 |
| M1 | `turn E4` | dry | – | – | 15 | level of the untreated signal s1 |

Related: [fx.overview], [fx.reverb]

Sources: s1 guide:fx#delay · s2 note 59 · s3 changelog:1.1.25

### Distortion effect [fx.distortion]
current · OS ≥ 1.0.9 · guide v1.1.15 · verified on 1.1.33
Also called: distortion, overdrive, drive, clipping, dirt
Where: modes auxiliary; screens M1

A clipping distortion for FX I or FX II; M1 sets the drive into it, the clipping amount and low and high cuts that shape what enters it.

Drive sets how hot the signal hits the distortion, clip how hard it is clipped. Because the two
cuts sit in front of the clipping, trimming the lows keeps bass from turning to mud, and trimming
the highs gives a darker, smoother crunch. As a send, it lets you add dirt to a drum bus or a lead
by degrees while the dry track stays clean.

Facts:
- The distortion clips the signal it receives, adding grit and harmonics. [#what] [s1]
- Low cut (`E3`) and high cut (`E4`) act on the input, trimming bass and treble before the clipping rather than after it. [#pre-filters] [s1]
- The unit lists the effect as dist, and its columns read drive, clip, lo cut and hi cut — the guide's amount is labelled clip. [#labels] (verified 1.1.33) [s2]

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| M1 | `turn E1` | drive | – | – | 12 | level going into the distortion s1 |
| M1 | `turn E2` | clip | – | – | 13 | how hard the signal is clipped; the guide calls it amount (verified 1.1.33) s2 |
| M1 | `turn E3` | low cut | – | – | 14 | how much bass reaches the distortion s1 |
| M1 | `turn E4` | high cut | – | – | 15 | how much treble reaches the distortion s1 |

Related: [fx.overview], [fx.lofi], [mix.saturator]

Sources: s1 guide:fx#distorsion · s2 note 59

### Lofi effect [fx.lofi]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: lofi, lo-fi, bitcrusher, bit crusher, sample rate reduction, decimator
Where: modes auxiliary; screens M1

A bitcrusher for FX I or FX II; M1 sets the sample rate, bit depth, a quality control and drift, which spreads the result in stereo.

Lofi degrades audio the digital way: fewer samples per second and fewer bits per sample. Small
amounts add a dusty edge to drums and keys; extreme settings turn anything into crunchy, aliased
noise. Drift widens the crushed signal across the stereo field. Sent from a few tracks at once, it
gives a whole mix a shared worn-out character.

Facts:
- Lofi is a bitcrusher. It roughens a sound by lowering its sample rate and bit depth, for lo-fi styles or just extra grit. [#what] [s1]
- The guide gives no detail about the quality control (`E3`) beyond its name. [#quality] [s1]

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| M1 | `turn E1` | rate | – | – | 12 | sample rate of the effect s1 |
| M1 | `turn E2` | bits | – | – | 13 | bit depth (the guide says bitrate) s1 |
| M1 | `turn E3` | quality | – | – | 14 | s1 |
| M1 | `turn E4` | drift | – | – | 15 | stereo spread of the output s1 |

Related: [fx.overview], [fx.distortion]

Sources: s1 guide:fx#lofi

### Phaser effect [fx.phaser]
current · OS ≥ 1.0.9 · guide v1.1.15 · verified on 1.1.33
Also called: phaser, phase shifter, phasing, sweep
Where: modes auxiliary; screens M1

A 12-pole phaser for FX I or FX II; M1 sets the centre frequency of the sweep, its depth, its rate and the feedback.

A phaser gives a sound a slow, swirling motion. Frequency places the sweep, depth sets how far it
travels and rate how fast. With feedback low the effect is gentle; turned up it becomes a pronounced,
whistling resonance. It suits pads, chords and hi-hats.

Facts:
- The phaser blends filtered copies of the sound with the dry signal; where the two are out of phase they cancel, which carves moving notches into the spectrum. [#what] [s1]
- The phaser is a 12-pole design with 12 notches. [#poles] [s1]
- More feedback (`E4`) sends more of the phaser's output back into it, making the sweep ring and sing. [#feedback] [s1]
- The phaser's columns read frequency, depth, rate and feedback, as the guide names them. [#labels] (verified 1.1.33) [s2]

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| M1 | `turn E1` | frequency | – | – | 12 | centre frequency the sweep moves around s1 |
| M1 | `turn E2` | depth | – | – | 13 | how far the sweep travels s1 |
| M1 | `turn E3` | rate | – | – | 14 | sweep speed s1 |
| M1 | `turn E4` | feedback | – | – | 15 | resonance of the notches s1 |

Related: [fx.overview], [fx.chorus]

Sources: s1 guide:fx#phaser · s2 note 59

### Reverb effect [fx.reverb]
current · OS ≥ 1.0.9 · guide v1.1.15 · verified on 1.1.33
Also called: reverb, reverberation, room, hall, space
Where: modes auxiliary; screens M1

A reverb for FX I or FX II, from a small room to a cathedral; M1 sets size, modulation, a tone filter and the dry/wet balance.

The reverb is the classic send: one instance on an FX track, with each track sending as much as it
needs. Size sets the space, modulation moves the tail and the tone control darkens or brightens it.
TE's guide names `E3` and `E4` rate and feedback; the screen calls them tone and dry, which matches
what they do.

Facts:
- The reverb puts a sound in a space, anything from a small room to a cathedral. Use it to make a part stand out or to smooth the whole mix. [#what] [s1]
- Modulation (`E2`) adds a slowly swelling, chorus-like movement to the reverb. [#modulation] [s1]
- The reverb's columns read size, mod, tone and dry, so `E3` is the tone control and `E4` the dry level. [#labels] (verified 1.1.33) [s2]
- The dry/wet control (`E4`) moves smoothly between send-style use, where only the reverb returns, and insert-style use, where dry signal passes through as well. [#send-insert] [s1]

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| M1 | `turn E1` | size | – | – | 12 | room size, small room to cathedral s1 |
| M1 | `turn E2` | modulation | – | – | 13 | chorus-like swell s1 |
| M1 | `turn E3` | tone | – | – | 14 | darkens or brightens the reverb; the guide calls it rate (verified 1.1.33) s2 |
| M1 | `turn E4` | dry | – | – | 15 | dry signal against the reverb; the guide calls it feedback (verified 1.1.33) s2 |

Related: [fx.overview], [fx.delay]

Sources: s1 guide:fx#reverb · s2 note 59

## Arrange

Patterns per track, sound link, scenes and song mode.

### Arrange mode [arrange.overview]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: arrange, arranger, arrangement, pattern view, switch patterns, pattern navigation
Where: modes arrange

Arrange mode manages each track's patterns and combines them into scenes and songs; E4 moves between the selected track's patterns and a click on it mutes the track.

Arrange is the bird's-eye view of a project. Pick a track and `E4` walks through its patterns while
the step keys show what each one holds; press `arrange` again for the auxiliary tracks. Patterns are
grouped into scenes, and scenes chained into songs. Since every change happens while the sequencer
runs, the same view doubles as a performance surface.

Facts:
- Arrange mode handles each track's patterns — adding them and switching between them — and strings them into scenes and songs, for building a song as well as performing it. [#purpose] [s1]
- Pressing `arrange` while already in arrange mode flips between the instrument tracks and the auxiliary tracks; both kinds have patterns. [#toggle] [s2]
- A track key picks the track to work on; instrument tracks light white and auxiliary tracks red, as in the other modes. [#select] [s2]
- The step keys show the selected track's sequence in its current pattern. [#steps] [s2]
- `turn E4` scrolls through the patterns of the selected track, drawn as a column of numbered blocks, so the current one sits on the colour band. [#browse] (verified 1.1.33) [s3]
- `click E4` mutes the selected track. [#mute] [s4]
- In arrange, `M1`…`M4` open no pages; the footer names them new, copy, paste and clear (delete once the track has more than one pattern), and with `shift` held they manage scenes. [#keys] (verified 1.1.33) [s3]
- The arrange page shows eight track columns crossed by a band of track colours; the selected track's segment is bright and dotted with its notes, its number above, and the current scene number sits boxed at the bottom. On the auxiliary side a small icon appears at the top left. [#screen] (verified 1.1.33) [s3]

Procedures:
- Open arrange mode [#enter] [s1]
  1. `arrange`
- Switch arrange between instrument and auxiliary tracks [#track-kind] [s2]
  Needs: arrange mode
  1. `arrange`
- Play another existing pattern on a track [#change-pattern] [s4]
  Needs: arrange mode
  1. `Tn` — select the track
  2. `turn E4` — step to the pattern

Related: [arrange.patterns], [arrange.sound-link], [arrange.scenes], [arrange.song-mode], [basics.patterns-scenes-songs], [mix.mute-solo]

Sources: s1 guide:arrange#arrange · s2 guide:arrange#switching-tracks-and-patterns · s3 note 59 · s4 guide:arrange#sound-link

### New, copy, paste and remove patterns [arrange.patterns]
outdated-in-guide · OS ≥ 1.0.9 · changed in 1.1.15, 1.1.25 · guide v1.1.15
Also called: new pattern, add pattern, copy pattern, paste pattern, delete pattern, clear pattern, pattern limit
Where: modes arrange

In arrange, M1 adds a pattern to the selected track, M2 copies the current pattern with its whole sound, M3 pastes it and M4 removes a pattern; a track holds up to 16.

The four module keys are the pattern toolbox of arrange: new, copy, paste and remove, always acting on
the selected track. A copy carries the full sound, so paste within a track for variations, or onto
another track to change a part's instrument mid-song. Editing the notes inside a pattern is a
sequencer topic.

Facts:
- `M1` adds a new pattern to the selected track, the one whose key is lit. [#new] [s1]
- OS 1.1.15 raised the limit from 9 to 16 patterns per track; older TE texts still give 9. [#was-nine] (since 1.1.15) [s2]
- `M2` copies the selected pattern together with its engine and all other settings. [#copy] [s1]
- `M3` pastes the copy. Pasted onto another track, it brings the complete instrument, engine and parameters included. [#paste] [s1]
- `M4` removes a pattern from the selected track. [#remove] [s1]
- On the device the arrange footer reads new, copy, paste and then clear or delete from left to right, so `M1` adds a pattern as the guide says; TE's screen art, which shows the order reversed, is wrong. [#labels] (verified 1.1.33) [s3]
- `M4` is labelled clear while the track has only one pattern and delete once it has more. [#m4-label] (verified 1.1.33) [s3]
- Since OS 1.1.25, a newly added pattern takes over the player type currently in use. [#player] (since 1.1.25) [s4]

Procedures:
- Add a pattern to a track [#new] [s1]
  Needs: arrange mode
  1. `Tn` — select the track
  2. `M1`
  Result: The track gains one more pattern, up to 16.
- Copy a pattern to the same or another track [#copy-paste] [s1]
  Needs: arrange mode; the pattern to copy is selected
  1. `M2` — copy
  2. `Tn` — optional, pick another track
  3. `M3` — paste
- Remove a pattern from a track [#remove] [s1]
  Needs: arrange mode; the pattern is selected
  1. `M4` — labelled clear while the track has one pattern, delete once it has more

Related: [arrange.overview], [arrange.sound-link], [arrange.scenes], [players.overview], [sequencer.overview]

Sources: s1 guide:arrange#edit-controls · s2 changelog:1.1.15 · s3 note 59 · s4 changelog:1.1.25

### Sound link [arrange.sound-link]
current · OS ≥ 1.1.0 · changed in 1.1.3 · guide v1.1.15
Also called: link sound, keep sound across patterns, link source, link track, same preset all patterns
Where: modes arrange

With sound link on, a track keeps one sound while you switch its patterns instead of loading each pattern's own; the sound comes from a source pattern you choose. New in OS 1.1.0.

Normally each pattern of a track carries its own sound, so switching patterns can switch presets —
handy for instrument changes, not when you only want new notes. Sound link fixes the track to the
sound of one source pattern. The guide (v1.1.15) does not say what happens to the patterns' own
sounds when the link goes off again.

Facts:
- Sound link arrived in OS 1.1.0. [#since] [s1]
- In arrange, `turn E3` or `click E3` switches sound link on or off for the selected track. [#toggle] [s2]
- While sound link is on, changing pattern leaves the track's sound and preset as they are; the sounds stored with the individual patterns are overridden. [#effect] [s2]
- The linked sound comes from one source pattern. To choose it, select that pattern with `turn E4`, then use `shift + turn E3` (or `shift + click E3`). [#source] [s2]
- OS 1.1.3 fixed a crash when deleting patterns on a track that used sound link. [#delete-fix] (since 1.1.3) [s3]

Procedures:
- Switch sound link on or off [#toggle] [s2]
  Needs: arrange mode; the track is selected
  1. `click E3` — turning `E3` also toggles it
- Choose which pattern's sound the link uses [#set-source] [s2]
  Needs: arrange mode; the track is selected
  1. `turn E4` — select the pattern whose sound you want
  2. `shift + turn E3` — `shift + click E3` works too

Related: [arrange.patterns], [arrange.overview]

Sources: s1 changelog:1.1.0 · s2 guide:arrange#sound-link · s3 changelog:1.1.3

### Scenes [arrange.scenes]
current · OS ≥ 1.0.9 · changed in 1.0.29, 1.0.45, 1.1.0 · guide v1.1.15
Also called: scene, select scene, scene 10-99, clone scene, copy scene, paste scene, reset scene
Where: modes arrange

A scene stores which pattern each track plays plus the mix; a project has 99. In arrange, shift and a black key select one, and shift + M1…M4 clone, copy, paste or reset.

A scene is a snapshot of the arrangement — one pattern choice per track plus the mix — so switching
scenes changes the whole project at once. Because an empty scene starts as a copy of the current one,
building a song is mostly "next scene, change a few patterns". Changes are immediate unless queued.

Facts:
- A project has 99 scenes. Each one remembers which pattern every track plays, together with the mix settings. [#what] [s1]
- A scene runs as long as its longest pattern. [#length] [s1]
- Since OS 1.1.0 a project setting picks how scene length is worked out; project files know three modes: longest (the default), shortest and time signature. [#length-modes] (since 1.1.0) (community-verified) [s2]
- Holding `shift` and pressing a black key selects scenes 1–9, each key standing for its printed digit. [#select] [s1]
- Scenes 10–99 start with `shift + accidental 0` (the last black key), followed by the scene number typed on the black keys. [#select-high] [s1]
- Selecting an empty scene fills it with a copy of the current one, so a song can grow scene by scene. [#empty] (since 1.0.29) [s1]
- `shift + M1` clones the current scene; `shift + M4` resets it, putting every track back on pattern 1. [#clone-reset] (since 1.0.29) [s1]
- `shift + M2` copies a scene and `shift + M3` pastes it into another. [#copy-paste] (since 1.0.45) [s1]
- Over MIDI, on any channel, CC85 selects a scene at once and CC83 and CC84 step to the previous and the next scene. [#midi] [s3]
- CC85 counts from zero, so value 0 selects scene 1 and value 98 scene 99. [#midi-zero] (community-verified) [s4]
- With `shift` held in arrange, the footer names `M1`…`M4` clone, copy, paste and reset, the scene actions. [#footer] (verified 1.1.33) [s5]

Procedures:
- Select scene 1–9 [#select] [s1]
  Needs: arrange mode
  1. `shift + accidental` — the black key with the scene's digit
- Select a scene from 10 to 99 [#select-high] [s1]
  Needs: arrange mode
  1. `shift + accidental 0 → + accidentals` — then type both digits; whether `shift` must stay down for them is not confirmed on a unit
- Copy one scene over another [#copy] (since 1.0.45) [s1]
  Needs: arrange mode; the scene to copy is selected
  1. `shift + M2` — copy
  2. `shift + accidental` — go to the target scene
  3. `shift + M3` — paste

Related: [arrange.scene-queue], [arrange.song-mode], [arrange.patterns], [mix.overview], [project.settings]

Sources: s1 guide:arrange#scenes · s2 note 10 · s3 guide:midi-references · s4 note 20 · s5 note 59

### Queued scene switching [arrange.scene-queue]
current · OS ≥ 1.1.0 · guide v1.1.15
Also called: queue scene, delayed scene switch, delayed scene, scene queue, cue next scene
Where: modes arrange

Scene changes normally happen at once; holding shift and tapping play before choosing a scene queues the change instead. The feature and its MIDI command (CC82) arrived in OS 1.1.0.

Jumping straight to a scene can land off the beat on stage. Queueing avoids that: tap `play` with
`shift` held before choosing the scene, and the change waits its turn; CC82 does the same over MIDI.
TE does not document when the queued scene takes over, and the scene-length setting (1.1.0) may play
a part.

Facts:
- OS 1.1.0 introduced delayed scene switching, together with a MIDI command that sets a delayed scene. [#since] [s1]
- Unless you queue it, a scene you select takes over immediately. [#default] [s2]
- To queue a scene, hold `shift`, tap `play`, then choose the scene with a black key while `shift` stays down. [#gesture] [s2]
- The guide does not say when a queued scene starts; community documentation has the MIDI version switch at the next bar. [#timing] (community) [s3]
- CC82, on any channel, sets the scene to switch to after a delay, where CC85 switches at once. [#midi] [s4]
- CC82 values 0–98 stand for scenes 1–99. [#midi-values] (community) [s3]

Procedures:
- Queue the next scene instead of switching at once [#queue] [s2]
  Needs: arrange mode
  1. `shift + play → + accidental` — keep shift held; the black key picks scenes 1–9
  Result: The chosen scene waits its turn instead of starting immediately.

Related: [arrange.scenes], [arrange.songs]

Sources: s1 changelog:1.1.0 · s2 guide:arrange#scenes · s3 note 20 · s4 guide:midi-references

### Song mode [arrange.song-mode]
current · OS ≥ 1.0.9 · changed in 1.0.29, 1.0.45, 1.1.0 · guide v1.1.15
Also called: song, song order, chain scenes, song arrangement, loop song, song editor
Where: modes arrange; screens song

Song mode chains scenes into a song order of up to 96 slots — dialled in with shift and the black keys, edited with a cursor, and set to loop or not with E1.

Song mode turns scenes into a finished structure — intro, verse, chorus — each scene playing for its
own length before the next. A cursor edits the list, and removing a scene from the song never
deletes it. Whether loop off is the stop-at-end option of 1.0.45 is not confirmed on a unit, nor how
the 32-slot grid shows an order longer than 32.

Facts:
- In arrange mode, `shift + arrange` opens song mode. [#enter] [s1]
- Holding `shift` and pressing black keys appends scenes to the song order one after another, much like keying in a phone number. [#add] [s1]
- Since OS 1.1.0, adding scenes and switching songs in song mode need `shift`. [#shift-needed] (since 1.1.0) [s2]
- A song order holds up to 96 scenes. [#max] (since 1.0.29) [s1]
- `shift + M2` and `shift + M3` move a cursor back and forth through the song order, so scenes can be inserted between others or removed. [#cursor] [s1]
- `shift + M4` takes the scene at the cursor out of the song; the scene itself stays in the project. [#delete] [s1]
- `shift + M1` empties the whole song order without deleting any scene. [#clear] [s1]
- OS 1.0.45 added the option of stopping playback when the song reaches its end. [#stop-at-end] (since 1.0.45) [s3]
- The song page is headed song 1 with a loop icon and shows a grid of 32 slots, eight across in four rows marked 1, 9, 17 and 25; scenes appear as numbered circles, a white line marks where the next scene goes, and a ring walks along the order during playback. [#screen] (verified 1.1.33) [s4]
- The box beside count at the top right shows how many scenes the song holds. [#count] (verified 1.1.33) [s4]
- The white cursor line shows only while `shift` is held, together with the lit footer. [#cursor-with-shift] (verified 1.1.33) [s4]
- During playback the playing scene wears a white ring with a small notch that goes round once while the scene plays; after stop the ring stays on the scene that was playing. [#ring] (verified 1.1.33) [s4]
- Holding `shift` lights the footer with clear all, ←, → and delete over `M1`…`M4`, the song editing keys. [#footer] (verified 1.1.33) [s4]

Procedures:
- Build a song from scenes [#build] [s1]
  Needs: arrange mode; the scenes exist
  1. `shift + arrange` — opens song mode
  2. `shift + accidentals` — add the scenes in playing order
- Insert a scene between two others [#insert] [s1]
  Needs: song mode
  1. `shift + M2/M3` — move the cursor to the insertion point
  2. `shift + accidental` — the scene to insert
- Take a scene out of the song [#delete] [s1]
  Needs: song mode
  1. `shift + M2/M3` — move the cursor to it
  2. `shift + M4`

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| song | `turn E1` | loop | off / on | – | – | when on, the song starts over from its first scene after the last one s1 |

Related: [arrange.songs], [arrange.scenes], [arrange.scene-queue]

Sources: s1 guide:arrange#song-mode · s2 changelog:1.1.0 · s3 changelog:1.0.45 · s4 note 59

### Multiple songs and cueing [arrange.songs]
current · OS ≥ 1.0.9 · changed in 1.0.29, 1.0.32 · guide v1.1.15
Also called: select song, copy song, paste song, 14 songs, cue scene, jump in song
Where: modes arrange; screens song

A project holds up to 14 songs, one per white key. In song mode shift and a white key select a song, M2 and M3 copy and paste it, and shift with minus or plus cues other scenes during playback.

Each white key holds a song, so one project can carry several arrangements of the same material — a
short and an extended version, or a whole set. Copying a song is the quickest start for a variant.
The guide does not say whether a cued jump waits for the current scene to finish.

Facts:
- A project can hold up to 14 songs, one for each white key. [#count] [s1]
- In song mode, `shift + natural` switches to the song stored on that white key. [#select] [s1]
- With `shift` and a song's white key held, `M2` copies that song and `M3` pastes the copied song onto it. [#copy-paste] (since 1.0.29) [s1]
- Since OS 1.0.32, leaving and re-entering song mode brings back the song you used last. [#remember] (since 1.0.32) [s2]
- While a song plays, `shift + [-]` and `shift + [+]` cue a different scene of the song order, which lets you skip ahead. [#cue] [s1]

Procedures:
- Switch to another song [#select] [s1]
  Needs: song mode
  1. `shift + natural`
- Copy one song onto another [#duplicate] (since 1.0.29) [s1]
  Needs: song mode
  1. `shift + natural + M2` — the white key of the song to copy
  2. `shift + natural + M3` — the white key of the target song
- Jump to another scene of the song while it plays [#cue] [s1]
  Needs: song mode; the song is playing
  1. `shift + [-]/[+]`

Related: [arrange.song-mode], [arrange.scene-queue]

Sources: s1 guide:arrange#song-mode · s2 changelog:1.0.32

## Mix

Levels, pans, sends, mute and solo, and the master EQ, saturator and compressor.

### Mix mode [mix.overview]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: mix, mixer, mixing, mixer mode, signal flow, master bus, master chain
Where: modes mix; screens M1, M2, M3, M4

Mix mode sets each track's level, pan and FX sends on M1 and runs the master chain — EQ on M2, saturator on M3, group levels, compressor and output level on M4.

Mix mode has four pages: `M1` is the channel strip of the selected track, and `M2`…`M4` work on the
master — EQ, saturator, then group levels, compressor and output. Tracks reach the mixer directly and
through their sends; the sum then runs through the master chain to the output. Scenes store track
levels and mutes, so a balance change can be part of the arrangement.

Facts:
- Mix mode is where you balance the project — levels, pans and FX sends per track, plus EQ and compression on the master. [#what] [s1]
- Pressing `mix` while already in mix mode flips between the instrument tracks and the auxiliary tracks; both can be mixed. [#toggle] [s2]
- A track key selects the track to adjust; instrument tracks light white and auxiliary tracks red. [#leds] [s2]
- Each scene stores every track's level and mute, so changing scene can change the balance too. [#per-scene] [s3]
- After the mixer, the summed signal passes through the EQ, then the saturator, then the compressor and limiter, and on to the main output. [#master-chain] [s4]
- A voice reaches the mixer directly and through its sends to the aux out, tape, FX I and FX II tracks, which feed the mixer as well. [#send-returns] [s4]
- In TE's signal flow diagram each send track can also feed the next — aux out into tape, tape into FX I, FX I into FX II. [#send-chain] [s4]

Procedures:
- Open mix mode [#enter] [s1]
  1. `mix`
- Switch mix between instrument and auxiliary tracks [#track-kind] [s2]
  Needs: mix mode
  1. `mix`

Related: [mix.levels-pans-sends], [mix.mute-solo], [mix.eq], [mix.saturator], [mix.master], [fx.overview], [arrange.scenes]

Sources: s1 guide:mix#arrange · s2 guide:mix#levels-pans-and-sends · s3 guide:workflow#patterns-scenes-songs-and-projects · s4 guide:mix#signal-flow-chart

### Levels, pans and sends [mix.levels-pans-sends]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: track level, track volume, volume, pan, panning, fx send, send level, channel strip
Where: modes mix; screens M1

On mix M1 the four encoders set the selected track's FX I send, FX II send, pan and level; clicking E3 centres the pan and clicking E4 mutes the track.

The `M1` page is a channel strip for the selected track: two send amounts, pan and level. The sends
decide how much of the track reaches the two FX tracks, so one reverb can serve the whole project.

Facts:
- `M1` in mix mode is the page for levels, pans and sends; a track key chooses which track the encoders adjust. [#page] [s1]
- Over MIDI, CC7 sets a track's level and CC10 its pan, each on the track's own channel (1–16). [#midi] [s2]
- On an instrument track's channel, CC38 and CC39 set its FX I and FX II sends — presumably the same values this page shows. [#midi-sends] (community) [s3]
- Instrument tracks repeat these sends on their `M3` shift layer, whose rows run aux out, tape, FX I, FX II from the top — FX I on `E3`, FX II on `E4`. TE's drawing of that page puts FX II above FX I; the device does not. [#track-send-page] (verified 1.1.33) [s4]
- The page draws eight columns, one per track, each with its number, a level line and a pan dot along the bottom; CC7 and CC10 sent over MIDI move them as they arrive. [#screen] (verified 1.1.33) [s5]
- Turning `E1` or `E2` briefly swaps the selected track's column for two boxed labels, I and II, each with a dark bar rising to its send level; after about a second the column comes back. [#send-display] (verified 1.1.33) [s5]
- Sending CC38 changes a track's FX I send without calling up that I and II display. [#cc38-quiet] (verified 1.1.33) [s5]

Procedures:
- Set a track's level [#set-level] [s1]
  1. `mix → M1`
  2. `Tn` — select the track
  3. `turn E4`
- Put a track back in the centre of the stereo field [#centre-pan] [s1]
  Needs: mix mode; M1; the track is selected
  1. `click E3`

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| M1 | `turn E1` | FX I send | – | – | – | share of the track sent to FX I s1 |
| M1 | `turn E2` | FX II send | – | – | – | share of the track sent to FX II s1 |
| M1 | `turn E3` | pan | – | – | 10 | stereo position s1 |
| M1 | `click E3` | centre pan | – | – | – | s1 |
| M1 | `turn E4` | level | – | – | 7 | track volume in the mix s1 |
| M1 | `click E4` | mute | – | – | – | mutes or unmutes the selected track s1 |

Related: [mix.overview], [mix.mute-solo], [fx.overview], [auxiliary.fx-sends], [instrument.track-sends]

Sources: s1 guide:mix#levels-pans-and-sends · s2 guide:midi-references · s3 note 20 · s4 note 59 · s5 note 59

### Mute and solo [mix.mute-solo]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: mute, unmute, solo, mute track, solo track, mute shortcut
Where: modes mix; screens M1

In mix mode, shift + a track key mutes or unmutes that track and holding track keys solos them; instrument or auxiliary + a track key is a quick mute, and CC9 mutes over MIDI.

`shift` shows the mute state on the track keys and toggles it; holding track keys solos them; and
`instrument` or `auxiliary` double as mute modifiers for their own group. A click on `E4` mutes the
selected track in arrange mode too. Mutes stop notes rather than cutting audio, so tails finish
naturally.

Facts:
- In mix mode, `shift + Tn` mutes that track, or unmutes it if it is muted. [#shift-mute] [s1]
- While `shift` is held in mix mode, unmuted tracks light up (white for instrument, red for auxiliary) and muted tracks stay dark. [#leds] [s1]
- A mute acts on a track's notes, not on its audio; no new notes start, while sound that is already playing rings out. [#notes-not-audio] [s1]
- On the mix `M1` page, `click E4` mutes the selected track. [#click] [s1]
- Holding one track key, or several at once, in mix mode solos those tracks. [#solo] [s1]
- Holding `instrument` and pressing a track key mutes or unmutes that instrument track; `auxiliary` does the same for the auxiliary tracks. [#shortcut] [s1]
- Over MIDI, CC9 on a track's channel sets its mute as a level rather than a toggle — 0 unmutes, any value from 1 to 127 mutes. [#midi] (verified 1.1.33) [s2]

Procedures:
- Mute or unmute a track [#mute] [s1]
  Needs: mix mode
  1. `shift + Tn`
- Solo one or more tracks [#solo] [s1]
  Needs: mix mode
  1. `hold Tn` — hold more track keys at the same time to solo several
- Mute a track with the mode-key shortcut [#quick-mute] [s1]
  1. `instrument/auxiliary + Tn` — the guide lists this under mix mode; whether it works in other modes is not confirmed

Related: [mix.levels-pans-sends], [mix.overview], [arrange.overview]

Sources: s1 guide:mix#levels-pans-and-sends · s2 note 90

### Master EQ [mix.eq]
current · OS ≥ 1.0.9 · changed in 1.1.15 · guide v1.1.15
Also called: eq, equalizer, equaliser, master equalizer, low mid high, eq blend
Where: modes mix; screens M2

Mix M2 is a three-band EQ on the master — low, mid, high — plus a blend that fades from flat to the set curve; clicking an encoder resets its band, and E4's click resets the whole EQ.

The blend control is the trick: set low, mid and high to an extreme curve — lows cut away for a
breakdown, say — keep blend at zero, and bring it up when the moment comes. At low blend values the
EQ stays neutral whatever the bands say, which makes sweeps quick and repeatable on stage.

Facts:
- The EQ on mix `M2` shapes the whole mix, not individual tracks. [#master] [s1]
- `E1`, `E2` and `E3` boost or cut the low, mid and high frequencies. [#bands] [s1]
- `E4` fades between a flat response and the band settings: low values leave the mix neutral, high values apply the boosts and cuts in full. [#blend] [s1]
- Clicking `E1`, `E2` or `E3` resets that band; clicking `E4` resets every EQ value. [#reset] (since 1.1.15) [s1]
- Over MIDI, CC90 moves the EQ bands, the channel choosing which — 1 low, 2 mid, 3 high. [#midi] (verified 1.1.33) [s2]
- CC90 on channel 4 changed nothing visible on the EQ page, so no MIDI control for blend is confirmed. [#midi-blend] (verified 1.1.33) [s2]
- The EQ page pictures the three bands as groups of panels standing on an isometric grid floor, next to a slider track with an N at one end. [#screen] (verified 1.1.33) [s2]
- Each band tilts its own group of panels, flat at the minimum and rising with the value to lean at about 60° at the maximum, never fully upright; in a new project all three bands sat at the middle value, 64. [#bands-drawn] (verified 1.1.33) [s2]
- Turning `E4` slides a knob along that track and reshapes the whole scene; as it travels, the low and high panels flatten and the mid panels stand up. [#blend-drawn] (verified 1.1.33) [s2]

Procedures:
- Open the master EQ [#open] [s1]
  1. `mix → M2`
- Flatten the EQ [#reset-all] (since 1.1.15) [s1]
  Needs: mix mode; M2
  1. `click E4`

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| M2 | `turn E1` | low | – | – | – | boost or cut the lows s1 |
| M2 | `turn E2` | mid | – | – | – | boost or cut the mids s1 |
| M2 | `turn E3` | high | – | – | – | boost or cut the highs s1 |
| M2 | `turn E4` | blend | – | – | – | flat at low values, full curve at high values s1 |
| M2 | `click E4` | reset all | – | – | – | flattens the whole EQ (since 1.1.15) s1 |

Related: [mix.overview], [mix.saturator], [mix.master]

Sources: s1 guide:mix#eq · s2 note 59

### Master saturator [mix.saturator]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: saturator, saturation, master saturation, clip, master drive, warmth
Where: modes mix; screens M3

Mix M3 is a saturator on the master bus; gain drives it, clip shaves off loud peaks, tone filters highs or lows and mix sets how much of it you hear.

The saturator adds density and warmth to the finished mix. Gain drives it, clip keeps peaks in check
and tone tilts the result darker or brighter; mix blends it with the clean signal, so heavy settings
work in small doses. It sits after the EQ and before the compressor.

Facts:
- The saturator on mix `M3` works on the master, so it colours the whole mix. [#master] [s1]
- Clip (`E2`) flattens the loudest peaks, reining in the dynamics. [#clip] [s1]
- Mix (`E4`) sets how much of the saturated signal you hear in the master. [#mix] [s1]
- No MIDI CC is known for the master saturator. [#no-cc] (community) [s2]
- The saturator page shows four vertical tick ladders — gain, clip, tone and mix from left to right — each topped by a cap in its encoder's style. [#screen] (verified 1.1.33) [s3]

Procedures:
- Open the master saturator [#open] [s1]
  1. `mix → M3`

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| M3 | `turn E1` | gain | – | – | – | level driven into the saturator s1 |
| M3 | `turn E2` | clip | – | – | – | trims loud peaks s1 |
| M3 | `turn E3` | tone | – | – | – | filters out highs or lows s1 |
| M3 | `turn E4` | mix | – | – | – | amount of saturation in the master s1 |

Related: [mix.overview], [mix.eq], [mix.master], [fx.distortion]

Sources: s1 guide:mix#saturator · s2 note 20 · s3 note 59

### Master groups, compressor and output [mix.master]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: master, master level, output level, compressor, master compressor, percussion group, melodic group, limiter
Where: modes mix; screens M4

Mix M4 sets the levels of the percussion and melodic groups, how much the master bus is compressed and the master level that feeds the output limiter.

The master page is the last stop before the output. The two group levels balance drums against
everything else without touching single tracks; the compressor glues the mix or flattens it for a
heavier sound; and the master level pushes the result into the limiter that guards the output.

Facts:
- Every engine is routed to one of two groups automatically — percussive engines such as the drum sampler to the percussion group, the synth engines and the sampler to the melodic group. [#groups] [s1]
- `E3` compresses the master bus. Light settings even out loud and quiet moments; heavy settings squash the mix into a denser, harder-hitting sound. [#compressor] [s1]
- `E4` raises the master level on its way into the output limiter. [#limiter] [s1]
- No MIDI CC is known for the group levels or the compressor. [#no-cc] (community) [s2]
- The master page shows the percussion and melodic levels as large numbers, a tall bar in the middle that `E3` shortens, and a VU meter from −20 to +3 above the word master. [#screen] (verified 1.1.33) [s3]

Procedures:
- Open the master page [#open] [s1]
  1. `mix → M4`

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| M4 | `turn E1` | percussion | – | – | – | level of the percussion group s1 |
| M4 | `turn E2` | melodic | – | – | – | level of the melodic group s1 |
| M4 | `turn E3` | compressor | – | – | – | amount of master-bus compression s1 |
| M4 | `turn E4` | master level | – | – | – | drive into the output limiter s1 |

Related: [mix.overview], [mix.saturator], [mix.eq]

Sources: s1 guide:mix#master · s2 note 20 · s3 note 59

## Project

Creating, saving and organising projects, templates and project settings.

### Project view — new, save, rename [project.project-view]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: project page, new project, create project, save project, save as, rename project, project name
Where: screens project

The project key opens the project view, where you create a new project (hold M1), save (M2), save as (shift + M2), rename (M3) and open the project settings (M4).

The project view is the home of the current project: its name, the save keys and the way into its
settings. Other projects are opened from the projects folder (`shift + project`), not from here.

Facts:
- `project` opens the project view of the project you are working on. [#enter] [s1]
- `hold M1` in the project view creates a new project, saving your work automatically when autosave is on. [#new] [s2]
- A new project starts with drums on tracks 1 and 2, then bass, pluck, lead, soft pluck, strings and pad on tracks 3–8. [#new-sounds] [s3]
- `M2` saves the project and stores a version of it. [#save] [s2]
- `shift + M2` saves a copy under a new name you type in. [#save-as] [s2]
- `M3` renames the project: `turn E1` picks the character position and `turn E2` changes the character. [#rename] [s2]
- In the naming screen, `M1` confirms, `M2` moves on to the next character, `M3` cancels and `M4` deletes. [#rename-keys] [s4]
- `M4` opens the project settings, which are separate from the system settings. [#config] [s2]

Procedures:
- Start a new project [#new] (verified 1.1.33) [s5]
  1. `project`
  2. `hold M1`
  Result: A new project opens with the default sounds.
- Save the project as a copy with a new name [#save-as] [s2]
  1. `project → shift + M2`
  2. `turn E1` — character position
  3. `turn E2` — character
  4. `M1` — confirm

Related: [project.versions-and-autosave], [project.projects-folder], [project.settings], [basics.patterns-scenes-songs]

Sources: s1 guide:project#project · s2 guide:project#rename · s3 guide:get-started#4.%20get%20started · s4 guide:instrument#view-and-create-preset · s5 note 90

### Autosave, versions and history [project.versions-and-autosave]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: autosave, auto save, versions, history, undo project, older version, backups folder, workspace
Where: screens project, projects folder

Projects save themselves by default, and every save or autosave is kept in the project's history, so you can go back and load an older state.

The history is a safety net for experiments: if a drastic change fails, load the version from before.

Facts:
- Autosave is on by default; switching it off in the project or system settings leaves only manual saves. [#default] [s1]
- Each manual save (`M2` in the project view) also adds a version to the project's history. [#save-version] [s1]
- The history keeps every save and autosave, so older states can be loaded and heard; `M2` in the projects folder opens it for the selected project. [#history] [s2]
- Versions and autosaves carry the date and time from the clock page of the system settings. [#timestamps] [s3]
- On a computer (over MTP), the history files sit in a backups folder beside your projects; to back up one project, copy its file together with its history folder. [#backups-folder] [s4]
- Over MTP the unit also shows projects/workspace.xy; on the owner's unit it held the project that was open. [#workspace] (verified 1.1.33) [s5]

Procedures:
- Save the project and add a version [#save] [s1]
  1. `project → M2`
- Go back to an older version of a project [#history] [s2]
  1. `shift + project` — select the project in the projects folder
  2. `M2` — opens its history; pick a version and load it

Related: [project.project-view], [project.projects-folder], [hardware.power-and-charging]

Sources: s1 guide:project#rename · s2 guide:project#project-folder · s3 guide:com#system-settings · s4 guide:how-to#how-to-back-up-your-projects · s5 note 90

### Projects folder — load, duplicate, delete [project.projects-folder]
current · OS ≥ 1.0.9 · changed in 1.1.25 · guide v1.1.15
Also called: project browser, project list, open project, load project, duplicate project, delete project, subfolders
Where: screens projects folder

Shift + project opens the projects folder with factory projects, your projects, templates and autosaves; from there you load, duplicate, delete or view the history of a project.

The projects folder is the unit's file browser for projects. Mind the soft-key labels on screen:
TE's text and drawing disagree about which end holds load and delete, and deleting is permanent.

Facts:
- `shift + project` opens the projects folder, which lists factory projects, your projects, the templates folder and autosaves. [#open] [s1]
- `M1` loads the selected project. [#load] [s1]
- `M2` shows the history of the selected project. [#history] [s1]
- Duplicate copies a whole project with its patterns, scenes and tracks; the guide's text gives it `M2` like history, but its drawing puts duplicate on the third key, so it is most likely `M3`. [#duplicate] (derived) [s2]
- `hold M4` deletes the selected project. [#delete] [s1]
- The guide's drawing of this screen labels the keys delete, history, duplicate, load from left to right, the reverse of the text for M1 and M4; check the labels on your screen. [#label-order] (conflicting) [s2]
- Subfolders made over MTP appear with their names in square brackets; clicking any encoder opens one. [#subfolders] [s1]
- Since OS 1.1.25 a duplicate includes changes that were not saved yet. [#unsaved] (since 1.1.25) [s3]
- Over MTP your projects live in projects/user. [#mtp-path] (verified 1.1.33) [s4]

Procedures:
- Open another project [#load] [s1]
  1. `shift + project`
  2. `turn E1…E4` — select the project
  3. `M1`
- Delete a project [#delete] [s1]
  1. `shift + project`
  2. `hold M4` — with the project selected

Related: [project.project-view], [project.versions-and-autosave], [project.templates]

Sources: s1 guide:project#project-folder · s2 note 50 · s3 changelog:1.1.25 · s4 note 90

### Project templates [project.templates]
outdated-in-guide · OS ≥ 1.1.15 · changed in 1.1.17 · guide v1.1.15
Also called: template, templates folder, default project, starting point, make default
Where: screens projects folder

Templates are projects to start from, kept in the templates folder of the projects folder and managed from a computer over MTP; since OS 1.1.17 one can be made the default.

A template saves setting up the same tracks, sounds and settings for every new idea. Save your work
under a new name, since neither TE source says how a template is protected from being overwritten.

Facts:
- The projects folder has a templates folder for projects meant as starting points. [#what] [s1]
- Project templates arrived with OS 1.1.15. [#since] [s2]
- Your own templates are created and loaded with a computer over MTP. [#mtp] [s1]
- Over MTP the folder is projects/templates. [#path] (verified 1.1.33) [s3]
- Copying a project file into that folder should make it a template; the guide implies this but it is not confirmed on a unit. [#copy-in] (derived) [s1]
- OS 1.1.17 added a make default option for templates. [#make-default] (since 1.1.17) [s4]
- Presumably new projects then start from the default template; the changelog gives no details. [#default-meaning] (since 1.1.17) (derived) [s4]

Procedures:
- Start from a template [#load] [s1]
  1. `shift + project` — the templates folder sits next to the factory and user projects
  2. `M1` — loads the selected template

Related: [project.projects-folder], [project.project-view]

Sources: s1 guide:project#project-folder · s2 changelog:1.1.15 · s3 note 90 · s4 changelog:1.1.17

### System usage indicators (voices, CPU, sample memory) [project.system-usage-indicators]
outdated-in-guide · OS ≥ 1.1.15 · changed in 1.1.25, 1.1.32 · guide v1.1.15
Also called: voice count, voice stealing, cpu meter, cpu overload, sample memory, crackles, dropouts

Three small icons warn when a project runs out of room — voice count, CPU load and sample memory — and turn red when the limit is hit.

When a voice icon turns red, notes are being cut to make room for new ones. Give important tracks
fixed voices in the project settings, shorten release times or thin out chords; for CPU and sample
memory, use fewer heavy tracks or shorter samples.

Facts:
- Heavy projects can bring up three icons on screen, for voice count, CPU and sample memory. [#three] [s1]
- The voice icon shows how many of the 24 voices are busy and appears only from 17 voices up. [#voices] [s1]
- The guide says the voice icon flashes red when a voice is stolen. [#stealing] [s1]
- OS 1.1.25 reworked the stealing indicator so it reports every audible voice steal. [#stealing-rework] (since 1.1.25) [s2]
- The CPU icon appears above 70 % load and flashes red at 100 %. [#cpu] [s1]
- Before OS 1.1.32 the CPU overload warning could miss some stalls. [#cpu-fix] (since 1.1.32) [s3]
- The sample memory icon appears while samples load and when more than 70 % of sample memory is in use. [#sample-memory] [s1]

Related: [project.settings], [project.project-view]

Sources: s1 guide:project#system-usage-indicators · s2 changelog:1.1.25 · s3 changelog:1.1.32

### Project settings [project.settings]
current · OS ≥ 1.0.9 · changed in 1.1.0, 1.1.3 · guide v1.1.15
Also called: project config, configure project, time signature, voices, polyphony, voice allocation, scene length
Where: screens project

M4 in the project view opens the project's own settings — general (transpose), tempo (time signature, groove type), voices and midi — edited with E1 page, E2 setting, E3 value.

Anything stored here travels with the project, unlike the system settings in `com → M1`, which
apply to the whole unit. The general and midi pages have their own units.

Facts:
- `M4` in the project view opens the project settings, which belong to the project and are separate from the system settings. [#open] [s1]
- `turn E1` picks the page (general, tempo, voices, midi), `turn E2` a setting on it and `turn E3` or `turn E4` its value; `M1` leaves. [#navigate] [s2]
- The tempo page sets the time signature — 3/4, 4/4 or 5/4, or 6/8, 7/8 or 12/8 — and shows the groove type, which can be changed there too. [#time-signature] [s2]
- The voices page shares out the 24 voices; allocation is automatic by default, and giving a track its own voices gives it priority. [#voices] [s2]
- Since OS 1.1.0 a project setting chooses how scene length is calculated; the guide does not describe it. [#scene-length] (since 1.1.0) [s3]
- One of its modes is called time signature; OS 1.1.3 repaired it. [#scene-length-mode] (since 1.1.3) [s4]

Procedures:
- Change a project setting [#change] [s2]
  1. `project → M4`
  2. `turn E1` — choose the page
  3. `turn E2` — choose the setting
  4. `turn E3` — set the value
  5. `M1` — leave the project settings

Related: [project.transpose], [project.midi-channels], [project.system-usage-indicators], [tempo.grooves]

Sources: s1 guide:project#rename · s2 guide:project#project-settings · s3 changelog:1.1.0 · s4 changelog:1.1.3

### Global (project) transpose [project.transpose]
outdated-in-guide · OS ≥ 1.0.9 · changed in 1.1.21, 1.1.25 · guide v1.1.15
Also called: transpose, global transpose, project transpose, change key, key of the song
Where: screens project

The general page of the project settings transposes the whole project, for example to match other music. Whether drums follow is unclear, and OS 1.1.21 simplified the setting.

Global transpose is a set-and-forget offset for the whole project. Because TE changed it after the
guide was written, check the screen for the current options, and listen to the drums after
changing it.

Facts:
- The general page of the project settings shifts the pitch of every note in the project, useful for matching the key of other music. [#what] [s1]
- Whether drums follow is unclear — the guide says they do, while the OS 1.0.9 notes say global transpose no longer applies to drums; not yet checked on a unit. [#drums] (conflicting) [s2]
- OS 1.1.21 simplified the global transpose without saying how. [#simplified] (since 1.1.21) [s3]
- OS 1.1.25 improved how multisampled sounds respond to global transpose. [#multisamples] (since 1.1.25) [s4]
- To follow a key live, or transpose only chosen tracks, use the brain track in auxiliary mode instead. [#brain] [s5]

Procedures:
- Transpose the whole project [#transpose] [s1]
  1. `project → M4`
  2. `turn E1` — general page
  3. `turn E2` — the transpose setting
  4. `turn E3` — set the amount

Related: [project.settings]

Sources: s1 guide:project#project-settings · s2 changelog:1.0.9 · s3 changelog:1.1.21 · s4 changelog:1.1.25 · s5 guide:auxiliary#brain

### Track MIDI channels (project) [project.midi-channels]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: midi channels, track channels, midi out channel, send notes over midi, sequence external gear
Where: screens project

The midi page of the project settings gives each of the 16 tracks a MIDI channel, which it needs before its sequenced notes go out over MIDI.

These channels are per project. The unit-wide MIDI switches — clock, notes and other messages in
and out — live in the system settings, and both have to allow a message before it leaves.

Facts:
- The midi page of the project settings assigns a MIDI channel to each of the 16 tracks, for example to sequence external MIDI gear. [#page] [s1]
- In a fresh project every track's channel is off, according to decoded OS 1.1.4 project files. [#fresh-off] (community) [s2]
- A track sends its sequenced notes over MIDI only once it has a channel here and notes output is allowed in the MIDI settings. [#send] (community) [s3]
- Incoming notes and CCs on channel N reach track N by default, channels 9–16 being the auxiliary tracks. [#receive] (community-verified) [s4]
- Whether a channel set here also changes what the track receives is not known yet. [#open-question] (speculative) [s2]

Procedures:
- Give a track a MIDI output channel [#assign] [s1]
  1. `project → M4`
  2. `turn E1` — midi page
  3. `turn E2` — the track
  4. `turn E3` — the channel

Related: [project.settings], [com.midi-settings]

Sources: s1 guide:project#project-settings · s2 note 20 · s3 note 20 · s4 note 20

## Tempo

Tempo, tap tempo, grooves, swing and the metronome.

### Tempo, tap tempo and metronome [tempo.tempo-screen]
current · OS ≥ 1.0.9 · guide v1.1.15 · verified on 1.1.33
Also called: bpm, tempo, tap tempo, metronome, click, speed, change tempo
Where: screens tempo

The tempo key opens the tempo screen from anywhere; tap it to set the tempo by ear. E1 sets BPM, E2 and E3 the groove, E4 the metronome level (click to switch the metronome on or off).

Tempo and groove are saved with each project, so every project keeps its own speed and feel. The
groove settings on E2 and E3 are explained under grooves.

Facts:
- `tempo` opens the tempo screen from any screen. [#open] [s1]
- Tapping `tempo` repeatedly in time with the music sets the tempo. [#tap] (verified 1.1.33) [s2]
- `turn E4` sets the metronome volume and `click E4` switches the metronome on or off. [#metronome] [s3]
- Over MIDI, CC80 on any channel sets the tempo; on OS 1.1.33 the result is twice the value in BPM, held within 40–220, so only even tempos can be sent. [#cc80] (verified 1.1.33) [s4]
- A new empty project on the owner's unit ran at 120 BPM. [#new-project] (verified 1.1.33) [s4]
- The tempo page has a light background, the BPM as a large number on the left and a metronome in the middle carrying the groove type's two-letter abbreviation. [#screen] (verified 1.1.33) [s2]
- The metronome's weight slides down its arm as the tempo rises, from the top at 40 BPM to the bottom at 220. [#weight] (verified 1.1.33) [s2]
- The speaker icon at the top right loses its sound waves as `E4` turns the metronome down. [#speaker] (verified 1.1.33) [s2]
- While the sequencer plays, the pendulum swings from one end to the other on every beat, and the beat's dot below it lights; stopped, it rests at the left end with no dot lit. [#pendulum] (verified 1.1.33) [s2]
- The swinging pendulum looks smeared, as if it left trails; the copies come from the screen's slow response rather than being drawn. [#smear] (derived) [s2]

Procedures:
- Set the tempo by tapping [#tap] [s1]
  1. `tempo → tempo → tempo → tempo` — tap in time with the beat
- Switch the metronome on or off [#metronome] [s3]
  1. `tempo → click E4`

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| tempo | `turn E1` | tempo | – | – | 80 | song tempo in BPM s3 |
| tempo | `turn E2` | groove type | – | – | – | the style of swing (see grooves) s3 |
| tempo | `turn E3` | groove amount | – | – | – | right of centre adds swing, left of centre adds shuffle s3 |
| tempo | `turn E4` | metronome level | – | – | – | s3 |
| tempo | `click E4` | metronome on/off | – | – | – | s3 |

Related: [tempo.grooves], [com.midi-settings]

Sources: s1 guide:tempo#project · s2 note 59 · s3 guide:tempo#edit-tempo · s4 note 90

### Grooves, swing and shuffle [tempo.grooves]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: groove, swing, shuffle, groove type, groove amount, humanize, feel, half shuffle, bombora, gaussian, island nod, danish, disfunk, roll over, prophetic
Where: screens tempo, bar

A groove shifts the timing and velocity of sequenced notes to change the feel. Pick one of eleven types with E2 on the tempo screen and dial swing or shuffle with E3; the bar menu can override the amount per track.

Start with shuffle and a little swing, then try the other types on the same pattern; give a single
track its own amount in the bar menu.

Facts:
- A groove changes the feel of the sequencer by moving the timing of notes and changing their velocity. [#what] [s1]
- Grooves also vary timing and velocity slightly at random, so the swing sounds less mechanical. [#human] [s1]
- On the tempo screen, `turn E3` clockwise past the centre for swing or anticlockwise for shuffle; the two push notes in opposite directions. [#amount] [s2]
- `turn E2` on the tempo screen picks the groove type, in this order: shuffle, half shuffle, danish, bombora, wobbly, gaussian, accents, island nod, disfunk, roll over and prophetic. The metronome shows each as two letters — SH, HS, DA, BO, WO, GA, AC, IN, DF, RO, PR. [#types] (verified 1.1.33) [s3]
- Shuffle is the everyday swing and half shuffle a lighter version of it; accents emphasises the important beats. [#plain-types] [s1]
- Bombora breaks up the beats on 2 and 4, and wobbly deliberately loosens the timing for a funkier, messier feel. [#wild-types] [s1]
- TE describes gaussian and island nod only in jokes, so judge them by ear. [#joke-types] [s1]
- The online guide leaves out four types. Danish relaxes the beat, disfunk turns funky one way and groovy the other, and roll over gives a slow, lazy hip-hop feel. TE gives prophetic no description at all. [#extra-types] [s4]
- `bar + turn E3` sets a groove amount for the current track that replaces the tempo screen's swing value; the groove type still comes from the tempo screen. [#per-track] [s5]
- Over MIDI, CC81 sets the groove amount, drawn as a slider under the metronome on the tempo page — far left at 0, centred at 64, far right at 127. [#cc81] (verified 1.1.33) [s3]
- Community MIDI tables give 63 as the no-groove value, one below the slider's centre at 64; which of the two is exactly neutral is not confirmed. [#cc81-neutral] (community) [s6]

Procedures:
- Add swing to the whole project [#swing] [s2]
  1. `tempo`
  2. `turn E2` — choose the groove type
  3. `turn E3` — clockwise past the centre for swing, anticlockwise for shuffle

Related: [tempo.tempo-screen], [project.settings]

Sources: s1 guide:tempo#what-are-grooves · s2 guide:tempo#edit-tempo · s3 note 59 · s4 note 40 · s5 guide:sequencer#extend-with-bar · s6 note 20

## Connectivity

The com hub: system settings, MIDI settings and monitor, controller mode, devices, MTP, multi-out and the MIDI CC reference.

### The com page [com.overview]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: com, com menu, com screen, connections, connectivity, com key
Where: screens com

`com` opens the connection hub. Its main page handles bluetooth MIDI and the multi-out jack; the four module keys lead to system settings, controller mode, connected devices and MTP file transfer.

Think of `com` as the OP-XY's patch bay and system menu in one. The main page itself only holds
bluetooth MIDI (`E1`) and the multi-out setting (`E3`); everything else is one module key away.

Two sections change how the unit behaves until you leave them: controller mode turns the panel into
a MIDI controller, and MTP mode takes the USB MIDI connection away while files move.

Facts:
- `com → M1` opens the system settings: screen, keyboard, MIDI, clock, pitchbend, battery and the MIDI monitor. [#m1] [s1]
- `com → M2` switches to MIDI controller mode, where keys and encoders send MIDI to a computer or other gear. [#m2] [s1]
- `com → M3` lists the MIDI devices connected right now, each with its own send and receive switches. [#m3] [s1]
- `com → M4` starts MTP mode, used to copy samples, presets and projects between the unit and a computer. [#m4] [s1]
- On the com page itself, `E1` makes the unit visible to bluetooth MIDI hosts and `E3` chooses what the multi-out jack carries. [#main-page] [s2]

Procedures:
- Go to one of the four com sections [#section] [s1]
  1. `com → M1…M4` — system settings, controller mode, devices or MTP

Related: [com.system-settings], [com.controller-mode], [com.devices], [com.mtp], [com.multi-out], [com.usb]

Sources: s1 guide:com · s2 guide:com#setting-the-multi-out-port-and-bluetooth-midi

### System settings [com.system-settings]
outdated-in-guide · OS ≥ 1.0.9 · changed in 1.1.17 · guide v1.1.15
Also called: settings, system menu, preferences, brightness, power-off type, date and time, detune
Where: screens system settings

Device-wide options behind `com → M1`, in sections: system (brightness, country, power-off), keyboard (velocity, detune), midi, clock, pitchbend calibration, battery and the MIDI monitor.

Most options here are set once: brightness, country, the date used to stamp files and how the unit
powers off. Two sections matter for playing — keyboard, where velocity is switched on and keys can
be detuned, and pitchbend, where you recalibrate the strip when bends feel lopsided. The midi and
monitor sections have units of their own.

Facts:
- In the system settings `E1` picks a section, `E2` a setting within it and `E3` (or `E4`) its value; `M1` goes back to the com page. [#navigate] [s1]
- The system section holds screen brightness, LED brightness, country and whether switching off happens at once or after a delay, which guards against powering down by accident mid-performance. [#system] [s1]
- The keyboard section sets how the built-in keys respond to velocity and can detune them, by notes and by cents, for microtonal scales. [#keyboard] [s1]
- The clock section holds the date and time that the unit stamps on snapshots, autosaves and project versions. [#clock] [s1]
- The pitchbend section calibrates the strip — `E2` sets the sensitivity of its left side, `E3` of its right side, and `M4` runs the calibration. [#pitchbend] [s1]
- The battery section shows the charge level and the input current limit. [#battery] [s1]
- OS 1.1.17 added a system setting for sample preview, which the guide does not list. [#sample-preview] (since 1.1.17) [s2]

Procedures:
- Calibrate the pitchbend strip [#calibrate-pitchbend] [s1]
  1. `com → M1`
  2. `turn E1` — pitchbend section
  3. `turn E2/E3` — left and right sensitivity
  4. `M4` — starts the calibration; follow the screen

Related: [com.midi-settings], [com.midi-monitor], [howto.enable-velocity]

Sources: s1 guide:com#system-settings · s2 changelog:1.1.17

### MIDI settings [com.midi-settings]
current · OS ≥ 1.0.9 · changed in 1.0.15, 1.0.29, 1.1.15 · guide v1.1.15
Also called: midi setup, midi clock settings, clock in, clock out, midi echo, midi thru, active track channel, transport sync
Where: screens com, system settings

The midi section of the system settings sets, separately for clock, notes and everything else, whether the OP-XY listens, transmits or does both; it also picks the channel that always plays the selected track and switches echo on or off.

The midi section is where the OP-XY decides how it talks to other gear. Clock, notes and "other"
(every remaining message type, such as control changes) each get a direction, so the unit can, say,
take notes from a keyboard while ignoring its clock. The active track channel is a shortcut for playing
the OP-XY from a controller: whatever arrives on that channel plays the track you have selected.

Out of the box the unit only listens for clock (clock in), so it sends no start, stop or clock of
its own. Switching clock to both makes it a sync source: `play` and `stop` send start and stop, and
the tick stream runs continuously. This app suggests clock both during setup so it can follow the
unit's transport and tempo.

When a connection misbehaves, open the monitor page first: it shows whether a message reached the
OP-XY at all. Per-device switches live separately in `com → M3`.

Facts:
- The MIDI options are one section of the system settings, reached with `com → M1`. [#location] [s1]
- The section has five settings: clock, notes, other (every remaining message type), active track channel and midi echo. [#five-settings] [s1]
- Notes arriving on the active track channel play whichever track is currently selected. [#active-track] [s1]
- On a unit with stock settings (OS 1.1.33) the section reads: clock in, notes both, other both, active track channel 1, midi echo off. [#stock-values] (verified 1.1.33) [s2]
- Clock, notes and other each take a direction; in (receive only) and both (receive and send) are confirmed on OS 1.1.33. [#directions] (verified 1.1.33) [s2]
- Community tools also describe out (send only) and off for these three settings. [#more-directions] (community) [s3]
- With clock set to in, pressing `play` or `stop` sends nothing — no start, no stop, no clock ticks. [#clock-in-silent] (verified 1.1.33) [s2]
- With clock set to both, every press of `play` sends a MIDI start (FA) — a press during playback sends another start — and `stop` sends a MIDI stop (FC). No continue (FB) or song position (F2) messages were seen. [#clock-both-transport] (verified 1.1.33) [s2]
- With clock set to both, clock ticks (F8, 24 per quarter note) stream all the time, even while stopped. [#clock-both-ticks] (verified 1.1.33) [s2]
- With clock set to both, a start (FA) or stop (FC) from a computer starts or stops playback, and the unit sends the message back out. [#transport-in] (verified 1.1.33) [s2]
- Software that follows the OP-XY's play state and tempo over USB, this app included, needs clock set to both. [#follow-apps] (derived) [s2]
- Even with midi echo off, a universal identity request (SysEx) sent to the unit came back on its output; what forwards it is not known yet. [#sysex-returns] (verified 1.1.33) [s2]
- OS 1.0.15 fixed the echo setting being ignored for notes from linked tracks. [#echo-linked] (since 1.0.15) [s4]
- Start and stop received from one device are passed on to the other connected MIDI devices. [#transport-relay] (since 1.0.29) [s5]
- A monitor page in the same settings lists whatever MIDI arrives — channel, value, clock and SysEx — which tells a message that never arrived from one that arrived but was ignored. [#monitor] (since 1.1.15) [s6]
- Switches for what is sent to and received from each connected device live separately, under `com → M3` (devices). [#per-device] [s7]

Procedures:
- Open the MIDI settings [#open] [s1]
  1. `com → M1` — system settings
  2. `turn E1` — choose the midi section
- Change one MIDI setting [#change] [s1]
  Needs: the midi section is open
  1. `turn E2` — pick the setting
  2. `turn E3` — set its value (`turn E4` works too)
- Make the OP-XY send transport and clock over MIDI [#send-clock] (verified 1.1.33) [s2]
  1. `com → M1`
  2. `turn E1` — midi section
  3. `turn E2` — clock
  4. `turn E3` — both
  Result: `play` and `stop` now send start and stop, and clock ticks run continuously.
- Leave the system settings [#leave] [s1]
  1. `M1`
  Result: Back on the com page.

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| system settings | `turn E1` | section | – | – | – | system, keyboard, midi, clock, pitchbend, battery, monitor s1 |
| system settings | `turn E2` | setting | – | – | – | the setting within the section s1 |
| system settings | `turn E3` | value | – | – | – | s1 |
| system settings | `turn E4` | value | – | – | – | same as E3 s1 |

Related: [com.midi-monitor], [com.devices], [com.midi-cc-reference], [hardware.layout]

Sources: s1 guide:com#system-settings · s2 note 90 · s3 note 20 · s4 changelog:1.0.15 · s5 changelog:1.0.29 · s6 guide:com#midi-monitor · s7 guide:com#devices

### MIDI monitor [com.midi-monitor]
current · OS ≥ 1.1.15 · guide v1.1.15
Also called: monitor, monitor page, incoming midi, midi activity, midi debug, check midi input
Where: screens system settings

A section of the system settings that lists incoming MIDI from any connected device — each message with its channel and value, plus clock and SysEx — so you can check that gear sends what you expect.

When a controller seems to do nothing, the monitor settles the first question: did anything arrive?
If messages show up here but the OP-XY ignores them, look at the midi section (is notes or other set
to receive?) and at the device's own switches under `com → M3`. If nothing shows up, suspect the
cable, the connection or the sending device first.

Facts:
- The monitor shows MIDI as it arrives from any connected device, with the channel and value of each message. [#what] [s1]
- Incoming clock and SysEx appear on the monitor as well. [#clock-sysex] [s1]
- The monitor is a troubleshooting aid — confirming that a keyboard, computer or sequencer really sends the messages you expect before you change any settings. [#purpose] [s1]
- The monitor was added to the system settings in OS 1.1.15. [#since] [s2]

Procedures:
- Watch incoming MIDI [#open] [s1]
  1. `com → M1`
  2. `turn E1` — scroll to the monitor section
  Result: Messages from connected devices appear as they arrive.

Related: [com.midi-settings], [com.devices], [com.system-settings]

Sources: s1 guide:com#midi-monitor · s2 changelog:1.1.15

### Connected MIDI devices [com.devices]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: devices, device list, midi devices, forget device, per-device settings, midi routing per device
Where: screens devices

`com → M3` lists the MIDI devices connected to the OP-XY; for each one you switch what it may send to the unit and receive from it, or forget it.

The devices page refines the midi settings per connection: use it when one device should be treated
differently — say, taking notes from a keyboard while ignoring its clock. `M1` returns to com. If a
device misbehaves, the MIDI monitor shows whether its messages arrive at all.

Facts:
- The devices page lists the MIDI devices connected to the OP-XY and lets you enable or disable individual inputs and outputs for each of them. [#what] [s1]
- Per device you can switch clock, notes, other messages (CCs and similar), timestamp and velocity. [#switches] [s2]
- Community tools also describe a second page with a transport receive switch that must be on for start and stop from that device. [#transport-page] (community) [s3]
- USB MIDI gear plugged into the OP-XY's USB-C port shows up here, which is where you decide what data goes to and comes from it. [#usb-gear] [s4]
- `M2` forgets the selected device and removes it from the list. [#forget] [s1]
- A computer running this app should keep clock, notes and other enabled in its entry, or the app cannot follow or play the unit. [#computer] (derived) [s3]

Procedures:
- Change what one device may send or receive [#edit] [s1]
  1. `com → M3`
  2. `turn E1` — choose the device
  3. `turn E2` — choose the setting
  4. `turn E3` — set the value (`turn E4` works too)
- Remove a device from the list [#forget] [s1]
  1. `com → M3`
  2. `turn E1` — choose the device
  3. `M2`

Related: [com.midi-settings], [com.midi-monitor], [com.usb], [howto.midi-keyboard]

Sources: s1 guide:com#devices · s2 guide:how-to#how-to-control-op-xy · s3 note 20 · s4 guide:how-to#how-to-control-a-synth-with-midi

### USB connections [com.usb]
current · OS ≥ 1.0.9 · changed in 1.1.32 · guide v1.1.15
Also called: usb, usb-c, usb midi, usb audio, usb host, class compliant, powered hub

The USB-C port works both ways. A computer sees a driverless audio and MIDI device; as a host the OP-XY accepts class-compliant MIDI gear and audio interfaces plugged into it.

With a computer, one cable carries MIDI and audio in both directions — this app uses it to play and
hear the OP-XY. With other gear, the OP-XY is the host.

Facts:
- The USB-C port carries audio and MIDI as a USB device (to a computer) and as a USB host (for gear plugged into the OP-XY). [#both-ways] [s1]
- A computer sees the OP-XY as a class-compliant USB audio and MIDI device, so no driver is needed; its one MIDI input and one MIDI output are both named OP-XY. [#class-compliant] (verified 1.1.33) [s2]
- The computer can record the OP-XY's output as a stereo USB audio input at 44.1 kHz and 16 bit. [#audio-to-computer] (verified 1.1.33) [s3]
- The USB link also offers an audio stream from the computer into the OP-XY; that it arrives as the external audio track's usb audio input is likely but not confirmed. [#audio-from-computer] (verified 1.1.33) [s2]
- USB MIDI keyboards, controllers and synths plug straight into the OP-XY through a USB-C cable or adapter, with no computer involved; a powered hub helps gear that needs more power. [#host-gear] [s4]
- Audio interfaces work when they are USB audio class 1 or 2 compliant; ones that need a driver may not. [#interfaces] [s5]
- OS 1.1.32 fixed the unit sometimes failing to start while connected to USB. [#start-fix] (since 1.1.32) [s6]
- In MTP mode the computer sees a file-transfer device instead, so USB audio and MIDI are gone until MTP ends. [#mtp-switch] (verified 1.1.33) [s3]

Related: [hardware.connectors], [com.devices], [com.mtp], [howto.midi-keyboard], [howto.audio-interface]

Sources: s1 guide:hardware-overview#technical-specifications · s2 note 90 · s3 note 90 · s4 guide:how-to#how-to-control-op-xy · s5 guide:how-to#use-an-audio-interface-with-op-xy · s6 changelog:1.1.32

### MIDI controller mode [com.controller-mode]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: controller mode, ctrl, midi controller, control mode, daw controller
Where: screens controller

`com → M2` turns the OP-XY into a generic MIDI controller; with `shift` held, `E1`–`E3` set its channel, knob behaviour and octave keys, and `shift + com` leaves.

Controller mode drives a DAW, a soft synth or another instrument from the OP-XY's panel. TE publishes
neither the CC numbers nor the default channel, so set the channel first and confirm the CCs with
your software's MIDI learn.

Facts:
- Controller mode makes the OP-XY a general-purpose MIDI controller for any device, a computer included. [#what] [s1]
- The encoders send either absolute values (0–127) or relative ones (the change since the last position). [#knobs] [s1]
- `shift + com` leaves controller mode and returns to the com page. [#exit] [s1]
- Community measurements put the encoders on CC1–CC4 when turned and CC15–CC18 when clicked; relative mode sends 1–63 clockwise and 65–127 counter-clockwise. [#encoder-ccs] (community) [s2]
- The keys send CCs as well — `record`, `play` and `stop` send CC55–CC57 (127 on press, 0 on release), the step keys CC61–CC76. [#key-ccs] (community) [s2]
- The keyboard sends notes 53–76 with velocity; the volume knob sends nothing. [#keyboard-notes] (community) [s2]

Procedures:
- Use the OP-XY as a MIDI controller [#enter] [s1]
  1. `com → M2`
  2. `shift + turn E1` — the channel your software listens on
- Leave controller mode [#exit] [s1]
  1. `shift + com`

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| controller | `shift + turn E1` | midi channel | – | – | – | s1 |
| controller | `shift + turn E2` | knob mode | absolute / relative | – | – | s1 |
| controller | `shift + turn E3` | octave keys | – | – | – | enables or disables `[-]` and `[+]` s1 |

Related: [com.overview], [com.midi-cc-reference], [com.usb]

Sources: s1 guide:com#midi-controller-moder · s2 note 20

### Multi-out jack modes [com.multi-out]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: multi-out, multi out, aux out, trs midi out, cv out, sync out, din sync
Where: screens com

The 3.5 mm multi-out sends MIDI, CV and gate, a sync pulse (sync8, sync16, sync24) or audio; the mode is chosen with `E3` on the com page while nothing is plugged in.

Pick the job first, then plug in. The jack only sends — MIDI comes in through the MIDI in jack, USB
or bluetooth. TE does not say which gear sync16 is meant for; the output levels are listed with the
specifications.

Facts:
- The multi-out has six modes: midi, cv/gate, audio and three sync rates (sync8, sync16, sync24). [#modes] [s1]
- The mode is chosen on the com page by turning `E3`. [#select] [s2]
- The mode cannot change while a cable is in the jack, so set it before connecting. [#unplug-first] [s2]
- In midi mode a type A TRS-to-DIN adapter cable reaches synths with DIN MIDI sockets. [#midi] [s3]
- In cv/gate mode the tip carries pitch CV and the ring the gate. [#cv-gate] [s4]
- The sync modes send a clock pulse while the OP-XY plays — sync8, an eighth-note pulse, suits pocket operators and sync24 suits DIN-sync drum machines. [#sync] [s5]
- In audio mode the jack is an auxiliary audio output, fed by the external audio track's routing and the tracks' aux sends. [#audio] [s6]

Procedures:
- Choose what the multi-out sends [#set] [s2]
  Needs: no cable is plugged into the multi-out
  1. `com → turn E3`

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| com | `turn E3` | multi-out mode | midi / cv/gate / sync8 / sync16 / sync24 / audio | – | – | s2 |

Related: [hardware.connectors], [howto.control-synth-midi], [howto.control-cv-synth], [howto.external-effect]

Sources: s1 guide:hardware-overview#inputs-outputs · s2 guide:com#setting-the-multi-out-port-and-bluetooth-midi · s3 guide:how-to#how-to-control-a-synth-with-midi · s4 guide:auxiliary#external-cv · s5 guide:how-to#sync-a-vintage-drum-machine · s6 guide:auxiliary#external-audio

### Bluetooth MIDI [com.bluetooth-midi]
current · OS ≥ 1.0.9 · changed in 1.0.29, 1.1.15 · guide v1.1.15
Also called: ble midi, bluetooth, wireless midi, advertise, bluetooth le, pair
Where: screens com

Turning or clicking `E1` on the com page advertises the OP-XY as a bluetooth LE MIDI device; a host such as a computer, tablet or phone then connects to it for notes and clock.

Bluetooth MIDI is the cable-free way to play or clock compatible gear and apps. The OP-XY does not
search for partners itself: it only announces that it is available, and the host (a computer, tablet
or phone app) picks it from its list. Audio still needs a cable: the wireless link carries MIDI only.

Facts:
- On the com page, turning or clicking `E1` makes the OP-XY advertise itself over bluetooth MIDI. [#advertise] [s1]
- The OP-XY joins as a device; the other side is the host and makes the connection from its own bluetooth MIDI settings. [#device-role] [s1]
- The wireless link carries notes and clock, in both directions. [#messages] [s1]
- Clock over bluetooth, incoming and outgoing, arrived in OS 1.0.29. [#clock-since] (since 1.0.29) [s2]
- OS 1.1.15 fixed advertising that sometimes failed to start. [#advertise-fix] (since 1.1.15) [s3]

Procedures:
- Pair the OP-XY with a bluetooth MIDI host [#connect] [s4]
  1. `com → click E1` — turning `E1` works as well; the unit is now discoverable
  Result: Choose the OP-XY in the host's bluetooth MIDI list to finish the connection.

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| com | `turn E1` | bluetooth midi | – | – | – | advertise the unit (clicking does the same) s1 |

Related: [com.overview], [com.midi-settings], [howto.control-synth-midi]

Sources: s1 guide:com#setting-the-multi-out-port-and-bluetooth-midi · s2 changelog:1.0.29 · s3 changelog:1.1.15 · s4 guide:how-to#how-to-control-a-synth-with-midi

### MTP mode (file transfer) [com.mtp]
current · OS ≥ 1.0.9 · changed in 1.0.32, 1.1.15 · guide v1.1.15
Also called: mtp, media transfer protocol, file transfer, usb drive, field kit, eject
Where: screens mtp

`com → M4` lets a connected computer browse the OP-XY's storage and copy projects, samples and presets; `M4` ejects. Macs need TE's field kit app, and USB MIDI is off while MTP runs.

MTP is a mode, not a background service: live MIDI and file transfer take turns. Eject with `M4`,
or let the computer close the session, before unplugging.

Facts:
- `com → M4` switches on MTP, so a computer can read and write the projects, samples and presets on the unit. [#enter] [s1]
- MTP is only offered while a computer is connected by USB, so plug in first. [#needs-computer] [s1]
- macOS cannot open MTP devices by itself, so Macs need TE's field kit app; Windows and Linux need nothing extra. [#mac] [s2]
- `M4` on the MTP screen ejects the OP-XY from the computer. [#eject] [s1]
- Instructions that say `T4` for MTP (TE's sound-pack page among them) follow the OP-1 field; on the OP-XY it is `M4`. [#m4-not-t4] [s2]
- In MTP mode the OP-XY shows up as a different USB device and its MIDI port disappears, so MIDI apps, this one included, lose the connection. [#midi-gone] (verified 1.1.33) [s3]
- When the computer closes its MTP session, the OP-XY leaves MTP mode by itself and its MIDI port returns. [#auto-exit] (verified 1.1.33) [s3]
- On OS 1.1.33 the top level holds projects (user, templates and the open project as workspace.xy), samples (user), presets (snapshot and user sound packs) and how_to_import.txt. [#layout] (verified 1.1.33) [s3]
- OS 1.0.29 could corrupt files over 64 KB copied off the unit by MTP; 1.0.32 fixed it, and backups made under 1.0.29 may be damaged. [#bug-1029] (since 1.0.32) [s4]
- MTP accepts UTF-8 file and folder names since OS 1.1.15. [#utf8] (since 1.1.15) [s5]

Procedures:
- Put the OP-XY in MTP mode [#enter] [s1]
  Needs: a computer is connected by USB-C; field kit runs on a Mac
  1. `com → M4`
  Result: The storage appears on the computer (inside field kit on a Mac).
- Eject the OP-XY from the computer [#eject] [s1]
  1. `M4`

Related: [howto.back-up-projects], [howto.load-samples], [com.usb], [sampler.sample-files]

Sources: s1 guide:com#mtp · s2 teenage.engineering/guides/fieldkit · s3 note 90 · s4 changelog:1.0.32 · s5 changelog:1.1.15

### MIDI CC reference [com.midi-cc-reference]
current · OS ≥ 1.0.9 · changed in 1.1.0 · guide v1.1.15
Also called: midi cc, cc list, cc chart, cc table, midi implementation, control change, remote control

The CCs TE documents — track volume, mute and pan, tempo, groove, scenes, project and master EQ — plus what we measured on OS 1.1.33, including play, stop and track-select CCs that TE's table leaves out.

TE's table covers the mixer and song-level controls; the encoders of each track's pages follow the
pattern in the track CC unit. Most CCs change the open project, which the unit saves by itself.
Remote key presses do not work on current firmware, so screens cannot be navigated over MIDI.

Facts:
- Most controls answer MIDI CCs out of the box; TE's reference table lists only the main ones, every one taking values 0–127. [#premapped] [s1]
- On channels 1–16, one per track: CC7 volume, CC9 mute, CC10 pan, and CC46, which TE labels only "track parameters". [#per-track] [s1]
- On any channel: CC80 tempo, CC81 groove, CC82 scene (switching at a delay), CC83 previous scene, CC84 next scene, CC85 scene (switching at once) and CC86 project. [#global] [s1]
- CC90 drives the master EQ on channels 1–4. [#eq] [s1]
- Community tests map CC90 channel 1 to the low band, 2 to mid and 3 to high; reports on channel 4 (blend) disagree. [#eq-bands] (community-verified) [s2]
- The delayed scene switch (CC82) was added in OS 1.1.0. [#delayed-scene] (since 1.1.0) [s3]
- CC80 sets the tempo to twice the value in BPM within 40–220 — 60 gives 120 BPM, values up to 20 give 40 and values from 110 give 220. [#tempo-scale] (verified 1.1.33) [s4]
- CC9 mutes the track at any value from 1 to 127 and unmutes it at 0; it sets a state and does not toggle. [#mute-values] (verified 1.1.33) [s4]
- Missing from TE's table but working, CC104 at 127 starts playback and CC105 at 127 stops it. [#play-stop] (verified 1.1.33) [s4]
- CC102 on channel 1 selects a track counting from zero, so value 2 selects track 3. [#track-select] (verified 1.1.33) [s4]
- The remote key-press CCs (CC106/CC107) that community tools used on older firmware have no effect on OS 1.1.33. [#no-remote-keys] (verified 1.1.33) [s4]
- By default channel N addresses track N — 1–8 the instrument tracks, 9–16 the auxiliary tracks from brain to FX II. [#channels] (community-verified) [s5]
- Outside controller mode, turning encoders sends no CCs, so other gear cannot read the OP-XY's knob positions. [#knobs-silent] (community-verified) [s6]

Related: [com.midi-track-ccs], [com.midi-settings], [com.controller-mode], [howto.midi-keyboard]

Sources: s1 guide:midi-references · s2 note 20 · s3 changelog:1.1.0 · s4 note 90 · s5 note 20 · s6 note 20

### Track parameter CCs [com.midi-track-ccs]
unverified · OS ≥ 1.0.9 · guide v1.1.15
Also called: cc lanes, lane model, parameter ccs, encoder ccs, filter cutoff cc, envelope cc, drum notes

Community charts and our lane model give each module page four consecutive CCs on the track's channel, one per encoder — M1 on CC12–15 up to the LFO on CC40–43 — and put the 24 drum keys on notes 53–76.

The pattern — page by page, four CCs per page, left to right — comes from community charts and
stored project data, not from TE, so treat it as a strong prediction. Filter cutoff on track 3 is
CC32 on channel 3; CCs outside the listed ranges (such as CC16–19) are unconfirmed.

Facts:
- Each module page answers four consecutive CCs on the track's channel, in encoder order `E1`…`E4`. [#lanes] (derived) [s1]
- The M1 (engine) page uses CC12–15, whatever engine the track runs. [#m1] (community-verified) [s2]
- M2 uses CC20–23 for the amp envelope (attack, decay, sustain, release), CC24–27 for the filter envelope and CC28–31 for its shift layer: play mode, portamento, bend range and preset volume. [#m2] (community-verified) [s1]
- M3 uses CC32–35 for the filter (cutoff, resonance, envelope amount, key tracking) and CC36–39 for its shift layer, the sends to aux out, tape, FX I and FX II. [#m3] (community-verified) [s1]
- M4 (the LFO) most likely uses CC40–43; community charts label these four CCs inconsistently. [#m4] (derived) [s3]
- The mixer controls sit outside the lanes, on CC7 (level), CC9 (mute) and CC10 (pan). [#mixer] [s4]
- On drum tracks the 24 keys play MIDI notes 53–76 from left to right (F3–E5 when middle C is 60). [#drum-notes] (community-verified) [s5]
- Which sound sits on which note depends on the loaded kit, so check the kit rather than assuming a General MIDI layout. [#drum-kits] (community-verified) [s5]

Related: [com.midi-cc-reference], [instrument.engine-prism], [com.controller-mode]

Sources: s1 note 20 · s2 note 20 · s3 note 20 · s4 guide:midi-references · s5 note 20

## How-to recipes

Task-oriented walkthroughs: first project, syncing and controlling other gear, audio interfacing, backups and samples.

### Get started — a first project [howto.get-started]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: first project, quick start, getting started, beginner walkthrough, first song, tutorial

TE's four-part first session in our words — create a project, then build a drum beat, record a bassline, add chords and perform with punch-in FX, using the sounds a new project already has.

The first session builds one idea in four passes, each on a different track and each teaching one
recording technique: placing steps, recording live, entering chords on steps and performing effects.
Every step works with the factory sounds, so nothing needs loading or configuring first. Follow the
recipes in order; each one assumes the tracks before it already play.

Facts:
- A song begins with a fresh project — `project` opens the project view, and holding `M1` there creates one. [#new-project] [s1]
- A new project comes loaded: drum kits on `T1` and `T2`, a bass on `T3`, a pluck on `T4`, a lead on `T5`, a soft pluck on `T6`, strings on `T7` and a pad on `T8`. [#default-sounds] [s1]
- The walkthrough uses those defaults in turn — drums on `T1`, bass on `T3`, chords on `T7` — and finishes on the punch-in FX track, `T2` in auxiliary mode. [#path] [s1]
- The unit keeps your work as you go, so switching it off loses nothing. [#autosave] [s2]

Procedures:
- Create a new project [#new] [s1]
  1. `project → hold M1`
  Result: An empty project opens with the default sounds on all eight instrument tracks.

Related: [howto.first-drum-beat], [howto.first-bassline], [howto.first-chords], [howto.first-punch-in], [project.project-view]

Sources: s1 guide:get-started#4.%20get%20started · s2 guide:hardware-overview#power-on-charging

### Recipe — program a first drum beat [howto.first-drum-beat]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: drum beat, four on the floor, program drums, first beat
Where: modes instrument

On drum track `T1`, place a kick on every beat, a snare on the backbeat and hi-hats in between, then turn one hi-hat step into a ratchet with the multiply step component.

Choose a sound on the keyboard, then press the steps where it should play. The single-sound view
keeps kick, snare and hats out of each other's way, and one step component adds variation.

Facts:
- With `T1` selected in instrument mode, each of the 24 keys plays a different drum sound. [#kit] [s1]
- The OP-XY remembers the key you pressed last, and pressing step keys places that sound. [#last-key] [s1]
- In the default kit the lowest F (`key F3`) is a kick, the G beside it a snare and a C# key a hi-hat. [#sounds] [s1]
- Holding a drum key and tapping `record` shows only that sound's steps, so it can go on steps already used by another sound. [#one-sound] [s1]
- The multiply component on `natural 3` with value `accidental 3` splits a step into three quick hits; the screen confirms with “divide into 3 trigs”. [#ratchet] [s1]

Procedures:
- Put a kick on every beat [#kick] [s1]
  1. `instrument → T1`
  2. `key F3 → step 1 → step 5 → step 9 → step 13` — select the kick, then place it on the four beats
  3. `play → stop` — listen, then stop
- Add a backbeat snare [#snare] [s1]
  1. `key G3 + record → + step 5 → + step 13` — keep the snare key held throughout; only its steps are shown
- Fill in hi-hats [#hats] [s1]
  1. `key C#4 + record → + steps` — keep the key held and press every other step; TE only says “the C# key”
- Turn one hi-hat into a triple hit [#ratchet] [s1]
  1. `shift + step 7 → + natural 3 → + accidental 3` — keep shift down; step 7 blinks, then multiply and its value are chosen
  2. `play`
  Result: The seventh step plays three short hi-hat hits.

Related: [sequencer.single-sound], [sequencer.step-components], [howto.first-bassline]

Sources: s1 guide:get-started#4.1%20sequencing%20a%20drum%20beat

### Recipe — record a bassline live [howto.first-bassline]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: record bassline, record a take, lengthen pattern, record knob movement
Where: modes instrument

On bass track `T3`, arm recording with `record + play`, play the line in, lengthen the pattern with extra bars or a slower track scale, and record a knob move as automation.

Practise over the running beat first; once armed, the take starts on your first note. Recorded knob
moves are stored per step, like parameter locks, so they sound stepped until smoothed.

Facts:
- On a synth track such as `T3` the 24 keys play notes chromatically, and `[-]`/`[+]` move them an octave. [#chromatic] [s1]
- `record + play` arms the track; the first step key flashes red while it waits. [#armed] [s1]
- Recording begins with the first note you play, or right away if you press `play` instead; `stop` ends it. [#start] [s1]
- A line longer than the pattern plays over itself; `bar + [+]` adds bars, up to four in all. [#bars] [s1]
- For still more length, `bar + accidental` raises the track scale, which stretches every step. [#scale] [s1]
- Holding `record` and `stop` until the step keys fill red empties the track so you can record again. [#clear] [s1]
- During playback, holding `record` while turning an encoder records the movement; `bar + turn E4` smooths its steps. [#automation] [s1]

Procedures:
- Record a bassline over the beat [#record] [s1]
  1. `instrument → T3`
  2. `record + play` — armed — the first step flashes red
  3. `keys` — the first note starts the take
  4. `stop`
- Make room for a longer line [#lengthen] [s1]
  1. `bar + [+]` — one more bar, up to four
  2. `record + hold stop` — clears the track before recording the longer take
- Record a knob move into the bassline [#automate] [s1]
  Needs: the pattern is playing
  1. `record + turn E1…E4`
  2. `bar + turn E4` — smooths the recorded steps

Related: [sequencer.live-recording], [sequencer.parameter-locks], [howto.first-chords]

Sources: s1 guide:get-started#4.2%20recording%20a%20baseline

### Recipe — add chords on steps [howto.first-chords]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: add chords, sequence chords, chord progression, pad chords, hold chords
Where: modes instrument

On `T7`, slow the track scale so each step lasts a beat, enter chords by holding their notes and pressing a step, and stretch each chord across the steps it should ring.

Chords are easier to place than to play in time. A track scale of 4 turns the sixteen steps into
four bars of quarter notes, so a whole progression fits on one page of step keys: hold the chord,
press its step, then stretch it to where the next chord begins. Repeat for each change.

Facts:
- `T7` holds strings in a new project, a good home for sustained chords. [#track] [s1]
- Play along with the beat first and count on which beats the chords change and how long the part must be. [#plan] [s1]
- `bar + accidental 4` sets the track scale to 4, so each step lasts four times as long and four steps make a bar. [#scale-4] [s1]
- To enter a chord, hold its notes on the keyboard and press the step where it should start. [#enter] [s1]
- Holding a chord's step and pressing a later step keeps the chord sounding until that step. [#stretch] [s1]
- If the progression needs more room, `bar + [+]` adds a bar. [#more-bars] [s1]

Procedures:
- Sequence a chord progression [#chords] [s1]
  1. `instrument → T7`
  2. `bar + accidental 4` — steps now blink four times slower
  3. `keys + step n` — hold the chord, press its first step
  4. `step n + step m` — hold that step, press where the chord should end
  Result: The chord plays from its step until the chosen end, pattern after pattern.

Related: [sequencer.step-entry], [sequencer.extend-notes], [howto.first-punch-in]

Sources: s1 guide:get-started#4.3%20adding-chords

### Recipe — perform with punch-in FX [howto.first-punch-in]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: perform with effects, punch-in performance, live effects, momentary effects
Where: modes auxiliary

Open the punch-in FX track (`T2` in auxiliary mode), start the song and hold keyboard keys — each key is a different momentary effect, and several can be held at once.

Punch-in effects are the performance end of the first session: nothing to set up, just keys to hold
while the song plays. Try single keys first to learn what each does, then combinations. When a move
works, record it like any other part so the pattern repeats it.

Facts:
- In auxiliary mode `T2` is the punch-in FX track. [#track] [s1]
- Each of the 24 keys applies its own effect for as long as you hold it. [#keys] [s1]
- Holding several keys stacks their effects. [#combine] [s1]
- The punch-in track records and sequences like any other track, so effect moves can become part of the pattern. [#sequence] [s1]

Procedures:
- Play effects over the running song [#perform] [s1]
  1. `auxiliary → T2`
  2. `play`
  3. `hold keys` — one key per effect; hold several to combine them
- Record an effect performance into the pattern [#record] [s1]
  1. `record + play`
  2. `hold keys`

Related: [auxiliary.overview], [howto.get-started]

Sources: s1 guide:get-started#4.4.%20adding-punch-in-fx

### Recipe — make the keyboard velocity-sensitive [howto.enable-velocity]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: enable velocity, velocity sensitive keys, key velocity, touch sensitivity, velocity curve
Where: screens system settings

In the keyboard section of the system settings, set velocity to soft or hard so the built-in keys respond to how hard you play.

Match the curve to your touch: soft for a light playing style, hard for a heavy one. The setting only
concerns the OP-XY's own keys — notes from a MIDI keyboard bring their own velocity.

Facts:
- Velocity lets the built-in keyboard play louder or softer notes depending on how hard you strike the keys. [#what] [s1]
- The velocity setting has three values — off, soft for a gentle touch and hard for a forceful one. [#values] [s1]
- The setting sits in the keyboard section of the system settings. [#where] [s1]
- How much a sound reacts to velocity is set per preset, with the velocity sensitivity in the preset settings. [#per-preset] [s2]

Procedures:
- Turn on keyboard velocity [#enable] [s1]
  1. `com → M1`
  2. `turn E1` — keyboard section
  3. `turn E2` — the velocity setting
  4. `turn E3` — soft or hard
  5. `M1` — back to the com page
  6. `instrument` — back to playing

Related: [com.system-settings], [instrument.preset-settings]

Sources: s1 guide:how-to#how-to-enable-velocity · s2 guide:instrument#preset-settings

### Recipe — play an external synth over MIDI [howto.control-synth-midi]
current · OS ≥ 1.0.9 · changed in 1.0.15 · guide v1.1.15
Also called: control a synth, sequence external synth, trs midi, din midi, external midi track
Where: modes auxiliary

Connect the synth through the multi-out (set to midi) or USB, then play and sequence it from the external MIDI track, `T3` in auxiliary mode, on the synth's channel.

If nothing sounds, check the channel first, then the cable route (multi-out mode, adapter type) and,
for USB gear, the device's switches under `com → M3`. Bluetooth MIDI synths work too once the
OP-XY advertises itself from the com page.

Facts:
- Synths with DIN MIDI sockets need the multi-out set to midi and a type A TRS-to-DIN cable, DIN end into the synth, jack into the multi-out. [#din] [s1]
- Synths with USB MIDI plug into the OP-XY's USB-C port (through an adapter if needed), need no multi-out setting and appear under `com → M3`. [#usb] [s1]
- The external MIDI track is `T3` in auxiliary mode; its keyboard and sequencer play the connected synth. [#track] [s2]
- On the track's `M1` page, `E1` sets the MIDI channel — match the channel the synth listens on — while `E2` and `E3` pick bank and program. [#channel] [s2]
- `M2` and `M3` hold eight CC slots: `shift` plus an encoder switches a slot on and picks its CC number, turning the encoder sends values, and the moves can be sequenced and recorded. [#ccs] [s1]
- To sequence several synths, instrument tracks can run the midi engine too; TE's guide still calls it "external", its name before OS 1.0.15. [#several-synths] (since 1.0.15) [s3]

Procedures:
- Point the external MIDI track at a synth [#connect] [s1]
  Needs: nothing is plugged into the multi-out yet
  1. `com → turn E3` — midi; then connect the cable
  2. `auxiliary → T3 → M1 → turn E1` — the synth's MIDI channel
- Control a synth parameter by CC [#cc] [s1]
  1. `M2/M3`
  2. `shift + turn E1…E4` — switch the slot on, choose the CC number
  3. `turn E1…E4` — send values

Related: [com.multi-out], [com.devices], [com.bluetooth-midi], [instrument.engine-midi], [auxiliary.overview]

Sources: s1 guide:how-to#how-to-control-a-synth-with-midi · s2 guide:auxiliary#external-midi · s3 changelog:1.0.15

### Recipe — play an analog synth with CV and gate [howto.control-cv-synth]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: cv gate, control voltage, eurorack, modular, external cv track
Where: modes auxiliary

Set the multi-out to cv/gate, split its tip (pitch CV) and ring (gate) into the synth's CV and gate inputs, then play and sequence from the external CV track, `T4` in auxiliary mode.

One voltage says which note, the other says when. TE's how-to stops after the cabling; the playing
happens on the external CV track. Connect everything before sending notes.

Facts:
- CV (control voltage) carries the pitch of a note to analog and Eurorack synths; the gate is high only while a note is held and fires the synth's envelopes. [#what] [s1]
- In cv/gate mode the multi-out sends CV on the tip and the gate on the ring. [#tip-ring] [s1]
- Use a splitter that breaks tip and ring out to two separate plugs (one that keeps the stereo pair together will not work), sized for the synth — 6.35 mm on many desktop synths, 3.5 mm on Eurorack. [#splitter] [s1]
- The tip lead goes to the synth's CV (pitch) input and the ring lead to its gate input; on a modular these usually sit on the oscillator and the envelope. [#patch] [s1]
- The external CV track, `T4` in auxiliary mode, plays and sequences the connected synth from the keyboard and steps. [#track] [s2]
- The CV output spans −5 V to +5 V and the gate is 5.2 V high; TE does not state the pitch standard (volts per octave), so check the tuning. [#range] [s3]

Procedures:
- Play an analog synth from the OP-XY [#setup] [s2]
  Needs: the splitter is not yet plugged into the multi-out
  1. `com → turn E3` — cv/gate; then patch the cables
  2. `auxiliary → T4`
  3. `keys` — the synth follows; sequence it like any track

Related: [com.multi-out], [auxiliary.overview], [howto.control-synth-midi]

Sources: s1 guide:how-to#how-to-control-an-analog-synth%20with%20cv%20and%20gate · s2 guide:auxiliary#external-cv · s3 guide:hardware-overview#electrical-characteristics

### Recipe — sync a vintage drum machine [howto.sync-drum-machine]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: din sync, sync24, vintage drum machine, clock a drum machine, 808 sync

Set the multi-out to sync24 and run a 3.5 mm-to-DIN-sync cable into the drum machine's sync input; `play` then sends clock, start, stop and reset.

The OP-XY is the master here: it sets the tempo and the drum machine follows, starting and stopping
with the OP-XY's transport. Set the jack's mode before plugging in, since it cannot change with a
cable in place.

Facts:
- Older drum machines usually take DIN sync on their sync socket rather than modern MIDI clock. [#why] [s1]
- Set the multi-out to sync24 so it sends that kind of sync signal. [#mode] [s1]
- The connection needs a cable with a 3.5 mm plug for the multi-out and a DIN plug for the drum machine's sync input. [#cable] [s1]
- With `play`, clock, start, stop and reset all travel down the cable, so the drum machine follows the OP-XY. [#signals] [s1]

Procedures:
- Clock a DIN-sync drum machine from the OP-XY [#sync] [s1]
  Needs: the sync cable is not yet plugged into the multi-out
  1. `com → turn E3` — sync24
  2. `play` — after connecting the cable; the drum machine starts with the OP-XY

Related: [com.multi-out], [howto.sync-pocket-operator]

Sources: s1 guide:how-to#sync-a-vintage-drum-machine

### Recipe — sync a pocket operator [howto.sync-pocket-operator]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: pocket operator, po sync, sync8, sy2, clock a pocket operator

Set the multi-out to sync8, run a plain 3.5 mm cable into the pocket operator's input, set the pocket operator to sync mode SY2 and press `play`.

Because SY2 keeps the pocket operator's output in stereo, you can run its audio into the OP-XY's
audio input or a mixer while it follows the OP-XY's tempo. The OP-XY sets the tempo; the pocket
operator only listens.

Facts:
- Pocket operators follow a slower clock than most gear; sync8 makes the multi-out send one pulse per eighth note. [#pulse] [s1]
- An ordinary 3.5 mm cable runs from the multi-out to the pocket operator's input jack. [#cable] [s1]
- On the pocket operator, hold its function key (below the rightmost knob) and press bpm until the screen reads SY2. [#sy2] [s1]
- In SY2 the pocket operator takes sync on its input and plays stereo audio from its output. [#sy2-meaning] [s1]
- `play` on the OP-XY starts the pulse, and both devices run in time. [#play] [s1]

Procedures:
- Clock a pocket operator from the OP-XY [#sync] [s1]
  Needs: the cable is not yet plugged into the multi-out
  1. `com → turn E3` — sync8
  2. `play` — after connecting the cable and setting SY2 on the pocket operator

Related: [com.multi-out], [howto.sync-drum-machine]

Sources: s1 guide:how-to#sync-a-pocket-operator

### Recipe — loop an external effect pedal [howto.external-effect]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: external effects, effects pedal, send return, fx loop, aux send
Where: modes auxiliary

Send audio out of the multi-out (set to audio) into the effect, bring the effect back into the audio input, and use the external audio track (`T5` in auxiliary mode) to pick the tracks that go out and balance the return.

The multi-out is the send, the audio input the return, and the external audio track the control room
in between: its routing decides what goes out, independently of each track's level in the main mix.

Facts:
- With the multi-out set to audio, one cable runs from it to the effect's input (adapt 3.5 mm to 6.35 mm for pedals) and a second from the effect's output to the OP-XY's audio input. [#cables] [s1]
- On the external audio track's `M1` page, turn `E1` to the audio input (the jack icon) and click `E1` to switch it on. [#input] [s1]
- The external audio track's `M2` page sends instrument tracks to the aux output — turn an encoder per track, click to swap between tracks 1–4 and 5–8. [#routing] [s1]
- A single track can also be sent from instrument mode with its aux send, `shift + turn E1` on its `M3` page. [#track-send] [s1]
- Drive (`E2`), level (`E3`) and mix (`E4`) on the external audio track's `M1` balance the returning signal; drive only affects analog inputs. [#balance] [s2]

Procedures:
- Route tracks through an external effect and back [#setup] [s1]
  Needs: nothing is plugged into the multi-out yet
  1. `com → turn E3` — audio; then connect both cables
  2. `auxiliary → T5 → M1 → turn E1` — the audio input
  3. `click E1` — switches the input on
  4. `M2 → turn E1…E4` — send tracks to the aux output
  5. `M1 → turn E2/E3/E4` — balance the return

Related: [com.multi-out], [instrument.track-sends], [auxiliary.overview]

Sources: s1 guide:how-to#send-audio-to-and-from-an-external-effect · s2 guide:auxiliary#external-audio

### Recipe — play the OP-XY from a MIDI keyboard [howto.midi-keyboard]
current · OS ≥ 1.0.9 · changed in 1.1.15, 1.1.17 · guide v1.1.15
Also called: midi keyboard, usb keyboard, external controller, mod wheel, sustain pedal

Plug a USB MIDI keyboard or controller straight into the OP-XY, route its mod wheel, aftertouch, pitch bend and velocity in the preset settings, and filter what it sends under `com → M3`.

The OP-XY hosts the keyboard itself, so no computer is involved. Mod routings are saved with each
preset. If the keyboard plays the wrong track, check the active track channel; map knobs with the
CC reference.

Facts:
- A USB MIDI keyboard or controller connects to the OP-XY's USB-C port with a USB-C cable or a USB-A adapter and is ready within moments. [#connect] [s1]
- A keyboard that needs more power than the port gives can run through a powered USB hub. [#power] [s1]
- Notes arriving on the active track channel play whichever track is selected. [#active-track] [s2]
- The mod tab of the preset settings (`shift + instrument`) routes mod wheel, aftertouch, pitch bend and velocity to synth parameters. [#mod-routing] [s1]
- Under `com → M3` you choose, for that keyboard, whether clock, notes, other messages, timestamp and velocity get through. [#filter] [s1]
- A sustain pedal holds notes until it is released, since OS 1.1.15. [#sustain] (since 1.1.15) [s3]
- Since OS 1.1.17 the sustain pedal leaves arpeggiated notes alone. [#sustain-arp] (since 1.1.17) [s4]

Procedures:
- Send the mod wheel to a synth parameter [#mod] [s1]
  Needs: instrument mode; the track is selected
  1. `shift + instrument` — preset settings
  2. `turn E1` — mod
  3. `turn E2` — choose the mod wheel's target
  4. `turn E3` — pick the parameter
- Choose what the keyboard may send to the OP-XY [#filter] [s1]
  1. `com → M3`
  2. `turn E1` — the keyboard
  3. `turn E2 → turn E3` — pick a switch, set it

Related: [com.usb], [com.devices], [com.midi-cc-reference], [instrument.preset-settings], [instrument.sustain-pedal]

Sources: s1 guide:how-to#how-to-control-op-xy · s2 guide:com#system-settings · s3 changelog:1.1.15 · s4 changelog:1.1.17

### Recipe — use an audio interface with the OP-XY [howto.audio-interface]
current · OS ≥ 1.0.9 · changed in 1.1.25 · guide v1.1.15
Also called: audio interface, usb audio interface, sound card, multichannel interface

Plug a class-compliant USB audio interface into the OP-XY; the main output plays through it, inputs 1–2 are used by default, and the sample page or the external audio track takes it as the usb source.

Here the OP-XY is the USB host, the reverse of connecting it to a computer. The interface adds
better outputs for studio or stage and more inputs for sampling and live processing.

Facts:
- The interface connects to the OP-XY's USB-C port with a USB-C cable or a USB-A adapter; a powered hub helps if it needs more power. [#connect] [s1]
- Interfaces that are USB audio class 1 or class 2 compliant work; ones that need a driver may not. [#class-compliant] [s1]
- The OP-XY's main output then plays through the interface; the internal speaker may still sound, so turn the volume knob down or monitor on headphones. [#main-out] [s1]
- With a multichannel interface the OP-XY uses inputs 1 and 2 unless you choose others. [#channels] [s1]
- On the `sample` page, `E1` sets the source to usb and `shift + turn E1` picks the input channel. [#pick-channel] [s2]
- TE's audio-interface how-to picks the channel with `turn E2` instead; which gesture OS 1.1.33 uses is not confirmed on a unit. [#channel-conflict] (conflicting) [s1]
- To hear the interface's inputs live, set the external audio track's input to usb audio with `E1` and click `E1` to activate it. [#live-input] [s1]
- OS 1.1.25 fixed audio-only interfaces being reported as disconnected. [#audio-only-fix] (since 1.1.25) [s3]

Procedures:
- Sample from other interface inputs [#sample-channel] [s2]
  1. `sample → turn E1` — usb source
  2. `shift + turn E1` — input channel
- Monitor the interface's input through the OP-XY [#live] [s1]
  1. `auxiliary → T5 → M1 → turn E1` — usb audio
  2. `click E1` — activates the input

Related: [com.usb], [sampler.sampling], [howto.external-effect]

Sources: s1 guide:how-to#use-an-audio-interface-with-op-xy · s2 guide:sample#arrange · s3 changelog:1.1.25

### Recipe — use the pitchbend strip as a modulator [howto.pitchbend-modulation]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: pitchbend modulation, pitch bend target, bend to filter, expression strip, pitchbend amount
Where: modes instrument

In a track's preset settings, point the pitchbend at a synth parameter and set its amount (negative inverts), then turn the track's bend range off so the strip no longer bends pitch.

Routed to filter cutoff or an effect send, the strip becomes a pressure-sensitive performance
control. Switch the bend range off as well, or every push also bends the pitch.

Facts:
- The pitchbend strip can modulate a synth parameter of your choice instead of, or as well as, the pitch. [#idea] [s1]
- The routing lives in the preset settings (`shift + instrument`), under mod — pitchbend target picks the parameter and pitchbend amount sets how far it moves. [#where] [s1]
- A negative amount inverts the modulation. [#negative] [s1]
- To stop the strip bending pitch, set the bend range on the `M2` shift layer (`shift + turn E3`) fully counter-clockwise, to off. [#pitch-off] [s1]
- The routing belongs to one instrument track, so each track can send the strip to a different parameter. [#per-track] [s1]
- Saving the track as a preset stores the preset settings too, pitchbend routing included. [#saved] [s1]

Procedures:
- Make the pitchbend strip move a synth parameter [#route] [s1]
  Needs: instrument mode; the track is selected
  1. `shift + instrument` — preset settings
  2. `turn E1` — mod
  3. `turn E2 → turn E3` — pitchbend target, then the parameter
  4. `turn E2 → turn E3` — pitchbend amount, then how much (below zero inverts)
- Stop the strip from bending pitch [#no-pitch] [s1]
  1. `M2` — leaves the preset settings for the envelope page
  2. `shift + turn E3` — bend range, fully counter-clockwise to off
  Result: The strip now moves only the chosen parameter.

Related: [instrument.preset-settings], [instrument.play-mode], [howto.midi-keyboard]

Sources: s1 guide:how-to#pitch-bend

### Recipe — back up projects to a computer [howto.back-up-projects]
current · OS ≥ 1.0.9 · changed in 1.0.32 · guide v1.1.15
Also called: backup, back up, copy projects, export projects, project history

Connect a computer, enter MTP (`com → M4`, with field kit on a Mac) and copy the projects folder; a single project needs its file plus its folder in backups.

Back up before a firmware update or a factory reset. Copying the whole projects folder also takes
the templates folder and the open project's workspace file along.

Facts:
- Connect the OP-XY with its USB-C cable first; MTP is only offered while a computer is attached, and a Mac also needs field kit. [#connect] [s1]
- In MTP mode the OP-XY appears as a drive with presets, projects and samples folders; on a Mac, open it from field kit's menu-bar icon if it does not open by itself. [#drive] [s1]
- Your projects sit in projects → user, next to a backups folder with each project's history files. [#user-folder] [s1]
- A complete copy of one project takes both the project file and its matching folder inside backups. [#one-project] [s1]
- To back up every project at once, copy the whole projects folder to a safe place. [#everything] [s1]
- From the computer you can also delete projects, rename them and sort them into subfolders; names may use any UTF-8 characters. [#manage] [s1]
- Projects can use your own samples and presets, so a full backup copies the samples and presets folders as well. [#whole-drive] (derived) [s1]
- Backups made while the unit ran OS 1.0.29 may contain corrupted files; make fresh ones on current firmware. [#bad-1029] (since 1.0.32) [s2]

Procedures:
- Copy all projects to a computer [#backup] [s1]
  Needs: the OP-XY is connected by USB-C; field kit is running on a Mac
  1. `com → M4` — MTP mode; copy the projects folder on the computer
  2. `M4` — eject when the copy has finished

Related: [com.mtp], [project.versions-and-autosave], [hardware.factory-reset], [howto.load-samples]

Sources: s1 guide:how-to#how-to-back-up-your-projects · s2 changelog:1.0.32

### Recipe — load samples from a computer [howto.load-samples]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: load samples, import samples, add samples, transfer samples, sample pack, sound pack

In MTP mode, drag WAV or AIFF files into samples → user or into your own folders inside samples, keep file names simple, then eject with `M4`; the samples appear in the sample library.

Loading samples is plain file copying once the unit is in MTP mode: organise with folders, keep names
to the allowed characters and convert other formats to WAV or AIFF first. Your own recordings land in
the same user folder, so it is also where you copy them off the unit.

Facts:
- The internal 8 GB drive has room for thousands of samples. [#room] [s1]
- Connect the unit to the computer, then `com → M4` opens MTP; a Mac needs field kit to see the drive. [#mtp] [s1]
- samples → user is where the OP-XY saves the samples you record on it, and files dragged there show up in the library. [#user] [s1]
- Folders you create inside samples appear on the unit with their names in square brackets. [#folders] [s1]
- The OP-XY reads WAV and AIFF files only. [#formats] [s1]
- Stick to letters, digits, spaces, hyphens and # in file names; rename anything else before copying. [#names] [s1]
- When the copy is done, press `M4` to eject, then unplug the cable. [#eject] [s1]
- TE's downloadable sound packs go the same way — unzip the pack and drop its folder onto the samples folder. [#packs] [s2]

Procedures:
- Copy samples onto the OP-XY [#load] [s1]
  Needs: the OP-XY is connected by USB-C; field kit is running on a Mac
  1. `com → M4` — copy the files into samples on the computer
  2. `M4` — eject, then unplug
- Find the new samples on the unit [#browse] [s3]
  1. `shift + sample` — opens the sample library

Related: [com.mtp], [sampler.sample-files], [sampler.sample-library], [howto.back-up-projects]

Sources: s1 guide:how-to#how-to-load-samples · s2 teenage.engineering/downloads/op-xy/sound-packs · s3 guide:sample#sample-folder

### Recipe — sketch a song fast with the brain [howto.song-with-brain]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: brain song, write a song fast, chord progression with brain, auto transpose, key detection
Where: modes auxiliary

Build a tiny loop — drums, a one- or two-note bassline, one chord — then record a progression on the brain's keyboard (`T1` in auxiliary mode) and the routed tracks transpose along.

The brain does the harmony work: write simple parts in one key, then let the brain move them as you
play. Take any part that should stay put, such as a lead, out of its routing.

Facts:
- Start in a new project with a drum beat, a bassline of one or two notes and one chord on a pad or pluck track, one or two bars long. [#start-small] [s1]
- The brain is `T1` in auxiliary mode. [#open] [s1]
- `bar + accidental 4` on the brain sets its track scale to 4, so its sequence runs four times slower and spans four bars. [#scale-4] [s1]
- The brain has already detected the key and scale of the recorded parts and shows them on screen. [#detect] [s1]
- Notes played on the brain's keyboard transpose the routed tracks, chords included, so the simple loop follows a progression. [#transpose] [s1]
- Parts that must not transpose, such as a lead, come out of the brain's routing on `M2`: turn an encoder to add or remove its track, click to swap between tracks 1–4 and 5–8. [#exclude] [s1]
- Only routed tracks feed the key detection. [#detection-input] [s2]

Procedures:
- Turn a one-chord loop into a progression [#progression] [s1]
  Needs: a short loop of drums; bass and one chord plays
  1. `auxiliary → T1`
  2. `bar + accidental 4` — four bars per brain sequence
  3. `record + play`
  4. `keys` — play the progression within the shown scale
- Keep a track out of the brain's transposition [#exclude] [s1]
  1. `M2`
  2. `turn E1…E4` — remove the track (`click E1` swaps to tracks 5–8)

Related: [auxiliary.brain], [howto.get-started], [howto.first-chords]

Sources: s1 guide:how-to#write-a-song-fast-with-brain · s2 guide:auxiliary#brain

### Recipe — make a track pump with the kick (duck) [howto.sidechain-duck]
current · OS ≥ 1.1.0 · guide v1.1.15
Also called: sidechain, sidechain pump, pumping bass, duck the bass, pump with the kick, ducking pad
Where: modes instrument; screens M4

On the track that should make room, such as a bass or a pad, pick the duck LFO on `M4`, set its source to the drum track and choose how deep and how long each dip is; the metronome as source pumps evenly with no drums at all.

Pumping makes room: the bass or pad steps out of the kick's way, so both stay loud without
clashing, and the loop starts to breathe with the beat. The OP-XY does it with an LFO type rather
than a compressor, so it costs no effect slot and works on any instrument track. Duck the parts that
share the kick's low end, usually the bass and long pads, and leave the drums and short plucks
alone.

Facts:
- Duck lowers the level of the track it sits on whenever its source plays, so a bass or pad ducked by the drums dips on every hit and swells back between them. [#idea] [s1]
- Choosing duck works like choosing an engine — `shift + M4` opens the list of LFO types, `turn E1` highlights duck and `click E1` takes it. [#pick] (derived) [s2]
- In a new project the drum kit sits on track 1, so source 1 ducks on every hit of that track, hi-hats included; a kick alone on its own track gives the classic pump. [#drums] (derived) [s3]
- Turned past the tracks, the source becomes the metronome, and the track then dips on every beat whether or not anything plays. [#metronome] [s1]
- When the hi-hats share the kick's track, a kick on every beat is better served by the metronome as source, which pumps on the beats only; the drum track itself would duck on every hat too. [#shared-track] (derived) [s1]
- Amount on `E2` sets how far the level drops; around 60–80 is a clear pump, lower values a gentle breathing. [#depth] (derived) [s1]
- Hold on `E3` keeps the level down for a moment and release on `E4` sets how it recovers; keep both short for a tight pump on a fast beat, and lengthen the release for slow swells. [#time] (derived) [s1]

Procedures:
- Make the bass on T3 pump with the drums on T1 [#set-up] (derived) [s1]
  Needs: instrument mode
  1. `T3 → M4` — the track that should make room
  2. `shift + M4` — the LFO types
  3. `turn E1` — highlight duck
  4. `click E1` — takes it; press `M4` if the page changed {set lfo type = duck}
  5. `turn E1` — source 1, the drum track {set duck source = 1}
  6. `turn E2` — amount around 70 {set lfo amount = 70}
  7. `turn E3` — a short hold {set duck hold = 10}
  8. `turn E4` — release around 40 {set duck release = 40}
  Result: With the drums and the bass playing, the bass dips on every drum hit.

Related: [instrument.lfo-duck], [instrument.lfo], [howto.first-drum-beat], [howto.first-bassline]

Sources: s1 guide:instrument#duck · s2 guide:synth-engines#change-engine · s3 note 30

### Recipe — turn a sound into a pluck [howto.pluck]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: pluck, plucky, short notes, staccato sound, percussive synth, plucked bass
Where: modes instrument; screens M2, M3

A pluck starts at once and dies away while the key is still down — on `M2` set attack 0, a short decay and no sustain, then let the filter envelope close the tone as the note fades.

A pluck cuts through a mix because its energy sits at the start of the note. The amp envelope makes
the level drop away and the filter envelope makes the tone drop with it, which is what makes it
sound plucked rather than merely short. With sustain at 0 nothing lingers, so fast sequences and
arpeggios stay clean. Longer decays drift towards bells and keys; a touch of FX II on
`shift + M3` gives the tail back without blurring the attack.

Facts:
- With sustain at 0 a note fades out over the decay time even while its key is held, so the decay sets the length of the pluck. [#shape] (derived) [s1]
- Decay on `E2` of `M2` grows longer as it is turned clockwise; around 15–30 gives a pluck, higher values a longer ring. [#decay] (derived) [s2]
- Release runs the other way on the OP-XY, clockwise being shorter, so a crisp pluck wants `E4` well clockwise; lower values let notes ring on after the key comes up. [#release] (derived) [s2]
- Clicking any encoder on `M2` swaps between the amp and the filter envelope, so the same four encoders set both. [#swap] [s1]
- For a pluck that starts bright and darkens, lower the cutoff on `M3`, raise the envelope amount on `E3`, and give the filter envelope a short decay and no sustain as well. [#filter] (derived) [s3]
- A little resonance on `E2` of `M3` adds a squelch as the filter closes. [#resonance] (derived) [s3]

Procedures:
- Make the notes on T3 pluck [#amp] (derived) [s1]
  Needs: instrument mode
  1. `T3 → M2` — the amp envelope; click an encoder if the filter envelope is in front
  2. `turn E1` — attack 0 {set amp attack = 0}
  3. `turn E2` — decay around 25 {set amp decay = 25}
  4. `turn E3` — sustain 0 {set amp sustain = 0}
  5. `turn E4` — release around 80, a short tail {set amp release = 80}
- Let the filter close with every pluck [#filter] (derived) [s3]
  1. `click E1` — the filter envelope
  2. `turn E2` — filter decay around 30 {set filter decay = 30}
  3. `turn E3` — filter sustain 0 {set filter sustain = 0}
  4. `M3` — press it again if the page shows off
  5. `turn E1` — cutoff around 30 {set cutoff = 30}
  6. `turn E2` — resonance around 30 {set resonance = 30}
  7. `turn E3` — envelope amount around 50 {set env amount = 50}

Related: [instrument.envelopes], [instrument.filter], [howto.first-bassline], [howto.pad-swell]

Sources: s1 guide:instrument#envelopes · s2 note 59 · s3 guide:instrument#filter

### Recipe — a pad that swells in and fades slowly [howto.pad-swell]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: pad, swell, slow attack, ambient pad, fade in, long release, string swell
Where: modes instrument; screens M2, M3

For a pad, play in poly with a slow attack, a high sustain and a long release — on the OP-XY that is `E4` turned counter-clockwise — open the filter slowly with its envelope and send the track to the reverb on FX II.

A pad is a bed rather than a part: it should arrive softly, hold still and leave slowly, so
nothing about it grabs attention from the beat. The slow amp attack and long release do most of the
work; the slow filter opening adds movement inside each chord. Hold chords for a bar or more and let
them overlap, and duck the pad with the kick if it muddies the low end.

Facts:
- Chords need play mode poly, `shift + turn E1` on `M2`, so that every note of the chord sounds. [#poly] (derived) [s1]
- A slow attack on `E1` of `M2` makes each chord fade in rather than start at once; the higher the value, the slower the swell. [#attack] (derived) [s1]
- A high sustain keeps the chord at full level for as long as the keys are held. [#sustain] (derived) [s1]
- For a long fade after the keys come up, turn release on `E4` counter-clockwise; on the OP-XY lower release values ring longer. [#release] (derived) [s2]
- A slow filter attack with a positive envelope amount on `M3` opens the tone as the chord swells, so the pad brightens as it grows louder. [#filter-swell] (derived) [s3]
- In a new project FX II holds a reverb, so the FX II send, `shift + turn E4` on `M3`, adds space to the pad. [#reverb] (measured) [s4]

Procedures:
- Make the chords on T7 swell in and fade out [#swell] (derived) [s1]
  Needs: instrument mode
  1. `T7 → M2` — the amp envelope; click an encoder if the filter envelope is in front
  2. `shift + turn E1` — play mode poly {set play mode = poly}
  3. `turn E1` — attack around 60 {set amp attack = 60}
  4. `turn E3` — sustain around 85 {set amp sustain = 85}
  5. `turn E4` — release around 20, a long fade {set amp release = 20}
- Let the pad brighten as it swells, in a little reverb [#brighten] (derived) [s3]
  1. `click E1` — the filter envelope
  2. `turn E1` — filter attack around 70 {set filter attack = 70}
  3. `M3` — press it again if the page shows off
  4. `turn E1` — cutoff around 35 {set cutoff = 35}
  5. `turn E3` — envelope amount around 40 {set env amount = 40}
  6. `shift + turn E4` — FX II send around 50 {set fx ii send = 50}

Related: [instrument.envelopes], [instrument.play-mode], [instrument.track-sends], [howto.first-chords]

Sources: s1 guide:instrument#envelopes · s2 note 59 · s3 guide:instrument#filter · s4 note 30

### Recipe — a filter wobble in time with the beat [howto.wobble]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: wobble, wobble bass, lfo on cutoff, filter wobble, rhythmic filter, auto filter
Where: modes instrument; screens M4, M3

Pick the value LFO on `M4`, aim it at the cutoff on the filter page and give it a tempo-synced speed; the amount sets how far the filter swings.

A wobble is a filter sweep that repeats in time, the sound of a hand rocking the cutoff knob back
and forth. Faster synced speeds make it busier, slower ones turn it into a long rise and fall over
the bar. Parameter locks on the LFO speed for single steps give the classic change of pace in the
middle of a phrase.

Facts:
- The value LFO turns one encoder of the track's pages up and down by itself, like a hand moving the knob in a loop. [#value] (derived) [s1]
- Destination on `E3` picks the page, filter for a wobble, and parameter on `E4` picks the encoder there; cutoff is the first of the filter page's four. [#target] [s1]
- Over the anti-clockwise part of its range the speed follows the tempo, so the wobble stays locked to the beat. [#synced] [s1]
- On the plain filter destination the wobble restarts with every note, so each note wobbles the same way; its free twin keeps running across notes. [#restart] [s1]
- A moderate cutoff with some resonance on `M3` makes the sweep easy to hear; with the cutoff fully open there is little left to move. [#audible] (derived) [s2]

Procedures:
- Make the filter on T3 wobble in time [#set-up] (derived) [s1]
  Needs: instrument mode
  1. `T3 → M4`
  2. `shift + M4` — the LFO types
  3. `turn E1` — highlight value
  4. `click E1` — takes it; press `M4` if the page changed {set lfo type = value}
  5. `turn E1` — a synced speed, such as 4 {set lfo speed = 4}
  6. `turn E2` — amount around 60 {set lfo amount = 60}
  7. `turn E3` — destination filter {set lfo destination = filter}
  8. `turn E4` — parameter 1, the cutoff {set lfo parameter = 1}
- Give the wobble something to move [#audible] (derived) [s2]
  1. `M3` — press it again if the page shows off
  2. `turn E1` — cutoff around 40 {set cutoff = 40}
  3. `turn E2` — resonance around 45 {set resonance = 45}

Related: [instrument.lfo-value], [instrument.lfo], [instrument.filter], [howto.acid-bass]

Sources: s1 guide:instrument#lfo · s2 guide:instrument#filter

### Recipe — a squelchy acid bass [howto.acid-bass]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: acid, acid bass, acid line, squelch, resonant bass, sliding bass
Where: modes instrument; screens M3, M2

On the bass track pick the ladder filter, set a low cutoff, high resonance and a strong, short filter envelope, then play mode legato with a little portamento so that overlapping notes slide.

Acid lives in the filter: a bright snap at the start of each note that closes almost at once, with
resonance singing at the cutoff. Program the line with some notes overlapping so they slide, and a
few locked accents where the filter opens further. Riding the cutoff live while the pattern loops is
half the fun.

Facts:
- Picking a filter type from `shift + M3` takes you back to `M1`, so press `M3` to go on with the filter. [#type-return] (verified 1.1.33) [s1]
- A low cutoff, high resonance and a large envelope amount with a short filter decay make each note open and snap shut, the acid squelch. [#squelch] (derived) [s2]
- In legato play mode one note sounds at a time, and portamento makes overlapping notes glide from one pitch to the next. [#slide] (derived) [s3]
- Parameter locks on the cutoff or the envelope amount for single steps give the line its accents. [#accents] (derived) [s4]

Procedures:
- Give the bass on T3 a squelchy filter [#filter] (derived) [s2]
  Needs: instrument mode
  1. `T3 → shift + M3` — the filter types
  2. `turn E1` — highlight ladder
  3. `click E1` — takes it and goes back to `M1` {set filter type = ladder}
  4. `M3` — press it again if the page shows off
  5. `turn E1` — cutoff around 20 {set cutoff = 20}
  6. `turn E2` — resonance around 70 {set resonance = 70}
  7. `turn E3` — envelope amount around 70 {set env amount = 70}
- Snap the filter shut and let the notes slide [#envelope] (derived) [s3]
  1. `M2` — click an encoder until the filter envelope is in front
  2. `turn E2` — filter decay around 25 {set filter decay = 25}
  3. `turn E3` — filter sustain 0 {set filter sustain = 0}
  4. `shift + turn E1` — play mode legato {set play mode = legato}
  5. `shift + turn E2` — portamento around 20 {set portamento = 20}

Related: [instrument.filter], [instrument.play-mode], [sequencer.parameter-locks], [howto.wobble]

Sources: s1 note 59 · s2 guide:instrument#filter · s3 guide:instrument#envelopes · s4 guide:sequencer#step-sequencing
