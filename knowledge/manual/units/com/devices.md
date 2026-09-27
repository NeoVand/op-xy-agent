---
id: com.devices
title: Connected MIDI devices
aliases:
  [devices, device list, midi devices, forget device, per-device settings, midi routing per device]
area: com
order: 30
context:
  screens: [devices]
summary: '`com → M3` lists the MIDI devices connected to the OP-XY; for each one you switch what it may send to the unit and receive from it, or forget it.'
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: what
    text: The devices page lists the MIDI devices connected to the OP-XY and lets you enable or disable individual inputs and outputs for each of them.
    source: https://teenage.engineering/guides/op-xy/com#devices
  - id: switches
    text: Per device you can switch clock, notes, other messages (CCs and similar), timestamp and velocity.
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-control-op-xy
  - id: transport-page
    text: Community tools also describe a second page with a transport receive switch that must be on for start and stop from that device.
    source: docs/research/20-midi-control.md#91-settings-that-gate-midi
    confidence: community
  - id: usb-gear
    text: USB MIDI gear plugged into the OP-XY's USB-C port shows up here, which is where you decide what data goes to and comes from it.
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-control-a-synth-with-midi
  - id: forget
    text: '`M2` forgets the selected device and removes it from the list.'
    source: https://teenage.engineering/guides/op-xy/com#devices
  - id: computer
    text: A computer running this app should keep clock, notes and other enabled in its entry, or the app cannot follow or play the unit.
    source: docs/research/20-midi-control.md#91-settings-that-gate-midi
    confidence: derived
procedures:
  - id: edit
    goal: Change what one device may send or receive
    steps:
      - keys: com → M3
      - keys: turn E1
        note: choose the device
      - keys: turn E2
        note: choose the setting
      - keys: turn E3
        note: set the value (`turn E4` works too)
    source: https://teenage.engineering/guides/op-xy/com#devices
  - id: forget
    goal: Remove a device from the list
    steps:
      - keys: com → M3
      - keys: turn E1
        note: choose the device
      - keys: M2
    source: https://teenage.engineering/guides/op-xy/com#devices
related: [com.midi-settings, com.midi-monitor, com.usb, howto.midi-keyboard]
---

The devices page refines the midi settings per connection: use it when one device should be treated
differently — say, taking notes from a keyboard while ignoring its clock. `M1` returns to com. If a
device misbehaves, the MIDI monitor shows whether its messages arrive at all.
