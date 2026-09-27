---
id: sampler.multisampler
title: Multisampler
aliases: [multisample, multi sampler, key zones, sampled instrument]
area: sampler
order: 50
context:
  modes: [instrument]
  screens: [M1, sample]
summary: Up to 24 samples of one instrument, each on its own zone of the keyboard; a sample also plays the empty keys below it, and M1 edits the selected zone like the synth sampler.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.1.25']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: what
    text: Each range of notes plays from a recording made near its pitch, which sounds truer than stretching one sample.
    source: https://teenage.engineering/guides/op-xy/sample#multisampler
  - id: zones
    text: While recording, select keys from left to right; every key that gets a sample becomes a zone.
    source: https://teenage.engineering/guides/op-xy/sample#multisampler
  - id: fill-down
    text: Zones fill downwards — a sample also covers the empty keys below it, pitched down, as far as the next zone.
    source: https://teenage.engineering/guides/op-xy/sample#multisampler
  - id: max
    text: Up to 24 zones fit, about three samples per octave.
    source: https://teenage.engineering/guides/op-xy/sample#multisampler
  - id: record-keys
    text: The record page works like the drum sampler's — `M1` records, `M2` / `M3` step through filled keys, `M4` unassigns; takes go to the user folder.
    source: https://teenage.engineering/guides/op-xy/sample#multisampler
  - id: editing
    text: The multisampler's M1 page has the synth sampler's layout, loop type included (`shift + click E3`).
    source: https://teenage.engineering/guides/op-xy/sample#multisampler
  - id: caption-mixup
    text: The guide titles `shift + turn E2` and `shift + turn E3` pan and sample fade but describes tune and loop crossfade; zones store tune and crossfade, not pan.
    source: docs/research/30-presets-samples.md#27-region-fields-by-type
    confidence: derived
  - id: no-layers
    text: There are no velocity layers or round robins — one sample per zone.
    source: docs/research/30-presets-samples.md#32-counts-and-structure-limits
    confidence: community
  - id: transpose
    text: OS 1.1.25 improved how multisamples follow global transpose.
    source: https://teenage.engineering/downloads/op-xy#1.1.25
    firmware_min: '1.1.25'
procedures:
  - id: record-zones
    goal: Multisample an instrument
    preconditions: [the track uses the multisampler]
    steps:
      - keys: sample
      - keys: key
        note: start low, work to the right
      - keys: hold M1
        note: play the matching note, then repeat on the next key
    source: https://teenage.engineering/guides/op-xy/sample#multisampler
related: [sampler.synth-sampler, sampler.sampling]
---

Sample the instrument every few notes and let the zones fill the gaps below each one.
