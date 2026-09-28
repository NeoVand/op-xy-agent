---
id: howto.song-from-scenes
title: Recipe — build a song from scenes
aliases:
  [
    song from scenes,
    arrange a song,
    verse and chorus,
    chain scenes,
    make a song,
    song order,
    scenes into a song
  ]
area: howto
order: 33
context:
  modes: [arrange]
  screens: [song]
summary: In arrange, a scene is a snapshot of which pattern every track plays — copy scene 1 into scene 2 with `shift + accidental 2`, give a track a new pattern there with `M1`, then key the scenes into song mode (`shift + arrange`) in playing order and choose whether the song loops.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.0.45', '1.1.0']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: scene
    text: A scene remembers the pattern every track plays and their mix; a project has 99.
    source: https://teenage.engineering/guides/op-xy/arrange#scenes
  - id: copy-on-select
    text: Choosing an empty scene fills it with a copy of the one playing, so the next section starts as the last one did.
    source: https://teenage.engineering/guides/op-xy/arrange#scenes
  - id: pick-scene
    text: '`shift` and a black key choose scenes 1–9; scenes 10–99 start with `shift + accidental 0` and two more black keys.'
    source: https://teenage.engineering/guides/op-xy/arrange#scenes
  - id: new-pattern
    text: In arrange, `M1` adds a new pattern to the selected track; the replica plays it at once in the current scene, which then remembers it, while other scenes keep their own choice.
    source: https://teenage.engineering/guides/op-xy/arrange#edit-controls
    confidence: derived
  - id: song-mode
    text: '`shift + arrange` opens song mode, where `shift` and black keys add scenes to the song order one after another and `shift + M1` empties it.'
    source: https://teenage.engineering/guides/op-xy/arrange#song-mode
  - id: loop
    text: '`E1` in song mode turns looping on or off; with it on, the song starts over from its first scene after the last.'
    source: https://teenage.engineering/guides/op-xy/arrange#song-mode
  - id: stop-at-end
    text: OS 1.0.45 added stopping playback at the song's end; the replica stops there with loop off, which is not yet confirmed on a unit.
    source: https://teenage.engineering/downloads/op-xy#1.0.45
    firmware_min: '1.0.45'
  - id: shift-keys
    text: Since OS 1.1.0 the black keys add scenes in song mode only with `shift` held.
    source: https://teenage.engineering/downloads/op-xy#1.1.0
    firmware_min: '1.1.0'
  - id: chorus-idea
    text: A chorus often needs only one or two tracks to change, such as a busier drum pattern or a new bassline, while the rest carry on; each changed track gets its own pattern in the chorus scene.
    source: https://teenage.engineering/guides/op-xy/arrange#scenes
    confidence: derived
procedures:
  - id: chorus
    goal: Make a chorus scene in which track 3 plays a second pattern
    preconditions: [the verse's patterns play in scene 1]
    steps:
      - keys: arrange
        note: scene 1, the verse
      - keys: shift + accidental 2
        note: scene 2, a copy of scene 1
        set: { param: scene, value: 2, area: arrange }
      - keys: T3 → M1
        note: a new, empty pattern 2 for track 3, playing in scene 2
        set: { param: pattern, value: 2, area: arrange, track: 3 }
      - keys: instrument
        note: program the chorus bassline on track 3's new pattern
    result: Scene 1 still plays track 3's pattern 1; scene 2 plays its pattern 2.
    source: https://teenage.engineering/guides/op-xy/arrange#scenes
    confidence: derived
  - id: song
    goal: Chain the scenes into a song that plays through once
    steps:
      - keys: arrange
      - keys: shift + arrange
        note: song mode
      - keys: shift + M1
        note: clear the song order
      - keys: shift + accidental 1 → + accidental 1 → + accidental 2 → + accidental 2
        note: shift held, verse twice, chorus twice
        set: { param: song, value: 1 1 2 2, area: arrange }
      - keys: turn E1
        note: counter-clockwise, loop off
        set: { param: loop, value: off, area: arrange }
      - keys: play
        note: the song plays from its first scene
    result: Verse, verse, chorus, chorus, and no start over at the end.
    source: https://teenage.engineering/guides/op-xy/arrange#song-mode
related: [arrange.scenes, arrange.song-mode, arrange.patterns, howto.song-with-brain]
---

Scenes turn loops into sections and song mode strings the sections together. Start from a loop that
already works as the verse, copy it into the next scene and change as little as makes the chorus lift:
one new pattern is often enough. Keep adding scenes for a bridge or an ending, then key the song in
the order it should play. With the loop left on, the song starts over at the end, handy while
writing; switch it off for a finished take.
