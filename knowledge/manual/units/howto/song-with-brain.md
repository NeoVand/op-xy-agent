---
id: howto.song-with-brain
title: Recipe — sketch a song fast with the brain
aliases:
  [
    brain song,
    write a song fast,
    chord progression with brain,
    auto transpose,
    key detection,
    brain routing,
    keep a track out of the brain,
    set the key by hand
  ]
area: howto
order: 32
context:
  modes: [auxiliary]
  screens: [M1, M2, bar]
summary: Build a tiny loop — drums, a one- or two-note bassline, one chord — then record a progression on the brain's keyboard (`T1` in auxiliary mode) and the routed tracks transpose along; take a lead out of the routing on `M2`, and set the key by hand when detection gets it wrong.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: start-small
    text: Start in a new project with a drum beat, a bassline of one or two notes and one chord on a pad or pluck track, one or two bars long.
    source: https://teenage.engineering/guides/op-xy/how-to#write-a-song-fast-with-brain
  - id: open
    text: The brain is `T1` in auxiliary mode.
    source: https://teenage.engineering/guides/op-xy/how-to#write-a-song-fast-with-brain
  - id: scale-4
    text: '`bar + accidental 4` on the brain sets its track scale to 4, so its sequence runs four times slower and spans four bars.'
    source: https://teenage.engineering/guides/op-xy/how-to#write-a-song-fast-with-brain
  - id: detect
    text: The brain has already detected the key and scale of the recorded parts and shows them on screen.
    source: https://teenage.engineering/guides/op-xy/how-to#write-a-song-fast-with-brain
  - id: transpose
    text: Notes played on the brain's keyboard transpose the routed tracks, chords included, so the simple loop follows a progression.
    source: https://teenage.engineering/guides/op-xy/how-to#write-a-song-fast-with-brain
  - id: exclude
    text: "Parts that must not transpose, such as a lead, come out of the brain's routing on `M2`: turn an encoder to add or remove its track, click to swap between tracks 1–4 and 5–8."
    source: https://teenage.engineering/guides/op-xy/how-to#write-a-song-fast-with-brain
  - id: detection-input
    text: Only routed tracks feed the key detection.
    source: https://teenage.engineering/guides/op-xy/auxiliary#brain
  - id: lead-track
    text: In a new project the lead is `T5`, the dissolve preset lead/gaussian.
    source: docs/research/30-presets-samples.md#11-a-new-projects-sounds
    confidence: verified
    verified_on: '1.1.33'
  - id: routed-by-default
    text: A new project routes tracks 3–8 to the brain, the lead among them, and leaves the drum tracks 1 and 2 out.
    source: docs/research/10-xy-format.md#34-patternstruct-base-clones-walking
    confidence: community
  - id: routing-turns
    text: The routing page draws the tracks the brain hears as boxes 1–8; on the replica an encoder turned clockwise takes its track in and counter-clockwise takes it out, a direction the guide does not give.
    source: docs/research/59-screen-profiling.md#213-auxiliary-tracks
    confidence: derived
  - id: by-hand
    text: The brain's manual mode sits at the counter-clockwise end of `E1` (CC12 at 0 showed manual), and in manual `E2` sets the root and `E3` the scale.
    source: docs/research/59-screen-profiling.md#213-auxiliary-tracks
    confidence: verified
    verified_on: '1.1.33'
procedures:
  - id: progression
    goal: Turn a one-chord loop into a progression
    preconditions: [a short loop of drums, bass and one chord plays]
    steps:
      - keys: auxiliary → T1
        note: the brain
      - keys: bar + accidental 4
        note: four bars per brain sequence
        set: { param: track scale, value: 4, area: bar, track: 9 }
      - keys: record + play
      - keys: keys
        note: play the progression within the shown scale
    result: The bass and the chord follow the progression; drums stay where they are.
    source: https://teenage.engineering/guides/op-xy/how-to#write-a-song-fast-with-brain
  - id: exclude
    goal: Keep the lead on `T5` out of the brain's transposition
    steps:
      - keys: M2
        note: the brain's routing, tracks 1–4 on the encoders
      - keys: click E1
        note: tracks 5–8 on the encoders
      - keys: turn E1
        note: counter-clockwise, `T5` out
        set: { param: track 5, value: out, area: auxiliary, track: 9, page: 2 }
    result: The lead keeps its notes while everything routed moves.
    source: https://teenage.engineering/guides/op-xy/how-to#write-a-song-fast-with-brain
  - id: key-by-hand
    goal: Set the brain to A minor by hand
    steps:
      - keys: M1
      - keys: turn E1
        note: counter-clockwise, manual
        set: { param: mode, value: manual, area: auxiliary, track: 9 }
      - keys: turn E2
        note: root a
        set: { param: root, value: a, area: auxiliary, track: 9 }
      - keys: turn E3
        note: scale minor
        set: { param: scale, value: minor, area: auxiliary, track: 9 }
    result: The brain's page reads a minor, and the routed tracks' step components move in that scale.
    source: https://teenage.engineering/guides/op-xy/auxiliary#brain
related: [auxiliary.brain, sequencer.track-scale, howto.song-from-scenes, howto.first-chords]
---

The brain does the harmony work: write simple parts in one key, then let the brain move them as you
play. Take any part that should stay put, such as a lead, out of its routing, and give the brain a
key by hand when it guesses wrong on a sparse loop. The progression can also be written rather than
played: one note per chord change on the brain's own pattern, which at track scale 4 lasts four
times as long as the loop. Once it works, arrange it into a song with scenes.
