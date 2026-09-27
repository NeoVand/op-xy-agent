---
id: sequencer.step-component-reference
title: Step component values
aliases: [step component table, component values, accidental values, what the number keys do]
area: sequencer
order: 41
context:
  modes: [instrument, auxiliary]
summary: What each black key (1–9, then 0) selects for each of the 14 step components, in white-key order.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: pulse
    text: 'Pulse (`natural 1`): 1–9 repeats; 0 a random number.'
    source: https://teenage.engineering/guides/op-xy/step-components#step-components-ref-table
  - id: pulse-hold
    text: 'Pulse hold (`natural 2`): held for 1–9 steps; 0 a random number.'
    source: https://teenage.engineering/guides/op-xy/step-components#step-components-ref-table
  - id: multiply
    text: 'Multiply (`natural 3`): 1–8 hits inside the step; 0 a random number; for 9 see the multiply unit.'
    source: https://teenage.engineering/guides/op-xy/step-components#step-components-ref-table
  - id: velocity
    text: 'Velocity (`natural 4`): 1–8 give 4, 8, 16, 32, 64, 100, 112, 127; 9 gives 0; 0 a random velocity.'
    source: https://teenage.engineering/guides/op-xy/step-components#step-components-ref-table
  - id: ramps-random
    text: 'Ramp up (`natural 5`), ramp down (`natural 6`) and random (`natural 7`): 1–5 mean 2–6 steps within one octave; 6–9 and 0 mean 2–6 steps over three octaves.'
    source: https://teenage.engineering/guides/op-xy/step-components#step-components-ref-table
  - id: portamento
    text: 'Portamento (`natural 8`): 1–9 give 10–90%; 0 a random amount.'
    source: https://teenage.engineering/guides/op-xy/step-components#step-components-ref-table
  - id: bend
    text: 'Bend (`natural 9`): 1 down-up, 2 up-down, 3 bump down, 4 bump up, 5 spring out, 6 spring in, 7 fade down, 8 fade up, 9 random 1, 0 random 2.'
    source: https://teenage.engineering/guides/op-xy/step-components#step-components-ref-table
  - id: tonality
    text: 'Tonality (`natural 10`): 1 ignore chord progression, 2 transpose only, 3 octave up, 4 fifth up, 5 third up, 6 chromatic up, 7 chromatic down, 8/9/0 quantize 33/66/100%.'
    source: https://teenage.engineering/guides/op-xy/step-components#step-components-ref-table
  - id: jump
    text: 'Jump (`natural 11`): 1–4 go to step 1, 5, 9 or 13; 5 one forward; 6 one back; 7 forward or back; 8 stay; 9 align the track position; 0 a random step.'
    source: https://teenage.engineering/guides/op-xy/step-components#step-components-ref-table
  - id: skips
    text: 'Skip parameter lock (`natural 12`), skip step component (`natural 13`) and skip trigger (`natural 14`): 1 every pass, 2–9 every 2nd to 9th pass, 0 at random.'
    source: https://teenage.engineering/guides/op-xy/step-components#step-components-ref-table
  - id: defaults
    text: Added without a digit, a component keeps a default value; decoded device files show 4 for most, 2 for multiply and the skips, 5 for velocity and 1 for bend.
    source: docs/research/10-xy-format.md#38-step-components-16-b-per-step-64-steps-at-0x3057
    confidence: community
  - id: scale
    text: The ramps and random stay in the current scale, presumably the song scale set on the brain track.
    source: https://teenage.engineering/guides/op-xy/auxiliary#brain
    confidence: derived
  - id: icons
    text: 'Key icons from `natural 1` to `natural 14`: four dots, open hand, ÷, rising wedge, stairs up, stairs down, "rnd", glide sign, twin fins, four-petal fan, arrow to a dot, spoked wheel, ring of wedges, sun.'
    source: docs/research/50-hardware-ui.md#25-octave-shift-and-naturals-row-5-y--897-mm
    confidence: measured
related: [sequencer.step-components]
---

A pass is one time the playhead reaches the step. For most components 0 means chance; the ramps,
random and tonality use it for their strongest setting instead. The screen names the chosen value
while `shift` is held; each component has its own unit with an example.
