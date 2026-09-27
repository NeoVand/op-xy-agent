---
id: basics.key-notation
title: How key presses are written
aliases: [notation, key combos, guide conventions, combo press, sequence press, shortcut notation]
area: basics
order: 5
summary: The press types TE's guide draws (single, combo, sequence, hold, turn, click, hold and turn, keyboard, chords) and the text notation this manual uses for them, such as `shift + M1` or `record + play → play`.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: press-types
    text: "TE's diagrams show a few press types: single, combo (hold one key, press another), sequence (one after the other), hold, turn or click an encoder, hold a key while turning, keyboard notes and chords."
    source: https://teenage.engineering/guides/op-xy/guide-conventions#guide-conventions
  - id: all-encoders
    text: When a diagram highlights all four encoders, any of them will do.
    source: https://teenage.engineering/guides/op-xy/guide-conventions#guide-conventions
  - id: whole-keyboard
    text: A diagram that shows the whole keyboard is there for orientation, not as a request to play it.
    source: https://teenage.engineering/guides/op-xy/guide-conventions#guide-conventions
  - id: guide-errata
    text: The guide's legend labels its hold-and-turn picture as a second sequence press and swaps two captions (all encoders, keyboard).
    source: docs/research/40-official-docs.md#53-te-errata-we-keep-verbatim-and-our-manual-must-not-copy
    confidence: derived
  - id: combos
    text: This manual writes a combo with a plus sign (`shift + M1` = hold shift, press M1) and a sequence with an arrow (`record + play → play` = release, then press play again).
    source: docs/research/40-official-docs.md#4-key-combos-replica-how-to-data
    confidence: derived
  - id: gestures
    text: '`hold com` is a long press, `turn E2` and `click E4` move an encoder, and `Tn`, `step n` or `key` stand for any track, step or keyboard key.'
    source: docs/research/40-official-docs.md#4-key-combos-replica-how-to-data
    confidence: derived
related: [hardware.layout, basics.modules]
---

TE's guide draws its shortcuts as highlighted keys; this manual writes the same gestures as text,
which the agent can say and the replica can animate.
