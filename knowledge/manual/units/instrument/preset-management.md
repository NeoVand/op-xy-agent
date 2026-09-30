---
id: instrument.preset-management
title: Organise presets (cut, paste, rename, delete, folders)
aliases: [move preset, rename preset, delete preset, preset folder, new folder, manage presets]
area: instrument
order: 75
context:
  modes: [instrument]
  screens: [preset browser]
summary: In the preset browser, `M1`–`M4` cut, paste, rename and delete user presets; `shift + M1`, `shift + M3` and `shift + M4` create, rename and delete folders. Folders and moving presets arrived in OS 1.1.15.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.1.15', '1.1.25']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: user-only
    text: The preset actions work on user presets; highlight one in the browser first.
    source: https://teenage.engineering/guides/op-xy/instrument#view-and-create-preset
  - id: cut-paste
    text: '`M1` cuts the highlighted preset and `M2` pastes it into the current folder, unless a preset of that name is already there — then nothing is overwritten.'
    source: https://teenage.engineering/guides/op-xy/instrument#view-and-create-preset
    firmware_min: '1.1.15'
  - id: rename
    text: '`M3` renames the preset. `E1` moves between characters and the other encoders change the one selected; then `M1` confirms, `M2` goes to the next character, `M3` cancels and `M4` deletes.'
    source: https://teenage.engineering/guides/op-xy/instrument#view-and-create-preset
  - id: delete
    text: '`M4` deletes the highlighted user preset.'
    source: https://teenage.engineering/guides/op-xy/instrument#view-and-create-preset
  - id: new-folder
    text: '`shift + M1` creates a preset folder.'
    source: https://teenage.engineering/guides/op-xy/instrument#view-and-create-preset
    firmware_min: '1.1.15'
  - id: edit-folder
    text: '`shift + M3` renames a preset folder and `shift + M4` deletes it, which only works once the folder is empty.'
    source: https://teenage.engineering/guides/op-xy/instrument#view-and-create-preset
  - id: since
    text: Adding preset folders and moving presets between them came with OS 1.1.15.
    source: https://teenage.engineering/downloads/op-xy#1.1.15
    firmware_min: '1.1.15'
  - id: name-clash
    text: OS 1.1.25 improved the behaviour when a user preset folder has the same name as factory presets.
    source: https://teenage.engineering/downloads/op-xy#1.1.25
    firmware_min: '1.1.25'
procedures:
  - id: move
    goal: Move a user preset into another folder
    preconditions: [the preset browser is open]
    steps:
      - keys: turn E2
        note: highlight the preset
      - keys: M1
        note: cut
      - keys: click E1
        note: the category view, whose entries are the folders (on OS 1.1.33 the browser opens by engine)
      - keys: turn E1
        note: go to the target folder; the guide does not say how nested folders are entered
      - keys: M2
        note: paste
    source: https://teenage.engineering/guides/op-xy/instrument#view-and-create-preset
    firmware_min: '1.1.15'
    confidence: derived
  - id: new-folder
    goal: Create a preset folder
    preconditions: [the preset browser is open]
    steps:
      - keys: shift + M1
    source: https://teenage.engineering/guides/op-xy/instrument#view-and-create-preset
    firmware_min: '1.1.15'
related: [instrument.preset-browser, instrument.save-copy-scramble]
---

User presets can be tidied without a computer: cut and paste move a preset between folders, rename
edits names with the encoders, and folders keep your own sounds apart from the factory library. The
actions apply to your own presets only.
