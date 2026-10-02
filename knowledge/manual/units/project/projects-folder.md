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
summary: '`shift + project` opens the projects folder — factory projects, your projects, templates and autosaves — to load, duplicate, delete or view the history of a project. TE disagrees with itself about which end key loads and which deletes, so read the screen labels first.'
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
    text: TE's text gives load to `M1`, and the key picture beside that step shows key 1.
    source: https://teenage.engineering/guides/op-xy/project#project-folder
  - id: history
    text: '`M2` shows the history of the selected project.'
    source: https://teenage.engineering/guides/op-xy/project#project-folder
  - id: duplicate
    text: Duplicate copies a whole project with its patterns, scenes and tracks.
    source: https://teenage.engineering/guides/op-xy/project#project-folder
  - id: duplicate-key
    text: TE's text gives duplicate `M2`, the key it also gives history — a slip, since the key picture beside it shows key 3 and the screen drawing puts duplicate third, so duplicate is almost certainly `M3`.
    source: https://teenage.engineering/guides/op-xy/project#project-folder
    confidence: derived
  - id: delete
    text: TE's text gives delete to `hold M4`, and the key picture beside that step shows key 4 held.
    source: https://teenage.engineering/guides/op-xy/project#project-folder
  - id: label-order
    text: TE's drawing of the folder screen labels the soft keys delete, history, duplicate, load from left to right, which puts delete over `M1` and load over `M4` — the reverse of its own text and key pictures.
    source: https://teenage.engineering/guides/op-xy/project#project-folder
    confidence: conflicting
  - id: unsettled
    text: The key order has not been checked on the device yet; the replica follows TE's text, so what the replica shows does not settle it.
    source: docs/research/55-screen.md#9-gaps-where-the-real-screen-would-settle-it
    confidence: derived
  - id: likely
    text: On the arrange page TE's art showed the same reversal and OS 1.1.33 followed the text, so load on `M1` and delete on `hold M4` is the likelier order here too.
    source: docs/research/59-screen-profiling.md#29-arrange-and-song-mode
    confidence: derived
  - id: check-labels
    text: Read the label above `M1` or `M4` on the screen before pressing it, and above all before holding it; the guide mentions no confirmation step after the delete hold, so do not count on one.
    source: https://teenage.engineering/guides/op-xy/project#project-folder
    confidence: derived
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
        note: load in TE's text; check that the label above it reads load
    source: https://teenage.engineering/guides/op-xy/project#project-folder
  - id: delete
    goal: Delete a project
    steps:
      - keys: shift + project
      - keys: hold M4
        note: with the project selected, and only after checking that the label above it reads delete
    source: https://teenage.engineering/guides/op-xy/project#project-folder
related: [project.project-view, project.versions-and-autosave, project.templates]
---

The projects folder is the unit's file browser for projects. History and duplicate sit on the middle
keys whichever way the labels run; only the end keys are in doubt, with TE's text putting load on
`M1` and delete on `M4` and its screen drawing the reverse. Look at the labels before you press, and
never hold a key whose label you have not read: TE describes no way to bring a deleted project back.
