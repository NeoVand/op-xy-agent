# OP-XY manual

Our own reworded, agent-oriented manual for the teenage engineering OP-XY, written for OS 1.1.33. It is derived from TE's online guide (v1.1.15), the OS changelog and checks on a real unit; 6 units, 81 facts, 21 procedures, 8 parameters.

## How to read this manual

- Key combos: `A + B` = hold A, then press B (every key but the last is held); `A → B` = press A, release, then press B; `→ +` = keep the earlier keys held; `hold A` = long press; `turn E1` / `click E1` = rotate / push an encoder. E1–E4 are the dark gray, mid gray, light gray and white encoders.
- Controls: `T1`…`T8` track keys, `step 1`…`step 16` step keys, `M1`…`M4` module keys under the screen, `[-]` / `[+]` minus / plus, `key F#3` a keyboard key, `natural 1`…`natural 14` white keys and `accidental 1`…`accidental 0` black keys counted from the left. Placeholders: `Tn`, `step n`, `key`, `natural`, `accidental` = any one; `steps`, `keys`, `naturals`, `accidentals` = one or more.
- Status: current = the guide (v1.1.15) still matches; outdated-in-guide = firmware after the guide changed it; changelog-only = the guide is silent and the OS changelog documents it; unverified = community or inferred, not yet confirmed.
- Tags: (since X) = needs OS X or newer; (verified X) = observed on a real unit running OS X; (community), (derived), … = confidence below official.
- Cite a unit as [unit-id] and a fact as [unit-id#fact-id]. Items end with [sN], a source listed at the end of their unit; send users to TE’s page for the original.
- Sources: guide:X = https://teenage.engineering/guides/op-xy/X (guide:#Y = https://teenage.engineering/guides/op-xy#Y); changelog:V = the OS V entry at https://teenage.engineering/downloads/op-xy; research:N = docs/research/N.md in the op-xy-agent repository (our own notes, e.g. the device probe log). Link a release with https://teenage.engineering/downloads/op-xy#1.1.21 (1.0.29 is the one exception: https://teenage.engineering/downloads/op-xy#1.0.28).

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
- `shift` does nothing alone: held with another key it opens that key's secondary function or page. [#shift-key] [s6]
- The two-octave keyboard of 24 keys lies right of the transport keys, below the step keys. [#keyboard] [s7]
- Every white key carries the icon of one step component; counted from the left they are `natural 1`…`natural 14`. [#naturals] [s8]
- The ten black keys double as number keys, marked 1–9 and 0 from the left; this manual calls them `accidental 1`…`accidental 0`. [#accidentals] [s9]
- `sample` (top right corner) starts sampling from any screen. [#sample-key] [s10]
- `project` opens the list of projects, where you create, open and manage them. [#project-key] [s11]
- `tempo` sets the song speed, the swing and the metronome. [#tempo-key] [s12]
- `com` is the hub for system settings, wired and wireless connections and output routing. [#com-key] [s13]
- `player` turns the notes of a track into arpeggios, chords and other note effects. [#player-key] [s14]
- `bar` lengthens the sequence and holds sequence-wide settings such as quantisation. [#bar-key] [s15]
- The volume knob is at the top left, next to the speaker. [#volume] [s16]
- The four encoders shade from dark to light: dark gray, mid gray, light gray and white. This manual calls them `E1`, `E2`, `E3` and `E4` in that order. [#encoders] [s17]
- The pitchbend strip on the lower left edge responds to pressure — push its left end to bend down, its right end to bend up. [#pitchbend] [s18]
- The right side carries the power switch, the USB-C port and four 3.5 mm jacks — audio out, multi-out, MIDI in and audio in. [#sockets] [s19]
- A small built-in microphone and a vertical LED level meter sit in the top right margin. [#mic-and-meter] [s19]
- Holding `com` turns the level meter into a rough battery gauge. [#battery] (since 1.0.36) [s20]

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
- Check the battery level [#battery] (since 1.0.36) [s20]
  1. `hold com` — read the level meter in the top right margin

Related: [sequencer.step-components], [com.midi-settings]

Sources: s1 research:50-hardware-ui#14-the-grid-plan-view · s2 guide:layout#main-modes · s3 guide:layout#modules · s4 guide:layout#track-buttons · s5 guide:layout#sequencer · s6 guide:layout#transport-controls · s7 guide:layout#keyboard · s8 guide:step-components#adding-step-components-to-a-sequence · s9 guide:step-components#step-components-ref-table · s10 guide:layout#sample · s11 guide:layout#projects · s12 guide:layout#tempo · s13 guide:layout#com · s14 guide:layout#players · s15 guide:layout#bar · s16 guide:layout#volume · s17 guide:layout#encoders · s18 guide:hardware-overview#speaker-volume-pitchbend · s19 guide:hardware-overview#inputs-outputs · s20 changelog:1.0.36

## Sequencer

Step and live recording, editing steps, parameter locks, the bar menu and the step components.

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
- To lock a value, keep a step held and turn an encoder; the step remembers the value you dial in. [#record] [s1]
- Each time the sequencer reaches a locked step, the parameter takes that step's stored value. [#playback] [s1]
- Any parameter on the four module pages can carry locks; the settings of players cannot. [#scope] [s1]
- By default the value jumps at each locked step. The shape control in the bar menu (`bar + turn E4`) smooths the movement between locks. [#stepped] [s2]
- Knob moves recorded live while holding `record` are also stored step by step, so they play back stepped until you add smoothing. [#live-automation] [s3]
- Copying a step to an empty step brings its locks along with its notes and step components. [#copy] [s1]
- `bar + M2` removes every lock in the pattern and leaves the notes in place. [#clear-pattern] [s2]
- Clearing the whole track with `record + hold stop` removes its locks too. [#clear-track] (since 1.0.15) [s4]
- The skip parameter lock step component (`natural 12`) lets a step's locks play only on every Nth pass, for automation that appears once every few repeats. [#skip-component] [s5]
- Tracks using the drum or synth sampler accept locks as well. [#samplers] (since 1.1.0) [s6]
- Duplicating a bar with `bar + shift + [+]` copies its locks and step components too. [#duplicate-bar] (since 1.1.3) [s7]
- Shifting a track's sequence with `Tn + [-]/[+]` moves the locks together with the notes. [#rotate] (since 1.1.21) [s8]
- A lock can sit on a step that has no note; before OS 1.1.33 a bug prevented adding one there. [#empty-steps] (since 1.1.33) [s9]

Procedures:
- Lock a parameter value on one step [#add] [s1]
  Needs: the track is selected; the module page with the parameter is on screen
  1. `step n + turn E1…E4` — keep holding the step while turning; any page parameter works
  Result: The step plays back with the new value from now on.
- Record knob movements into the pattern while it plays [#record-live] [s3]
  Needs: the pattern is playing
  1. `record + turn E1…E4`
  Result: The movement is stored per step, like locks.
- Glide between locked values instead of jumping [#smooth] [s2]
  1. `bar + turn E4`
- Remove all locks from the pattern but keep its notes [#clear] [s2]
  1. `bar + M2`
- Copy a step, locks included, to another step [#copy-step] [s1]
  1. `hold step n → step m` — let go of the first step, then press the target step, which must be empty

Related: [sequencer.step-components], [instrument.engine-prism]

Sources: s1 guide:sequencer#step-sequencing · s2 guide:sequencer#extend-with-bar · s3 guide:sequencer#live-recording · s4 changelog:1.0.15 · s5 guide:step-components · s6 changelog:1.1.0 · s7 changelog:1.1.3 · s8 changelog:1.1.21 · s9 changelog:1.1.33

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

Related: [sequencer.parameter-locks], [hardware.layout]

Sources: s1 guide:step-components#what-are-step-components · s2 guide:step-components#adding-step-components-to-a-sequence · s3 guide:step-components#step-components-ref-table · s4 guide:step-components · s5 changelog:1.1.3 · s6 changelog:1.1.21 · s7 changelog:1.1.32

## Instrument

Instrument tracks: engines (synths, samplers, MIDI), envelopes, filter, LFO, preset settings and presets.

### Prism synth engine [instrument.engine-prism]
current · OS ≥ 1.0.9 · guide v1.1.15
Also called: prism, prism engine, prism synth
Where: modes instrument; screens M1

A general-purpose synth engine for bass lines, leads and most other parts; its M1 page covers waveform, oscillator ratio, detune and stereo width.

Prism runs several oscillators and gives you four controls over how they relate: their waveform,
their tuning ratio, how far apart they drift in pitch and how wide they spread. Little detune and a
narrow image keep it tight for bass; more of both makes it broad enough for leads and pads.

Everything else about the sound — how notes start and fade (M2), the filter (M3) and modulation
(M4) — is shared by all engines, so a prism patch is shaped the same way as any other synth patch.
TE's guide gives no numeric ranges or defaults for prism's parameters; read them off the screen
while turning, and treat the CC numbers as community findings rather than TE documentation.

Facts:
- Prism is one of the eight built-in synth engines. Each instrument track runs one engine, chosen per track. [#one-of-eight] [s1]
- Prism is the everyday workhorse among the engines, suited to bass lines, leads and most parts in between. [#character] [s2]
- Only the M1 page belongs to the engine. Envelopes (M2), filter (M3) and LFO (M4) work the same whichever synth engine a track uses. [#m1-is-engine] [s3]
- Like every module-page parameter, prism's four M1 settings can be parameter-locked per step. [#lockable] [s4]
- Over MIDI, the four M1 encoders answer CC12, CC13, CC14 and CC15 on the track's channel, whatever engine is loaded. [#midi-ccs] (community-verified) [s5]

Procedures:
- Put the prism engine on the selected instrument track [#choose] [s6]
  Needs: instrument mode; the track is selected
  1. `shift + M1` — opens the engine list
  2. `turn E1` — scroll to prism
  3. `click E1` — pressing M1 confirms as well
  Result: The track now plays through prism and M1 shows its four parameters.

Parameters:

| screen | control | name | range | default | CC | notes |
| --- | --- | --- | --- | --- | --- | --- |
| M1 | `turn E1` | shape | – | – | 12 | waveform of the oscillators s2 |
| M1 | `turn E2` | ratio | – | – | 13 | tuning ratio between the oscillators s2 |
| M1 | `turn E3` | detune | – | – | 14 | small pitch offset between the oscillators, for a thicker sound s2 |
| M1 | `turn E4` | stereo | – | – | 15 | how far the oscillators spread across the stereo field s2 |

Related: [sequencer.parameter-locks], [instrument.save-to-same-snapshot]

Sources: s1 guide:synth-engines#arrange · s2 guide:synth-engines#prism · s3 guide:instrument#engine · s4 guide:sequencer#step-sequencing · s5 research:20-midi-control#34-engine-resolved-names-for-cc1215-p1p4 · s6 guide:synth-engines#change-engine

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

Sources: s1 guide:instrument#view-and-create-preset · s2 changelog:1.1.17 · s3 changelog:1.1.18 · s4 research:90-device-probe#2026-09-26--session-1-results-owner-present-scratch-project-os-1133

## Connectivity

The com hub: system settings, MIDI settings and monitor, controller mode, devices, MTP, multi-out and the MIDI CC reference.

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

Related: [hardware.layout]

Sources: s1 guide:com#system-settings · s2 research:90-device-probe#2026-09-26--session-1-results-owner-present-scratch-project-os-1133 · s3 research:20-midi-control#91-settings-that-gate-midi · s4 changelog:1.0.15 · s5 changelog:1.0.29 · s6 guide:com#midi-monitor · s7 guide:com#devices
