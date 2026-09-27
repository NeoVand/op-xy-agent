---
id: project.templates
title: Project templates
aliases: [template, templates folder, default project, starting point, make default]
area: project
order: 30
context:
  screens: [projects folder]
summary: Templates are projects to start from, kept in the templates folder of the projects folder and managed from a computer over MTP; since OS 1.1.17 one can be made the default.
status: outdated-in-guide
firmware:
  min: '1.1.15'
  changed_in: ['1.1.17']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: what
    text: The projects folder has a templates folder for projects meant as starting points.
    source: https://teenage.engineering/guides/op-xy/project#project-folder
  - id: since
    text: Project templates arrived with OS 1.1.15.
    source: https://teenage.engineering/downloads/op-xy#1.1.15
  - id: mtp
    text: Your own templates are created and loaded with a computer over MTP.
    source: https://teenage.engineering/guides/op-xy/project#project-folder
  - id: path
    text: Over MTP the folder is projects/templates.
    source: docs/research/90-device-probe.md#2026-09-26--session-1-results-owner-present-scratch-project-os-1133
    verified_on: '1.1.33'
  - id: copy-in
    text: Copying a project file into that folder should make it a template; the guide implies this but it is not confirmed on a unit.
    source: https://teenage.engineering/guides/op-xy/project#project-folder
    confidence: derived
  - id: make-default
    text: OS 1.1.17 added a make default option for templates.
    source: https://teenage.engineering/downloads/op-xy#1.1.17
    firmware_min: '1.1.17'
  - id: default-meaning
    text: Presumably new projects then start from the default template; the changelog gives no details.
    source: https://teenage.engineering/downloads/op-xy#1.1.17
    firmware_min: '1.1.17'
    confidence: derived
procedures:
  - id: load
    goal: Start from a template
    steps:
      - keys: shift + project
        note: the templates folder sits next to the factory and user projects
      - keys: M1
        note: loads the selected template
    source: https://teenage.engineering/guides/op-xy/project#project-folder
related: [project.projects-folder, project.project-view]
---

A template saves setting up the same tracks, sounds and settings for every new idea. Save your work
under a new name, since neither TE source says how a template is protected from being overwritten.
