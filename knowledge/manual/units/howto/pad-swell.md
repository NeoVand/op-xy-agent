---
id: howto.pad-swell
title: Recipe — a pad that swells in and fades slowly
aliases: [pad, swell, slow attack, ambient pad, fade in, long release, string swell]
area: howto
order: 42
context:
  modes: [instrument]
  screens: [M2, M3]
summary: For a pad, play in poly with a slow attack, a high sustain and a long release — on the OP-XY that is `E4` turned counter-clockwise — open the filter slowly with its envelope and send the track to the reverb on FX II.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: poly
    text: Chords need play mode poly, `shift + turn E1` on `M2`, so that every note of the chord sounds.
    source: https://teenage.engineering/guides/op-xy/instrument#envelopes
    confidence: derived
  - id: attack
    text: A slow attack on `E1` of `M2` makes each chord fade in rather than start at once; the higher the value, the slower the swell.
    source: https://teenage.engineering/guides/op-xy/instrument#envelopes
    confidence: derived
  - id: sustain
    text: A high sustain keeps the chord at full level for as long as the keys are held.
    source: https://teenage.engineering/guides/op-xy/instrument#envelopes
    confidence: derived
  - id: release
    text: For a long fade after the keys come up, turn release on `E4` counter-clockwise; on the OP-XY lower release values ring longer.
    source: docs/research/59-screen-profiling.md#22-envelope-editor-instrument-m2
    confidence: derived
  - id: filter-swell
    text: A slow filter attack with a positive envelope amount on `M3` opens the tone as the chord swells, so the pad brightens as it grows louder.
    source: https://teenage.engineering/guides/op-xy/instrument#filter
    confidence: derived
  - id: reverb
    text: In a new project FX II holds a reverb, so the FX II send, `shift + turn E4` on `M3`, adds space to the pad.
    source: docs/research/30-presets-samples.md#11-a-new-projects-sounds
    confidence: measured
  - id: factory
    text: A new project's strings and pad show the shape in numbers. Draemy on `T7` (axis) swells in at attack 50 and bandpasser on `T8` (multisampler) at 35; both hold a high sustain, 76 and 99, and release at 30 and 33. Draemy's filter envelope opens at attack 64 with an envelope amount of only 17, and the track sends 53 to FX II.
    source: docs/research/30-presets-samples.md#11-a-new-projects-sounds
    confidence: verified
    verified_on: '1.1.33'
  - id: from-a-lead
    text: Any sound can become a pad; in a new project `T5`, the legato lead, shows every step at work, since the strings on `T7` already swell.
    source: docs/research/30-presets-samples.md#11-a-new-projects-sounds
    confidence: derived
procedures:
  - id: swell
    goal: Make the chords on `T5` swell in and fade out
    preconditions: [instrument mode]
    steps:
      - keys: T5 → M2
        note: the amp envelope; click an encoder if the filter envelope is in front
      - keys: shift + turn E1
        note: play mode poly
        set: { param: play mode, value: poly }
      - keys: turn E1
        note: attack around 50, the factory strings' swell
        set: { param: amp attack, value: 50 }
      - keys: turn E3
        note: sustain around 85, held high as the factory pads hold it
        set: { param: amp sustain, value: 85 }
      - keys: turn E4
        note: release around 30, the factory pads' long fade
        set: { param: amp release, value: 30 }
    source: https://teenage.engineering/guides/op-xy/instrument#envelopes
    confidence: derived
  - id: brighten
    goal: Let the pad brighten as it swells, in a little reverb
    steps:
      - keys: click E1
        note: the filter envelope
      - keys: turn E1
        note: filter attack 64, as the factory strings
        set: { param: filter attack, value: 64 }
      - keys: M3
        note: press it again if the page shows off
      - keys: turn E1
        note: cutoff around 35
        set: { param: cutoff, value: 35 }
      - keys: turn E3
        note: envelope amount 17, the strings' gentle opening
        set: { param: env amount, value: 17 }
      - keys: shift + turn E4
        note: FX II send 53, as the strings send
        set: { param: fx ii send, value: 53 }
    source: https://teenage.engineering/guides/op-xy/instrument#filter
    confidence: derived
related: [instrument.envelopes, instrument.play-mode, instrument.track-sends, howto.first-chords]
---

A pad is a bed rather than a part: it should arrive softly, hold still and leave slowly, so
nothing about it grabs attention from the beat. The slow amp attack and long release do most of the
work; the slow filter opening adds movement inside each chord. Hold chords for a bar or more and let
them overlap, and duck the pad with the kick if it muddies the low end.
