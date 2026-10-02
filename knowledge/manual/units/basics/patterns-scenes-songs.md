---
id: basics.patterns-scenes-songs
title: Patterns, scenes, songs and projects
aliases: [song structure, data model, how many patterns, pattern limit, scene limit, song limit]
area: basics
order: 50
summary: A project holds everything; each track has up to 16 patterns, a scene says which pattern every track plays, and a song is an ordered list of scenes. The guide's workflow chapter still gives older limits.
status: outdated-in-guide
firmware:
  min: '1.0.9'
  changed_in: ['1.1.15', '1.1.25']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: pattern
    text: A pattern is one track's sequence of notes or sounds and holds at most 120 notes.
    source: https://teenage.engineering/guides/op-xy/workflow#patterns-scenes-songs-and-projects
  - id: sixteen-patterns
    text: Each track holds up to 16 patterns (OS 1.1.15 raised it from nine, the number older TE texts still give).
    source: https://teenage.engineering/downloads/op-xy#1.1.15
    firmware_min: '1.1.15'
  - id: length
    text: A pattern has up to four bars; with track scale it can last up to 64 bars.
    source: https://teenage.engineering/guides/op-xy/sequencer#extend-with-bar
  - id: sound-per-pattern
    text: Each pattern can carry its own sound unless sound link (arrange) holds one sound for the track.
    source: https://teenage.engineering/guides/op-xy/arrange#sound-link
  - id: new-pattern-player
    text: A pattern added since OS 1.1.25 starts with the player type the track is using.
    source: https://teenage.engineering/downloads/op-xy#1.1.25
    firmware_min: '1.1.25'
  - id: scene
    text: A scene records which pattern each track plays, plus the track volumes and mutes, and lasts as long as its longest pattern; a project has 99 scenes.
    source: https://teenage.engineering/guides/op-xy/workflow#patterns-scenes-songs-and-projects
  - id: song
    text: A song plays up to 96 scenes in order; a project holds up to 14 songs, one per white key (older TE texts say nine).
    source: https://teenage.engineering/guides/op-xy/arrange#song-mode
  - id: project
    text: A project contains the tracks with their patterns, scenes and songs; the unit stores thousands of projects.
    source: https://teenage.engineering/guides/op-xy/workflow#patterns-scenes-songs-and-projects
related: [basics.workflow, project.settings, project.project-view]
---

Nested boxes: patterns per track, scenes that freeze a combination of patterns and mutes, songs
that play scenes in order, all inside one project.
