---
id: mix.mute-solo
title: Mute and solo
aliases: [mute, unmute, solo, mute track, solo track, mute shortcut]
area: mix
order: 20
context:
  modes: [mix]
  screens: [M1]
summary: In mix mode, shift + a track key mutes or unmutes that track and holding track keys solos them; instrument or auxiliary + a track key is a quick mute, and CC9 mutes over MIDI.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: shift-mute
    text: In mix mode, `shift + Tn` mutes that track, or unmutes it if it is muted.
    source: https://teenage.engineering/guides/op-xy/mix#levels-pans-and-sends
  - id: leds
    text: While `shift` is held in mix mode, unmuted tracks light up (white for instrument, red for auxiliary) and muted tracks stay dark.
    source: https://teenage.engineering/guides/op-xy/mix#levels-pans-and-sends
  - id: notes-not-audio
    text: A mute acts on a track's notes, not on its audio; no new notes start, while sound that is already playing rings out.
    source: https://teenage.engineering/guides/op-xy/mix#levels-pans-and-sends
  - id: click
    text: On the mix `M1` page, `click E4` mutes the selected track.
    source: https://teenage.engineering/guides/op-xy/mix#levels-pans-and-sends
  - id: solo
    text: Holding one track key, or several at once, in mix mode solos those tracks.
    source: https://teenage.engineering/guides/op-xy/mix#levels-pans-and-sends
  - id: shortcut
    text: Holding `instrument` and pressing a track key mutes or unmutes that instrument track; `auxiliary` does the same for the auxiliary tracks.
    source: https://teenage.engineering/guides/op-xy/mix#levels-pans-and-sends
  - id: midi
    text: Over MIDI, CC9 on a track's channel sets its mute as a level rather than a toggle — 0 unmutes, any value from 1 to 127 mutes.
    source: docs/research/90-device-probe.md#2026-09-26--session-1-results-owner-present-scratch-project-os-1133
    verified_on: '1.1.33'
procedures:
  - id: mute
    goal: Mute or unmute a track
    preconditions: [mix mode]
    steps:
      - keys: shift + Tn
    source: https://teenage.engineering/guides/op-xy/mix#levels-pans-and-sends
  - id: solo
    goal: Solo one or more tracks
    preconditions: [mix mode]
    steps:
      - keys: hold Tn
        note: hold more track keys at the same time to solo several
    source: https://teenage.engineering/guides/op-xy/mix#levels-pans-and-sends
  - id: quick-mute
    goal: Mute a track with the mode-key shortcut
    steps:
      - keys: instrument/auxiliary + Tn
        note: the guide lists this under mix mode; whether it works in other modes is not confirmed
    source: https://teenage.engineering/guides/op-xy/mix#levels-pans-and-sends
related: [mix.levels-pans-sends, mix.overview, arrange.overview]
---

`shift` shows the mute state on the track keys and toggles it; holding track keys solos them; and
`instrument` or `auxiliary` double as mute modifiers for their own group. A click on `E4` mutes the
selected track in arrange mode too. Mutes stop notes rather than cutting audio, so tails finish
naturally.
