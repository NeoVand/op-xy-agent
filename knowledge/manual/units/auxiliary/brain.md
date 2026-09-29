---
id: auxiliary.brain
title: Brain
aliases: [brain track, key detection, auto transpose, chord changes]
area: auxiliary
order: 10
context:
  modes: [auxiliary]
  screens: [M1, M2]
summary: The brain (`T1`) works out the key and scale of the tracks routed into it, and its keyboard transposes them in key — live, or sequenced as notes on the brain track.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.0.25', '1.0.29', '1.1.17']
  guide_version: '1.1.15'
  verified_on: '1.1.33'
facts:
  - id: what
    text: The brain detects the key and scale of the routed tracks and transposes them musically — the whole song or only some tracks.
    source: https://teenage.engineering/guides/op-xy/auxiliary#brain
  - id: keyboard
    text: On the brain track, the keyboard transposes every routed track.
    source: https://teenage.engineering/guides/op-xy/auxiliary#brain
  - id: sequence
    text: Brain notes recorded into its sequence play back as transpositions, so a one-bar idea follows a chord progression.
    source: https://teenage.engineering/guides/op-xy/how-to#write-a-song-fast-with-brain
  - id: manual
    text: The brain's manual mode lets you set the key yourself when detection gets it wrong.
    source: https://teenage.engineering/guides/op-xy/auxiliary#brain
  - id: routing
    text: Tracks left out of the routing on `M2` are neither transposed nor used for key detection.
    source: https://teenage.engineering/guides/op-xy/auxiliary#brain
  - id: default-routing
    text: In a new project tracks 3–8 are routed to the brain and drum tracks 1 and 2 are not.
    source: docs/research/10-xy-format.md#34-patternstruct-base-clones-walking
    confidence: community
  - id: scales
    text: The brain has seven scales, shown in this order as major, dorian, phrygian, lydian, mixo (mixolydian), minor and locrian.
    source: docs/research/59-screen-profiling.md#213-auxiliary-tracks
    confidence: verified
    verified_on: '1.1.33'
  - id: per-pattern
    text: Brain settings are stored per pattern.
    source: https://teenage.engineering/downloads/op-xy#1.0.25
    firmware_min: '1.0.25'
  - id: routing-per-pattern
    text: The brain's routing is stored per pattern, not per scene.
    source: https://teenage.engineering/downloads/op-xy#1.0.28
    firmware_min: '1.0.29'
  - id: arp
    text: Arpeggiator notes follow the brain; OS 1.1.17 fixed arpeggios ignoring it.
    source: https://teenage.engineering/downloads/op-xy#1.1.17
    firmware_min: '1.1.17'
  - id: screen
    text: The brain's `M1` is headed with the current key, such as c major, and draws a mini keyboard marking the scale's notes. Manual mode shows a hand and the root and scale fields; auto mode shows a brain head instead.
    source: docs/research/59-screen-profiling.md#213-auxiliary-tracks
    confidence: verified
    verified_on: '1.1.33'
  - id: link-values
    text: Link reads a crossed box when off and a two-digit number otherwise; with CC15 at 32, 64, 96 and 127 it showed 02, 04, 06 and 08.
    source: docs/research/59-screen-profiling.md#213-auxiliary-tracks
    confidence: verified
    verified_on: '1.1.33'
  - id: routing-page
    text: '`M2` slides in from `M1` and shows an in bracket running from the brain to track boxes 1–8, each on or off.'
    source: docs/research/59-screen-profiling.md#213-auxiliary-tracks
    confidence: verified
    verified_on: '1.1.33'
  - id: no-filter
    text: The brain has no filter page; CC32 and CC35 on its channel change nothing.
    source: docs/research/59-screen-profiling.md#213-auxiliary-tracks
    confidence: verified
    verified_on: '1.1.33'
  - id: midi
    text: Over MIDI, CC12–15 on the brain's channel (9) drive its four `M1` encoders; CC12 shows manual at 0 and auto at 127.
    source: docs/research/59-screen-profiling.md#213-auxiliary-tracks
    confidence: verified
    verified_on: '1.1.33'
procedures:
  - id: route
    goal: Take a track into or out of the brain
    steps:
      - keys: auxiliary → T1
      - keys: M2
      - keys: turn E1…E4
        note: the track's encoder; an encoder click toggles the page, tracks 1–4 or 5–8
    source: https://teenage.engineering/guides/op-xy/auxiliary#brain
parameters:
  - screen: M1
    encoder: E1
    layer: base
    name: manual / auto
    cc: 12
    source: https://teenage.engineering/guides/op-xy/auxiliary#brain
  - screen: M1
    encoder: E2
    layer: base
    name: root
    range: 12 notes, c … b
    note: the guide calls it key
    cc: 13
    source: docs/research/59-screen-profiling.md#213-auxiliary-tracks
    confidence: verified
    verified_on: '1.1.33'
  - screen: M1
    encoder: E3
    layer: base
    name: scale
    range: major / dorian / phrygian / lydian / mixo / minor / locrian
    cc: 14
    source: docs/research/59-screen-profiling.md#213-auxiliary-tracks
    confidence: verified
    verified_on: '1.1.33'
  - screen: M1
    encoder: E4
    layer: base
    name: link
    note: links an instrument track, to riff over the song as it transposes
    cc: 15
    source: https://teenage.engineering/guides/op-xy/auxiliary#brain
related: [auxiliary.overview, auxiliary.routing-filter-lfo]
---

A fast way to write: sequence a beat, a bassline and one chord, then play or sequence root changes
on the brain track. Take leads and drums out of the routing when they should stay put.
