---
id: howto.sidechain-duck
title: Recipe — make a track pump with the kick (duck)
aliases: [sidechain, sidechain pump, pumping bass, duck the bass, pump with the kick, ducking pad]
area: howto
order: 40
context:
  modes: [instrument]
  screens: [M4]
summary: On the track that should make room, such as a bass or a pad, pick the duck LFO on `M4`, set its source to the drum track and choose how deep and how long each dip is; the metronome as source pumps evenly with no drums at all.
status: current
firmware:
  min: '1.1.0'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: idea
    text: Duck lowers the level of the track it sits on whenever its source plays, so a bass or pad ducked by the drums dips on every hit and swells back between them.
    source: https://teenage.engineering/guides/op-xy/instrument#duck
  - id: pick
    text: Choosing duck works like choosing an engine — `shift + M4` opens the list of LFO types, `turn E1` highlights duck and `click E1` takes it.
    source: https://teenage.engineering/guides/op-xy/synth-engines#change-engine
    confidence: derived
  - id: drums
    text: In a new project the drum kit sits on track 1, so source 1 ducks on every hit of that track, hi-hats included; a kick alone on its own track gives the classic pump.
    source: docs/research/30-presets-samples.md#11-a-new-projects-sounds
    confidence: derived
  - id: metronome
    text: Turned past the tracks, the source becomes the metronome, and the track then dips on every beat whether or not anything plays.
    source: https://teenage.engineering/guides/op-xy/instrument#duck
  - id: depth
    text: Amount on `E2` sets how far the level drops; around 60–80 is a clear pump, lower values a gentle breathing.
    source: https://teenage.engineering/guides/op-xy/instrument#duck
    confidence: derived
  - id: time
    text: Hold on `E3` keeps the level down for a moment and release on `E4` sets how it recovers; keep both short for a tight pump on a fast beat, and lengthen the release for slow swells.
    source: https://teenage.engineering/guides/op-xy/instrument#duck
    confidence: derived
procedures:
  - id: set-up
    goal: Make the bass on T3 pump with the drums on T1
    preconditions: [instrument mode]
    steps:
      - keys: T3 → M4
        note: the track that should make room
      - keys: shift + M4
        note: the LFO types
      - keys: turn E1
        note: highlight duck
      - keys: click E1
        note: takes it; press `M4` if the page changed
        set: { param: lfo type, value: duck }
      - keys: turn E1
        note: source 1, the drum track
        set: { param: duck source, value: 1 }
      - keys: turn E2
        note: amount around 70
        set: { param: lfo amount, value: 70 }
      - keys: turn E3
        note: a short hold
        set: { param: duck hold, value: 10 }
      - keys: turn E4
        note: release around 40
        set: { param: duck release, value: 40 }
    result: With the drums and the bass playing, the bass dips on every drum hit.
    source: https://teenage.engineering/guides/op-xy/instrument#duck
    confidence: derived
related: [instrument.lfo-duck, instrument.lfo, howto.first-drum-beat, howto.first-bassline]
---

Pumping makes room: the bass or pad steps out of the kick's way, so both stay loud without
clashing, and the loop starts to breathe with the beat. The OP-XY does it with an LFO type rather
than a compressor, so it costs no effect slot and works on any instrument track. Duck the parts that
share the kick's low end, usually the bass and long pads, and leave the drums and short plucks
alone.
