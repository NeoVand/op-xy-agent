---
id: instrument.lfo
title: LFO page and LFO types (M4)
aliases: [lfo, low frequency oscillator, modulation, lfo type, modulation source, M4 page]
area: instrument
order: 40
context:
  modes: [instrument]
  screens: [M4]
summary: '`M4` holds one LFO per track in five types — duck, element, random, tremolo and value. `shift + M4` changes the type; most types share one layout: source or speed, amount, destination page, parameter.'
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.0.15', '1.1.0', '1.1.3']
  guide_version: '1.1.15'
  verified_on: '1.1.33'
facts:
  - id: types
    text: '`shift + M4` switches the LFO type between duck, element, random, tremolo and value.'
    source: https://teenage.engineering/guides/op-xy/instrument#lfo
  - id: five-not-four
    text: Duck arrived in OS 1.1.0; the guide's sentence listing the LFO types still counts four and leaves it out.
    source: https://teenage.engineering/downloads/op-xy#1.1.0
    firmware_min: '1.1.0'
  - id: layout
    text: In element, random and value, `E1` sets the source or speed, `E2` the amount, `E3` the destination page and `E4` the parameter on that page; duck and tremolo use their own layouts.
    source: https://teenage.engineering/guides/op-xy/instrument#lfo
  - id: target
    text: The destination is one of the track's module pages and the parameter is one of that page's four encoders; `E4` can be turned or clicked to choose it.
    source: https://teenage.engineering/guides/op-xy/instrument#lfo
  - id: sub-functions
    text: Extra settings sit behind encoder clicks or `shift` plus a turn; on some types a click on `E1` changes the waveform shape.
    source: https://teenage.engineering/guides/op-xy/instrument#lfo
  - id: speed
    text: Speed controls are tempo-synced over their anti-clockwise range; turned clockwise until a dial icon appears, they run at a free rate.
    source: https://teenage.engineering/guides/op-xy/instrument#lfo
  - id: speed-screen
    text: On screen a synced speed reads as a count beside a note value, 8 with a 32nd at the slow end, then 6 with a 16th, 4 with a quarter and 2 with a whole note as it turns; from the middle of its range a clock dial shows the free rate.
    source: docs/research/59-screen-profiling.md#24-lfo-instrument-m4-five-types
    confidence: verified
    verified_on: '1.1.33'
  - id: synced-rates
    text: 'Synced, the speed doubles every eighth of the lane: in the middle of the synced range one cycle lasts a quarter note, anticlockwise an eighth, a 16th, a 32nd and a 64th, clockwise a half note and a bar.'
    source: docs/research/60-sound-session.md#4-lfos
    confidence: verified
    verified_on: '1.1.33'
  - id: free-rates
    text: Free, the LFO stands still at the dial's first position and speeds up ever faster, to about 21.5 cycles a second at the end.
    source: docs/research/60-sound-session.md#4-lfos
    confidence: verified
    verified_on: '1.1.33'
  - id: amount-centre
    text: Amount ladders are centred on zero (CC 64 over MIDI); either side of it sets the same depth with the modulation inverted.
    source: docs/research/60-sound-session.md#4-lfos
    confidence: verified
    verified_on: '1.1.33'
  - id: cutoff-depth
    text: Aimed at a filter's cutoff, value and random sweep its whole range at full amount; half the amount from a middle cutoff already reaches both ends.
    source: docs/research/60-sound-session.md#4-lfos
    confidence: verified
    verified_on: '1.1.33'
  - id: negative
    text: The amount can go below zero to invert the modulation; OS 1.1.3 fixed how negative amounts are drawn.
    source: https://teenage.engineering/downloads/op-xy#1.1.3
    firmware_min: '1.1.3'
    confidence: derived
  - id: drum-reset
    text: On drum tracks the LFO restarts with every new note.
    source: https://teenage.engineering/downloads/op-xy#1.0.15
    firmware_min: '1.0.15'
  - id: midi-ccs
    text: Over MIDI, CC40–43 on the track's channel drive the four `M4` encoders in order, in all five LFO types.
    source: docs/research/59-screen-profiling.md#3-midi-reach-on-1133-verified-on-screen
    confidence: verified
    verified_on: '1.1.33'
  - id: no-type-cc
    text: No MIDI CC is known for the LFO type.
    source: docs/research/20-midi-control.md#33-instrument-tracks-18-synth-drum-sampler-multisampler-engines
    confidence: community-verified
  - id: off
    text: With the LFO off, the page is dimmed under an off box; pressing `M4` again switches the LFO on.
    source: docs/research/59-screen-profiling.md#24-lfo-instrument-m4-five-types
    confidence: verified
    verified_on: '1.1.33'
procedures:
  - id: type
    goal: Change the LFO type of the selected track
    preconditions: [instrument mode, the track is selected]
    steps:
      - keys: shift + M4
    source: https://teenage.engineering/guides/op-xy/instrument#lfo
related:
  [
    instrument.lfo-duck,
    instrument.lfo-element,
    instrument.lfo-random,
    instrument.lfo-tremolo,
    instrument.lfo-value,
    sequencer.parameter-locks
  ]
---

An LFO rides a knob for you. Choose what drives the movement — a repeating wave (value), random steps
(random), the unit's motion, microphone or envelope (element), another track's rhythm (duck) — then
aim it at an encoder on the track's pages. Tremolo skips the aiming: it is wired to pitch and volume.
