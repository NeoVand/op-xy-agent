---
id: howto.enable-velocity
title: Recipe — make the keyboard velocity-sensitive
aliases: [enable velocity, velocity sensitive keys, key velocity, touch sensitivity, velocity curve]
area: howto
order: 10
context:
  screens: [system settings]
summary: In the keyboard section of the system settings, set velocity to soft or hard so the built-in keys respond to how hard you play.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: what
    text: Velocity lets the built-in keyboard play louder or softer notes depending on how hard you strike the keys.
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-enable-velocity
  - id: values
    text: The velocity setting has three values — off, soft for a gentle touch and hard for a forceful one.
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-enable-velocity
  - id: where
    text: The setting sits in the keyboard section of the system settings.
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-enable-velocity
  - id: per-preset
    text: How much a sound reacts to velocity is set per preset, with the velocity sensitivity in the preset settings.
    source: https://teenage.engineering/guides/op-xy/instrument#preset-settings
procedures:
  - id: enable
    goal: Turn on keyboard velocity
    steps:
      - keys: com → M1
      - keys: turn E1
        note: keyboard section
      - keys: turn E2
        note: the velocity setting
      - keys: turn E3
        note: soft or hard
      - keys: M1
        note: back to the com page
      - keys: instrument
        note: back to playing
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-enable-velocity
related: [com.system-settings, instrument.preset-settings]
---

Match the curve to your touch: soft for a light playing style, hard for a heavy one. The setting only
concerns the OP-XY's own keys — notes from a MIDI keyboard bring their own velocity.
