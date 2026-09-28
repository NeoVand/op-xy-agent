---
id: instrument.engine-midi
title: Midi engine (called external in the guide)
aliases: [midi engine, external, external engine, external midi engine, sequence an external synth]
area: instrument
order: 50
context:
  modes: [instrument]
  screens: [M1, M2, M3]
summary: The midi engine makes an instrument track sequence outside gear — `M1` sets channel, bank and program, `M2` and `M3` hold eight CCs. TE's guide still calls it external, its name before OS 1.0.15.
status: outdated-in-guide
firmware:
  min: '1.0.9'
  changed_in: ['1.0.15', '1.0.45', '1.0.50', '1.1.15', '1.1.32']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: what
    text: The midi engine makes no sound; the track's notes and settings go out as MIDI to an external instrument.
    source: https://teenage.engineering/guides/op-xy/synth-engines#external
  - id: renamed
    text: OS 1.0.15 renamed the engine from external to midi; the guide (v1.1.15) and its MIDI how-to still use the old name.
    source: https://teenage.engineering/downloads/op-xy#1.0.15
    firmware_min: '1.0.15'
  - id: cc-slots
    text: '`M2` and `M3` hold eight CC slots: turn an encoder to set a value, or hold `shift` and turn it to switch the slot on and choose its CC number.'
    source: https://teenage.engineering/guides/op-xy/synth-engines#external
  - id: several-devices
    text: Several instrument tracks can run the midi engine at once, one per device or channel, where the external MIDI track in auxiliary mode offers only one.
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-control-a-synth-with-midi
  - id: presets-keep-ccs
    text: Since OS 1.0.45, presets saved from a midi-engine track keep their CC settings.
    source: https://teenage.engineering/downloads/op-xy#1.0.45
    firmware_min: '1.0.45'
  - id: switch-back
    text: Since OS 1.0.50, switching a track to the midi engine and back keeps its synth settings.
    source: https://teenage.engineering/downloads/op-xy#1.0.50
    firmware_min: '1.0.50'
  - id: program-locks
    text: Program changes can be parameter-locked per step; OS 1.1.15 fixed such locks not working.
    source: https://teenage.engineering/downloads/op-xy#1.1.15
    firmware_min: '1.1.15'
  - id: browser-1133
    text: On OS 1.1.33 the preset browser that `shift + M1` brings up listed no midi engine on the owner's unit, so how that firmware puts an instrument track on midi is still open; the external MIDI track (auxiliary `T3`) always works, and this app's replica lists midi last in the browser.
    source: docs/research/59-screen-profiling.md#26-preset-browser-shift--m1
    confidence: verified
    verified_on: '1.1.33'
  - id: arp-fix
    text: OS 1.1.32 fixed the arpeggiator disturbing a midi-engine parameter.
    source: https://teenage.engineering/downloads/op-xy#1.1.32
    firmware_min: '1.1.32'
procedures:
  - id: setup
    goal: Sequence an external synth from an instrument track
    preconditions:
      [instrument mode, the synth is connected over USB or to the multi-out jack in MIDI mode]
    steps:
      - keys: shift + M1
        note: the preset browser on OS 1.1.33 (the guide's engine list before)
      - keys: turn E1
        note: choose midi, where it is listed
      - keys: click E2
        note: loads it (the old engine list took a click of `E1`)
      - keys: turn E1
        note: set the synth's MIDI channel
      - keys: M2
        note: CC slots (more on `M3`)
      - keys: shift + turn E1
        note: switch a slot on and pick its CC number
    result: Notes played or sequenced on the track now play the external synth.
    source: https://teenage.engineering/guides/op-xy/synth-engines#external
parameters:
  - screen: M1
    encoder: E1
    layer: base
    name: channel
    note: MIDI channel the track sends on
    source: https://teenage.engineering/guides/op-xy/synth-engines#external
  - screen: M1
    encoder: E2
    layer: base
    name: bank
    source: https://teenage.engineering/guides/op-xy/synth-engines#external
  - screen: M1
    encoder: E3
    layer: base
    name: program
    source: https://teenage.engineering/guides/op-xy/synth-engines#external
related:
  [
    instrument.engine,
    auxiliary.external-midi,
    howto.control-synth-midi,
    com.midi-settings,
    sequencer.parameter-locks
  ]
---

Record or step-sequence on the track as usual and the notes play the connected synth; bank and
program pick its sound, and the CC slots send controller values that can be locked per step.
