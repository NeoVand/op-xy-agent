---
id: project.versions-and-autosave
title: Autosave, versions and history
aliases:
  [autosave, auto save, versions, history, undo project, older version, backups folder, workspace]
area: project
order: 10
context:
  screens: [project, projects folder]
summary: Projects save themselves by default, and every save or autosave is kept in the project's history, so you can go back and load an older state.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: default
    text: Autosave is on by default; switching it off in the project or system settings leaves only manual saves.
    source: https://teenage.engineering/guides/op-xy/project#rename
  - id: save-version
    text: Each manual save (`M2` in the project view) also adds a version to the project's history.
    source: https://teenage.engineering/guides/op-xy/project#rename
  - id: history
    text: The history keeps every save and autosave, so older states can be loaded and heard; `M2` in the projects folder opens it for the selected project.
    source: https://teenage.engineering/guides/op-xy/project#project-folder
  - id: timestamps
    text: Versions and autosaves carry the date and time from the clock page of the system settings.
    source: https://teenage.engineering/guides/op-xy/com#system-settings
  - id: backups-folder
    text: On a computer (over MTP), the history files sit in a backups folder beside your projects; to back up one project, copy its file together with its history folder.
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-back-up-your-projects
  - id: workspace
    text: Over MTP the unit also shows projects/workspace.xy; on the owner's unit it held the project that was open.
    source: docs/research/90-device-probe.md#2026-09-26--session-1-results-owner-present-scratch-project-os-1133
    verified_on: '1.1.33'
procedures:
  - id: save
    goal: Save the project and add a version
    steps:
      - keys: project → M2
    source: https://teenage.engineering/guides/op-xy/project#rename
  - id: history
    goal: Go back to an older version of a project
    steps:
      - keys: shift + project
        note: select the project in the projects folder
      - keys: M2
        note: opens its history; pick a version and load it
    source: https://teenage.engineering/guides/op-xy/project#project-folder
related: [project.project-view, project.projects-folder, hardware.power-and-charging]
---

The history is a safety net for experiments: if a drastic change fails, load the version from before.
