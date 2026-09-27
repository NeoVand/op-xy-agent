---
id: instrument.preset-settings
title: Preset settings (tuning, velocity, width, mod routing)
aliases:
  [
    sound settings,
    mod routing,
    velocity sensitivity,
    modwheel,
    aftertouch,
    stereo width,
    preset transpose
  ]
area: instrument
order: 60
context:
  modes: [instrument]
  screens: [preset settings]
summary: "`shift + instrument` opens settings stored with the track's sound: tuning and transpose, a high-pass, velocity sensitivity, portamento style and width, plus a mod tab routing modwheel, aftertouch, pitchbend and velocity."
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: open
    text: '`shift + instrument` opens the preset settings of the selected instrument track; `instrument` or any of `M1`…`M4` leads back to the pages.'
    source: https://teenage.engineering/guides/op-xy/instrument#preset-settings
  - id: settings-tab
    text: The settings tab covers tuning (user tunings and transposition), a basic high-pass for trimming lows, velocity sensitivity, the portamento style and stereo width.
    source: https://teenage.engineering/guides/op-xy/instrument#preset-settings
  - id: separate-hp
    text: The preset high-pass is separate from the `M3` filter, so a track can use both.
    source: docs/research/30-presets-samples.md#23-engine
    confidence: community-verified
  - id: mod-tab
    text: The mod tab assigns the modwheel, aftertouch, pitchbend and velocity to parameters of the sound.
    source: https://teenage.engineering/guides/op-xy/instrument#preset-settings
  - id: target-amount
    text: Each mod source has a target entry and an amount entry; a negative amount inverts the modulation.
    source: https://teenage.engineering/guides/op-xy/how-to#pitch-bend
  - id: keyboard-velocity
    text: Whether the built-in keys send velocity at all is a system setting (`com → M1`, keyboard section) with the choices off, soft and hard.
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-enable-velocity
  - id: no-cc
    text: No MIDI CC is known for any preset setting.
    source: docs/research/20-midi-control.md#33-instrument-tracks-18-synth-drum-sampler-multisampler-engines
    confidence: community-verified
procedures:
  - id: route
    goal: Route a mod source such as the pitchbend strip to a parameter
    preconditions: [instrument mode, the track is selected]
    steps:
      - keys: shift + instrument
      - keys: turn E1
        note: mod tab
      - keys: turn E2
        note: the source's target entry, for example pitchbend target
      - keys: turn E3
        note: choose the parameter, then set the matching amount entry the same way
    source: https://teenage.engineering/guides/op-xy/how-to#pitch-bend
parameters:
  - screen: preset settings
    encoder: E1
    layer: base
    name: tab
    range: settings / mod
    source: https://teenage.engineering/guides/op-xy/instrument#preset-settings
  - screen: preset settings
    encoder: E2
    layer: base
    name: setting
    source: https://teenage.engineering/guides/op-xy/instrument#preset-settings
  - screen: preset settings
    encoder: E3
    layer: base
    name: value
    note: '`E4` does the same'
    source: https://teenage.engineering/guides/op-xy/instrument#preset-settings
related: [instrument.user-tunings, instrument.play-mode, howto.enable-velocity]
---

Preset settings are the parts of a sound you rarely touch while playing, and they travel with the
preset. The mod tab is how outside expression reaches the sound: aim a MIDI keyboard's modwheel or
aftertouch, or the pitchbend strip, at a parameter. To stop the strip also bending pitch, set bend
range (`M2`, shift layer) to off.
