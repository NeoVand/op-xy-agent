---
id: instrument.engine-epiano
title: Epiano synth engine
aliases: [epiano, e-piano, electric piano, epiano engine, keys engine]
area: instrument
order: 50
context:
  modes: [instrument]
  screens: [M1]
summary: An electric-piano model that also reaches plucks, strong leads and thick basses; its M1 page sets tone, texture, tine and punch.
status: outdated-in-guide
firmware:
  min: '1.0.9'
  changed_in: ['1.1.25']
  guide_version: '1.1.15'
  verified_on: '1.1.33'
facts:
  - id: character
    text: Epiano imitates an electric piano and stretches to plucky keys, strong leads and heavy basses.
    source: https://teenage.engineering/guides/op-xy/synth-engines#epiano
  - id: label-fix
    text: OS 1.1.25 corrected wrongly named parameters on the epiano screen, so older firmware may label its encoders differently.
    source: https://teenage.engineering/downloads/op-xy#1.1.25
    firmware_min: '1.1.25'
  - id: order
    text: On OS 1.1.33 the third encoder is tine and the fourth punch — the guide lists them the other way round.
    source: docs/research/59-screen-profiling.md#25-engine-pages-instrument-m1
    confidence: verified
    verified_on: '1.1.33'
  - id: picture
    text: Epiano's picture is an isometric stack of layers with tines, under a top bar of coloured cells labelled tone, texture, tine and punch.
    source: docs/research/59-screen-profiling.md#25-engine-pages-instrument-m1
    confidence: verified
    verified_on: '1.1.33'
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
    name: tine
    note: bright, metallic attack at the start of each note; the guide puts it on `E4`
    cc: 14
    source: docs/research/59-screen-profiling.md#25-engine-pages-instrument-m1
    confidence: verified
    verified_on: '1.1.33'
  - screen: M1
    encoder: E4
    layer: base
    name: punch
    note: adds movement; the guide puts it on `E3`
    cc: 15
    source: docs/research/59-screen-profiling.md#25-engine-pages-instrument-m1
    confidence: verified
    verified_on: '1.1.33'
related: [instrument.engine]
---

Epiano recreates the struck-tine electric piano. Tine sets how much bell-like attack each note has,
tone the overall brightness, texture adds dirt and punch adds movement. With the tine up and a medium
decay it sounds like classic keys; the guide also pitches it for leads and basses, so try it outside
piano parts. The guide (1.1.15) lists punch before tine; on 1.1.33, after the 1.1.25 fix to the
epiano's labels, tine sits on `E3` and punch on `E4`. Load it with `shift + M1`.
