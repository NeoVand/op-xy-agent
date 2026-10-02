---
id: auxiliary.fx-sends
title: FX I and FX II send tracks
aliases: [send effects, fx tracks, reverb send, delay send]
area: auxiliary
order: 70
context:
  modes: [auxiliary]
summary: '`T7` and `T8` hold the two send effects: any sounding track can feed them, FX I can feed FX II (one way only), and `shift + T7` or `shift + T8` opens the effect list for a slot.'
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: what
    text: FX I and FX II are the two send effects; every track that makes sound can send to both, and FX I can send on into FX II.
    source: https://teenage.engineering/guides/op-xy/auxiliary#fx-i-and-fx-ii
  - id: audition
    text: On an FX track the keyboard plays the last selected instrument track, so you hear the effect on that sound.
    source: https://teenage.engineering/guides/op-xy/auxiliary#fx-i-and-fx-ii
  - id: choose
    text: '`shift + T7` or `shift + T8` opens the effect list for that slot: `turn E4` scrolls it, and `click E4` or `M1` loads the highlighted effect.'
    source: https://teenage.engineering/guides/op-xy/fx#fx
  - id: m1
    text: On an FX track, `M1` shows the loaded effect's parameters.
    source: https://teenage.engineering/guides/op-xy/auxiliary#fx-i-and-fx-ii
  - id: fx1-to-fx2
    text: On FX I, `shift + turn E4` on the `M3` page sets the send into FX II.
    source: https://teenage.engineering/guides/op-xy/auxiliary#fx-i-and-fx-ii
  - id: one-way
    text: The link between the slots runs one way, FX I into FX II; the guide describes no send from FX II back into FX I, so put the effect that should come first on FX I.
    source: https://teenage.engineering/guides/op-xy/auxiliary#fx-i-and-fx-ii
    confidence: derived
  - id: fx2-sends
    text: What FX II's own `M3` shift layer holds is not documented, and that page has not yet been looked at on a unit.
    source: docs/research/59-screen-profiling.md#213-auxiliary-tracks
    confidence: derived
  - id: track-sends
    text: Instrument tracks send from their send page (`shift` held on `M3`, `E3` for FX I, `E4` for FX II).
    source: https://teenage.engineering/guides/op-xy/instrument#filter
  - id: mix-sends
    text: In mix mode, `M1` sets each track's FX I send with `turn E1` and FX II send with `turn E2`.
    source: https://teenage.engineering/guides/op-xy/mix#levels-pans-and-sends
  - id: guide-slips
    text: The guide's FX routing card repeats a CV sentence and its filter card names the tape track — copy slips.
    source: https://teenage.engineering/guides/op-xy/auxiliary#fx-i-and-fx-ii
    confidence: derived
  - id: screen
    text: The FX I page is headed with a boxed FX I and the effect's name, then four columns with labels above and values below, each a bar split by a marker at the value's height.
    source: docs/research/59-screen-profiling.md#213-auxiliary-tracks
    confidence: verified
    verified_on: '1.1.33'
  - id: type-list
    text: On FX I, `shift + T7` lists the effects — chorus, delay, dist, lofi, phaser and reverb.
    source: docs/research/59-screen-profiling.md#213-auxiliary-tracks
    confidence: verified
    verified_on: '1.1.33'
  - id: midi
    text: Over MIDI, CC12–15 on channel 15 move the four columns of FX I.
    source: docs/research/59-screen-profiling.md#3-midi-reach-on-1133-verified-on-screen
    confidence: verified
    verified_on: '1.1.33'
related: [fx.overview, auxiliary.routing-filter-lfo, mix.levels-pans-sends]
---

One reverb on FX II can serve every track, each sending as much as it needs, and chaining FX I
into FX II lets a delay fade into reverb. The chain only runs that way round, so reverb into delay
means loading the reverb on FX I and the delay on FX II. The effects themselves are described in the
effects area.
