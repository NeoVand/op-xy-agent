---
id: sequencer.live-recording
title: Live recording
aliases: [live record, real-time recording, overdub, latch recording, count-in]
area: sequencer
order: 14
context:
  modes: [instrument, auxiliary]
summary: '`record + play` arms recording, which begins with your first note; during playback, hold `record` to overdub or press `record + play` to latch recording. `record + play → play` adds a count-in.'
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.0.38']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: arm
    text: '`record + play` arms live recording: the step 1 key flashes red while the sequencer waits.'
    source: https://teenage.engineering/guides/op-xy/sequencer#live-recording
  - id: first-note
    text: The first note you play starts playback and recording together.
    source: https://teenage.engineering/guides/op-xy/sequencer#live-recording
  - id: red-white
    text: Steps that receive notes turn red while recording and show white after `stop`.
    source: https://teenage.engineering/guides/op-xy/sequencer#live-recording
  - id: overdub
    text: While a pattern plays, holding `record` records into it until you let go.
    source: https://teenage.engineering/guides/op-xy/sequencer#live-recording
  - id: latch
    text: Pressing `record + play` during playback latches recording on without holding `record`.
    source: https://teenage.engineering/guides/op-xy/sequencer#live-recording
  - id: automation
    text: Encoder moves made while recording are stored per step, like parameter locks; `bar + turn E4` smooths them.
    source: https://teenage.engineering/guides/op-xy/sequencer#live-recording
  - id: count-in
    text: '`record + play → play` plays a count-in before recording starts.'
    source: https://teenage.engineering/guides/op-xy/sequencer#live-recording
    firmware_min: '1.0.38'
  - id: too-long
    text: A take longer than the pattern wraps round and plays over itself, so lengthen the pattern first.
    source: https://teenage.engineering/guides/op-xy/get-started#4.2%20recording%20a%20baseline
  - id: midi-in
    text: Notes arriving over MIDI while recording is armed land in the pattern too, according to community test tools.
    source: docs/research/20-midi-control.md#45-recording-into-the-op-xys-own-sequencer-over-midi-live
    confidence: community
procedures:
  - id: record
    goal: Record a part live
    steps:
      - keys: record + play
      - keys: keys
        note: recording starts with the first note
      - keys: stop
    source: https://teenage.engineering/guides/op-xy/sequencer#live-recording
  - id: overdub
    goal: Add notes to a playing pattern
    preconditions: [the pattern is playing]
    steps:
      - keys: record + keys
    source: https://teenage.engineering/guides/op-xy/sequencer#live-recording
  - id: count-in
    goal: Record with a count-in
    steps:
      - keys: record + play → play
    source: https://teenage.engineering/guides/op-xy/sequencer#live-recording
    firmware_min: '1.0.38'
related: [sequencer.bar-menu, sequencer.parameter-locks, sequencer.bars-and-length]
---

Arming means nothing runs until your first note, so a take starts exactly on the downbeat. Once a
pattern loops, holding `record` layers new notes on each pass. Live takes are pulled onto the grid by
the track's quantisation in the bar menu.
