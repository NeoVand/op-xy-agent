---
id: howto.first-bassline
title: Recipe — record a bassline live
aliases: [record bassline, record a take, lengthen pattern, record knob movement]
area: howto
order: 2
context:
  modes: [instrument]
summary: On bass track `T3`, arm recording with `record + play`, play the line in, lengthen the pattern with extra bars or a slower track scale, and record a knob move as automation.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: chromatic
    text: On a synth track such as `T3` the 24 keys play notes chromatically, and `[-]`/`[+]` move them an octave.
    source: https://teenage.engineering/guides/op-xy/get-started#4.2%20recording%20a%20baseline
  - id: armed
    text: '`record + play` arms the track; the first step key flashes red while it waits.'
    source: https://teenage.engineering/guides/op-xy/get-started#4.2%20recording%20a%20baseline
  - id: start
    text: Recording begins with the first note you play, or right away if you press `play` instead; `stop` ends it.
    source: https://teenage.engineering/guides/op-xy/get-started#4.2%20recording%20a%20baseline
  - id: bars
    text: A line longer than the pattern plays over itself; `bar + [+]` adds bars, up to four in all.
    source: https://teenage.engineering/guides/op-xy/get-started#4.2%20recording%20a%20baseline
  - id: scale
    text: For still more length, `bar + accidental` raises the track scale, which stretches every step.
    source: https://teenage.engineering/guides/op-xy/get-started#4.2%20recording%20a%20baseline
  - id: clear
    text: Holding `record` and `stop` until the step keys fill red empties the track so you can record again.
    source: https://teenage.engineering/guides/op-xy/get-started#4.2%20recording%20a%20baseline
  - id: automation
    text: During playback, holding `record` while turning an encoder records the movement; `bar + turn E4` smooths its steps.
    source: https://teenage.engineering/guides/op-xy/get-started#4.2%20recording%20a%20baseline
procedures:
  - id: record
    goal: Record a bassline over the beat
    steps:
      - keys: instrument → T3
      - keys: record + play
        note: armed — the first step flashes red
      - keys: keys
        note: the first note starts the take
      - keys: stop
    source: https://teenage.engineering/guides/op-xy/get-started#4.2%20recording%20a%20baseline
  - id: lengthen
    goal: Make room for a longer line
    steps:
      - keys: bar + [+]
        note: one more bar, up to four
      - keys: record + hold stop
        note: clears the track before recording the longer take
    source: https://teenage.engineering/guides/op-xy/get-started#4.2%20recording%20a%20baseline
  - id: automate
    goal: Record a knob move into the bassline
    preconditions: [the pattern is playing]
    steps:
      - keys: record + turn E1…E4
      - keys: bar + turn E4
        note: smooths the recorded steps
    source: https://teenage.engineering/guides/op-xy/get-started#4.2%20recording%20a%20baseline
related: [sequencer.live-recording, sequencer.parameter-locks, howto.first-chords]
---

Practise over the running beat first; once armed, the take starts on your first note. Recorded knob
moves are stored per step, like parameter locks, so they sound stepped until smoothed.
