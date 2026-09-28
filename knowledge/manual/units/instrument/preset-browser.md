---
id: instrument.preset-browser
title: Preset browser (find and load sounds)
aliases: [presets, preset list, load preset, browse presets, sound browser, patches, categories]
area: instrument
order: 70
context:
  modes: [instrument]
  screens: [preset browser]
summary: "`shift + Tn` in instrument mode opens that track's preset browser (on OS 1.1.33 `shift + M1` opens it for the selected track). Browse by engine or by category — a click of `E1` swaps them — and load a preset with a click of `E2`."
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.1.15']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: open
    text: In instrument mode, `shift + Tn` opens the preset browser for track n.
    source: https://teenage.engineering/guides/op-xy/instrument#view-and-create-preset
  - id: factory
    text: The unit ships with factory presets across the engines and the sound categories.
    source: https://teenage.engineering/guides/op-xy/instrument#view-and-create-preset
  - id: whole-sound
    text: Loading a preset replaces the track's whole sound and copies it into the project, so later changes to the preset file leave existing tracks alone.
    source: docs/research/30-presets-samples.md#42-how-a-project-points-at-a-preset-decoded-xy
    confidence: community-verified
  - id: categories
    text: On OS 1.1.33 the category view lists bass, drum, keys, lead, organ, pad, pluck and strings, after any preset pack of the owner's (the owner's Nostalgic Synths came first).
    source: docs/research/59-screen-profiling.md#26-preset-browser-shift--m1
    confidence: verified
    verified_on: '1.1.33'
  - id: folders
    text: Top-level folders under presets on the unit's storage show up as categories.
    source: docs/research/30-presets-samples.md#41-what-mtp-shows
    confidence: community-verified
  - id: deeper-folders
    text: Since OS 1.1.15, user preset folders can be nested more deeply.
    source: https://teenage.engineering/downloads/op-xy#1.1.15
    firmware_min: '1.1.15'
  - id: screen
    text: The browser shows the track number over the word preset on the left, the engine list in the middle and that engine's presets on the right, the current preset highlighted.
    source: docs/research/59-screen-profiling.md#26-preset-browser-shift--m1
    confidence: verified
    verified_on: '1.1.33'
  - id: views
    text: A click of `E1` swaps between by engine and by category, and a popup names the view for a moment; the highlighted preset stays highlighted in the other view.
    source: docs/research/59-screen-profiling.md#26-preset-browser-shift--m1
    confidence: verified
    verified_on: '1.1.33'
  - id: sorting
    text: Presets sort by name, factory and user ones together; moving to another engine or category starts its list from the top with the first preset highlighted, and a list scrolls only as far as the highlight needs.
    source: docs/research/59-screen-profiling.md#26-preset-browser-shift--m1
    confidence: verified
    verified_on: '1.1.33'
  - id: footer
    text: With one of your own presets highlighted the footer reads cut, paste, rename and delete over `M1`…`M4`; a factory preset shows none.
    source: docs/research/59-screen-profiling.md#26-preset-browser-shift--m1
    confidence: verified
    verified_on: '1.1.33'
  - id: loads-to-m1
    text: Loading leaves the browser for the track's `M1` page, showing the new sound's engine values.
    source: docs/research/59-screen-profiling.md#26-preset-browser-shift--m1
    confidence: verified
    verified_on: '1.1.33'
  - id: shift-m1
    text: On OS 1.1.33, `shift + M1` brings up this browser for the selected track, opening on its current preset in engine view; it is how that firmware changes engine.
    source: docs/research/59-screen-profiling.md#26-preset-browser-shift--m1
    confidence: verified
    verified_on: '1.1.33'
procedures:
  - id: load
    goal: Load a preset on a track
    preconditions: [instrument mode]
    steps:
      - keys: shift + Tn
        note: the track to change
      - keys: click E1
        note: optional; swaps between engine and category view
      - keys: turn E1
        note: choose a category or engine
      - keys: turn E2
        note: choose a preset
      - keys: click E2
        note: load it
    result: The track plays the preset; all four pages and the preset settings change with it.
    source: https://teenage.engineering/guides/op-xy/instrument#view-and-create-preset
parameters:
  - screen: preset browser
    encoder: E1
    layer: base
    name: category / engine
    source: https://teenage.engineering/guides/op-xy/instrument#view-and-create-preset
  - screen: preset browser
    encoder: E1
    layer: click
    name: view
    range: category / engine
    source: https://teenage.engineering/guides/op-xy/instrument#view-and-create-preset
  - screen: preset browser
    encoder: E2
    layer: base
    name: preset
    note: '`E3` and `E4` scroll too'
    source: https://teenage.engineering/guides/op-xy/instrument#view-and-create-preset
  - screen: preset browser
    encoder: E2
    layer: click
    name: load
    note: clicking `E3` or `E4` also loads
    source: https://teenage.engineering/guides/op-xy/instrument#view-and-create-preset
related:
  [
    instrument.preset-management,
    instrument.save-copy-scramble,
    instrument.save-to-same-snapshot,
    com.mtp
  ]
---

The browser changes a track's whole sound in one step. Category view groups sounds by role; engine
view lists everything built on one engine, handy when you know the character you want. Your own
presets and folders sit beside the factory ones and are managed from the same screen.
