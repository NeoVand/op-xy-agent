---
id: sampler.sample-files
title: Sample files, pitch and memory
aliases: [wav, aiff, sample format, root note, sample memory, import samples]
area: sampler
order: 70
summary: The samplers read WAV and AIFF files copied into the samples folder over MTP; pitch comes from the file's metadata or a note in its name, and a project can load up to 64 MB of samples.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.0.25', '1.0.45', '1.1.15']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: formats
    text: The OP-XY reads WAV and AIFF files.
    source: https://teenage.engineering/guides/op-xy/sample#sample-folder
  - id: copy-in
    text: To add samples, connect a computer, put the unit in MTP mode and copy the files into the sample library.
    source: https://teenage.engineering/guides/op-xy/sample#sample-folder
  - id: tree
    text: Over MTP the unit shows a samples folder containing user, next to presets and projects.
    source: docs/research/90-device-probe.md#2026-09-26--session-1-results-owner-present-scratch-project-os-1133
    verified_on: '1.1.33'
  - id: delete
    text: Deleting a sample for good needs MTP; clearing a key on the unit only removes the assignment.
    source: https://teenage.engineering/guides/op-xy/sample#sample-folder
  - id: pitch
    text: Pitch is read from the WAV metadata; failing that, from a note name such as a3 in the file name.
    source: https://teenage.engineering/guides/op-xy/sample#sample-folder
  - id: base-note
    text: The unit writes the root note into the metadata of the WAVs it records.
    source: https://teenage.engineering/downloads/op-xy#1.0.45
    firmware_min: '1.0.45'
  - id: octave
    text: Current factory and device files name notes with C4 = 60, older device files with C3 = 60; metadata avoids the mix-up.
    source: docs/research/30-presets-samples.md#34-note-names-in-file-names-the-octave-question
    confidence: community-verified
  - id: device-format
    text: Recordings examined so far are 16-bit, 44.1 kHz mono WAV files.
    source: docs/research/30-presets-samples.md#31-formats
    confidence: community-verified
  - id: names
    text: 'File names should use only letters, digits, spaces, - and #.'
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-load-samples
  - id: nesting
    text: Folders can nest more than one level deep.
    source: https://teenage.engineering/downloads/op-xy#1.1.15
    firmware_min: '1.1.15'
  - id: memory
    text: A project can have up to 64 MB of samples loaded at once.
    source: https://teenage.engineering/downloads/op-xy#1.0.25
    firmware_min: '1.0.25'
related: [sampler.sample-library, com.mtp, project.system-usage-indicators]
---

Anything copied into the samples folder shows up in the library, sorted by folder. Give files a root
note in their metadata, or a note name in the file name, so the samplers play them in tune.
