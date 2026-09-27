---
id: tempo.tempo-screen
title: Tempo, tap tempo and metronome
aliases: [bpm, tempo, tap tempo, metronome, click, speed, change tempo]
area: tempo
order: 0
context:
  screens: [tempo]
summary: The tempo key opens the tempo screen from anywhere; tap it to set the tempo by ear. E1 sets BPM, E2 and E3 the groove, E4 the metronome level (click to switch the metronome on or off).
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: open
    text: '`tempo` opens the tempo screen from any screen.'
    source: https://teenage.engineering/guides/op-xy/tempo#project
  - id: tap
    text: Tapping `tempo` repeatedly in time with the music sets the tempo.
    source: https://teenage.engineering/guides/op-xy/tempo#project
  - id: metronome
    text: '`turn E4` sets the metronome volume and `click E4` switches the metronome on or off.'
    source: https://teenage.engineering/guides/op-xy/tempo#edit-tempo
  - id: cc80
    text: Over MIDI, CC80 on any channel sets the tempo; on OS 1.1.33 the result is twice the value in BPM, held within 40–220, so only even tempos can be sent.
    source: docs/research/90-device-probe.md#2026-09-26--session-1-results-owner-present-scratch-project-os-1133
    verified_on: '1.1.33'
  - id: new-project
    text: A new empty project on the owner's unit ran at 120 BPM.
    source: docs/research/90-device-probe.md#2026-09-26--session-1-results-owner-present-scratch-project-os-1133
    verified_on: '1.1.33'
procedures:
  - id: tap
    goal: Set the tempo by tapping
    steps:
      - keys: tempo → tempo → tempo → tempo
        note: tap in time with the beat
    source: https://teenage.engineering/guides/op-xy/tempo#project
  - id: metronome
    goal: Switch the metronome on or off
    steps:
      - keys: tempo → click E4
    source: https://teenage.engineering/guides/op-xy/tempo#edit-tempo
parameters:
  - screen: tempo
    encoder: E1
    layer: base
    name: tempo
    note: song tempo in BPM
    cc: 80
    source: https://teenage.engineering/guides/op-xy/tempo#edit-tempo
  - screen: tempo
    encoder: E2
    layer: base
    name: groove type
    note: the style of swing (see grooves)
    source: https://teenage.engineering/guides/op-xy/tempo#edit-tempo
  - screen: tempo
    encoder: E3
    layer: base
    name: groove amount
    note: right of centre adds swing, left of centre adds shuffle
    source: https://teenage.engineering/guides/op-xy/tempo#edit-tempo
  - screen: tempo
    encoder: E4
    layer: base
    name: metronome level
    source: https://teenage.engineering/guides/op-xy/tempo#edit-tempo
  - screen: tempo
    encoder: E4
    layer: click
    name: metronome on/off
    source: https://teenage.engineering/guides/op-xy/tempo#edit-tempo
related: [tempo.grooves, com.midi-settings]
---

Tempo and groove are saved with each project, so every project keeps its own speed and feel. The
groove settings on E2 and E3 are explained under grooves.
