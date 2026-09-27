---
id: howto.first-chords
title: Recipe — add chords on steps
aliases: [add chords, sequence chords, chord progression, pad chords, hold chords]
area: howto
order: 3
context:
  modes: [instrument]
summary: On `T7`, slow the track scale so each step lasts a beat, enter chords by holding their notes and pressing a step, and stretch each chord across the steps it should ring.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: track
    text: '`T7` holds strings in a new project, a good home for sustained chords.'
    source: https://teenage.engineering/guides/op-xy/get-started#4.3%20adding-chords
  - id: plan
    text: Play along with the beat first and count on which beats the chords change and how long the part must be.
    source: https://teenage.engineering/guides/op-xy/get-started#4.3%20adding-chords
  - id: scale-4
    text: '`bar + accidental 4` sets the track scale to 4, so each step lasts four times as long and four steps make a bar.'
    source: https://teenage.engineering/guides/op-xy/get-started#4.3%20adding-chords
  - id: enter
    text: To enter a chord, hold its notes on the keyboard and press the step where it should start.
    source: https://teenage.engineering/guides/op-xy/get-started#4.3%20adding-chords
  - id: stretch
    text: Holding a chord's step and pressing a later step keeps the chord sounding until that step.
    source: https://teenage.engineering/guides/op-xy/get-started#4.3%20adding-chords
  - id: more-bars
    text: If the progression needs more room, `bar + [+]` adds a bar.
    source: https://teenage.engineering/guides/op-xy/get-started#4.3%20adding-chords
procedures:
  - id: chords
    goal: Sequence a chord progression
    steps:
      - keys: instrument → T7
      - keys: bar + accidental 4
        note: steps now blink four times slower
      - keys: keys + step n
        note: hold the chord, press its first step
      - keys: step n + step m
        note: hold that step, press where the chord should end
    result: The chord plays from its step until the chosen end, pattern after pattern.
    source: https://teenage.engineering/guides/op-xy/get-started#4.3%20adding-chords
related: [sequencer.step-entry, sequencer.extend-notes, howto.first-punch-in]
---

Chords are easier to place than to play in time. A track scale of 4 turns the sixteen steps into
four bars of quarter notes, so a whole progression fits on one page of step keys: hold the chord,
press its step, then stretch it to where the next chord begins. Repeat for each change.
