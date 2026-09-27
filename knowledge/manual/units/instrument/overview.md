---
id: instrument.overview
title: Instrument mode
aliases: [instrument tracks, sound tracks, tracks 1–8, instrument pages, instrument modules]
area: instrument
order: 0
context:
  modes: [instrument]
  screens: [M1, M2, M3, M4]
summary: 'Instrument mode holds the eight tracks that make sound. Each track runs one engine — a synth, a sampler or the midi engine — and is shaped on four pages: engine, envelopes, filter and LFO.'
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: eight-tracks
    text: Instrument mode holds eight instrument tracks, one per track key `T1`…`T8`; the eight auxiliary tracks have a mode of their own.
    source: https://teenage.engineering/guides/op-xy/instrument#project
  - id: pages
    text: '`M1` shows the engine, `M2` the amp and filter envelopes, `M3` the filter and `M4` the LFO.'
    source: https://teenage.engineering/guides/op-xy/instrument
  - id: choose-engine
    text: '`shift + M1` opens the engine list for the selected track.'
    source: https://teenage.engineering/guides/op-xy/instrument#project
  - id: browse
    text: '`shift + Tn` opens the preset browser for that track, where a preset, sample pack or engine can be loaded in one go.'
    source: https://teenage.engineering/guides/op-xy/instrument#project
  - id: preset-settings
    text: "`shift + instrument` opens the preset settings: tuning, velocity sensitivity, width and modulation routing of the track's sound."
    source: https://teenage.engineering/guides/op-xy/instrument#preset-settings
  - id: sound-actions
    text: "With a track key held, the module keys act on that track's whole sound: `Tn + M1` scrambles it, `Tn + M2` copies it, `Tn + M3` pastes onto it and `Tn + M4` saves it as a preset."
    source: https://teenage.engineering/guides/op-xy/instrument#view-and-create-preset
  - id: defaults
    text: A fresh project puts drums on tracks 1 and 2, a bass on 3, a pluck on 4, a lead on 5, a soft pluck on 6, strings on 7 and a pad on 8.
    source: https://teenage.engineering/guides/op-xy/get-started#4.%20get%20started
  - id: default-engines
    text: Community captures name the engines behind those sounds as the drum sampler on tracks 1 and 2, then prism, epiano, dissolve, hardsync, axis and multisampler on tracks 3 to 8.
    source: docs/research/20-midi-control.md#21-the-16-tracks-and-their-default-channels
    confidence: community
procedures:
  - id: enter
    goal: Open instrument mode and select a track
    steps:
      - keys: instrument
      - keys: T1…T8
    source: https://teenage.engineering/guides/op-xy/instrument#project
related:
  [
    instrument.engine,
    instrument.envelopes,
    instrument.filter,
    instrument.lfo,
    instrument.preset-browser,
    instrument.preset-settings,
    instrument.save-copy-scramble,
    basics.modules,
    auxiliary.overview
  ]
---

Pick a track, then work through its pages: the engine creates the tone, the envelopes shape each
note, the filter colours it and the LFO adds movement; every value can be parameter-locked per step.
A track's complete sound travels as one preset, so `shift + Tn` changes everything at once while
`shift + M1` swaps only the engine. Brain, send effects, external gear and tape live in auxiliary
mode.
