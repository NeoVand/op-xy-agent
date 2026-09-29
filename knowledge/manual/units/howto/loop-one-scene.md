---
id: howto.loop-one-scene
title: Recipe — loop one scene
aliases:
  [
    loop one scene,
    loop a scene,
    repeat a scene,
    hold a scene,
    stay on a scene,
    stop the song advancing,
    play only one scene
  ]
area: howto
order: 34
context:
  modes: [arrange]
summary: Play runs the song, scene after scene. To hear one scene over and over, pick it — in arrange, `shift` and its black key, before play or while playing — and it repeats; or empty the song order in song mode so play keeps to the current scene.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: '1.1.33'
facts:
  - id: play-runs-song
    text: Play runs the current song from its first scene even outside song mode, and after a stop it starts from the first scene again.
    source: docs/research/90-device-probe.md#2026-09-28-night--songs-and-scenes-on-the-unit-owner-present-tes-agent-os-1133
    confidence: verified
    verified_on: '1.1.33'
  - id: pick-while-playing
    text: While the song plays, `shift` and a black key in arrange switch to that scene at once, mid-bar, and from then on the unit repeats it; the song stops moving on.
    source: docs/research/90-device-probe.md#2026-09-28-night--songs-and-scenes-on-the-unit-owner-present-tes-agent-os-1133
    confidence: verified
    verified_on: '1.1.33'
  - id: pick-before-play
    text: Picked while stopped (`shift` and its black key, in arrange), a scene is what play starts with instead of the song's first scene, and it repeats — twenty bars of scene 7 in a test on OS 1.1.33, where the song would have moved on to scene 6.
    source: docs/research/90-device-probe.md#2026-09-28-night--songs-and-scenes-on-the-unit-owner-present-tes-agent-os-1133
    confidence: verified
    verified_on: '1.1.33'
  - id: arrange-only
    text: '`shift` and the black keys choose scenes only in arrange mode.'
    source: docs/research/90-device-probe.md#2026-09-28-night--songs-and-scenes-on-the-unit-owner-present-tes-agent-os-1133
    confidence: verified
    verified_on: '1.1.33'
  - id: clear-song
    text: "`shift + M1` in song mode empties the song order without deleting any scene, taking every scene out of the song's playback."
    source: https://teenage.engineering/guides/op-xy/arrange#song-mode
  - id: empty-song-plays-scene
    text: With the song order empty, play has no song to run, so the scene on screen keeps playing.
    source: https://teenage.engineering/guides/op-xy/arrange#song-mode
    confidence: derived
procedures:
  - id: while-playing
    goal: Keep one scene playing, from the song
    preconditions: [a song with several scenes]
    steps:
      - keys: play
        note: the song starts from its first scene
      - keys: arrange
      - keys: shift + accidental
        note: the black key of the scene to keep; it takes over at once and repeats
    result: The chosen scene plays over and over until stop.
    source: docs/research/90-device-probe.md#2026-09-28-night--songs-and-scenes-on-the-unit-owner-present-tes-agent-os-1133
    confidence: verified
    verified_on: '1.1.33'
  - id: before-play
    goal: Start on one scene and keep it
    preconditions: [arrange mode, stopped]
    steps:
      - keys: shift + accidental
        note: the black key of the scene to keep
      - keys: play
        note: that scene plays, not the song's first one, and repeats
    result: The chosen scene plays over and over until stop.
    source: docs/research/90-device-probe.md#2026-09-28-night--songs-and-scenes-on-the-unit-owner-present-tes-agent-os-1133
    confidence: verified
    verified_on: '1.1.33'
  - id: for-good
    goal: Make play keep to the current scene
    preconditions: [arrange mode]
    steps:
      - keys: shift + accidental
        note: choose the scene to loop
      - keys: shift + arrange
        note: song mode
      - keys: shift + M1
        note: clear the song order; the scenes themselves stay
      - keys: arrange
        note: back to the patterns
      - keys: play
        note: the scene plays over and over
    result: Play loops the chosen scene; key the scenes back into song mode to have a song again.
    source: https://teenage.engineering/guides/op-xy/arrange#song-mode
    confidence: derived
related: [arrange.scenes, arrange.song-mode, arrange.scene-queue, howto.song-from-scenes]
---

The OP-XY treats play as "play the song": a new project's song holds scene 1, and a project with a
longer song walks through it from the top on every play. Picking a scene while it plays is the quick
way to stay somewhere, handy while jamming on one section. Clearing the song order keeps play on one
scene for good, until scenes are keyed back into song mode.
