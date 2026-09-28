---
id: auxiliary.punch-in-fx
title: Punch-in FX
aliases: [punch-in, punch in effects, performance effects]
area: auxiliary
order: 20
context:
  modes: [auxiliary, instrument]
summary: The punch-in FX track (`T2`) turns the keyboard into 24 momentary effects — lower octave for percussion tracks, upper for melodic ones; `shift + key` fires them from any instrument track.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.0.32', '1.0.50']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: keys
    text: On `T2` each of the 24 keys is a different effect that lasts while held; held keys combine.
    source: https://teenage.engineering/guides/op-xy/get-started#4.4.%20adding-punch-in-fx
  - id: octaves
    text: The lower octave acts on the percussion tracks, the upper octave on the melodic tracks.
    source: https://teenage.engineering/guides/op-xy/auxiliary#punch-in-fx
  - id: motion
    text: Some effects also respond to moving the unit (gyroscope) or to the pitchbend strip.
    source: https://teenage.engineering/guides/op-xy/auxiliary#punch-in-fx
  - id: shortcut
    text: On an instrument track, `shift + key` plays punch-in FX; the lower octave affects only that track, the upper octave its whole group.
    source: https://teenage.engineering/guides/op-xy/auxiliary#punch-in-fx
  - id: record
    text: Shortcut effects played while recording are written to the punch-in FX track.
    source: https://teenage.engineering/guides/op-xy/auxiliary#punch-in-fx
  - id: groups
    text: Percussive engines such as the drum sampler form the percussion group; synth engines and the synth sampler the melodic group.
    source: https://teenage.engineering/guides/op-xy/mix#master
  - id: mute-wins
    text: When effects conflict, the mute effect takes priority.
    source: https://teenage.engineering/downloads/op-xy#1.0.50
    firmware_min: '1.0.50'
  - id: midi-shortcut
    text: OS 1.0.32 stopped `shift + key` from triggering punch-in FX while external MIDI is in use.
    source: https://teenage.engineering/downloads/op-xy#1.0.32
    firmware_min: '1.0.32'
  - id: midi-notes
    text: Over MIDI, notes 53–76 on channel 10 fire the 24 effects as if the keys were held, with the track showing each animation; which effect each note is remains unpublished.
    source: docs/research/60-sound-session.md#6-punch-in-fx
    confidence: verified
    verified_on: '1.1.33'
  - id: animations
    text: On `T2` each of the 24 keys plays its own animation on the screen — planets, a digit clock, noise, hands, waves, sweeping lines and bars, and more.
    source: docs/research/59-screen-profiling.md#213-auxiliary-tracks
    confidence: verified
    verified_on: '1.1.33'
  - id: idle-heartbeat
    text: With no effect held, the page shows a single dot tracing a heartbeat line across the dot grid, about every three seconds; it starts again from the left edge each time an effect ends.
    source: docs/research/59-screen-profiling.md#213-auxiliary-tracks
    confidence: verified
    verified_on: '1.1.33'
procedures:
  - id: record-shortcut
    goal: Record punch-in FX from an instrument track
    preconditions: [instrument mode]
    steps:
      - keys: record + play
        note: start a live recording
      - keys: shift + keys
    source: https://teenage.engineering/guides/op-xy/auxiliary#punch-in-fx
related: [auxiliary.overview, howto.first-punch-in]
---

Punch-in FX are for performing: hold a key for a moment of change, let go and the track snaps back.
Recorded passes live on their own track, so they can be edited without touching the parts below.
