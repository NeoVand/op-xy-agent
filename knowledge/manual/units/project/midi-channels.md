---
id: project.midi-channels
title: Track MIDI channels (project)
aliases:
  [
    midi channels,
    track channels,
    midi out channel,
    send notes over midi,
    sequence external gear,
    project midi channel
  ]
area: project
order: 70
context:
  screens: [project]
summary: The midi page of the project settings gives each of the 16 tracks a MIDI channel. Community tools say it lets a track on one of the OP-XY's own engines send its sequenced notes out; the external MIDI track and midi-engine tracks send on the channel set on their own `M1` page.
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
  - id: midi-tracks
    text: The external MIDI track and instrument tracks on the midi engine send on the channel chosen with `E1` on their own `M1` page; TE's MIDI how-to sets only that channel and never visits this page.
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-control-a-synth-with-midi
  - id: midi-tracks-community
    text: Community tools say the external MIDI track and midi-engine tracks send their notes without a channel here; not yet checked on a unit.
    source: docs/research/20-midi-control.md#81-normal-operation
    confidence: community
  - id: send
    text: Community tools report that a track on one of the OP-XY's own engines sends its sequenced notes over MIDI only once it has a channel here and notes output is allowed in the MIDI settings.
    source: docs/research/20-midi-control.md#23-transmit-routing
    confidence: community
  - id: keeps-sound
    text: Community tools report that a track given a channel here keeps playing through its own engine while its notes also go out.
    source: https://github.com/jshph/opxy-reactive/blob/master/DESIGN.md
    confidence: community
  - id: both-set
    text: The guide does not say what happens when a midi-engine or external MIDI track also has a channel here — which channel wins, or whether its notes go out twice.
    source: https://teenage.engineering/guides/op-xy/project#project-settings
  - id: live-notes
    text: The guide speaks only of sequencing gear from this page; whether notes played live on the keyboard also go out on the channel is not documented.
    source: https://teenage.engineering/guides/op-xy/project#project-settings
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
    goal: Give a track a MIDI channel in the project
    steps:
      - keys: project → M4
      - keys: turn E1
        note: midi page
      - keys: turn E2
        note: the track
      - keys: turn E3
        note: the channel
    source: https://teenage.engineering/guides/op-xy/project#project-settings
related:
  [
    project.settings,
    com.midi-settings,
    auxiliary.external-midi,
    instrument.engine-midi,
    howto.control-synth-midi
  ]
---

Two kinds of channel can be in play. The external MIDI track (`T3` in auxiliary mode) and
midi-engine tracks carry their own channel on `M1`: that is the one the outside synth must listen
on, and TE's steps set nothing on this page. This page serves the other tracks: by community
accounts it makes a track on one of the OP-XY's own engines send its sequenced notes as well, while
it keeps sounding. These channels are per project; the unit-wide notes switch in `com → M1` must
also allow sending, which it does on a stock unit.
