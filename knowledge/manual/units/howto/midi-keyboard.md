---
id: howto.midi-keyboard
title: Recipe — play the OP-XY from a MIDI keyboard
aliases: [midi keyboard, usb keyboard, external controller, mod wheel, sustain pedal]
area: howto
order: 25
summary: Plug a USB MIDI keyboard or controller straight into the OP-XY, route its mod wheel, aftertouch, pitch bend and velocity in the preset settings, and filter what it sends under `com → M3`.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.1.15', '1.1.17']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: connect
    text: A USB MIDI keyboard or controller connects to the OP-XY's USB-C port with a USB-C cable or a USB-A adapter and is ready within moments.
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-control-op-xy
  - id: power
    text: A keyboard that needs more power than the port gives can run through a powered USB hub.
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-control-op-xy
  - id: active-track
    text: Notes arriving on the active track channel play whichever track is selected.
    source: https://teenage.engineering/guides/op-xy/com#system-settings
  - id: mod-routing
    text: The mod tab of the preset settings (`shift + instrument`) routes mod wheel, aftertouch, pitch bend and velocity to synth parameters.
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-control-op-xy
  - id: filter
    text: Under `com → M3` you choose, for that keyboard, whether clock, notes, other messages, timestamp and velocity get through.
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-control-op-xy
  - id: sustain
    text: A sustain pedal holds notes until it is released, since OS 1.1.15.
    source: https://teenage.engineering/downloads/op-xy#1.1.15
    firmware_min: '1.1.15'
  - id: sustain-arp
    text: Since OS 1.1.17 the sustain pedal leaves arpeggiated notes alone.
    source: https://teenage.engineering/downloads/op-xy#1.1.17
    firmware_min: '1.1.17'
procedures:
  - id: mod
    goal: Send the mod wheel to a synth parameter
    preconditions: [instrument mode, the track is selected]
    steps:
      - keys: shift + instrument
        note: preset settings
      - keys: turn E1
        note: mod
      - keys: turn E2
        note: choose the mod wheel's target
      - keys: turn E3
        note: pick the parameter
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-control-op-xy
  - id: filter
    goal: Choose what the keyboard may send to the OP-XY
    steps:
      - keys: com → M3
      - keys: turn E1
        note: the keyboard
      - keys: turn E2 → turn E3
        note: pick a switch, set it
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-control-op-xy
related:
  [
    com.usb,
    com.devices,
    com.midi-cc-reference,
    instrument.preset-settings,
    instrument.sustain-pedal
  ]
---

The OP-XY hosts the keyboard itself, so no computer is involved. Mod routings are saved with each
preset. If the keyboard plays the wrong track, check the active track channel; map knobs with the
CC reference.
