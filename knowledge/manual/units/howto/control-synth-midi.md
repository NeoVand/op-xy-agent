---
id: howto.control-synth-midi
title: Recipe — play an external synth over MIDI
aliases: [control a synth, sequence external synth, trs midi, din midi, external midi track]
area: howto
order: 20
context:
  modes: [auxiliary]
summary: Connect the synth through the multi-out (set to midi) or USB, then play and sequence it from the external MIDI track, `T3` in auxiliary mode, on the synth's channel.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.0.15']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: din
    text: Synths with DIN MIDI sockets need the multi-out set to midi and a type A TRS-to-DIN cable, DIN end into the synth, jack into the multi-out.
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-control-a-synth-with-midi
  - id: usb
    text: Synths with USB MIDI plug into the OP-XY's USB-C port (through an adapter if needed), need no multi-out setting and appear under `com → M3`.
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-control-a-synth-with-midi
  - id: track
    text: The external MIDI track is `T3` in auxiliary mode; its keyboard and sequencer play the connected synth.
    source: https://teenage.engineering/guides/op-xy/auxiliary#external-midi
  - id: channel
    text: On the track's `M1` page, `E1` sets the MIDI channel — match the channel the synth listens on — while `E2` and `E3` pick bank and program.
    source: https://teenage.engineering/guides/op-xy/auxiliary#external-midi
  - id: ccs
    text: '`M2` and `M3` hold eight CC slots: `shift` plus an encoder switches a slot on and picks its CC number, turning the encoder sends values, and the moves can be sequenced and recorded.'
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-control-a-synth-with-midi
  - id: several-synths
    text: To sequence several synths, instrument tracks can run the midi engine too; TE's guide still calls it "external", its name before OS 1.0.15.
    source: https://teenage.engineering/downloads/op-xy#1.0.15
    firmware_min: '1.0.15'
procedures:
  - id: connect
    goal: Point the external MIDI track at a synth
    preconditions: [nothing is plugged into the multi-out yet]
    steps:
      - keys: com → turn E3
        note: midi; then connect the cable
      - keys: auxiliary → T3 → M1 → turn E1
        note: the synth's MIDI channel
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-control-a-synth-with-midi
  - id: cc
    goal: Control a synth parameter by CC
    steps:
      - keys: M2/M3
      - keys: shift + turn E1…E4
        note: switch the slot on, choose the CC number
      - keys: turn E1…E4
        note: send values
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-control-a-synth-with-midi
related:
  [com.multi-out, com.devices, com.bluetooth-midi, instrument.engine-midi, auxiliary.overview]
---

If nothing sounds, check the channel first, then the cable route (multi-out mode, adapter type) and,
for USB gear, the device's switches under `com → M3`. Bluetooth MIDI synths work too once the
OP-XY advertises itself from the com page.
