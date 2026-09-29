---
id: instrument.save-to-same-snapshot
title: Save over the same preset snapshot
aliases: [overwrite preset, save preset in place, resave preset, update snapshot]
area: instrument
order: 80
context:
  modes: [instrument]
summary: Since OS 1.1.17, holding shift while saving a track's sound overwrites the snapshot it was loaded from instead of adding a new one. TE's guide does not mention it.
status: changelog-only
firmware:
  min: '1.1.17'
  changed_in: ['1.1.18']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: plain-save
    text: The regular save, `Tn + M4` in instrument mode, stores the track's current sound as a preset.
    source: https://teenage.engineering/guides/op-xy/instrument#view-and-create-preset
  - id: new-by-default
    text: A regular save creates a new snapshot instead of replacing the one the sound came from.
    source: https://teenage.engineering/downloads/op-xy#1.1.17
    confidence: derived
  - id: hold-shift
    text: Keeping `shift` held while you save writes the sound back into the snapshot it came from.
    source: https://teenage.engineering/downloads/op-xy#1.1.17
  - id: key-order
    text: Press the keys in the right order. `shift + Tn` on its own opens the preset browser, where `M4` deletes the selected user preset — so hold the track key first, then add `shift`.
    source: https://teenage.engineering/guides/op-xy/instrument#view-and-create-preset
    confidence: derived
  - id: samples-bug
    text: On OS 1.1.17, saving into the same snapshot could lose the preset's samples; 1.1.18 fixed it, so use the feature on 1.1.18 or later.
    source: https://teenage.engineering/downloads/op-xy#1.1.18
    firmware_min: '1.1.18'
  - id: snapshot-folder
    text: Over MTP, the unit's storage shows a presets/snapshot folder next to the folders of user sound packs.
    source: docs/research/90-device-probe.md#2026-09-26--session-1-results-owner-present-scratch-project-os-1133
    verified_on: '1.1.33'
procedures:
  - id: save-in-place
    goal: Overwrite the loaded snapshot with the track's current sound
    preconditions: [instrument mode, the track's sound was loaded from a saved snapshot]
    steps:
      - keys: Tn + shift + M4
        note: hold the track key as for a normal save, add shift, then press `M4` — the changelog only says to hold shift, so this order is not yet confirmed on a unit
    result: The snapshot is updated in place; no new snapshot appears.
    source: https://teenage.engineering/downloads/op-xy#1.1.17
    confidence: derived
related: [instrument.engine-prism]
---

Every regular save of a track's sound adds another snapshot, which is safe but fills the preset
folders with near-copies while you refine a patch. OS 1.1.17 added the alternative: hold `shift`
while saving and the snapshot you are working on is updated instead.

The guide (v1.1.15) predates the feature, so the exact gesture comes from the changelog alone.
Mind the order of the keys: starting with `shift` and then the track key opens the preset browser,
where `M4` means delete. Update to 1.1.18 or later before relying on it, because the first release
of the feature could drop the preset's samples.
