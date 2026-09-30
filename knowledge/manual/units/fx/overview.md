---
id: fx.overview
title: Send effects
aliases: [fx, send fx, fx types, change fx, effect list, FX I, FX II]
area: fx
order: 0
context:
  modes: [auxiliary]
  screens: [M1]
summary: Six built-in send effects — chorus, delay, distortion, lofi, phaser and reverb — can be loaded on the two FX tracks, FX I (`T7`) and FX II (`T8`); `M1` of an FX track shows the effect's four controls.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: six
    text: The OP-XY has six built-in send effects — chorus, delay, distortion, lofi, phaser and reverb.
    source: https://teenage.engineering/guides/op-xy/fx#fx
  - id: slots
    text: Two slots hold them, the FX tracks FX I and FX II, which are auxiliary tracks `T7` and `T8`; either slot can take any of the six.
    source: https://teenage.engineering/guides/op-xy/fx#fx
  - id: m1
    text: The loaded effect's four parameters sit on the FX track's `M1` page.
    source: https://teenage.engineering/guides/op-xy/auxiliary#fx-i-and-fx-ii
  - id: no-type-cc
    text: No MIDI CC is known that changes the effect type; choose it on the unit.
    source: docs/research/20-midi-control.md#35-auxiliary-tracks-916
    confidence: community
  - id: list-names
    text: The effect list on the unit spells them chorus, delay, dist, lofi, phaser and reverb.
    source: docs/research/59-screen-profiling.md#213-auxiliary-tracks
    confidence: verified
    verified_on: '1.1.33'
  - id: new-project
    text: A new project starts with a delay on FX I, set to a dotted eighth, and a reverb on FX II.
    source: docs/research/30-presets-samples.md#11-a-new-projects-sounds
    confidence: verified
    verified_on: '1.1.33'
procedures:
  - id: change
    goal: Load a different effect on FX I or FX II
    steps:
      - keys: auxiliary
      - keys: T7/T8
        note: select FX I or FX II
      - keys: shift + T7/T8
        note: opens the list of effects for that slot
      - keys: turn E4
        note: scroll to the effect
      - keys: click E4
        note: pressing `M1` confirms as well
    result: The slot now runs the chosen effect and `M1` shows its parameters.
    source: https://teenage.engineering/guides/op-xy/fx#fx
related:
  [
    fx.chorus,
    fx.delay,
    fx.distortion,
    fx.lofi,
    fx.phaser,
    fx.reverb,
    auxiliary.fx-sends,
    mix.levels-pans-sends
  ]
---

Send effects work like the return channels of a mixing desk: tracks send a share of their signal to
FX I or FX II, and the FX track plays the processed result back into the mix, so one reverb can serve
every track. Each slot runs one effect at a time. The FX tracks themselves — sends, routing, filter,
LFO and defaults — are covered with the auxiliary tracks; the units here list what each effect's
`M1` encoders do.
