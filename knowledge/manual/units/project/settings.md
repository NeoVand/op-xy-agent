---
id: project.settings
title: Project settings
aliases:
  [
    project config,
    configure project,
    time signature,
    voices,
    polyphony,
    voice allocation,
    scene length
  ]
area: project
order: 50
context:
  screens: [project]
summary: "`M4` in the project view opens the project's own settings — general (transpose), tempo (time signature, groove type), voices and midi — edited with `E1` page, `E2` setting, `E3` value."
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.1.0', '1.1.3']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: open
    text: '`M4` in the project view opens the project settings, which belong to the project and are separate from the system settings.'
    source: https://teenage.engineering/guides/op-xy/project#rename
  - id: navigate
    text: '`turn E1` picks the page (general, tempo, voices, midi), `turn E2` a setting on it and `turn E3` or `turn E4` its value; `M1` leaves.'
    source: https://teenage.engineering/guides/op-xy/project#project-settings
  - id: time-signature
    text: 'The tempo page sets the time signature — 3/4, 4/4 or 5/4, or 6/8, 7/8 or 12/8 — and shows the groove type, which can be changed there too.'
    source: https://teenage.engineering/guides/op-xy/project#project-settings
  - id: voices
    text: The voices page shares out the 24 voices; allocation is automatic by default, and giving a track its own voices gives it priority.
    source: https://teenage.engineering/guides/op-xy/project#project-settings
  - id: scene-length
    text: Since OS 1.1.0 a project setting chooses how scene length is calculated; the guide does not describe it.
    source: https://teenage.engineering/downloads/op-xy#1.1.0
    firmware_min: '1.1.0'
  - id: scene-length-mode
    text: One of its modes is called time signature; OS 1.1.3 repaired it.
    source: https://teenage.engineering/downloads/op-xy#1.1.3
    firmware_min: '1.1.3'
procedures:
  - id: change
    goal: Change a project setting
    steps:
      - keys: project → M4
      - keys: turn E1
        note: choose the page
      - keys: turn E2
        note: choose the setting
      - keys: turn E3
        note: set the value
      - keys: M1
        note: leave the project settings
    source: https://teenage.engineering/guides/op-xy/project#project-settings
related: [project.transpose, project.midi-channels, project.system-usage-indicators, tempo.grooves]
---

Anything stored here travels with the project, unlike the system settings in `com → M1`, which
apply to the whole unit. The general and midi pages have their own units.
