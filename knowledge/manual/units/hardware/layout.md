---
id: hardware.layout
title: Panel layout
aliases: [top panel, front panel, control map, where is a key, buttons and knobs]
area: hardware
order: 0
summary: A map of the top panel — mode keys, module keys, track and step keys, transport, keyboard, function keys, encoders, screen and sockets — and the names this manual uses for each.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.0.36']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: grid
    text: Seen from above, the controls sit on a grid of 17 columns and 6 rows. The top two rows hold the speaker, the volume knob, the screen and the four encoders; keys fill the four rows below.
    source: docs/research/50-hardware-ui.md#14-the-grid-plan-view
    confidence: measured
  - id: rows
    text: 'Row three runs mode keys, `M1`…`M4`, then `T1`…`T8`; row four is `step 1`…`step 16`; the bottom two rows put `record`, `play`, `stop` above `[-]`, `[+]`, `shift` on the left, with the keyboard to their right.'
    source: docs/research/50-hardware-ui.md#14-the-grid-plan-view
    confidence: measured
  - id: right-column
    text: The rightmost column holds `sample`, `com`, `player` and `bar`, top to bottom; `project` and `tempo` sit just below the volume knob.
    source: docs/research/50-hardware-ui.md#14-the-grid-plan-view
    confidence: measured
  - id: mode-keys
    text: 'Four keys pick the main mode: `instrument` for the eight sound tracks, `auxiliary` for the eight utility tracks (brain, punch-in FX, external gear, tape, send effects), `arrange` for patterns, scenes and songs, and `mix` for levels, pans, EQ and the master compressor.'
    source: https://teenage.engineering/guides/op-xy/layout#main-modes
  - id: module-keys
    text: The keys printed 1 to 4 directly under the screen are the module keys, written `M1`…`M4`. Each opens one page of the current mode, and the four encoders then edit what that page shows.
    source: https://teenage.engineering/guides/op-xy/layout#modules
  - id: arrange-no-modules
    text: Arrange is the only main mode without module pages.
    source: https://teenage.engineering/guides/op-xy/layout#modules
  - id: shift-layer
    text: Some pages keep a second set of parameters on a shift layer, reached by holding `shift`.
    source: https://teenage.engineering/guides/op-xy/layout#modules
  - id: track-keys
    text: The eight track keys under the encoders choose which track you edit — an instrument track in instrument mode, an auxiliary track in auxiliary mode.
    source: https://teenage.engineering/guides/op-xy/layout#track-buttons
  - id: step-keys
    text: The sixteen step keys across the middle form the step sequencer, the grid you program notes and sounds into.
    source: https://teenage.engineering/guides/op-xy/layout#sequencer
  - id: transport
    text: '`record` arms recording of notes and knob moves, `play` starts playback and `stop` halts it.'
    source: https://teenage.engineering/guides/op-xy/layout#transport-controls
  - id: play-again
    text: Pressing `play` again during playback jumps back to the start of the pattern.
    source: https://teenage.engineering/guides/op-xy/layout#transport-controls
  - id: stop-again
    text: A second press of `stop` cuts off every note and sound that is still ringing.
    source: https://teenage.engineering/guides/op-xy/layout#transport-controls
  - id: octave-keys
    text: '`[-]` and `[+]` move the keyboard one octave down or up; several pages give them other jobs.'
    source: https://teenage.engineering/guides/op-xy/layout#transport-controls
  - id: octave-popup
    text: On an instrument page, `[-]` and `[+]` bring up a small white card low in the middle of the screen, with a mini keyboard and the octave offset in thin digits (+0, +1, −1, −3 …); it fades after a second or two. On the external CV page the offset appears inside the meter card instead.
    source: docs/research/59-screen-profiling.md#212-octave-popup
    confidence: verified
    verified_on: '1.1.33'
  - id: shift-key
    text: "`shift` does nothing alone: held with another key it opens that key's secondary function or page."
    source: https://teenage.engineering/guides/op-xy/layout#transport-controls
  - id: keyboard
    text: The two-octave keyboard of 24 keys lies right of the transport keys, below the step keys.
    source: https://teenage.engineering/guides/op-xy/layout#keyboard
  - id: naturals
    text: Every white key carries the icon of one step component; counted from the left they are `natural 1`…`natural 14`.
    source: https://teenage.engineering/guides/op-xy/step-components#adding-step-components-to-a-sequence
  - id: accidentals
    text: The ten black keys double as number keys, marked 1–9 and 0 from the left; this manual calls them `accidental 1`…`accidental 0`.
    source: https://teenage.engineering/guides/op-xy/step-components#step-components-ref-table
  - id: sample-key
    text: '`sample` (top right corner) starts sampling from any screen.'
    source: https://teenage.engineering/guides/op-xy/layout#sample
  - id: project-key
    text: '`project` opens the list of projects, where you create, open and manage them.'
    source: https://teenage.engineering/guides/op-xy/layout#projects
  - id: tempo-key
    text: '`tempo` sets the song speed, the swing and the metronome.'
    source: https://teenage.engineering/guides/op-xy/layout#tempo
  - id: com-key
    text: '`com` is the hub for system settings, wired and wireless connections and output routing.'
    source: https://teenage.engineering/guides/op-xy/layout#com
  - id: player-key
    text: '`player` turns the notes of a track into arpeggios, chords and other note effects.'
    source: https://teenage.engineering/guides/op-xy/layout#players
  - id: bar-key
    text: '`bar` lengthens the sequence and holds sequence-wide settings such as quantisation.'
    source: https://teenage.engineering/guides/op-xy/layout#bar
  - id: volume
    text: The volume knob is at the top left, next to the speaker.
    source: https://teenage.engineering/guides/op-xy/layout#volume
  - id: encoders
    text: 'The four encoders shade from dark to light: dark gray, mid gray, light gray and white. This manual calls them `E1`, `E2`, `E3` and `E4` in that order.'
    source: https://teenage.engineering/guides/op-xy/layout#encoders
  - id: pitchbend
    text: The pitchbend strip on the lower left edge responds to pressure — push its left end to bend down, its right end to bend up.
    source: https://teenage.engineering/guides/op-xy/hardware-overview#speaker-volume-pitchbend
  - id: sockets
    text: The right side carries the power switch, the USB-C port and four 3.5 mm jacks — audio out, multi-out, MIDI in and audio in.
    source: https://teenage.engineering/guides/op-xy/hardware-overview#inputs-outputs
  - id: mic-and-meter
    text: A small built-in microphone and a vertical LED level meter sit in the top right margin.
    source: https://teenage.engineering/guides/op-xy/hardware-overview#inputs-outputs
  - id: battery
    text: Holding `com` turns the level meter into a rough battery gauge.
    source: https://teenage.engineering/downloads/op-xy#1.0.36
    firmware_min: '1.0.36'
