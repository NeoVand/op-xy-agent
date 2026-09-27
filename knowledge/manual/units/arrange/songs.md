---
id: arrange.songs
title: Multiple songs and cueing
aliases: [select song, copy song, paste song, 14 songs, cue scene, jump in song]
area: arrange
order: 60
context:
  modes: [arrange]
  screens: [song]
summary: A project holds up to 14 songs, one per white key. In song mode shift and a white key select a song, M2 and M3 copy and paste it, and shift with minus or plus cues other scenes during playback.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.0.29', '1.0.32']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: count
    text: A project can hold up to 14 songs, one for each white key.
    source: https://teenage.engineering/guides/op-xy/arrange#song-mode
  - id: select
    text: In song mode, `shift + natural` switches to the song stored on that white key.
    source: https://teenage.engineering/guides/op-xy/arrange#song-mode
  - id: copy-paste
    text: With `shift` and a song's white key held, `M2` copies that song and `M3` pastes the copied song onto it.
    source: https://teenage.engineering/guides/op-xy/arrange#song-mode
    firmware_min: '1.0.29'
  - id: remember
    text: Since OS 1.0.32, leaving and re-entering song mode brings back the song you used last.
    source: https://teenage.engineering/downloads/op-xy#1.0.32
    firmware_min: '1.0.32'
  - id: cue
    text: While a song plays, `shift + [-]` and `shift + [+]` cue a different scene of the song order, which lets you skip ahead.
    source: https://teenage.engineering/guides/op-xy/arrange#song-mode
procedures:
  - id: select
    goal: Switch to another song
    preconditions: [song mode]
    steps:
      - keys: shift + natural
    source: https://teenage.engineering/guides/op-xy/arrange#song-mode
  - id: duplicate
    goal: Copy one song onto another
    preconditions: [song mode]
    steps:
      - keys: shift + natural + M2
        note: the white key of the song to copy
      - keys: shift + natural + M3
        note: the white key of the target song
    source: https://teenage.engineering/guides/op-xy/arrange#song-mode
    firmware_min: '1.0.29'
  - id: cue
    goal: Jump to another scene of the song while it plays
    preconditions: [song mode, the song is playing]
    steps:
      - keys: shift + [-]/[+]
    source: https://teenage.engineering/guides/op-xy/arrange#song-mode
related: [arrange.song-mode, arrange.scene-queue]
---

Each white key holds a song, so one project can carry several arrangements of the same material — a
short and an extended version, or a whole set. Copying a song is the quickest start for a variant.
The guide does not say whether a cued jump waits for the current scene to finish.
