---
id: com.midi-monitor
title: MIDI monitor
aliases: [monitor, monitor page, incoming midi, midi activity, midi debug, check midi input]
area: com
order: 25
context:
  screens: [system settings]
summary: A section of the system settings that lists incoming MIDI from any connected device — each message with its channel and value, plus clock and SysEx — so you can check that gear sends what you expect.
status: current
firmware:
  min: '1.1.15'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: what
    text: The monitor shows MIDI as it arrives from any connected device, with the channel and value of each message.
    source: https://teenage.engineering/guides/op-xy/com#midi-monitor
  - id: clock-sysex
    text: Incoming clock and SysEx appear on the monitor as well.
    source: https://teenage.engineering/guides/op-xy/com#midi-monitor
  - id: purpose
    text: The monitor is a troubleshooting aid — confirming that a keyboard, computer or sequencer really sends the messages you expect before you change any settings.
    source: https://teenage.engineering/guides/op-xy/com#midi-monitor
  - id: since
    text: The monitor was added to the system settings in OS 1.1.15.
    source: https://teenage.engineering/downloads/op-xy#1.1.15
procedures:
  - id: open
    goal: Watch incoming MIDI
    steps:
      - keys: com → M1
      - keys: turn E1
        note: scroll to the monitor section
    result: Messages from connected devices appear as they arrive.
    source: https://teenage.engineering/guides/op-xy/com#midi-monitor
related: [com.midi-settings, com.devices, com.system-settings]
---

When a controller seems to do nothing, the monitor settles the first question: did anything arrive?
If messages show up here but the OP-XY ignores them, look at the midi section (is notes or other set
to receive?) and at the device's own switches under `com → M3`. If nothing shows up, suspect the
cable, the connection or the sending device first.
