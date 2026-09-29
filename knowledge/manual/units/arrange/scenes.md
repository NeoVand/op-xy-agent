---
id: arrange.scenes
title: Scenes
aliases: [scene, select scene, scene 10-99, clone scene, copy scene, paste scene, reset scene]
area: arrange
order: 30
context:
  modes: [arrange]
summary: A scene stores which pattern each track plays plus the mix; a project has 99. In arrange, shift and a black key select one, and shift + M1…M4 clone, copy, paste or reset.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.0.29', '1.0.45', '1.1.0']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: what
    text: A project has 99 scenes. Each one remembers which pattern every track plays, together with the mix settings.
    source: https://teenage.engineering/guides/op-xy/arrange#scenes
  - id: length
    text: A scene runs as long as its longest pattern.
    source: https://teenage.engineering/guides/op-xy/arrange#scenes
  - id: length-modes
    text: 'Since OS 1.1.0 a project setting picks how scene length is worked out; project files know three modes: longest (the default), shortest and time signature.'
    source: docs/research/10-xy-format.md#32-projectsettings-0x00000x0094
    firmware_min: '1.1.0'
    confidence: community-verified
  - id: select
    text: Holding `shift` and pressing a black key selects scenes 1–9, each key standing for its printed digit.
    source: https://teenage.engineering/guides/op-xy/arrange#scenes
  - id: select-high
    text: Scenes 10–99 start with `shift + accidental 0` (the last black key), followed by the scene number typed on the black keys.
    source: https://teenage.engineering/guides/op-xy/arrange#scenes
  - id: empty
    text: Selecting an empty scene fills it with a copy of the current one, so a song can grow scene by scene.
    source: https://teenage.engineering/guides/op-xy/arrange#scenes
    firmware_min: '1.0.29'
  - id: clone-reset
    text: '`shift + M1` clones the current scene; `shift + M4` resets it, putting every track back on pattern 1.'
    source: https://teenage.engineering/guides/op-xy/arrange#scenes
    firmware_min: '1.0.29'
  - id: copy-paste
    text: '`shift + M2` copies a scene and `shift + M3` pastes it into another.'
    source: https://teenage.engineering/guides/op-xy/arrange#scenes
    firmware_min: '1.0.45'
  - id: midi
    text: Over MIDI, on any channel, CC85 selects a scene at once and CC83 and CC84 step to the previous and the next scene.
    source: https://teenage.engineering/guides/op-xy/midi-references
  - id: midi-zero
    text: CC85 counts from zero, so value 0 selects scene 1 and value 98 scene 99.
    source: docs/research/20-midi-control.md#31-global-ccs
    confidence: community-verified
  - id: select-while-song
    text: Selected while the song plays (`shift` and a black key, in arrange), a scene takes over at once, mid-bar, its patterns carrying on from the song's place in the bar; from then on the unit plays that scene over and over and the song stops moving on. This is how to loop one scene.
    source: docs/research/90-device-probe.md#2026-09-28-night--songs-and-scenes-on-the-unit-owner-present-tes-agent-os-1133
    confidence: verified
    verified_on: '1.1.33'
  - id: select-arrange-only
    text: '`shift` and the black keys pick scenes only in arrange mode.'
    source: docs/research/90-device-probe.md#2026-09-28-night--songs-and-scenes-on-the-unit-owner-present-tes-agent-os-1133
    confidence: verified
    verified_on: '1.1.33'
  - id: footer
    text: With `shift` held in arrange, the footer names `M1`…`M4` clone, copy, paste and reset, the scene actions.
    source: docs/research/59-screen-profiling.md#29-arrange-and-song-mode
    confidence: verified
    verified_on: '1.1.33'
procedures:
  - id: loop-one
    goal: Loop one scene while the song plays
    preconditions: [arrange mode, playing]
    steps:
      - keys: shift + accidental
        note: the scene to keep; it starts at once and then repeats, and the song stops moving on
    source: docs/research/90-device-probe.md#2026-09-28-night--songs-and-scenes-on-the-unit-owner-present-tes-agent-os-1133
    confidence: verified
    verified_on: '1.1.33'
  - id: select
    goal: Select scene 1–9
    preconditions: [arrange mode]
    steps:
      - keys: shift + accidental
        note: the black key with the scene's digit
    source: https://teenage.engineering/guides/op-xy/arrange#scenes
  - id: select-high
    goal: Select a scene from 10 to 99
    preconditions: [arrange mode]
    steps:
      - keys: shift + accidental 0 → + accidentals
        note: then type both digits; whether `shift` must stay down for them is not confirmed on a unit
    source: https://teenage.engineering/guides/op-xy/arrange#scenes
  - id: copy
    goal: Copy one scene over another
    preconditions: [arrange mode, the scene to copy is selected]
    steps:
      - keys: shift + M2
        note: copy
      - keys: shift + accidental
        note: go to the target scene
      - keys: shift + M3
        note: paste
    source: https://teenage.engineering/guides/op-xy/arrange#scenes
    firmware_min: '1.0.45'
related: [arrange.scene-queue, arrange.song-mode, arrange.patterns, mix.overview, project.settings]
---

A scene is a snapshot of the arrangement — one pattern choice per track plus the mix — so switching
scenes changes the whole project at once. Because an empty scene starts as a copy of the current one,
building a song is mostly "next scene, change a few patterns". Changes are immediate unless queued.
