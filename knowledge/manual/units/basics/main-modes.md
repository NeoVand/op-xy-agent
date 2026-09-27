---
id: basics.main-modes
title: Main modes
aliases: [modes, mode keys, instrument mode, auxiliary mode, arrange mode, mix mode, mixer]
area: basics
order: 10
summary: Four mode keys switch the whole unit between making sounds (instrument), the utility tracks (auxiliary), building the song (arrange) and balancing it (mix).
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: lifecycle
    text: Each main mode has its own key, and TE frames them as stages of a track's life — compose in `instrument`, transpose and process in `auxiliary`, assemble in `arrange`, balance in `mix`.
    source: https://teenage.engineering/guides/op-xy/main-modes
  - id: instrument
    text: In instrument mode `T1`…`T8` select and edit the eight instrument tracks, each running a synth engine or a sampler.
    source: https://teenage.engineering/guides/op-xy/instrument#project
  - id: auxiliary
    text: In auxiliary mode the same keys reach the eight auxiliary tracks, which transpose other tracks, play punch-in FX, handle external inputs and outputs and hold the send effects.
    source: https://teenage.engineering/guides/op-xy/main-modes#5.1%20main-modes
  - id: arrange
    text: Arrange groups the tracks' patterns into scenes and chains scenes into songs.
    source: https://teenage.engineering/guides/op-xy/main-modes#5.1%20main-modes
  - id: mix
    text: Mix sets each track's level and pan and holds the master EQ and compressor.
    source: https://teenage.engineering/guides/op-xy/main-modes#5.1%20main-modes
  - id: toggle-arrange
    text: In arrange, pressing `arrange` again swaps the track keys between instrument and auxiliary tracks.
    source: https://teenage.engineering/guides/op-xy/arrange#switching-tracks-and-patterns
  - id: toggle-mix
    text: In mix, pressing `mix` again swaps the track keys between instrument and auxiliary tracks.
    source: https://teenage.engineering/guides/op-xy/mix#levels-pans-and-sends
  - id: shift-instrument
    text: '`shift + instrument` opens the preset settings of the selected instrument track.'
    source: https://teenage.engineering/guides/op-xy/instrument#preset-settings
  - id: shift-arrange
    text: In arrange, `shift + arrange` opens song mode.
    source: https://teenage.engineering/guides/op-xy/arrange#song-mode
related: [basics.modules, basics.track-buttons, hardware.layout]
---

The track keys, module keys and encoders keep their jobs in every mode — pick a track, open a page,
turn a knob — but what they address changes with the mode.
