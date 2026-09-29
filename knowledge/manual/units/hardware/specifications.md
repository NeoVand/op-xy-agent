---
id: hardware.specifications
title: Technical specifications
aliases:
  [
    specs,
    dimensions,
    weight,
    screen resolution,
    storage,
    battery life,
    output level,
    electrical,
    build
  ]
area: hardware
order: 30
summary: Size, build, screen, storage, battery, processing and the electrical figures of the audio, CV and sync connections.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: build
    text: The body is black anodised aluminium, the low-profile keyboard is backlit, and the custom colour LCD sits directly on the keyboard.
    source: https://teenage.engineering/guides/op-xy/hardware-overview#hardware
  - id: size
    text: It measures 288 × 102 × 29 mm and weighs 900 g.
    source: https://teenage.engineering/store/op-xy
  - id: controls
    text: There are 68 mechanical keys (the keyboard included), four encoders and a pressure-sensitive pitchbend strip.
    source: https://teenage.engineering/products/op-xy
  - id: screen
    text: The guide lists a 480 × 220 pixel IPS TFT screen.
    source: https://teenage.engineering/guides/op-xy/hardware-overview#technical-specifications
  - id: screen-alt
    text: TE's product page gives the screen as 480 × 222 pixels.
    source: https://teenage.engineering/products/op-xy
  - id: storage
    text: There are 8 GB of user storage.
    source: https://teenage.engineering/guides/op-xy/hardware-overview#technical-specifications
  - id: storage-seen
    text: Over MTP a unit shows an 8.59 GB volume.
    source: docs/research/90-device-probe.md#2026-09-26--session-1-results-owner-present-scratch-project-os-1133
    verified_on: '1.1.33'
  - id: battery
    text: The rechargeable battery is rated for 16 hours.
    source: https://teenage.engineering/guides/op-xy/hardware-overview#technical-specifications
  - id: wireless
    text: Bluetooth LE MIDI is built in.
    source: https://teenage.engineering/guides/op-xy/hardware-overview#technical-specifications
  - id: processing
    text: Inside are two Blackfin processor cores, a three-core DSP co-processor and a 6-axis motion sensor.
    source: https://teenage.engineering/products/op-xy
  - id: voices
    text: Polyphony is 24 voices, shared by all tracks.
    source: https://teenage.engineering/guides/op-xy/project#project-settings
  - id: model
    text: The model number is TE033AS001; a unit checked on OS 1.1.33 reports hardware revision 2.
    source: docs/research/90-device-probe.md#2026-09-26--te-sysex-protocol-read-only-te_sysex_probepy
    verified_on: '1.1.33'
  - id: audio-out
    text: 'Audio out: 8 dBu (2 Vrms) level, 124 dBA signal-to-noise ratio.'
    source: https://teenage.engineering/guides/op-xy/hardware-overview#electrical-characteristics
  - id: audio-in
    text: 'Audio in: 8 dBu (2 Vrms) level, 98 dBA signal-to-noise ratio, 13 kΩ impedance, 0–31 dB of analogue gain.'
    source: https://teenage.engineering/guides/op-xy/hardware-overview#electrical-characteristics
  - id: multi-out
    text: 'Multi-out: audio at 2 dBu (1 Vrms), CV within ±5 V, sync and gate pulses at 5.2 V.'
    source: https://teenage.engineering/guides/op-xy/hardware-overview#electrical-characteristics
related: [hardware.connectors, hardware.power-and-charging, hardware.layout]
---

Where TE's pages disagree (the screen height), both figures are given.
