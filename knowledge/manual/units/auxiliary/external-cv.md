---
id: auxiliary.external-cv
title: External CV track
aliases: [cv track, cv gate, control voltage, modular, eurorack]
area: auxiliary
order: 40
context:
  modes: [auxiliary]
summary: '`T4` sends note pitch as control voltage and a gate from the multi-out jack, so the keyboard and sequencer can play modular and vintage synths.'
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: why
    text: Modular and vintage synths take pitch as a control voltage (CV) and note on/off as a gate.
    source: https://teenage.engineering/guides/op-xy/auxiliary#external-cv
  - id: track
    text: On the external CV track (`T4`) the keyboard and sequencer play the connected CV device.
    source: https://teenage.engineering/guides/op-xy/auxiliary#external-cv
  - id: jack
    text: The multi-out carries CV on its tip (left) and gate on its ring (right).
    source: https://teenage.engineering/guides/op-xy/auxiliary#external-cv
  - id: cable
    text: Use a splitter cable that separates left and right, not one that keeps stereo — tip to the CV input, ring to the gate input.
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-control-an-analog-synth%20with%20cv%20and%20gate
procedures:
  - id: multi-out
    goal: Set the multi-out to CV and gate
    preconditions: [nothing plugged into the multi-out]
    steps:
      - keys: com
      - keys: turn E3
        note: until cv shows
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-control-an-analog-synth%20with%20cv%20and%20gate
related: [com.multi-out, howto.control-cv-synth]
---

The simplest aux track: the guide gives it no page settings, only notes. Set the multi-out to cv
before plugging in, patch pitch and gate into the synth, then play `T4` like any other track.
