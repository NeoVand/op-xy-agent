---
id: sampler.drum-sampler
title: Drum sampler
aliases: [drum engine, drum kit, drum keys, copy drum key]
area: sampler
order: 30
context:
  modes: [instrument]
  screens: [M1, sample]
summary: Gives each of the 24 keys its own one-shot sample; record straight onto a chosen key, step between filled keys, and copy, paste or multi-select keys on the `M1` page.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.0.29', '1.0.32']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: what
    text: Each key holds its own one-shot sample — built for kits, fine for any set of separate sounds.
    source: https://teenage.engineering/guides/op-xy/sample#drum-sampler
  - id: record-order
    text: On the record page, press the key the take should land on (it lights up), then `hold M1`; the recording itself starts once the input passes the threshold.
    source: https://teenage.engineering/guides/op-xy/sample#drum-sampler
  - id: key-pitch
    text: The guide ties no root note to a drum key — the key you choose is where the take goes, and tune on the `M1` page (`turn E1`) changes its pitch afterwards.
    source: https://teenage.engineering/guides/op-xy/sample#drum-sampler
  - id: notes
    text: Over MIDI the 24 keys are notes 53–76 (F3–E5 with C4 = 60), left to right.
    source: docs/research/20-midi-control.md#42-drum-key-mapping
    confidence: community-verified
  - id: saved
    text: Every drum sampler recording is also saved to the samples folder named user.
    source: https://teenage.engineering/guides/op-xy/sample#drum-sampler
  - id: step-keys
    text: On the record page, `M2` and `M3` jump to the previous or next key holding a sample; `M4` clears the current key but keeps its file.
    source: https://teenage.engineering/guides/op-xy/sample#drum-sampler
  - id: copy-paste
    text: On `M1`, `key + M2` copies that key's sample and `key + M3` pastes the last copy onto the held key.
    source: https://teenage.engineering/guides/op-xy/sample#drum-sampler
  - id: copy-since
    text: Drum key copy and paste exists since OS 1.0.29.
    source: https://teenage.engineering/downloads/op-xy#1.0.28
    firmware_min: '1.0.29'
  - id: multi-select
    text: '`key + M4` selects several keys so one edit changes them all; the guide does not say how more keys join.'
    source: https://teenage.engineering/guides/op-xy/sample#drum-sampler
  - id: long-samples
    text: Long samples default to the key play mode (sound only while held) rather than oneshot.
    source: https://teenage.engineering/downloads/op-xy#1.0.32
    firmware_min: '1.0.32'
  - id: te-layout
    text: "TE's factory kits share one layout, left to right: kick, kick, snare, snare, rim, clap, tambourine, shaker, closed hat, closed hat, open hat, clave, low tom, ride, mid tom, crash, high tom, triangle, low conga, high conga, cowbell, guiro, metal, chi."
    source: docs/research/30-presets-samples.md#74-te-drum-layout-use-it-for-role--key
    confidence: community-verified
procedures:
  - id: record
    goal: Record a sample onto one key
    preconditions: [the track uses the drum sampler]
    steps:
      - keys: sample
        note: set source, gain and threshold here (`turn E1`, `turn E3`, `turn E4`)
      - keys: key
        note: the key lights up; choose it after `sample`, since a key held while pressing `sample` browses samples instead
      - keys: hold M1
        note: the take starts once the input passes the threshold
    source: https://teenage.engineering/guides/op-xy/sample#drum-sampler
related: [sampler.drum-key-settings, sampler.slicing, sampler.sampling]
---

Treat the keyboard as 24 pads: on the record page press a key, `hold M1` and make the sound; the
recorder waits for the threshold, so the take starts on the hit. Takes also land in the library, so
clearing a key never loses a recording.