procedures:
  - id: switch-mode
    goal: Switch to another main mode
    steps:
      - keys: instrument/auxiliary/arrange/mix
    source: https://teenage.engineering/guides/op-xy/layout#main-modes
  - id: open-page
    goal: Open one of the current mode's module pages
    steps:
      - keys: M1…M4
    source: https://teenage.engineering/guides/op-xy/layout#modules
  - id: shift-page
    goal: Show the shift-layer parameters of the current page
    steps:
      - keys: hold shift
        note: the extra parameters stay while shift is down
    source: https://teenage.engineering/guides/op-xy/layout#modules
  - id: select-track
    goal: Choose the track to edit
    steps:
      - keys: T1…T8
    source: https://teenage.engineering/guides/op-xy/layout#track-buttons
  - id: restart
    goal: Restart playback from the top of the pattern
    preconditions: [playback is running]
    steps:
      - keys: play
    source: https://teenage.engineering/guides/op-xy/layout#transport-controls
  - id: silence
    goal: Stop and silence everything
    steps:
      - keys: stop → stop
    source: https://teenage.engineering/guides/op-xy/layout#transport-controls
  - id: octave
    goal: Move the keyboard an octave down or up
    steps:
      - keys: '[-]/[+]'
    source: https://teenage.engineering/guides/op-xy/layout#transport-controls
  - id: battery
    goal: Check the battery level
    steps:
      - keys: hold com
        note: read the level meter in the top right margin
    source: https://teenage.engineering/downloads/op-xy#1.0.36
    firmware_min: '1.0.36'
related: [sequencer.step-components, com.midi-settings]
---

The OP-XY packs everything into one flat grid of square keys, so a few landmarks make it easy to
find your way. The left block is about _where you are_: the four mode keys (`instrument`,
`auxiliary`, `arrange`, `mix`) and, below them, the transport. The middle is about _what you edit_:
the module keys `M1`…`M4` under the screen choose a page, the track keys under the encoders choose a
track, and the step keys below them are the sequencer. The right-hand column holds the utility keys
(`sample`, `com`, `player`, `bar`).

Most editing follows one pattern: pick a mode, pick a track, pick a page, then `turn E1`…`E4`.
`shift` reaches a second layer of almost every key and page, and the keyboard's white and black keys
double as step-component and number keys when a page asks for them.
