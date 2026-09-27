---
id: project.projects-folder
title: Projects folder — load, duplicate, delete
aliases:
  [
    project browser,
    project list,
    open project,
    load project,
    duplicate project,
    delete project,
    subfolders
  ]
area: project
order: 20
context:
  screens: [projects folder]
summary: Shift + project opens the projects folder with factory projects, your projects, templates and autosaves; from there you load, duplicate, delete or view the history of a project.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.1.25']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: open
    text: '`shift + project` opens the projects folder, which lists factory projects, your projects, the templates folder and autosaves.'
    source: https://teenage.engineering/guides/op-xy/project#project-folder
  - id: load
    text: '`M1` loads the selected project.'
    source: https://teenage.engineering/guides/op-xy/project#project-folder
  - id: history
    text: '`M2` shows the history of the selected project.'
    source: https://teenage.engineering/guides/op-xy/project#project-folder
  - id: duplicate
    text: Duplicate copies a whole project with its patterns, scenes and tracks; the guide's text gives it `M2` like history, but its drawing puts duplicate on the third key, so it is most likely `M3`.
    source: docs/research/50-hardware-ui.md#33-page-catalogue
    confidence: derived
  - id: delete
    text: '`hold M4` deletes the selected project.'
    source: https://teenage.engineering/guides/op-xy/project#project-folder
  - id: label-order
    text: The guide's drawing of this screen labels the keys delete, history, duplicate, load from left to right, the reverse of the text for M1 and M4; check the labels on your screen.
    source: docs/research/50-hardware-ui.md#33-page-catalogue
    confidence: conflicting
  - id: subfolders
    text: Subfolders made over MTP appear with their names in square brackets; clicking any encoder opens one.
    source: https://teenage.engineering/guides/op-xy/project#project-folder
  - id: unsaved
    text: Since OS 1.1.25 a duplicate includes changes that were not saved yet.
    source: https://teenage.engineering/downloads/op-xy#1.1.25
    firmware_min: '1.1.25'
  - id: mtp-path
    text: Over MTP your projects live in projects/user.
    source: docs/research/90-device-probe.md#2026-09-26--session-1-results-owner-present-scratch-project-os-1133
    verified_on: '1.1.33'
procedures:
  - id: load
    goal: Open another project
    steps:
      - keys: shift + project
      - keys: turn E1…E4
        note: select the project
      - keys: M1
    source: https://teenage.engineering/guides/op-xy/project#project-folder
  - id: delete
    goal: Delete a project
    steps:
      - keys: shift + project
      - keys: hold M4
        note: with the project selected
    source: https://teenage.engineering/guides/op-xy/project#project-folder
related: [project.project-view, project.versions-and-autosave, project.templates]
---

The projects folder is the unit's file browser for projects. Mind the soft-key labels on screen:
TE's text and drawing disagree about which end holds load and delete, and deleting is permanent.
