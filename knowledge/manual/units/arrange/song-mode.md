---
id: arrange.song-mode
title: Song mode
aliases: [song, song order, chain scenes, song arrangement, loop song, song editor]
area: arrange
order: 50
context:
  modes: [arrange]
  screens: [song]
summary: Song mode chains scenes into a song order of up to 96 slots — dialled in with shift and the black keys, edited with a cursor, and set to loop or not with `E1`.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.0.29', '1.0.45', '1.1.0']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: enter
    text: In arrange mode, `shift + arrange` opens song mode.
    source: https://teenage.engineering/guides/op-xy/arrange#song-mode
  - id: add
    text: Holding `shift` and pressing black keys appends scenes to the song order one after another, much like keying in a phone number.
    source: https://teenage.engineering/guides/op-xy/arrange#song-mode
  - id: shift-needed
    text: Since OS 1.1.0, adding scenes and switching songs in song mode need `shift`.
    source: https://teenage.engineering/downloads/op-xy#1.1.0
    firmware_min: '1.1.0'
  - id: max
    text: A song order holds up to 96 scenes.
    source: https://teenage.engineering/guides/op-xy/arrange#song-mode
    firmware_min: '1.0.29'
  - id: cursor
    text: '`shift + M2` and `shift + M3` move a cursor back and forth through the song order, so scenes can be inserted between others or removed.'
    source: https://teenage.engineering/guides/op-xy/arrange#song-mode
  - id: delete
    text: '`shift + M4` takes the scene at the cursor out of the song; the scene itself stays in the project.'
    source: https://teenage.engineering/guides/op-xy/arrange#song-mode
  - id: clear
    text: '`shift + M1` empties the whole song order without deleting any scene.'
    source: https://teenage.engineering/guides/op-xy/arrange#song-mode
  - id: stop-at-end
    text: OS 1.0.45 added the option of stopping playback when the song reaches its end.
    source: https://teenage.engineering/downloads/op-xy#1.0.45
    firmware_min: '1.0.45'
  - id: plain-play
    text: Play runs the current song from its first scene even outside song mode, and after a stop play starts it from the first scene again, unless a scene was picked in arrange first, which then plays instead.
    source: docs/research/90-device-probe.md#2026-09-28-night--songs-and-scenes-on-the-unit-owner-present-tes-agent-os-1133
    confidence: verified
    verified_on: '1.1.33'
  - id: screen
    text: The song page is headed song 1 with a loop icon and shows a grid of 32 slots, eight across in four rows marked 1, 9, 17 and 25; scenes appear as numbered circles, a white line marks where the next scene goes, and a ring walks along the order during playback.
    source: docs/research/59-screen-profiling.md#29-arrange-and-song-mode
    confidence: verified
    verified_on: '1.1.33'
  - id: count
    text: The box beside count at the top right shows how many scenes the song holds.
    source: docs/research/59-screen-profiling.md#29-arrange-and-song-mode
    confidence: verified
    verified_on: '1.1.33'
  - id: cursor-with-shift
    text: The white cursor line shows only while `shift` is held, together with the lit footer.
    source: docs/research/59-screen-profiling.md#29-arrange-and-song-mode
    confidence: verified
    verified_on: '1.1.33'
  - id: ring
    text: During playback the playing scene wears a white ring with a small notch that goes round once while the scene plays; after stop the ring stays on the scene that was playing.
    source: docs/research/59-screen-profiling.md#29-arrange-and-song-mode
    confidence: verified
    verified_on: '1.1.33'
  - id: footer
    text: Holding `shift` lights the footer with clear all, ←, → and delete over `M1`…`M4`, the song editing keys.
    source: docs/research/59-screen-profiling.md#29-arrange-and-song-mode
    confidence: verified
    verified_on: '1.1.33'
procedures:
  - id: build
    goal: Build a song from scenes
    preconditions: [arrange mode, the scenes exist]
    steps:
      - keys: shift + arrange
        note: opens song mode
      - keys: shift + accidentals
        note: add the scenes in playing order
    source: https://teenage.engineering/guides/op-xy/arrange#song-mode
  - id: insert
    goal: Insert a scene between two others
    preconditions: [song mode]
    steps:
      - keys: shift + M2/M3
        note: move the cursor to the insertion point
      - keys: shift + accidental
        note: the scene to insert
    source: https://teenage.engineering/guides/op-xy/arrange#song-mode
  - id: delete
    goal: Take a scene out of the song
    preconditions: [song mode]
    steps:
      - keys: shift + M2/M3
        note: move the cursor to it
      - keys: shift + M4
    source: https://teenage.engineering/guides/op-xy/arrange#song-mode
parameters:
  - screen: song
    encoder: E1
    layer: base
    name: loop
    range: off / on
    note: when on, the song starts over from its first scene after the last one
    source: https://teenage.engineering/guides/op-xy/arrange#song-mode
related: [arrange.songs, arrange.scenes, arrange.scene-queue]
---

Song mode turns scenes into a finished structure — intro, verse, chorus — each scene playing for its
own length before the next. A cursor edits the list, and removing a scene from the song never
deletes it. Whether loop off is the stop-at-end option of 1.0.45 is not confirmed on a unit, nor how
the 32-slot grid shows an order longer than 32.
