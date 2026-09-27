---
id: basics.linked-tracks
title: Linking tracks
aliases: [link tracks, linked tracks, track link, layer sounds, stack tracks, primary track]
area: basics
order: 40
summary: Hold one track key and press up to three others to link them; whatever you play on the held (primary) track then drives every linked track, which is how you layer sounds.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.0.15', '1.1.15']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: how
    text: To link tracks, keep one track key held and press the keys of the tracks to join it; four tracks at most can be linked.
    source: https://teenage.engineering/guides/op-xy/track-buttons#6.2%20linking-tracks
  - id: primary
    text: The track whose key you held becomes the primary track, and playing or sequencing it controls all linked tracks.
    source: https://teenage.engineering/guides/op-xy/track-buttons#6.2%20linking-tracks
  - id: separate
    text: A linked track still plays on its own when you select it directly rather than the primary track.
    source: https://teenage.engineering/guides/op-xy/track-buttons#6.2%20linking-tracks
  - id: pitchbend
    text: Pitchbend from the primary track reaches the linked tracks.
    source: https://teenage.engineering/downloads/op-xy#1.0.15
    firmware_min: '1.0.15'
  - id: no-arp
    text: Arpeggiator notes are not passed on to linked tracks.
    source: https://teenage.engineering/downloads/op-xy#1.0.15
    firmware_min: '1.0.15'
  - id: octave
    text: OS 1.1.15 reworked how octave offsets behave on linked tracks; the changelog gives no details.
    source: https://teenage.engineering/downloads/op-xy#1.1.15
    firmware_min: '1.1.15'
  - id: unlink
    text: The guide does not describe how to undo a link.
    source: https://teenage.engineering/guides/op-xy/track-buttons#6.2%20linking-tracks
    confidence: derived
  - id: not-sound-link
    text: Linking tracks is unrelated to sound link in arrange, which keeps one sound across a track's patterns.
    source: https://teenage.engineering/guides/op-xy/arrange#sound-link
procedures:
  - id: link
    goal: Link tracks so that one track plays several
    steps:
      - keys: Tn + Tm
        note: keep the first key held and press up to three more track keys
    result: The held track is the primary; playing it also plays the linked tracks.
    source: https://teenage.engineering/guides/op-xy/track-buttons#6.2%20linking-tracks
related: [basics.track-buttons]
---

Linking is the layering tool: hold `T3` and press `T4`, and a bass line played on track 3 also
sounds through track 4's synth, each track keeping its own sound and settings.
