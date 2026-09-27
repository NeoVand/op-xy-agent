---
id: howto.load-samples
title: Recipe — load samples from a computer
aliases: [load samples, import samples, add samples, transfer samples, sample pack, sound pack]
area: howto
order: 31
summary: In MTP mode, drag WAV or AIFF files into samples → user or into your own folders inside samples, keep file names simple, then eject with `M4`; the samples appear in the sample library.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: room
    text: The internal 8 GB drive has room for thousands of samples.
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-load-samples
  - id: mtp
    text: Connect the unit to the computer, then `com → M4` opens MTP; a Mac needs field kit to see the drive.
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-load-samples
  - id: user
    text: samples → user is where the OP-XY saves the samples you record on it, and files dragged there show up in the library.
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-load-samples
  - id: folders
    text: Folders you create inside samples appear on the unit with their names in square brackets.
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-load-samples
  - id: formats
    text: The OP-XY reads WAV and AIFF files only.
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-load-samples
  - id: names
    text: 'Stick to letters, digits, spaces, hyphens and # in file names; rename anything else before copying.'
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-load-samples
  - id: eject
    text: When the copy is done, press `M4` to eject, then unplug the cable.
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-load-samples
  - id: packs
    text: TE's downloadable sound packs go the same way — unzip the pack and drop its folder onto the samples folder.
    source: https://teenage.engineering/downloads/op-xy/sound-packs
procedures:
  - id: load
    goal: Copy samples onto the OP-XY
    preconditions: [the OP-XY is connected by USB-C, field kit is running on a Mac]
    steps:
      - keys: com → M4
        note: copy the files into samples on the computer
      - keys: M4
        note: eject, then unplug
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-load-samples
  - id: browse
    goal: Find the new samples on the unit
    steps:
      - keys: shift + sample
        note: opens the sample library
    source: https://teenage.engineering/guides/op-xy/sample#sample-folder
related: [com.mtp, sampler.sample-files, sampler.sample-library, howto.back-up-projects]
---

Loading samples is plain file copying once the unit is in MTP mode: organise with folders, keep names
to the allowed characters and convert other formats to WAV or AIFF first. Your own recordings land in
the same user folder, so it is also where you copy them off the unit.
