---
id: instrument.engine
title: Engine page and engine list (M1)
aliases: [engine page, engine list, change engine, choose engine, sound source, synth engines]
area: instrument
order: 10
context:
  modes: [instrument]
  screens: [M1, engine list]
summary: "`M1` is the engine page: its encoders edit the loaded engine's own parameters. `shift + M1` opens the engine list — eight synths, three samplers and the midi engine — to swap the track's sound source."
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: m1-controls
    text: On `M1` the four encoders edit the loaded engine's own parameters, so what each one does depends on the engine.
    source: https://teenage.engineering/guides/op-xy/instrument#engine
  - id: synths
    text: There are eight synth engines — axis, dissolve, epiano, hardsync, organ, prism, simple and wavetable — each with its own character.
    source: https://teenage.engineering/guides/op-xy/synth-engines
  - id: samplers
    text: Three sampler engines play recorded audio — the synth sampler, the drum sampler and the multisampler.
    source: https://teenage.engineering/guides/op-xy/sample
  - id: midi
    text: The midi engine makes no sound of its own; it turns the track into a MIDI sequencer for external gear and uses `M2` and `M3` for CC controls.
    source: https://teenage.engineering/guides/op-xy/synth-engines#external
  - id: list
    text: The engine list holds all twelve — the eight synths, the three samplers and midi.
    source: docs/research/20-midi-control.md#21-the-16-tracks-and-their-default-channels
    confidence: derived
  - id: midi-ccs
    text: Over MIDI, CC12–15 on the track's channel reach the four `M1` encoders, whichever engine is loaded.
    source: docs/research/20-midi-control.md#34-engine-resolved-names-for-cc1215-p1p4
    confidence: community-verified
procedures:
  - id: choose
    goal: Change the engine of the selected instrument track
    preconditions: [instrument mode, the track is selected]
    steps:
      - keys: shift + M1
        note: the engine list opens
      - keys: turn E1
        note: highlight an engine
      - keys: click E1
        note: pressing `M1` also confirms
    result: M1 now shows the parameters of the new engine.
    source: https://teenage.engineering/guides/op-xy/synth-engines#change-engine
related:
  [
    instrument.overview,
    instrument.engine-axis,
    instrument.engine-dissolve,
    instrument.engine-epiano,
    instrument.engine-hardsync,
    instrument.engine-midi,
    instrument.engine-organ,
    instrument.engine-prism,
    instrument.engine-simple,
    instrument.engine-wavetable,
    instrument.preset-browser,
    sampler.overview,
    com.midi-track-ccs
  ]
---

Synth engines build tones from oscillators, samplers play recorded audio, and the midi engine stays
silent and drives outside gear. Only `M1` belongs to the engine, so after a swap the other pages work
as before (the midi engine excepted). To replace the whole sound with a finished patch, load a preset
with `shift + Tn` instead.
