---
id: com.midi-track-ccs
title: Track parameter CCs
aliases:
  [cc lanes, lane model, parameter ccs, encoder ccs, filter cutoff cc, envelope cc, drum notes]
area: com
order: 75
summary: Community charts and our lane model give each module page four consecutive CCs on the track's channel, one per encoder — `M1` on CC12–15 up to the LFO on CC40–43 — and put the 24 drum keys on notes 53–76.
status: unverified
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: lanes
    text: Each module page answers four consecutive CCs on the track's channel, in encoder order `E1`…`E4`.
    source: docs/research/20-midi-control.md#30-the-lane-model-derived
    confidence: derived
  - id: m1
    text: The `M1` (engine) page uses CC12–15, whatever engine the track runs.
    source: docs/research/20-midi-control.md#34-engine-resolved-names-for-cc1215-p1p4
    confidence: community-verified
  - id: m2
    text: '`M2` uses CC20–23 for the amp envelope (attack, decay, sustain, release), CC24–27 for the filter envelope and CC28–31 for its shift layer: play mode, portamento, bend range and preset volume.'
    source: docs/research/20-midi-control.md#30-the-lane-model-derived
    confidence: community-verified
  - id: m3
    text: '`M3` uses CC32–35 for the filter (cutoff, resonance, envelope amount, key tracking) and CC36–39 for its shift layer, the sends to aux out, tape, FX I and FX II.'
    source: docs/research/20-midi-control.md#30-the-lane-model-derived
    confidence: community-verified
  - id: m4
    text: '`M4` (the LFO) most likely uses CC40–43; community charts label these four CCs inconsistently.'
    source: docs/research/20-midi-control.md#37-known-conflicts--errata-in-the-sources
    confidence: derived
  - id: mixer
    text: The mixer controls sit outside the lanes, on CC7 (level), CC9 (mute) and CC10 (pan).
    source: https://teenage.engineering/guides/op-xy/midi-references
  - id: drum-notes
    text: On drum tracks the 24 keys play MIDI notes 53–76 from left to right (F3–E5 when middle C is 60).
    source: docs/research/20-midi-control.md#42-drum-key-mapping
    confidence: community-verified
  - id: drum-kits
    text: Which sound sits on which note depends on the loaded kit, so check the kit rather than assuming a General MIDI layout.
    source: docs/research/20-midi-control.md#42-drum-key-mapping
    confidence: community-verified
related: [com.midi-cc-reference, instrument.engine-prism, com.controller-mode]
---

The pattern — page by page, four CCs per page, left to right — comes from community charts and
stored project data, not from TE, so treat it as a strong prediction. Filter cutoff on track 3 is
CC32 on channel 3; CCs outside the listed ranges (such as CC16–19) are unconfirmed.
