---
id: sequencer.parameter-locks
title: Parameter locks
aliases: [p-lock, p-locks, plock, parameter lock, locked parameter, step automation, per-step value]
area: sequencer
order: 30
context:
  modes: [instrument, auxiliary]
  screens: [M1, M2, M3, M4]
summary: Store a module-page value on individual steps; whenever such a step plays, the parameter jumps to the stored value.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.0.15', '1.1.0', '1.1.3', '1.1.21', '1.1.33']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: record
    text: To lock a value, keep a step held and turn an encoder; the step remembers the value you dial in.
    source: https://teenage.engineering/guides/op-xy/sequencer#step-sequencing
  - id: playback
    text: Each time the sequencer reaches a locked step, the parameter takes that step's stored value.
    source: https://teenage.engineering/guides/op-xy/sequencer#step-sequencing
  - id: scope
    text: Any parameter on the four module pages can carry locks; the settings of players cannot.
    source: https://teenage.engineering/guides/op-xy/sequencer#step-sequencing
  - id: stepped
    text: By default the value jumps at each locked step. The shape control in the bar menu (`bar + turn E4`) smooths the movement between locks.
    source: https://teenage.engineering/guides/op-xy/sequencer#extend-with-bar
  - id: live-automation
    text: Knob moves recorded live while holding `record` are also stored step by step, so they play back stepped until you add smoothing.
    source: https://teenage.engineering/guides/op-xy/sequencer#live-recording
  - id: copy
    text: Copying a step to an empty step brings its locks along with its notes and step components.
    source: https://teenage.engineering/guides/op-xy/sequencer#step-sequencing
  - id: clear-pattern
    text: '`bar + M2` removes every lock in the pattern and leaves the notes in place.'
    source: https://teenage.engineering/guides/op-xy/sequencer#extend-with-bar
  - id: clear-track
    text: Clearing the whole track with `record + hold stop` removes its locks too.
    source: https://teenage.engineering/downloads/op-xy#1.0.15
    firmware_min: '1.0.15'
  - id: skip-component
    text: The skip parameter lock step component (`natural 12`) lets a step's locks play only on every Nth pass, for automation that appears once every few repeats.
    source: https://teenage.engineering/guides/op-xy/step-components
  - id: samplers
    text: Tracks using the drum or synth sampler accept locks as well.
    source: https://teenage.engineering/downloads/op-xy#1.1.0
    firmware_min: '1.1.0'
  - id: duplicate-bar
    text: Duplicating a bar with `bar + shift + [+]` copies its locks and step components too.
    source: https://teenage.engineering/downloads/op-xy#1.1.3
    firmware_min: '1.1.3'
  - id: rotate
    text: Shifting a track's sequence with `Tn + [-]/[+]` moves the locks together with the notes.
    source: https://teenage.engineering/downloads/op-xy#1.1.21
    firmware_min: '1.1.21'
  - id: empty-steps
    text: A lock can sit on a step that has no note; before OS 1.1.33 a bug prevented adding one there.
    source: https://teenage.engineering/downloads/op-xy#1.1.33
    firmware_min: '1.1.33'
procedures:
  - id: add
    goal: Lock a parameter value on one step
    preconditions: [the track is selected, the module page with the parameter is on screen]
    steps:
      - keys: step n + turn E1…E4
        note: keep holding the step while turning; any page parameter works
    result: The step plays back with the new value from now on.
    source: https://teenage.engineering/guides/op-xy/sequencer#step-sequencing
  - id: record-live
    goal: Record knob movements into the pattern while it plays
    preconditions: [the pattern is playing]
    steps:
      - keys: record + turn E1…E4
    result: The movement is stored per step, like locks.
    source: https://teenage.engineering/guides/op-xy/sequencer#live-recording
  - id: smooth
    goal: Glide between locked values instead of jumping
    steps:
      - keys: bar + turn E4
    source: https://teenage.engineering/guides/op-xy/sequencer#extend-with-bar
  - id: clear
    goal: Remove all locks from the pattern but keep its notes
    steps:
      - keys: bar + M2
    source: https://teenage.engineering/guides/op-xy/sequencer#extend-with-bar
  - id: copy-step
    goal: Copy a step, locks included, to another step
    steps:
      - keys: hold step n → step m
        note: let go of the first step, then press the target step, which must be empty
    source: https://teenage.engineering/guides/op-xy/sequencer#step-sequencing
related: [sequencer.step-components, instrument.engine-prism]
---

A parameter lock pins one value of one parameter to one step. Hold a hi-hat step and open the
filter a little, hold the next one and close it, and the pattern gains movement without any
recording pass. Locks work on everything the module pages show — engine, envelopes, filter, LFO —
but not on player settings.

Locks and live-recorded knob moves share their storage and their smoothing: both change the value
in steps unless the bar menu's shape control (`bar + turn E4`) blends between them. To thin locks
out over time, pair them with the skip parameter lock step component.

Firmware history matters here: sampler tracks gained locks in 1.1.0, rotating a sequence has
carried its locks along since 1.1.21, and locks on empty steps work reliably from 1.1.33.
