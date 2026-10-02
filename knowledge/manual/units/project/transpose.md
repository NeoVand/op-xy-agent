---
id: project.transpose
title: Global (project) transpose
aliases: [transpose, global transpose, project transpose, change key, key of the song]
area: project
order: 60
context:
  screens: [project]
summary: The general page of the project settings transposes the whole project, for example to match other music. Whether drums follow is unclear, and OS 1.1.21 simplified the setting.
status: outdated-in-guide
firmware:
  min: '1.0.9'
  changed_in: ['1.1.21', '1.1.25']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: what
    text: The general page of the project settings shifts the pitch of every note in the project, useful for matching the key of other music.
    source: https://teenage.engineering/guides/op-xy/project#project-settings
  - id: drums
    text: Whether drums follow is unclear — the guide says they do, while the OS 1.0.9 notes say global transpose no longer applies to drums; not yet checked on a unit.
    source: https://teenage.engineering/downloads/op-xy#1.0.9
    confidence: conflicting
  - id: replica
    text: The replica follows the OS 1.0.9 notes, the later source. Every track but a drum track plays transposed, with the sound's own preset transpose added, and a drum track plays as it is.
    source: https://teenage.engineering/downloads/op-xy#1.0.9
    confidence: derived
  - id: simplified
    text: OS 1.1.21 simplified the global transpose without saying how.
    source: https://teenage.engineering/downloads/op-xy#1.1.21
    firmware_min: '1.1.21'
  - id: multisamples
    text: OS 1.1.25 improved how multisampled sounds respond to global transpose.
    source: https://teenage.engineering/downloads/op-xy#1.1.25
    firmware_min: '1.1.25'
  - id: brain
    text: To follow a key live, or transpose only chosen tracks, use the brain track in auxiliary mode instead.
    source: https://teenage.engineering/guides/op-xy/auxiliary#brain
procedures:
  - id: transpose
    goal: Transpose the whole project
    steps:
      - keys: project → M4
      - keys: turn E1
        note: general page
      - keys: turn E2
        note: the transpose setting
      - keys: turn E3
        note: set the amount
    source: https://teenage.engineering/guides/op-xy/project#project-settings
related: [project.settings]
---

Global transpose is a set-and-forget offset for the whole project. Because TE changed it after the
guide was written, check the screen for the current options, and listen to the drums after
changing it.
