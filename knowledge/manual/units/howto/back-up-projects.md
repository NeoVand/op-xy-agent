---
id: howto.back-up-projects
title: Recipe — back up projects to a computer
aliases: [backup, back up, copy projects, export projects, project history]
area: howto
order: 30
summary: Connect a computer, enter MTP (`com → M4`, with field kit on a Mac) and copy the projects folder; a single project needs its file plus its folder in backups.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.0.32']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: connect
    text: Connect the OP-XY with its USB-C cable first; MTP is only offered while a computer is attached, and a Mac also needs field kit.
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-back-up-your-projects
  - id: drive
    text: In MTP mode the OP-XY appears as a drive with presets, projects and samples folders; on a Mac, open it from field kit's menu-bar icon if it does not open by itself.
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-back-up-your-projects
  - id: user-folder
    text: Your projects sit in projects → user, next to a backups folder with each project's history files.
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-back-up-your-projects
  - id: one-project
    text: A complete copy of one project takes both the project file and its matching folder inside backups.
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-back-up-your-projects
  - id: everything
    text: To back up every project at once, copy the whole projects folder to a safe place.
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-back-up-your-projects
  - id: manage
    text: From the computer you can also delete projects, rename them and sort them into subfolders; names may use any UTF-8 characters.
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-back-up-your-projects
  - id: whole-drive
    text: Projects can use your own samples and presets, so a full backup copies the samples and presets folders as well.
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-back-up-your-projects
    confidence: derived
  - id: bad-1029
    text: Backups made while the unit ran OS 1.0.29 may contain corrupted files; make fresh ones on current firmware.
    source: https://teenage.engineering/downloads/op-xy#1.0.32
    firmware_min: '1.0.32'
procedures:
  - id: backup
    goal: Copy all projects to a computer
    preconditions: [the OP-XY is connected by USB-C, field kit is running on a Mac]
    steps:
      - keys: com → M4
        note: MTP mode; copy the projects folder on the computer
      - keys: M4
        note: eject when the copy has finished
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-back-up-your-projects
related: [com.mtp, project.versions-and-autosave, hardware.factory-reset, howto.load-samples]
---

Back up before a firmware update or a factory reset. Copying the whole projects folder also takes
the templates folder and the open project's workspace file along.
