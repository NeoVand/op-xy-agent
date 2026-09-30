---
id: howto.slice-a-loop
title: Recipe — sample a loop and play it in slices
aliases:
  [
    slice a loop,
    chop a break,
    sample a loop,
    record a loop onto a key,
    even slices,
    slice a sample into the keys
  ]
area: howto
order: 45
context:
  modes: [instrument]
  screens: [sample, M1]
summary: On a drum track, record a loop onto its top key from the `sample` page, then hold that key and press `M1` to cut it into even slices that spread over the keyboard and choke each other, ready to replay in a new order.
status: current
firmware:
  min: '1.1.0'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: drum-track
    text: Slicing is the drum sampler's, and a new project has drum kits on `T1` and `T2`.
    source: https://teenage.engineering/guides/op-xy/sample#sample-slicer
  - id: record-onto-key
    text: On a drum track the record page records onto the selected key; press the key first, then `sample`.
    source: https://teenage.engineering/guides/op-xy/sample#drum-sampler
  - id: inputs
    text: On the record page `turn E1` picks the source (the built-in mic, line in or USB), `turn E3` the gain and `turn E4` the threshold.
    source: https://teenage.engineering/guides/op-xy/sample#arrange
  - id: threshold
    text: Holding `M1` arms the recorder and the take begins once the input passes the threshold, so a low threshold catches the loop's first hit.
    source: https://teenage.engineering/guides/op-xy/sample#arrange
    confidence: derived
  - id: open
    text: Holding a key and pressing `M1` opens the slicer on that key's sample.
    source: https://teenage.engineering/guides/op-xy/sample#sample-slicer
  - id: even
    text: Even mode splits the sample into equal parts and `turn E4` sets how many; sixteen suits a one-bar loop cut into sixteenths.
    source: https://teenage.engineering/guides/op-xy/sample#sample-slicer
    confidence: derived
  - id: spread
    text: The slices spread over the keyboard and choke each other, so one slice sounds at a time, as in a chopped break.
    source: https://teenage.engineering/guides/op-xy/sample#sample-slicer
  - id: top-key
    text: The replica fills the keys from the lowest, F3, upward (the guide says only that the slices fill the keyboard), so a loop kept on the top key, E5, stays whole there for up to 23 slices.
    source: https://teenage.engineering/guides/op-xy/sample#sample-slicer
    confidence: derived
  - id: done
    text: The slicer offers cancel and done, which the guide does not place on keys; the replica puts done on `M4` and cancel on `M3`.
    source: docs/research/50-hardware-ui.md#33-page-catalogue
    confidence: derived
  - id: transient
    text: For a drum loop with clear hits, transient mode cuts at the loudest ones instead; a sample with fewer hits gives fewer slices than `E4` asks for.
    source: https://teenage.engineering/guides/op-xy/sample#sample-slicer
    confidence: derived
procedures:
  - id: record
    goal: Record a loop onto the drum track's top key
    preconditions: [the loop plays into line in]
    steps:
      - keys: T1 → key E5
        note: the drum track and its top key
      - keys: sample
        note: the record page, recording onto E5
      - keys: turn E1
        note: line in
        set: { param: source, value: line in, area: sample, track: 1 }
      - keys: turn E4
        note: a low threshold, around 10
        set: { param: threshold, value: 10, area: sample, track: 1 }
      - keys: hold M1
        note: start the loop playing, and let go once it has played through
    result: E5 holds the loop; `M2` plays the take back.
    source: https://teenage.engineering/guides/op-xy/sample#arrange
    confidence: derived
  - id: slice
    goal: Cut the loop into sixteen even slices
    steps:
      - keys: sample
        note: leave the record page for the drum page first; on the record page the next combo records again
      - keys: key E5 + M1
        note: hold the loop's key; the slicer opens on it
      - keys: turn E1
        note: even
      - keys: turn E4
        note: sixteen slices
      - keys: M4
        note: done (on the replica; press the key your screen labels done)
        set: { param: even slices, value: 16, area: sample, track: 1, key: E5 }
    result: Sixteen keys play the loop's sixteenths in order, each cutting off the one before; E5 still plays the whole loop.
    source: https://teenage.engineering/guides/op-xy/sample#sample-slicer
    confidence: derived
related: [sampler.slicing, sampler.sampling, sampler.drum-sampler, howto.load-samples]
---

Slicing turns a recording into an instrument: once the loop is spread over the keys, step-enter the
slices in a new order, repeat the kick slice, or play the hits live against the original loop on
E5. Even slices keep the loop's timing grid, so a straight beat cut into sixteenths lines up with
the sequencer's steps; tap mode suits phrases that do not sit on a grid.
