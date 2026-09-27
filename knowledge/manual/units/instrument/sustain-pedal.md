---
id: instrument.sustain-pedal
title: Sustain pedal
aliases: [sustain, damper pedal, cc64, hold pedal, pedal]
area: instrument
order: 90
context:
  modes: [instrument]
summary: Since OS 1.1.15 a sustain pedal holds notes until it is let up, and since 1.1.17 it leaves arpeggiated notes alone. TE's guide never mentions it; with no pedal jack on the unit, the pedal arrives over MIDI.
status: changelog-only
firmware:
  min: '1.1.15'
  changed_in: ['1.1.17']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: holds
    text: A sustain pedal keeps notes sounding until the pedal is released.
    source: https://teenage.engineering/downloads/op-xy#1.1.15
  - id: not-arp
    text: Since OS 1.1.17, the sustain pedal does not affect arpeggiated notes.
    source: https://teenage.engineering/downloads/op-xy#1.1.17
    firmware_min: '1.1.17'
  - id: no-jack
    text: The OP-XY has no pedal socket, so a pedal has to reach it as MIDI — for example through a keyboard with a pedal input, connected over USB or MIDI in.
    source: https://teenage.engineering/guides/op-xy/hardware-overview#inputs-outputs
    confidence: derived
  - id: cc64
    text: Over MIDI, sustain is controller 64 on the track's channel.
    source: docs/research/20-midi-control.md#36-channel-voice--performance-messages-receive-side
    confidence: derived
related: [players.arpeggio, com.midi-settings]
---

The sustain pedal arrived with OS 1.1.15 and is absent from TE's guide, so what is known comes from
the changelog: held notes ring on until the pedal goes up, and arpeggios have ignored the pedal
since 1.1.17. Whether it works on every engine, and whether sustained notes are recorded, is not
documented.
