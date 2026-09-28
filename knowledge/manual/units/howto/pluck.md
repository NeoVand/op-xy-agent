---
id: howto.pluck
title: Recipe — turn a sound into a pluck
aliases: [pluck, plucky, short notes, staccato sound, percussive synth, plucked bass]
area: howto
order: 41
context:
  modes: [instrument]
  screens: [M2, M3]
summary: A pluck starts at once and dies away while the key is still down — on `M2` set attack 0, a short decay and no sustain, then let the filter envelope close the tone as the note fades.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: shape
    text: With sustain at 0 a note fades out over the decay time even while its key is held, so the decay sets the length of the pluck.
    source: https://teenage.engineering/guides/op-xy/instrument#envelopes
    confidence: derived
  - id: decay
    text: Decay on `E2` of `M2` grows longer as it is turned clockwise; around 15–30 gives a pluck, higher values a longer ring.
    source: docs/research/59-screen-profiling.md#22-envelope-editor-instrument-m2
    confidence: derived
  - id: release
    text: Release runs the other way on the OP-XY, clockwise being shorter, so a crisp pluck wants `E4` well clockwise; lower values let notes ring on after the key comes up.
    source: docs/research/59-screen-profiling.md#22-envelope-editor-instrument-m2
    confidence: derived
  - id: swap
    text: Clicking any encoder on `M2` swaps between the amp and the filter envelope, so the same four encoders set both.
    source: https://teenage.engineering/guides/op-xy/instrument#envelopes
  - id: filter
    text: For a pluck that starts bright and darkens, lower the cutoff on `M3`, raise the envelope amount on `E3`, and give the filter envelope a short decay and no sustain as well.
    source: https://teenage.engineering/guides/op-xy/instrument#filter
    confidence: derived
  - id: resonance
    text: A little resonance on `E2` of `M3` adds a squelch as the filter closes.
    source: https://teenage.engineering/guides/op-xy/instrument#filter
    confidence: derived
procedures:
  - id: amp
    goal: Make the notes on T3 pluck
    preconditions: [instrument mode]
    steps:
      - keys: T3 → M2
        note: the amp envelope; click an encoder if the filter envelope is in front
      - keys: turn E1
        note: attack 0
        set: { param: amp attack, value: 0 }
      - keys: turn E2
        note: decay around 25
        set: { param: amp decay, value: 25 }
      - keys: turn E3
        note: sustain 0
        set: { param: amp sustain, value: 0 }
      - keys: turn E4
        note: release around 80, a short tail
        set: { param: amp release, value: 80 }
    source: https://teenage.engineering/guides/op-xy/instrument#envelopes
    confidence: derived
  - id: filter
    goal: Let the filter close with every pluck
    steps:
      - keys: click E1
        note: the filter envelope
      - keys: turn E2
        note: filter decay around 30
        set: { param: filter decay, value: 30 }
      - keys: turn E3
        note: filter sustain 0
        set: { param: filter sustain, value: 0 }
      - keys: M3
        note: press it again if the page shows off
      - keys: turn E1
        note: cutoff around 30
        set: { param: cutoff, value: 30 }
      - keys: turn E2
        note: resonance around 30
        set: { param: resonance, value: 30 }
      - keys: turn E3
        note: envelope amount around 50
        set: { param: env amount, value: 50 }
    source: https://teenage.engineering/guides/op-xy/instrument#filter
    confidence: derived
related: [instrument.envelopes, instrument.filter, howto.first-bassline, howto.pad-swell]
---

A pluck cuts through a mix because its energy sits at the start of the note. The amp envelope makes
the level drop away and the filter envelope makes the tone drop with it, which is what makes it
sound plucked rather than merely short. With sustain at 0 nothing lingers, so fast sequences and
arpeggios stay clean. Longer decays drift towards bells and keys; a touch of FX II on
`shift + M3` gives the tail back without blurring the attack.
