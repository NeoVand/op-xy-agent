---
id: howto.song-with-brain
title: Recipe — sketch a song fast with the brain
aliases:
  [brain song, write a song fast, chord progression with brain, auto transpose, key detection]
area: howto
order: 32
context:
  modes: [auxiliary]
summary: Build a tiny loop — drums, a one- or two-note bassline, one chord — then record a progression on the brain's keyboard (`T1` in auxiliary mode) and the routed tracks transpose along.
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
procedures:
  - id: progression
    goal: Turn a one-chord loop into a progression
    preconditions: [a short loop of drums, bass and one chord plays]
    steps:
      - keys: auxiliary → T1
      - keys: bar + accidental 4
        note: four bars per brain sequence
      - keys: record + play
      - keys: keys
        note: play the progression within the shown scale
    source: https://teenage.engineering/guides/op-xy/how-to#write-a-song-fast-with-brain
  - id: exclude
    goal: Keep a track out of the brain's transposition
    steps:
      - keys: M2
      - keys: turn E1…E4
        note: remove the track (`click E1` swaps to tracks 5–8)
    source: https://teenage.engineering/guides/op-xy/how-to#write-a-song-fast-with-brain
related: [auxiliary.brain, howto.get-started, howto.first-chords]
---

The brain does the harmony work: write simple parts in one key, then let the brain move them as you
play. Take any part that should stay put, such as a lead, out of its routing.
