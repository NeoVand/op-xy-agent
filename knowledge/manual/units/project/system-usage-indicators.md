---
id: project.system-usage-indicators
title: System usage indicators (voices, CPU, sample memory)
aliases: [voice count, voice stealing, cpu meter, cpu overload, sample memory, crackles, dropouts]
area: project
order: 40
summary: Three small icons warn when a project runs out of room — voice count, CPU load and sample memory — and turn red when the limit is hit.
status: outdated-in-guide
firmware:
  min: '1.1.15'
  changed_in: ['1.1.25', '1.1.32']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: three
    text: Heavy projects can bring up three icons on screen, for voice count, CPU and sample memory.
    source: https://teenage.engineering/guides/op-xy/project#system-usage-indicators
  - id: voices
    text: The voice icon shows how many of the 24 voices are busy and appears only from 17 voices up.
    source: https://teenage.engineering/guides/op-xy/project#system-usage-indicators
  - id: stealing
    text: The guide says the voice icon flashes red when a voice is stolen.
    source: https://teenage.engineering/guides/op-xy/project#system-usage-indicators
  - id: stealing-rework
    text: OS 1.1.25 reworked the stealing indicator so it reports every audible voice steal.
    source: https://teenage.engineering/downloads/op-xy#1.1.25
    firmware_min: '1.1.25'
  - id: cpu
    text: The CPU icon appears above 70 % load and flashes red at 100 %.
    source: https://teenage.engineering/guides/op-xy/project#system-usage-indicators
  - id: cpu-fix
    text: Before OS 1.1.32 the CPU overload warning could miss some stalls.
    source: https://teenage.engineering/downloads/op-xy#1.1.32
    firmware_min: '1.1.32'
  - id: sample-memory
    text: The sample memory icon appears while samples load and when more than 70 % of sample memory is in use.
    source: https://teenage.engineering/guides/op-xy/project#system-usage-indicators
related: [project.settings, project.project-view]
---

When a voice icon turns red, notes are being cut to make room for new ones. Give important tracks
fixed voices in the project settings, shorten release times or thin out chords; for CPU and sample
memory, use fewer heavy tracks or shorter samples.
