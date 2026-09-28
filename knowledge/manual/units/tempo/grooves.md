---
id: tempo.grooves
title: Grooves, swing and shuffle
aliases:
  [
    groove,
    swing,
    shuffle,
    groove type,
    groove amount,
    humanize,
    feel,
    half shuffle,
    bombora,
    gaussian,
    island nod,
    danish,
    disfunk,
    roll over,
    prophetic
  ]
area: tempo
order: 10
context:
  screens: [tempo, bar]
summary: A groove shifts the timing and velocity of sequenced notes to change the feel. Pick one of eleven types with E2 on the tempo screen and dial swing or shuffle with E3; the bar menu can override the amount per track.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: what
    text: A groove changes the feel of the sequencer by moving the timing of notes and changing their velocity.
    source: https://teenage.engineering/guides/op-xy/tempo#what-are-grooves
  - id: human
    text: Grooves also vary timing and velocity slightly at random, so the swing sounds less mechanical.
    source: https://teenage.engineering/guides/op-xy/tempo#what-are-grooves
  - id: amount
    text: On the tempo screen, `turn E3` clockwise past the centre for swing or anticlockwise for shuffle; the two push notes in opposite directions.
    source: https://teenage.engineering/guides/op-xy/tempo#edit-tempo
  - id: types
    text: '`turn E2` on the tempo screen picks the groove type, in this order: shuffle, half shuffle, danish, bombora, wobbly, gaussian, accents, island nod, disfunk, roll over and prophetic.'
    source: docs/research/40-official-docs.md#52-older-gaps-and-contradictions-true-even-for-1115
    confidence: community-verified
  - id: plain-types
    text: Shuffle is the everyday swing and half shuffle a lighter version of it; accents emphasises the important beats.
    source: https://teenage.engineering/guides/op-xy/tempo#what-are-grooves
  - id: wild-types
    text: Bombora breaks up the beats on 2 and 4, and wobbly deliberately loosens the timing for a funkier, messier feel.
    source: https://teenage.engineering/guides/op-xy/tempo#what-are-grooves
  - id: joke-types
    text: TE describes gaussian and island nod only in jokes, so judge them by ear.
    source: https://teenage.engineering/guides/op-xy/tempo#what-are-grooves
  - id: extra-types
    text: The online guide leaves out four types. Danish relaxes the beat, disfunk turns funky one way and groovy the other, and roll over gives a slow, lazy hip-hop feel. TE gives prophetic no description at all.
    source: docs/research/40-official-docs.md#52-older-gaps-and-contradictions-true-even-for-1115
    confidence: official
  - id: per-track
    text: "`bar + turn E3` sets a groove amount for the current track that replaces the tempo screen's swing value; the groove type still comes from the tempo screen."
    source: https://teenage.engineering/guides/op-xy/sequencer#extend-with-bar
  - id: cc81
    text: Over MIDI, CC81 on any channel sets the groove; community tables treat 63 as no groove.
    source: docs/research/20-midi-control.md#31-global-ccs
    confidence: community
procedures:
  - id: swing
    goal: Add swing to the whole project
    steps:
      - keys: tempo
      - keys: turn E2
        note: choose the groove type
      - keys: turn E3
        note: clockwise past the centre for swing, anticlockwise for shuffle
    source: https://teenage.engineering/guides/op-xy/tempo#edit-tempo
related: [tempo.tempo-screen, project.settings]
---

Start with shuffle and a little swing, then try the other types on the same pattern; give a single
track its own amount in the bar menu.
