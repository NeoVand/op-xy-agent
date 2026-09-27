---
id: arrange.sound-link
title: Sound link
aliases: [link sound, keep sound across patterns, link source, link track, same preset all patterns]
area: arrange
order: 20
context:
  modes: [arrange]
summary: With sound link on, a track keeps one sound while you switch its patterns instead of loading each pattern's own; the sound comes from a source pattern you choose. New in OS 1.1.0.
status: current
firmware:
  min: '1.1.0'
  changed_in: ['1.1.3']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: since
    text: Sound link arrived in OS 1.1.0.
    source: https://teenage.engineering/downloads/op-xy#1.1.0
  - id: toggle
    text: In arrange, `turn E3` or `click E3` switches sound link on or off for the selected track.
    source: https://teenage.engineering/guides/op-xy/arrange#sound-link
  - id: effect
    text: While sound link is on, changing pattern leaves the track's sound and preset as they are; the sounds stored with the individual patterns are overridden.
    source: https://teenage.engineering/guides/op-xy/arrange#sound-link
  - id: source
    text: The linked sound comes from one source pattern. To choose it, select that pattern with `turn E4`, then use `shift + turn E3` (or `shift + click E3`).
    source: https://teenage.engineering/guides/op-xy/arrange#sound-link
  - id: delete-fix
    text: OS 1.1.3 fixed a crash when deleting patterns on a track that used sound link.
    source: https://teenage.engineering/downloads/op-xy#1.1.3
    firmware_min: '1.1.3'
procedures:
  - id: toggle
    goal: Switch sound link on or off
    preconditions: [arrange mode, the track is selected]
    steps:
      - keys: click E3
        note: turning `E3` also toggles it
    source: https://teenage.engineering/guides/op-xy/arrange#sound-link
  - id: set-source
    goal: Choose which pattern's sound the link uses
    preconditions: [arrange mode, the track is selected]
    steps:
      - keys: turn E4
        note: select the pattern whose sound you want
      - keys: shift + turn E3
        note: '`shift + click E3` works too'
    source: https://teenage.engineering/guides/op-xy/arrange#sound-link
related: [arrange.patterns, arrange.overview]
---

Normally each pattern of a track carries its own sound, so switching patterns can switch presets —
handy for instrument changes, not when you only want new notes. Sound link fixes the track to the
sound of one source pattern. The guide (v1.1.15) does not say what happens to the patterns' own
sounds when the link goes off again.
