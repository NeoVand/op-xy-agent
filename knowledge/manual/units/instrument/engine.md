---
id: instrument.engine
title: Engine page and changing engine (M1)
aliases:
  [
    engine page,
    engine list,
    change engine,
    choose engine,
    sound source,
    synth engines,
    load an engine
  ]
area: instrument
order: 10
context:
  modes: [instrument]
  screens: [M1, preset browser]
summary: "`M1` is the engine page: its encoders edit the loaded engine's own parameters. On OS 1.1.33 `shift + M1` brings up the preset browser by engine, and loading one of an engine's presets changes the engine — along with the whole sound. Twelve engines: eight synths, three samplers and midi."
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
    text: Twelve engines in all — the eight synths, the three samplers and midi.
    source: docs/research/20-midi-control.md#21-the-16-tracks-and-their-default-channels
    confidence: derived
  - id: midi-ccs
    text: Over MIDI, CC12–15 on the track's channel move the four `M1` parameters of every synth engine; the drum sampler, synth sampler and multisampler pages ignore them.
    source: docs/research/59-screen-profiling.md#3-midi-reach-on-1133-verified-on-screen
    confidence: verified
    verified_on: '1.1.33'
  - id: top-bar
    text: A synth engine page lists its four values in a top bar — coloured cells on prism, epiano and wavetable, plain text on simple and axis, none on organ — above a picture drawn from the four values; prism, dissolve and hardsync animate while notes sound, organ's drawbars glide to new values and wavetable's drift keeps its copies turning.
    source: docs/research/59-screen-profiling.md#21-general
    confidence: verified
    verified_on: '1.1.33'
  - id: browser
    text: On OS 1.1.33 there is no separate engine list; `shift + M1` brings up the preset browser on the track's current preset — the track number over the word preset at the left, the engines in the middle with the track's engine boxed, and that engine's presets on the right.
    source: docs/research/59-screen-profiling.md#26-preset-browser-shift--m1
    confidence: verified
    verified_on: '1.1.33'
  - id: browser-engines
    text: On a unit running OS 1.1.33 it listed eleven engines, alphabetically (axis, dissolve, drum, epiano, hardsync, multisampler, organ, prism, sampler, simple, wavetable) and no midi engine; how OS 1.1.33 puts an instrument track on midi is still open, and this app's replica lists midi last.
    source: docs/research/59-screen-profiling.md#26-preset-browser-shift--m1
    confidence: verified
    verified_on: '1.1.33'
  - id: load-changes-engine
    text: Turning `E1` to an engine highlights its first preset; loading a preset changes the engine with the whole sound (all four pages) and returns to the track's `M1` page.
    source: docs/research/59-screen-profiling.md#26-preset-browser-shift--m1
    confidence: verified
    verified_on: '1.1.33'
  - id: e1-click
    text: In the browser a click of `E1` swaps between by engine and by category (a popup says which) instead of confirming, as it did in the older engine list the guide describes.
    source: docs/research/59-screen-profiling.md#26-preset-browser-shift--m1
    confidence: verified
    verified_on: '1.1.33'
procedures:
  - id: choose
    goal: Change the engine of the selected instrument track
    preconditions: [instrument mode, the track is selected]
    steps:
      - keys: shift + M1
        note: the preset browser opens on the track's preset
      - keys: click E1
        note: only if it lists categories; a click swaps to by engine
      - keys: turn E1
        note: highlight an engine; its first preset is highlighted
      - keys: turn E2
        note: optional; another of its presets
      - keys: click E2
        note: loads it
    result: The track runs the new engine with that preset's sound, and `M1` shows the engine's parameters.
    source: docs/research/59-screen-profiling.md#26-preset-browser-shift--m1
    confidence: verified
    verified_on: '1.1.33'
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
silent and drives outside gear. Only `M1` belongs to the engine, but on OS 1.1.33 an engine arrives
with one of its presets, so a swap resets the envelopes, filter and LFO too: choose the engine first,
then shape the other pages. `shift + Tn` opens the same browser for any track.
