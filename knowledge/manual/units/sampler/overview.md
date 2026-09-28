---
id: sampler.overview
title: Samplers at a glance
aliases: [sample engines, sampler engines, sample tracks, which sampler]
area: sampler
order: 0
context:
  modes: [instrument]
summary: Three instrument engines play samples — the synth sampler, the drum sampler and the multisampler; the sample key records into whichever one the selected track uses.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.1.0']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: synth-sampler
    text: The synth sampler (sampler among the browser's engines) plays one sample across the keyboard, with loop points for sustained sounds.
    source: https://teenage.engineering/guides/op-xy/sample#one-shot-synth-sampler
  - id: drum-sampler
    text: The drum sampler (drum among the browser's engines) gives each of the 24 keys its own one-shot sample.
    source: https://teenage.engineering/guides/op-xy/sample#drum-sampler
  - id: multisampler
    text: The multisampler lays up to 24 samples of one instrument over zones of the keyboard.
    source: https://teenage.engineering/guides/op-xy/sample#multisampler
  - id: m1
    text: On sampler tracks M1 edits the sample; M2–M4 work as on any instrument track.
    source: https://teenage.engineering/guides/op-xy/instrument#engine
  - id: groups
    text: In the mix, the drum sampler feeds the percussion group and the synth sampler the melodic group.
    source: https://teenage.engineering/guides/op-xy/mix#master
  - id: p-locks
    text: Drum sampler and synth sampler settings can be parameter-locked.
    source: https://teenage.engineering/downloads/op-xy#1.1.0
    firmware_min: '1.1.0'
  - id: default-tracks
    text: A blank project has drum samplers on tracks 1 and 2 and a multisampler on track 8.
    source: docs/research/10-xy-format.md#312-enumerations
    confidence: community-verified
  - id: ccs
    text: Over MIDI, M1's encoders answer CC12–15 — start, loop start, loop end, end on the synth sampler and multisampler; tune, start, end, play mode on the drum sampler.
    source: docs/research/20-midi-control.md#34-engine-resolved-names-for-cc1215-p1p4
    confidence: community
procedures:
  - id: choose
    goal: Put a sampler engine on the selected track
    preconditions: [instrument mode]
    steps:
      - keys: shift + M1
        note: the preset browser by engine (OS 1.1.33)
      - keys: turn E1
        note: sampler, drum or multisampler
      - keys: click E2
        note: loads its highlighted preset
    source: https://teenage.engineering/guides/op-xy/synth-engines#change-engine
related:
  [
    sampler.sampling,
    sampler.synth-sampler,
    sampler.drum-sampler,
    sampler.multisampler,
    instrument.preset-browser
  ]
---

Use the synth sampler to make one sound playable, the drum sampler for kits and one-shots (slicing
lives there too), and the multisampler when an instrument should sound natural across its range.
