---
id: instrument.engine-epiano
title: Epiano synth engine
aliases: [epiano, e-piano, electric piano, epiano engine, keys engine]
area: instrument
order: 50
context:
  modes: [instrument]
  screens: [M1]
summary: An electric-piano model that also reaches plucks, strong leads and thick basses; its M1 page sets tone, texture, punch and tine.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.1.25']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: character
    text: Epiano imitates an electric piano and stretches to plucky keys, strong leads and heavy basses.
    source: https://teenage.engineering/guides/op-xy/synth-engines#epiano
  - id: label-fix
    text: OS 1.1.25 corrected wrongly named parameters on the epiano screen, so older firmware may label its encoders differently.
    source: https://teenage.engineering/downloads/op-xy#1.1.25
    firmware_min: '1.1.25'
parameters:
  - screen: M1
    encoder: E1
    layer: base
    name: tone
    note: darker ↔ brighter
    cc: 12
    source: https://teenage.engineering/guides/op-xy/synth-engines#epiano
  - screen: M1
    encoder: E2
    layer: base
    name: texture
    note: adds grit
    cc: 13
    source: https://teenage.engineering/guides/op-xy/synth-engines#epiano
  - screen: M1
    encoder: E3
    layer: base
    name: punch
    note: adds movement
    cc: 14
    source: https://teenage.engineering/guides/op-xy/synth-engines#epiano
  - screen: M1
    encoder: E4
    layer: base
    name: tine
    note: bright, metallic attack at the start of each note
    cc: 15
    source: https://teenage.engineering/guides/op-xy/synth-engines#epiano
related: [instrument.engine]
---

Epiano recreates the struck-tine electric piano. Tine sets how much bell-like attack each note has,
tone the overall brightness, texture adds dirt and punch adds movement. With the tine up and a medium
decay it sounds like classic keys; the guide also pitches it for leads and basses, so try it outside
piano parts. Load it with `shift + M1`.
