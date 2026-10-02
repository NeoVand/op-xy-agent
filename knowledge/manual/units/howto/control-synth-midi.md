---
id: howto.control-synth-midi
title: Recipe — play an external synth over MIDI
aliases:
  [
    control a synth,
    sequence external synth,
    sequence a hardware synth,
    trs midi,
    din midi,
    midi out,
    external midi track
  ]
area: howto
order: 20
context:
  modes: [auxiliary]
summary: Set the multi-out to midi before plugging in a TRS-to-DIN cable (USB gear needs no setting), then play and sequence the synth from `T3` in auxiliary mode on the synth's channel, set on `M1`. TE's steps set no project MIDI channel; set clock to both only if the synth should follow the tempo.
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
  - id: one-job
    text: The multi-out does one job at a time, so in midi mode it carries no CV, gate, sync pulse or audio.
    source: https://teenage.engineering/guides/op-xy/hardware-overview#inputs-outputs
  - id: usb
    text: Synths with USB MIDI plug into the OP-XY's USB-C port (through an adapter if needed), need no multi-out setting and appear under `com → M3`.
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-control-a-synth-with-midi
  - id: devices-din
    text: TE's how-tos point to the devices page (`com → M3`) only for USB gear; whether a synth on the multi-out appears there is not documented.
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-control-a-synth-with-midi
  - id: track
    text: The external MIDI track is `T3` in auxiliary mode; its keyboard and sequencer play the connected synth.
    source: https://teenage.engineering/guides/op-xy/auxiliary#external-midi
  - id: channel
    text: On the track's `M1` page, `E1` sets the MIDI channel — match the channel the synth listens on — while `E2` and `E3` pick bank and program.
    source: https://teenage.engineering/guides/op-xy/auxiliary#external-midi
  - id: no-project-channel
    text: TE's steps set only that `M1` channel; the project's midi page (`project → M4`) is not part of them.
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-control-a-synth-with-midi
  - id: no-project-community
    text: Community tools also report that the external MIDI track and midi-engine tracks send without a project MIDI channel; not yet checked on a unit.
    source: docs/research/20-midi-control.md#81-normal-operation
    confidence: community
  - id: notes-on
    text: On a unit with stock settings, notes in the midi section of the system settings (`com → M1`) is at both, which includes sending.
    source: docs/research/90-device-probe.md#2026-09-26--session-1-results-owner-present-scratch-project-os-1133
    verified_on: '1.1.33'
  - id: clock
    text: Clock is its own switch in the same section; at the stock setting (in) `play` and `stop` send no start, stop or clock ticks, and set to both they send start and stop with a constant tick stream (seen over USB).
    source: docs/research/90-device-probe.md#2026-09-26--session-1-results-owner-present-scratch-project-os-1133
    verified_on: '1.1.33'
  - id: clock-jack
    text: Community tools report that clock, start and stop go out over TRS MIDI as well as USB under that switch; only USB has been checked on a unit.
    source: https://github.com/jshph/opxy-reactive/blob/master/DESIGN.md
    confidence: community
  - id: ccs
    text: '`M2` and `M3` hold eight CC slots: `shift` plus an encoder switches a slot on and picks its CC number, turning the encoder sends values, and the moves can be sequenced and recorded.'
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-control-a-synth-with-midi
  - id: several-synths
    text: To sequence several synths, instrument tracks can run the midi engine too; TE's guide still calls it "external", its name before OS 1.0.15.
    source: https://teenage.engineering/downloads/op-xy#1.0.15
    firmware_min: '1.0.15'
  - id: engine-1133
    text: On OS 1.1.33 the preset browser listed no midi engine, so `T3` is the route to use on that firmware.
    source: docs/research/59-screen-profiling.md#26-preset-browser-shift--m1
    verified_on: '1.1.33'
  - id: own-engine
    text: To send the notes of a track on one of the OP-XY's own engines as well, community tools say to give it a channel on the project's midi page.
    source: docs/research/20-midi-control.md#23-transmit-routing
    confidence: community
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
  - id: send-clock
    goal: Let the synth follow the OP-XY's tempo and transport
    steps:
      - keys: com → M1
      - keys: turn E1
        note: the midi section
      - keys: turn E2
        note: clock
      - keys: turn E3
        note: both
    result: '`play` and `stop` send start and stop, and clock ticks run continuously (checked over USB).'
    source: docs/research/90-device-probe.md#2026-09-26--session-1-results-owner-present-scratch-project-os-1133
    verified_on: '1.1.33'
related:
  [
    com.multi-out,
    com.devices,
    com.midi-settings,
    com.bluetooth-midi,
    project.midi-channels,
    instrument.engine-midi,
    auxiliary.overview
  ]
---

If nothing sounds, check the channel first, then the cable route (multi-out mode, adapter type)
and, for USB gear, the device's switches under `com → M3`. Leave the project's midi page alone
unless a track on an OP-XY engine should send its notes too. Notes need no clock: switch clock to
both only when the synth's tempo-synced parts should lock to the OP-XY. Bluetooth MIDI synths work
too once the OP-XY advertises itself from the com page.
