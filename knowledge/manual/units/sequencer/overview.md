---
id: sequencer.overview
title: Step sequencer overview
aliases: [sequencer, step sequencer, sequencing, step keys]
area: sequencer
order: 0
context:
  modes: [instrument, auxiliary]
summary: The 16 step keys program the selected track's pattern — up to four bars and 120 notes — by pressing steps, recording live or step recording; the bar menu, parameter locks and step components refine it.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.1.32']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: grid
    text: The row of 16 step keys is the step sequencer, the grid that stores the notes and sounds of every track.
    source: https://teenage.engineering/guides/op-xy/sequencer#sequencer
  - id: shows-track
    text: The step keys light up with the pattern of the selected track.
    source: https://teenage.engineering/guides/op-xy/arrange#switching-tracks-and-patterns
  - id: aux-too
    text: Auxiliary tracks such as punch-in FX are sequenced with the same techniques as instrument tracks.
    source: https://teenage.engineering/guides/op-xy/get-started#4.4.%20adding-punch-in-fx
  - id: bars
    text: A pattern can grow to four bars of 16 steps, 64 steps in all.
    source: https://teenage.engineering/guides/op-xy/sequencer#extend-with-bar
  - id: notes
    text: A pattern holds at most 120 notes.
    source: https://teenage.engineering/guides/op-xy/workflow#patterns-scenes-songs-and-projects
  - id: three-ways
    text: 'Notes get in three ways: pressing steps after choosing a note, recording live while the pattern plays, or step recording with playback stopped.'
    source: https://teenage.engineering/guides/op-xy/sequencer#live-recording
  - id: components
    text: Step components attach rules to single steps — repeats, ratchets, random notes, skips — without re-recording anything.
    source: https://teenage.engineering/guides/op-xy/step-components#step-components
  - id: stall-fix
    text: OS 1.1.32 fixed occasional sequencer stalls while browsing presets and samples.
    source: https://teenage.engineering/downloads/op-xy#1.1.32
    firmware_min: '1.1.32'
procedures:
  - id: show-track
    goal: Show a track's pattern on the step keys
    steps:
      - keys: instrument/auxiliary
      - keys: Tn
    source: https://teenage.engineering/guides/op-xy/layout#track-buttons
related:
  [
    sequencer.step-entry,
    sequencer.live-recording,
    sequencer.step-recording,
    sequencer.bar-menu,
    basics.patterns-scenes-songs
  ]
---

Every track keeps its own patterns. Choose the input that suits the part: press steps for drums and
exact lines, record live to keep your feel, or step record a melody without the sequencer running.
Then the bar menu sets length and timing for the whole pattern, parameter locks change the sound on
single steps, and step components change how single steps behave on each pass.
