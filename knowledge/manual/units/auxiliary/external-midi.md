---
id: auxiliary.external-midi
title: External MIDI track
aliases: [midi track, ext midi, control a synth, midi cc slots]
area: auxiliary
order: 30
context:
  modes: [auxiliary]
  screens: [M1, M2, M3, M4]
summary: '`T3` plays and sequences outside MIDI gear over USB-C or the multi-out, sending on the channel set on `M1` (with bank and program); `M2` and `M3` hold eight CC slots and `M4` an LFO.'
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.1.15']
  guide_version: '1.1.15'
  verified_on: '1.1.33'
facts:
  - id: track
    text: The external MIDI track (`T3`) sends its keyboard and sequencer notes to connected MIDI gear.
    source: https://teenage.engineering/guides/op-xy/auxiliary#external-midi
  - id: ports
    text: Gear connects through the USB-C port, or through the multi-out jack set to midi.
    source: https://teenage.engineering/guides/op-xy/auxiliary#external-midi
  - id: send-channel
    text: Notes and CC values leave on the channel set with `E1` on `M1`, so set it to the channel the outside synth listens on.
    source: https://teenage.engineering/guides/op-xy/auxiliary#external-midi
  - id: no-project-channel
    text: TE's MIDI how-to sets only this `M1` channel; the project's midi page plays no part in it.
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-control-a-synth-with-midi
  - id: slots
    text: "`M2` and `M3` hold four CC slots each; turning sends a slot's value, `shift + turn E1…E4` switches a slot on and picks its CC number, and the values can be sequenced and recorded."
    source: https://teenage.engineering/guides/op-xy/auxiliary#external-midi
  - id: lfo
    text: The external MIDI track's LFO (`M4`) modulates the track's own parameters, such as a CC slot.
    source: https://teenage.engineering/guides/op-xy/auxiliary#external-midi
  - id: program-locks
    text: Program changes can be parameter-locked; OS 1.1.15 fixed such locks not working.
    source: https://teenage.engineering/downloads/op-xy#1.1.15
    firmware_min: '1.1.15'
  - id: ccs
    text: Community charts put the slot values on CC20–23 and CC32–35 of channel 11 and the slot numbers on CC28–31 and CC36–39.
    source: docs/research/20-midi-control.md#35-auxiliary-tracks-916
    confidence: community
  - id: midi
    text: Received on channel 11, CC12–14 set the track's channel, bank and program and CC40–43 drive the `M4` LFO; CC15 does nothing.
    source: docs/research/59-screen-profiling.md#213-auxiliary-tracks
    confidence: verified
    verified_on: '1.1.33'
  - id: screen
    text: The `M1` page is headed midi with a DIN socket icon; channel reads 01–16, and bank and program show a crossed box at 0, then 1–128.
    source: docs/research/59-screen-profiling.md#213-auxiliary-tracks
    confidence: verified
    verified_on: '1.1.33'
  - id: slot-pages
    text: '`M2` and `M3` slide in sideways from `M1`; each CC slot is a crossed box while off, or a large value with cc and its number underneath.'
    source: docs/research/59-screen-profiling.md#213-auxiliary-tracks
    confidence: verified
    verified_on: '1.1.33'
  - id: lfo-screen
    text: The `M4` LFO offers the CC slots as its destinations; a slot without a CC shows no cc set as the parameter.
    source: docs/research/59-screen-profiling.md#213-auxiliary-tracks
    confidence: verified
    verified_on: '1.1.33'
procedures:
  - id: setup
    goal: Play an outside synth from the OP-XY
    preconditions: [the synth is connected over USB-C, or to the multi-out set to midi]
    steps:
      - keys: auxiliary → T3
      - keys: turn E1
        note: on `M1`, the channel the synth listens on
      - keys: keys
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-control-a-synth-with-midi
parameters:
  - screen: M1
    encoder: E1
    layer: base
    name: channel
    range: 1–16
    cc: 12
    source: https://teenage.engineering/guides/op-xy/auxiliary#external-midi
  - screen: M1
    encoder: E2
    layer: base
    name: bank
    range: off, 1–128
    cc: 13
    source: docs/research/59-screen-profiling.md#213-auxiliary-tracks
    confidence: verified
    verified_on: '1.1.33'
  - screen: M1
    encoder: E3
    layer: base
    name: program
    range: off, 1–128
    cc: 14
    source: docs/research/59-screen-profiling.md#213-auxiliary-tracks
    confidence: verified
    verified_on: '1.1.33'
related:
  [
    instrument.engine-midi,
    howto.control-synth-midi,
    project.midi-channels,
    com.multi-out,
    sequencer.parameter-locks
  ]
---

`T3` is a track whose sound lives in another box: set its channel to the synth's, pick a sound with
bank and program, and map the CC slots to the controls you want to move. Channel 11 is only where
the OP-XY listens for the track's own controls; the notes go out on the `M1` channel. For more
devices at once, use instrument tracks with the midi engine (which OS 1.1.33's preset browser did
not list).
