---
id: sequencer.component-velocity
title: Velocity (step component)
aliases: [velocity component, fixed velocity, accent, ghost note]
area: sequencer
order: 45
context:
  modes: [instrument, auxiliary]
summary: Step component on `natural 4` that plays a step at a fixed or random velocity.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: what
    text: The velocity component makes a step play at a set velocity, whatever velocity was recorded.
    source: https://teenage.engineering/guides/op-xy/step-components
  - id: values
    text: The black keys 1–8 set 4, 8, 16, 32, 64, 100, 112 or 127; 9 sets 0; 0 picks a random velocity.
    source: https://teenage.engineering/guides/op-xy/step-components#step-components-ref-table
  - id: sound
    text: How much velocity changes the sound depends on the preset's velocity sensitivity, set in its preset settings.
    source: https://teenage.engineering/guides/op-xy/instrument#preset-settings
    confidence: derived
procedures:
  - id: accent
    goal: Accent a step at full velocity
    steps:
      - keys: shift + steps → + natural 4 → + accidental 8
        note: 8 gives 127
    source: https://teenage.engineering/guides/op-xy/step-components#adding-step-components-to-a-sequence
related: [sequencer.step-component-reference, howto.enable-velocity]
---

Use it for accents and ghost notes — 127 on the backbeat, 16 or 32 on the hi-hats between — or the
random setting for a looser feel.
