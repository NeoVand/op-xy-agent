---
id: project.midi-channels
title: Track MIDI channels (project)
aliases:
  [midi channels, track channels, midi out channel, send notes over midi, sequence external gear]
area: project
order: 70
context:
  screens: [project]
summary: The midi page of the project settings gives each of the 16 tracks a MIDI channel, which it needs before its sequenced notes go out over MIDI.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: page
    text: The midi page of the project settings assigns a MIDI channel to each of the 16 tracks, for example to sequence external MIDI gear.
    source: https://teenage.engineering/guides/op-xy/project#project-settings
  - id: fresh-off
    text: In a fresh project every track's channel is off, according to decoded OS 1.1.4 project files.
    source: docs/research/20-midi-control.md#22-receive-routing-what-a-channel-reaches
    confidence: community
  - id: send
    text: A track sends its sequenced notes over MIDI only once it has a channel here and notes output is allowed in the MIDI settings.
    source: docs/research/20-midi-control.md#23-transmit-routing
    confidence: community
  - id: receive
    text: Incoming notes and CCs on channel N reach track N by default, channels 9–16 being the auxiliary tracks.
    source: docs/research/20-midi-control.md#21-the-16-tracks-and-their-default-channels
    confidence: community-verified
  - id: open-question
    text: Whether a channel set here also changes what the track receives is not known yet.
    source: docs/research/20-midi-control.md#22-receive-routing-what-a-channel-reaches
    confidence: speculative
procedures:
  - id: assign
    goal: Give a track a MIDI output channel
    steps:
      - keys: project → M4
      - keys: turn E1
        note: midi page
      - keys: turn E2
        note: the track
      - keys: turn E3
        note: the channel
    source: https://teenage.engineering/guides/op-xy/project#project-settings
related: [project.settings, com.midi-settings]
---

These channels are per project. The unit-wide MIDI switches — clock, notes and other messages in
and out — live in the system settings, and both have to allow a message before it leaves.
