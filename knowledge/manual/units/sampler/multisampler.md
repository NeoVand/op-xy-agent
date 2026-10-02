---
id: sampler.multisampler
title: Multisampler
aliases: [multisample, multi sampler, key zones, sampled instrument]
area: sampler
order: 50
context:
  modes: [instrument]
  screens: [M1, sample]
summary: Up to 24 samples of one instrument, each on its own zone of the keyboard; a sample also plays the empty keys below it, and `M1` edits the selected zone like the synth sampler.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.1.0', '1.1.25']
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
    text: The record page works like the drum sampler's — press a key to choose the zone (it lights up), then `hold M1`; `M2` / `M3` step through filled keys, `M4` unassigns, and takes also go to the user folder.
    source: https://teenage.engineering/guides/op-xy/sample#multisampler
  - id: threshold
    text: As on every record page, the take starts only once the input passes the threshold set with `E4`.
    source: https://teenage.engineering/guides/op-xy/sample#multisampler
  - id: root
    text: The key you record on becomes the zone's top key and root (presets the unit writes set each zone's root to its top key), so play that key's note into the input.
    source: docs/research/30-presets-samples.md#27-region-fields-by-type
    confidence: derived
  - id: editing
    text: The multisampler's `M1` page has the synth sampler's layout, loop type included (`shift + click E3`).
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
  - id: screen
    text: The top strip is a full keyboard on which the zone of the sample being played lights up, jumping with the octave; each zone brings its own waveform and markers, and the shift layer matches the synth sampler's.
    source: docs/research/59-screen-profiling.md#25-engine-pages-instrument-m1
    confidence: verified
    verified_on: '1.1.33'
  - id: no-cc
    text: CC12–15 on the track's channel move nothing on this page.
    source: docs/research/59-screen-profiling.md#25-engine-pages-instrument-m1
    confidence: verified
    verified_on: '1.1.33'
  - id: no-locks
    text: OS 1.1.0 gave parameter locks to the drum and synth samplers and does not name the multisampler; the replica gives its zones none, which is not yet checked on a unit.
    source: https://teenage.engineering/downloads/op-xy#1.1.0
    confidence: derived
    firmware_min: '1.1.0'
procedures:
  - id: record-zones
    goal: Multisample an instrument
    preconditions: [the track uses the multisampler]
    steps:
      - keys: sample
        note: set source, gain and threshold here (`turn E1`, `turn E3`, `turn E4`)
      - keys: key
        note: start low and work to the right; the key lights up
      - keys: hold M1
        note: play that key's note; the take starts once it passes the threshold. Repeat on the next key
    source: https://teenage.engineering/guides/op-xy/sample#multisampler
related: [sampler.synth-sampler, sampler.sampling]
---

Sample the instrument every few notes and let the zones fill the gaps below each one.
