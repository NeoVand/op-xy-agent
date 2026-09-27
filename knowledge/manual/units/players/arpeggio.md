---
id: players.arpeggio
title: Arpeggio player
aliases: [arpeggio, arp, arpeggiator, arp speed, arp pattern, arp hold, latch]
area: players
order: 10
context:
  modes: [instrument, auxiliary]
  screens: [player]
summary: Plays held or sequenced notes one after another; the encoders set speed, note order, range and hold, and the shift layer adds note length, style, glide and stereo spread.
status: outdated-in-guide
firmware:
  min: '1.0.9'
  changed_in: ['1.0.15', '1.1.0', '1.1.17', '1.1.21']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: what
    text: The arpeggio player breaks the notes a track receives into a repeating run, playing them one at a time instead of together.
    source: https://teenage.engineering/guides/op-xy/players#arpeggio
  - id: style-vs-pattern
    text: The guide says that both pattern (`E2`) and the shift-layer style change the order of the notes, without explaining how the two differ.
    source: https://teenage.engineering/guides/op-xy/players#arpeggio
  - id: linked
    text: Notes made by the arpeggio are not passed on to linked tracks.
    source: https://teenage.engineering/downloads/op-xy#1.0.15
    firmware_min: '1.0.15'
  - id: muted
    text: Since OS 1.1.0, held arpeggio notes still sound when their track is muted.
    source: https://teenage.engineering/downloads/op-xy#1.1.0
    firmware_min: '1.1.0'
  - id: sustain
    text: Since OS 1.1.17, a sustain pedal has no effect on arpeggiated notes.
    source: https://teenage.engineering/downloads/op-xy#1.1.17
    firmware_min: '1.1.17'
  - id: brain
    text: Since OS 1.1.17, the brain transposes arpeggios along with the rest of the track.
    source: https://teenage.engineering/downloads/op-xy#1.1.17
    firmware_min: '1.1.17'
  - id: pattern-switch
    text: Since OS 1.1.21, moving to another pattern stops any arpeggio notes that were being held.
    source: https://teenage.engineering/downloads/op-xy#1.1.21
    firmware_min: '1.1.21'
procedures:
  - id: latch
    goal: Keep an arpeggio running without holding the keys
    preconditions: [the arpeggio player is on for the selected track]
    steps:
      - keys: turn E4
        note: switch hold on
      - keys: keys
        note: play the notes, then let go
    source: https://teenage.engineering/guides/op-xy/players#arpeggio
parameters:
  - screen: player
    encoder: E1
    layer: base
    name: speed
    note: rate of the run
    source: https://teenage.engineering/guides/op-xy/players#arpeggio
  - screen: player
    encoder: E2
    layer: base
    name: pattern
    note: random, play order, up, down, up/down or up/repeat/down
    source: https://teenage.engineering/guides/op-xy/players#arpeggio
  - screen: player
    encoder: E3
    layer: base
    name: range
    note: span of the run
    source: https://teenage.engineering/guides/op-xy/players#arpeggio
  - screen: player
    encoder: E4
    layer: base
    name: hold
    range: off / on
    note: keeps the run going after the keys are released
    source: https://teenage.engineering/guides/op-xy/players#arpeggio
  - screen: player
    encoder: E1
    layer: shift
    name: note length
    source: https://teenage.engineering/guides/op-xy/players#arpeggio
  - screen: player
    encoder: E2
    layer: shift
    name: style
    note: playback order of the notes
    source: https://teenage.engineering/guides/op-xy/players#arpeggio
  - screen: player
    encoder: E3
    layer: shift
    name: glide
    note: slide between notes
    source: https://teenage.engineering/guides/op-xy/players#arpeggio
  - screen: player
    encoder: E4
    layer: shift
    name: stereo
    note: pans successive notes apart
    source: https://teenage.engineering/guides/op-xy/players#arpeggio
related: [players.overview, players.hold, basics.linked-tracks]
---

The arpeggio steps through a chord, played live or sequenced, at the speed of `E1`, in the order of
`E2`, across the span of `E3`; hold (`E4`) keeps it going hands-free. The shift layer adds note
length, style, glide and stereo spread. Since the guide, arpeggios ignore the sustain pedal and
follow the brain (1.1.17), and a pattern change cuts held notes (1.1.21).
