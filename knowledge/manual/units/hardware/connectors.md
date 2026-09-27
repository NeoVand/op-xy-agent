---
id: hardware.connectors
title: Connectors and jacks
aliases:
  [inputs, outputs, jacks, sockets, headphone out, line in, line out, midi in, multi out, ports]
area: hardware
order: 20
summary: The right edge carries four 3.5 mm jacks — audio out, multi-out, MIDI in, audio in — plus the USB-C port and the power switch. What each one is for.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: order
    text: Along the right edge, starting at the back, sit audio out, multi-out, MIDI in and audio in, then the USB-C port, the charge LED and the power switch near the front.
    source: docs/research/50-hardware-ui.md#15-edges-ports-and-non-key-features
    confidence: measured
  - id: audio-out
    text: The 3.5 mm stereo audio out feeds headphones or speakers.
    source: https://teenage.engineering/guides/op-xy/hardware-overview#inputs-outputs
  - id: headset
    text: The audio out also supports headsets with a built-in microphone.
    source: https://teenage.engineering/guides/op-xy/hardware-overview#technical-specifications
  - id: audio-in
    text: The 3.5 mm stereo audio in records line-level sources directly into the OP-XY.
    source: https://teenage.engineering/guides/op-xy/hardware-overview#inputs-outputs
  - id: midi-in
    text: The 3.5 mm MIDI in lets other MIDI gear play and control the OP-XY.
    source: https://teenage.engineering/guides/op-xy/hardware-overview#inputs-outputs
  - id: multi-out
    text: The multi-out jack works in one of six modes at a time — audio, MIDI, CV and gate, or sync pulses at sync8, sync16 or sync24.
    source: https://teenage.engineering/guides/op-xy/hardware-overview#inputs-outputs
  - id: usb
    text: The USB-C port charges the battery and carries audio and MIDI in both directions.
    source: https://teenage.engineering/guides/op-xy/hardware-overview#technical-specifications
related: [com.usb, hardware.specifications, hardware.layout]
---

None of the jacks is a dedicated MIDI out: wired MIDI and sync leave through the multi-out, in the
mode picked on the com page, or over USB. Levels for each jack are listed under the specifications.
