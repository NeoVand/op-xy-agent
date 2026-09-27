---
id: arrange.patterns
title: New, copy, paste and remove patterns
aliases:
  [
    new pattern,
    add pattern,
    copy pattern,
    paste pattern,
    delete pattern,
    clear pattern,
    pattern limit
  ]
area: arrange
order: 10
context:
  modes: [arrange]
summary: In arrange, M1 adds a pattern to the selected track, M2 copies the current pattern with its whole sound, M3 pastes it and M4 removes a pattern; a track holds up to 16.
status: outdated-in-guide
firmware:
  min: '1.0.9'
  changed_in: ['1.1.15', '1.1.25']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: new
    text: '`M1` adds a new pattern to the selected track, the one whose key is lit.'
    source: https://teenage.engineering/guides/op-xy/arrange#edit-controls
  - id: was-nine
    text: OS 1.1.15 raised the limit from 9 to 16 patterns per track; older TE texts still give 9.
    source: https://teenage.engineering/downloads/op-xy#1.1.15
    firmware_min: '1.1.15'
  - id: copy
    text: '`M2` copies the selected pattern together with its engine and all other settings.'
    source: https://teenage.engineering/guides/op-xy/arrange#edit-controls
  - id: paste
    text: '`M3` pastes the copy. Pasted onto another track, it brings the complete instrument, engine and parameters included.'
    source: https://teenage.engineering/guides/op-xy/arrange#edit-controls
  - id: remove
    text: '`M4` removes a pattern from the selected track.'
    source: https://teenage.engineering/guides/op-xy/arrange#edit-controls
  - id: labels
    text: TE's screen art for arrange labels the four keys clear, copy, paste and new from left to right, the reverse of the guide text for `M1` and `M4`; not yet checked on a unit.
    source: docs/research/50-hardware-ui.md#33-page-catalogue
    confidence: conflicting
  - id: player
    text: Since OS 1.1.25, a newly added pattern takes over the player type currently in use.
    source: https://teenage.engineering/downloads/op-xy#1.1.25
    firmware_min: '1.1.25'
procedures:
  - id: new
    goal: Add a pattern to a track
    preconditions: [arrange mode]
    steps:
      - keys: Tn
        note: select the track
      - keys: M1
    result: The track gains one more pattern, up to 16.
    source: https://teenage.engineering/guides/op-xy/arrange#edit-controls
  - id: copy-paste
    goal: Copy a pattern to the same or another track
    preconditions: [arrange mode, the pattern to copy is selected]
    steps:
      - keys: M2
        note: copy
      - keys: Tn
        note: optional, pick another track
      - keys: M3
        note: paste
    source: https://teenage.engineering/guides/op-xy/arrange#edit-controls
  - id: remove
    goal: Remove a pattern from a track
    preconditions: [arrange mode, the pattern is selected]
    steps:
      - keys: M4
        note: check the label on screen first
    source: https://teenage.engineering/guides/op-xy/arrange#edit-controls
related:
  [arrange.overview, arrange.sound-link, arrange.scenes, players.overview, sequencer.overview]
---

The four module keys are the pattern toolbox of arrange: new, copy, paste and remove, always acting on
the selected track. A copy carries the full sound, so paste within a track for variations, or onto
another track to change a part's instrument mid-song. Editing the notes inside a pattern is a
sequencer topic.
