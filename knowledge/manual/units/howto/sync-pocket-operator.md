---
id: howto.sync-pocket-operator
title: Recipe — sync a pocket operator
aliases: [pocket operator, po sync, sync8, sy2, clock a pocket operator]
area: howto
order: 23
summary: Set the multi-out to sync8, run a plain 3.5 mm cable into the pocket operator's input, set the pocket operator to sync mode SY2 and press `play`.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: pulse
    text: Pocket operators follow a slower clock than most gear; sync8 makes the multi-out send one pulse per eighth note.
    source: https://teenage.engineering/guides/op-xy/how-to#sync-a-pocket-operator
  - id: cable
    text: An ordinary 3.5 mm cable runs from the multi-out to the pocket operator's input jack.
    source: https://teenage.engineering/guides/op-xy/how-to#sync-a-pocket-operator
  - id: sy2
    text: On the pocket operator, hold its function key (below the rightmost knob) and press bpm until the screen reads SY2.
    source: https://teenage.engineering/guides/op-xy/how-to#sync-a-pocket-operator
  - id: sy2-meaning
    text: In SY2 the pocket operator takes sync on its input and plays stereo audio from its output.
    source: https://teenage.engineering/guides/op-xy/how-to#sync-a-pocket-operator
  - id: play
    text: '`play` on the OP-XY starts the pulse, and both devices run in time.'
    source: https://teenage.engineering/guides/op-xy/how-to#sync-a-pocket-operator
procedures:
  - id: sync
    goal: Clock a pocket operator from the OP-XY
    preconditions: [the cable is not yet plugged into the multi-out]
    steps:
      - keys: com → turn E3
        note: sync8
      - keys: play
        note: after connecting the cable and setting SY2 on the pocket operator
    source: https://teenage.engineering/guides/op-xy/how-to#sync-a-pocket-operator
related: [com.multi-out, howto.sync-drum-machine]
---

Because SY2 keeps the pocket operator's output in stereo, you can run its audio into the OP-XY's
audio input or a mixer while it follows the OP-XY's tempo. The OP-XY sets the tempo; the pocket
operator only listens.
