---
id: sequencer.bars-and-length
title: Bars and pattern length
aliases:
  [add a bar, duplicate a bar, switch bars, pages, sequence length, pattern length, number of steps]
area: sequencer
order: 64
context:
  modes: [instrument, auxiliary]
  screens: [bar]
summary: '`bar + [+]` adds a 16-step bar (four at most), `bar + [-]` removes one, `bar + shift + [+]` duplicates, tapping `bar` switches bars, and `bar + step n` sets how many steps the last bar plays.'
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.1.3']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: add-remove
    text: '`bar + [+]` adds a bar of 16 steps and `bar + [-]` removes one; a pattern holds at most four bars.'
    source: https://teenage.engineering/guides/op-xy/sequencer#extend-with-bar
  - id: duplicate
    text: '`bar + shift + [+]` duplicates the current bar; in a two-bar pattern it doubles the phrase, copying bar 1 to bar 3 and bar 2 to bar 4.'
    source: https://teenage.engineering/guides/op-xy/sequencer#extend-with-bar
  - id: duplicate-content
    text: Since OS 1.1.3, duplicated bars keep their step components and parameter locks.
    source: https://teenage.engineering/downloads/op-xy#1.1.3
    firmware_min: '1.1.3'
  - id: switch
    text: Tapping `bar` changes which bar the step keys show; a bar picked during playback or recording stays on the keys instead of following the playhead.
    source: https://teenage.engineering/guides/op-xy/sequencer#extend-with-bar
  - id: length
    text: Holding `bar` and pressing a step key sets how many steps the pattern plays; with several bars it trims the final bar only.
    source: https://teenage.engineering/guides/op-xy/sequencer#extend-with-bar
  - id: range
    text: Bars and length together allow any pattern length from 1 to 64 steps.
    source: docs/research/10-xy-format.md#44-constraints-and-limits
    confidence: community-verified
procedures:
  - id: add
    goal: Add or remove a bar
    steps:
      - keys: bar + [+]/[-]
    source: https://teenage.engineering/guides/op-xy/sequencer#extend-with-bar
  - id: duplicate
    goal: Duplicate the current bar
    steps:
      - keys: bar + shift + [+]
    source: https://teenage.engineering/guides/op-xy/sequencer#extend-with-bar
  - id: length
    goal: Set the pattern's length in steps
    steps:
      - keys: bar + step n
    source: https://teenage.engineering/guides/op-xy/sequencer#extend-with-bar
related: [sequencer.bar-menu, sequencer.track-scale, basics.patterns-scenes-songs]
---

Duplicate the first bar, then change a detail in the copy. Length makes odd patterns easy: 12 steps
for a bar of 3/4. The OS changelog calls bars "pages".
