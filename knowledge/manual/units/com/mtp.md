---
id: com.mtp
title: MTP mode (file transfer)
aliases: [mtp, media transfer protocol, file transfer, usb drive, field kit, eject]
area: com
order: 60
context:
  screens: [mtp]
summary: "`com → M4` lets a connected computer browse the OP-XY's storage and copy projects, samples and presets; `M4` ejects. Macs need TE's field kit app, and USB MIDI is off while MTP runs."
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.0.32', '1.1.15']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: enter
    text: '`com → M4` switches on MTP, so a computer can read and write the projects, samples and presets on the unit.'
    source: https://teenage.engineering/guides/op-xy/com#mtp
  - id: needs-computer
    text: MTP is only offered while a computer is connected by USB, so plug in first.
    source: https://teenage.engineering/guides/op-xy/com#mtp
  - id: mac
    text: macOS cannot open MTP devices by itself, so Macs need TE's field kit app; Windows and Linux need nothing extra.
    source: https://teenage.engineering/guides/fieldkit
  - id: eject
    text: '`M4` on the MTP screen ejects the OP-XY from the computer.'
    source: https://teenage.engineering/guides/op-xy/com#mtp
  - id: m4-not-t4
    text: Instructions that say `T4` for MTP (TE's sound-pack page among them) follow the OP-1 field; on the OP-XY it is `M4`.
    source: https://teenage.engineering/guides/fieldkit
  - id: midi-gone
    text: In MTP mode the OP-XY shows up as a different USB device and its MIDI port disappears, so MIDI apps, this one included, lose the connection.
    source: docs/research/90-device-probe.md#2026-09-26--session-1-results-owner-present-scratch-project-os-1133
    verified_on: '1.1.33'
  - id: auto-exit
    text: When the computer closes its MTP session, the OP-XY leaves MTP mode by itself and its MIDI port returns.
    source: docs/research/90-device-probe.md#2026-09-26--session-1-results-owner-present-scratch-project-os-1133
    verified_on: '1.1.33'
  - id: layout
    text: 'On OS 1.1.33 the top level holds projects (user, templates and the open project as workspace.xy), samples (user), presets (snapshot and user sound packs) and how_to_import.txt.'
    source: docs/research/90-device-probe.md#2026-09-26--session-1-results-owner-present-scratch-project-os-1133
    verified_on: '1.1.33'
  - id: own-folders
    text: Each kind of file goes only in its own top folder (presets, projects, samples), and new folders can be made only inside those three; a copy that fails usually has a name the unit refuses or sits in the wrong folder.
    source: docs/research/30-presets-samples.md#41-what-mtp-shows
    verified_on: '1.1.33'
  - id: preset-files
    text: A copied drum or sampler preset is a folder whose name ends in .preset, its patch.json beside its samples; it can sit anywhere inside the presets folder, a folder of your own there included. A synth preset without samples can also be a single .json file.
    source: docs/research/30-presets-samples.md#41-what-mtp-shows
    verified_on: '1.1.33'
  - id: on-eject
    text: What you copy, rename or delete shows on the unit once the disk is ejected (`M4`).
    source: docs/research/30-presets-samples.md#41-what-mtp-shows
    verified_on: '1.1.33'
  - id: names
    text: The unit's own import note allows letters, digits, spaces, hashes, hyphens and round brackets in file and folder names, plus the extension's dot; keep to those even though OS 1.1.15 took UTF-8.
    source: docs/research/30-presets-samples.md#41-what-mtp-shows
    verified_on: '1.1.33'
  - id: samples-travel
    text: A project file does not carry its samples, so a project moved to another OP-XY needs its samples copied too.
    source: docs/research/30-presets-samples.md#41-what-mtp-shows
    verified_on: '1.1.33'
  - id: bug-1029
    text: OS 1.0.29 could corrupt files over 64 KB copied off the unit by MTP; 1.0.32 fixed it, and backups made under 1.0.29 may be damaged.
    source: https://teenage.engineering/downloads/op-xy#1.0.32
    firmware_min: '1.0.32'
  - id: utf8
    text: MTP accepts UTF-8 file and folder names since OS 1.1.15.
    source: https://teenage.engineering/downloads/op-xy#1.1.15
    firmware_min: '1.1.15'
procedures:
  - id: enter
    goal: Put the OP-XY in MTP mode
    preconditions: [a computer is connected by USB-C, field kit runs on a Mac]
    steps:
      - keys: com → M4
    result: The storage appears on the computer (inside field kit on a Mac).
    source: https://teenage.engineering/guides/op-xy/com#mtp
  - id: eject
    goal: Eject the OP-XY from the computer
    steps:
      - keys: M4
    source: https://teenage.engineering/guides/op-xy/com#mtp
related: [howto.back-up-projects, howto.load-samples, com.usb, sampler.sample-files]
---

MTP is a mode, not a background service: live MIDI and file transfer take turns. Eject with `M4`,
or let the computer close the session, before unplugging.
