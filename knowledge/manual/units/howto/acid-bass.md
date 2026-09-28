---
id: howto.acid-bass
title: Recipe — a squelchy acid bass
aliases: [acid, acid bass, acid line, squelch, resonant bass, sliding bass]
area: howto
order: 44
context:
  modes: [instrument]
  screens: [M3, M2]
summary: On the bass track pick the ladder filter, set a low cutoff, high resonance and a strong, short filter envelope, then play mode legato with a little portamento so that overlapping notes slide.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: type-return
    text: Picking a filter type from `shift + M3` takes you back to `M1`, so press `M3` to go on with the filter.
    source: docs/research/59-screen-profiling.md#23-filter-instrument-m3
    confidence: verified
    verified_on: '1.1.33'
  - id: squelch
    text: A low cutoff, high resonance and a large envelope amount with a short filter decay make each note open and snap shut, the acid squelch.
    source: https://teenage.engineering/guides/op-xy/instrument#filter
    confidence: derived
  - id: slide
    text: In legato play mode one note sounds at a time, and portamento makes overlapping notes glide from one pitch to the next.
    source: https://teenage.engineering/guides/op-xy/instrument#envelopes
    confidence: derived
  - id: accents
    text: Parameter locks on the cutoff or the envelope amount for single steps give the line its accents.
    source: https://teenage.engineering/guides/op-xy/sequencer#step-sequencing
    confidence: derived
procedures:
  - id: filter
    goal: Give the bass on T3 a squelchy filter
    preconditions: [instrument mode]
    steps:
      - keys: T3 → shift + M3
        note: the filter types
      - keys: turn E1
        note: highlight ladder
      - keys: click E1
        note: takes it and goes back to `M1`
        set: { param: filter type, value: ladder }
      - keys: M3
        note: press it again if the page shows off
      - keys: turn E1
        note: cutoff around 20
        set: { param: cutoff, value: 20 }
      - keys: turn E2
        note: resonance around 70
        set: { param: resonance, value: 70 }
      - keys: turn E3
        note: envelope amount around 70
        set: { param: env amount, value: 70 }
    source: https://teenage.engineering/guides/op-xy/instrument#filter
    confidence: derived
  - id: envelope
    goal: Snap the filter shut and let the notes slide
    steps:
      - keys: M2
        note: click an encoder until the filter envelope is in front
      - keys: turn E2
        note: filter decay around 25
        set: { param: filter decay, value: 25 }
      - keys: turn E3
        note: filter sustain 0
        set: { param: filter sustain, value: 0 }
      - keys: shift + turn E1
        note: play mode legato
        set: { param: play mode, value: legato }
      - keys: shift + turn E2
        note: portamento around 20
        set: { param: portamento, value: 20 }
    source: https://teenage.engineering/guides/op-xy/instrument#envelopes
    confidence: derived
related: [instrument.filter, instrument.play-mode, sequencer.parameter-locks, howto.wobble]
---

Acid lives in the filter: a bright snap at the start of each note that closes almost at once, with
resonance singing at the cutoff. Program the line with some notes overlapping so they slide, and a
few locked accents where the filter opens further. Riding the cutoff live while the pattern loops is
half the fun.
