---
id: sampler.sample-library
title: Sample library
aliases: [sample browser, browse samples, load a sample, sample preview]
area: sampler
order: 60
context:
  modes: [instrument]
  screens: [sample library]
summary: '`shift + sample` opens the library of every sample on the unit: pick a folder, hear each sample as you land on it, and click an encoder to load it into the sampler.'
status: outdated-in-guide
firmware:
  min: '1.0.9'
  changed_in: ['1.1.0', '1.1.15', '1.1.17']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: what
    text: The library holds every sample on the unit and loads any of them into any of the three samplers.
    source: https://teenage.engineering/guides/op-xy/sample#sample-folder
  - id: preview
    text: In the library a sample plays as soon as it is selected; `stop` ends the preview.
    source: https://teenage.engineering/guides/op-xy/sample#sample-folder
  - id: enter
    text: Clicking any encoder opens a subfolder or loads the selected sample; subfolder names are in square brackets.
    source: https://teenage.engineering/guides/op-xy/sample#sample-folder
  - id: new-folders
    text: New folders are made on a computer, inside the samples folder, in MTP mode.
    source: https://teenage.engineering/guides/op-xy/sample#sample-folder
  - id: key-controls
    text: For the drum sampler and multisampler, `M2` and `M3` step through filled keys and `M4` clears a key without deleting its file.
    source: https://teenage.engineering/guides/op-xy/sample#sample-folder
  - id: from-key
    text: Holding a keyboard key and pressing `sample` browses samples for that key.
    source: https://teenage.engineering/downloads/op-xy#1.1.0
    firmware_min: '1.1.0'
  - id: preset-samples
    text: Samples used by your own presets are gathered in one group.
    source: https://teenage.engineering/downloads/op-xy#1.1.15
    firmware_min: '1.1.15'
  - id: preview-setting
    text: A system setting controls the sample preview; the changelog does not say where it is.
    source: https://teenage.engineering/downloads/op-xy#1.1.17
    firmware_min: '1.1.17'
procedures:
  - id: load
    goal: Load a sample into the current sampler
    steps:
      - keys: shift + sample
      - keys: turn E1
        note: folder
      - keys: turn E2
        note: sample
      - keys: click E2
    source: https://teenage.engineering/guides/op-xy/sample#sample-folder
parameters:
  - screen: sample library
    encoder: E1
    layer: base
    name: folder
    source: https://teenage.engineering/guides/op-xy/sample#sample-folder
  - screen: sample library
    encoder: E2
    layer: base
    name: sample
    note: '`E3` and `E4` do the same'
    source: https://teenage.engineering/guides/op-xy/sample#sample-folder
related: [sampler.sample-files, sampler.drum-sampler]
---

The library is the shared pool behind all three samplers: your recordings, factory sounds and files
copied from a computer. Browsing auditions as you turn.
