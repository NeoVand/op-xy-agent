---
id: instrument.save-copy-scramble
title: Save, copy, paste and scramble a track's sound
aliases:
  [save preset, save sound, copy sound, paste sound, copy track sound, scramble, randomise sound]
area: instrument
order: 78
context:
  modes: [instrument]
summary: Hold a track key and press a module key — `Tn + M1` scrambles the sound, `Tn + M2` copies it, `Tn + M3` pastes onto that track and `Tn + M4` saves it as a new preset.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.0.38', '1.1.32']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: scramble
    text: "`Tn + M1` scrambles the track's sound, a quick way to wreck a patch or audition random variations."
    source: https://teenage.engineering/guides/op-xy/instrument#view-and-create-preset
  - id: copy-paste
    text: '`Tn + M2` copies the sound of the held track and `Tn + M3` pastes it onto the held track.'
    source: https://teenage.engineering/guides/op-xy/instrument#view-and-create-preset
  - id: save
    text: "`Tn + M4` saves the track's current sound as a preset."
    source: https://teenage.engineering/guides/op-xy/instrument#view-and-create-preset
  - id: snapshot-name
    text: Each save becomes a new dated preset in the snapshot folder, named like 2026-06-15 (1).
    source: docs/research/30-presets-samples.md#41-what-mtp-shows
    confidence: community-verified
  - id: samples-copied
    text: Saving copies the track's samples into the new preset, so it no longer depends on the original files.
    source: docs/research/30-presets-samples.md#42-how-a-project-points-at-a-preset-decoded-xy
    confidence: community-verified
  - id: octave
    text: A copied and pasted track takes its active octave along.
    source: https://teenage.engineering/downloads/op-xy#1.0.38
    firmware_min: '1.0.38'
  - id: paste-fix
    text: OS 1.1.32 fixed pasted tracks sometimes missing some of their settings.
    source: https://teenage.engineering/downloads/op-xy#1.1.32
    firmware_min: '1.1.32'
procedures:
  - id: save
    goal: Save the selected track's sound as a new preset
    steps:
      - keys: Tn + M4
    source: https://teenage.engineering/guides/op-xy/instrument#view-and-create-preset
  - id: copy
    goal: Duplicate one track's sound onto another track
    steps:
      - keys: Tn + M2
        note: hold the source track's key
      - keys: Tm + M3
        note: hold the destination track's key
    source: https://teenage.engineering/guides/op-xy/instrument#view-and-create-preset
related: [instrument.save-to-same-snapshot, instrument.preset-browser, instrument.preset-management]
---

These shortcuts act on a track's complete sound, preset settings included, without opening a menu.
Copy and paste duplicate a sound onto another track for layering or variations; scramble throws the
settings around for happy accidents, so save first if you may want the original back. A save never
overwrites: it adds a snapshot, unless you use the shift variant described in the related unit.
