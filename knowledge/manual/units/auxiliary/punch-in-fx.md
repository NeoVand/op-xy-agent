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
    text: Over MIDI, notes 53–76 on channel 10 fire the 24 effects as if the keys were held, with the track showing each animation.
    source: docs/research/60-sound-session.md#6-punch-in-fx
    confidence: verified
    verified_on: '1.1.33'
  - id: effect-order
    text: Both octaves hold the same twelve effects in the same order, F to E — mute, stutter, repeat two steps, pan, repeat three steps, octave, follow, fill or ramp up, short, hat fill or ramp down, soft attack, random. Each takes a shape suited to the group it acts on. TE has not named them; these names are descriptive.
    source: docs/research/60-sound-session.md#6-punch-in-fx
    confidence: verified
    verified_on: '1.1.33'
  - id: mute-key
    text: F (either octave) silences its group for as long as it is held.
    source: docs/research/60-sound-session.md#6-punch-in-fx
    confidence: verified
    verified_on: '1.1.33'
  - id: stutter-key
    text: F♯ stutters in time with the project's sixteenths — melodic tracks jump back to the start of each sixteenth several times and drop out for its last part; drums let only the first few tens of milliseconds of each sixteenth through, in mono.
    source: docs/research/60-sound-session.md#6-punch-in-fx
    confidence: verified
    verified_on: '1.1.33'
  - id: repeat-keys
    text: A replays three sixteenths over and over, and G (on melodic tracks) two; the pattern keeps running underneath and carries on in place on release.
    source: docs/research/60-sound-session.md#6-punch-in-fx
    confidence: verified
    verified_on: '1.1.33'
  - id: repeat-drums
    text: G on the drums presumably loops two sixteenths as it does on melodic tracks; the recordings did not show it.
    source: docs/research/60-sound-session.md#6-punch-in-fx
    confidence: derived
  - id: pan-key
    text: G♯ moves the sound across the stereo field — each drum hit lands left or right by its place in the bar, and melodic tracks swing to one side.
    source: docs/research/60-sound-session.md#6-punch-in-fx
    confidence: verified
    verified_on: '1.1.33'
  - id: octave-key
    text: A♯ drops melodic tracks' sequenced notes an octave.
    source: docs/research/60-sound-session.md#6-punch-in-fx
    confidence: verified
    verified_on: '1.1.33'
  - id: octave-drums
    text: On the drums, A♯ presumably raises the sequenced hits an octave.
    source: docs/research/60-sound-session.md#6-punch-in-fx
    confidence: derived
  - id: follow-key
    text: B makes the other tracks of the group play the sequenced notes too, each with its own sound.
    source: docs/research/60-sound-session.md#6-punch-in-fx
    confidence: derived
  - id: fill-keys
    text: On the drums, C adds a kick and snare fill and D a hi-hat groove (closed on every sixteenth, open on the off-beat eighths), both on top of the pattern.
    source: docs/research/60-sound-session.md#6-punch-in-fx
    confidence: verified
    verified_on: '1.1.33'
  - id: ramp-up
    text: On melodic tracks, C makes each step's notes climb higher, gliding between them.
    source: docs/research/60-sound-session.md#6-punch-in-fx
    confidence: verified
    verified_on: '1.1.33'
  - id: ramp-down
    text: On melodic tracks, D makes each step's notes fall lower, gliding between them.
    source: docs/research/60-sound-session.md#6-punch-in-fx
    confidence: derived
  - id: short-key
    text: C♯ cuts every note or hit to a blip of about 25 ms.
    source: docs/research/60-sound-session.md#6-punch-in-fx
    confidence: verified
    verified_on: '1.1.33'
  - id: soft-key
    text: D♯ softens attacks — drum hits fade in and synth notes swell in.
    source: docs/research/60-sound-session.md#6-punch-in-fx
    confidence: verified
    verified_on: '1.1.33'
  - id: random-key
    text: E randomises — drum steps play random keys of the kit and melodic notes leap by random intervals.
    source: docs/research/60-sound-session.md#6-punch-in-fx
    confidence: derived
  - id: levels
    text: On the drums, the repeats, octave, follow and random rework the sequencer's own pattern and leave hits arriving over MIDI untouched, while mute, stutter, pan, short and soft change every hit and the fills add hits of their own.
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

From F to E, each octave runs: mute, stutter, repeat two steps, pan, repeat three steps, octave,
follow, a fill (drums) or rising ramp (melodic), short, a hi-hat groove (drums) or falling ramp
(melodic), soft attack and random. The rhythmic ones follow the project tempo.
