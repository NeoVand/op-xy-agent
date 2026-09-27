---
id: instrument.preset-browser
title: Preset browser (find and load sounds)
aliases: [presets, preset list, load preset, browse presets, sound browser, patches, categories]
area: instrument
order: 70
context:
  modes: [instrument]
  screens: [preset browser]
summary: "`shift + Tn` in instrument mode opens that track's preset browser. Browse by category or by engine and load a preset with an encoder click; factory presets exist for every engine."
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
    text: The unit ships with presets for every engine and every sound category.
    source: https://teenage.engineering/guides/op-xy/instrument#view-and-create-preset
  - id: whole-sound
    text: Loading a preset replaces the track's whole sound and copies it into the project, so later changes to the preset file leave existing tracks alone.
    source: docs/research/30-presets-samples.md#42-how-a-project-points-at-a-preset-decoded-xy
    confidence: community-verified
  - id: categories
    text: Factory categories include bass, drum, keys, lead, organ, pad, pluck and strings, plus fx, wind and bells; top-level folders under presets on the unit's storage show up as categories.
    source: docs/research/30-presets-samples.md#41-what-mtp-shows
    confidence: community-verified
  - id: deeper-folders
    text: Since OS 1.1.15, user preset folders can be nested more deeply.
    source: https://teenage.engineering/downloads/op-xy#1.1.15
    firmware_min: '1.1.15'
procedures:
  - id: load
    goal: Load a preset on a track
    preconditions: [instrument mode]
    steps:
      - keys: shift + Tn
        note: the track to change
      - keys: click E1
        note: optional; switches between category and engine view
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
