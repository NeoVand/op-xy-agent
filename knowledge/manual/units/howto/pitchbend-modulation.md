---
id: howto.pitchbend-modulation
title: Recipe — use the pitchbend strip as a modulator
aliases:
  [pitchbend modulation, pitch bend target, bend to filter, expression strip, pitchbend amount]
area: howto
order: 27
context:
  modes: [instrument]
summary: In a track's preset settings, point the pitchbend at a synth parameter and set its amount (negative inverts), then turn the track's bend range off so the strip no longer bends pitch.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: idea
    text: The pitchbend strip can modulate a synth parameter of your choice instead of, or as well as, the pitch.
    source: https://teenage.engineering/guides/op-xy/how-to#pitch-bend
  - id: where
    text: The routing lives in the preset settings (`shift + instrument`), under mod — pitchbend target picks the parameter and pitchbend amount sets how far it moves.
    source: https://teenage.engineering/guides/op-xy/how-to#pitch-bend
  - id: negative
    text: A negative amount inverts the modulation.
    source: https://teenage.engineering/guides/op-xy/how-to#pitch-bend
  - id: pitch-off
    text: To stop the strip bending pitch, set the bend range on the `M2` shift layer (`shift + turn E3`) fully counter-clockwise, to off.
    source: https://teenage.engineering/guides/op-xy/how-to#pitch-bend
  - id: per-track
    text: The routing belongs to one instrument track, so each track can send the strip to a different parameter.
    source: https://teenage.engineering/guides/op-xy/how-to#pitch-bend
  - id: saved
    text: Saving the track as a preset stores the preset settings too, pitchbend routing included.
    source: https://teenage.engineering/guides/op-xy/how-to#pitch-bend
procedures:
  - id: route
    goal: Make the pitchbend strip move a synth parameter
    preconditions: [instrument mode, the track is selected]
    steps:
      - keys: shift + instrument
        note: preset settings
      - keys: turn E1
        note: mod
      - keys: turn E2 → turn E3
        note: pitchbend target, then the parameter
      - keys: turn E2 → turn E3
        note: pitchbend amount, then how much (below zero inverts)
    source: https://teenage.engineering/guides/op-xy/how-to#pitch-bend
  - id: no-pitch
    goal: Stop the strip from bending pitch
    steps:
      - keys: M2
        note: leaves the preset settings for the envelope page
      - keys: shift + turn E3
        note: bend range, fully counter-clockwise to off
    result: The strip now moves only the chosen parameter.
    source: https://teenage.engineering/guides/op-xy/how-to#pitch-bend
related: [instrument.preset-settings, instrument.play-mode, howto.midi-keyboard]
---

Routed to filter cutoff or an effect send, the strip becomes a pressure-sensitive performance
control. Switch the bend range off as well, or every push also bends the pitch.
