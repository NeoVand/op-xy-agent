---
id: project.project-view
title: Project view — new, save, rename
aliases:
  [project page, new project, create project, save project, save as, rename project, project name]
area: project
order: 0
context:
  screens: [project]
summary: The project key opens the project view, where you create a new project (hold M1), save (M2), save as (shift + M2), rename (M3) and open the project settings (M4).
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: enter
    text: '`project` opens the project view of the project you are working on.'
    source: https://teenage.engineering/guides/op-xy/project#project
  - id: new
    text: '`hold M1` in the project view creates a new project, saving your work automatically when autosave is on.'
    source: https://teenage.engineering/guides/op-xy/project#rename
  - id: new-sounds
    text: A new project starts with drums on tracks 1 and 2, then bass, pluck, lead, soft pluck, strings and pad on tracks 3–8.
    source: https://teenage.engineering/guides/op-xy/get-started#4.%20get%20started
  - id: save
    text: '`M2` saves the project and stores a version of it.'
    source: https://teenage.engineering/guides/op-xy/project#rename
  - id: save-as
    text: '`shift + M2` saves a copy under a new name you type in.'
    source: https://teenage.engineering/guides/op-xy/project#rename
  - id: rename
    text: '`M3` renames the project: `turn E1` picks the character position and `turn E2` changes the character.'
    source: https://teenage.engineering/guides/op-xy/project#rename
  - id: rename-keys
    text: In the naming screen, `M1` confirms, `M2` moves on to the next character, `M3` cancels and `M4` deletes.
    source: https://teenage.engineering/guides/op-xy/instrument#view-and-create-preset
  - id: config
    text: '`M4` opens the project settings, which are separate from the system settings.'
    source: https://teenage.engineering/guides/op-xy/project#rename
procedures:
  - id: new
    goal: Start a new project
    steps:
      - keys: project
      - keys: hold M1
    result: A new project opens with the default sounds.
    source: docs/research/90-device-probe.md#2026-09-26--session-1-results-owner-present-scratch-project-os-1133
    verified_on: '1.1.33'
  - id: save-as
    goal: Save the project as a copy with a new name
    steps:
      - keys: project → shift + M2
      - keys: turn E1
        note: character position
      - keys: turn E2
        note: character
      - keys: M1
        note: confirm
    source: https://teenage.engineering/guides/op-xy/project#rename
related:
  [
    project.versions-and-autosave,
    project.projects-folder,
    project.settings,
    basics.patterns-scenes-songs
  ]
---

The project view is the home of the current project: its name, the save keys and the way into its
settings. Other projects are opened from the projects folder (`shift + project`), not from here.
