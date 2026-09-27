---
id: auxiliary.external-midi
title: External MIDI track
aliases: [midi track, ext midi, control a synth, midi cc slots]
area: auxiliary
order: 30
context:
  modes: [auxiliary]
  screens: [M1, M2, M3]
summary: '`T3` plays and sequences outside MIDI gear over USB-C or the multi-out; M1 sets channel, bank and program, M2 and M3 hold eight CC slots, and M4 has an LFO.'
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.1.15']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: track
    text: The external MIDI track (`T3`) sends its keyboard and sequencer notes to connected MIDI gear.
    source: https://teenage.engineering/guides/op-xy/auxiliary#external-midi
  - id: ports
    text: Gear connects through the USB-C port, or through the multi-out jack set to midi.
    source: https://teenage.engineering/guides/op-xy/auxiliary#external-midi
  - id: slots
    text: M2 and M3 hold four CC slots each; turning sends a slot's value, `shift + turn E1…E4` switches a slot on and picks its CC number, and the values can be sequenced and recorded.
    source: https://teenage.engineering/guides/op-xy/auxiliary#external-midi
  - id: lfo
    text: The external MIDI track's LFO (M4) modulates the track's own parameters, such as a CC slot.
    source: https://teenage.engineering/guides/op-xy/auxiliary#external-midi
  - id: program-locks
    text: Program changes can be parameter-locked; OS 1.1.15 fixed such locks not working.
    source: https://teenage.engineering/downloads/op-xy#1.1.15
    firmware_min: '1.1.15'
  - id: ccs
    text: 'Community charts for channel 11: CC12–14 channel, bank, program; CC20–23 and CC32–35 slot values; CC28–31 and CC36–39 slot numbers; CC40–43 LFO.'
    source: docs/research/20-midi-control.md#35-auxiliary-tracks-916
    confidence: community
procedures:
  - id: setup
    goal: Play an outside synth from the OP-XY
    preconditions: [the synth is connected over USB-C or the multi-out]
    steps:
      - keys: auxiliary → T3
      - keys: turn E1
        note: the synth's MIDI channel, on M1
      - keys: keys
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-control-a-synth-with-midi
parameters:
  - screen: M1
    encoder: E1
    layer: base
    name: channel
    range: 1–16
    source: https://teenage.engineering/guides/op-xy/auxiliary#external-midi
  - screen: M1
    encoder: E2
    layer: base
    name: bank
    source: https://teenage.engineering/guides/op-xy/auxiliary#external-midi
  - screen: M1
    encoder: E3
    layer: base
    name: program
    source: https://teenage.engineering/guides/op-xy/auxiliary#external-midi
related: [instrument.engine-midi, com.multi-out, sequencer.parameter-locks]
---

`T3` is a track whose sound lives in another box: set its channel, pick a sound with bank and
program, and map the CC slots to the controls you want to move. For more devices at once, use
instrument tracks with the midi engine.
