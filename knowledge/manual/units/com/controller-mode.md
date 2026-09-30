---
id: com.controller-mode
title: MIDI controller mode
aliases: [controller mode, ctrl, midi controller, control mode, daw controller]
area: com
order: 40
context:
  screens: [controller]
summary: '`com → M2` turns the OP-XY into a generic MIDI controller; with `shift` held, `E1`–`E3` set its channel, knob behaviour and octave keys, and `shift + com` leaves.'
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: what
    text: Controller mode makes the OP-XY a general-purpose MIDI controller for any device, a computer included.
    source: https://teenage.engineering/guides/op-xy/com#midi-controller-moder
  - id: knobs
    text: The encoders send either absolute values (0–127) or relative ones (the change since the last position).
    source: https://teenage.engineering/guides/op-xy/com#midi-controller-moder
  - id: exit
    text: '`shift + com` leaves controller mode and returns to the com page.'
    source: https://teenage.engineering/guides/op-xy/com#midi-controller-moder
  - id: encoder-ccs
    text: Community measurements put the encoders on CC1–CC4 when turned and CC15–CC18 when clicked; relative mode sends 1–63 clockwise and 65–127 counter-clockwise.
    source: docs/research/20-midi-control.md#82-controller-mode-com--m2--full-emit-map
    confidence: community
  - id: key-ccs
    text: The keys send CCs as well — `record`, `play` and `stop` send CC55–CC57 (127 on press, 0 on release), the step keys CC61–CC76.
    source: docs/research/20-midi-control.md#82-controller-mode-com--m2--full-emit-map
    confidence: community
  - id: keyboard-notes
    text: The keyboard sends notes 53–76 with velocity; the volume knob sends nothing.
    source: docs/research/20-midi-control.md#82-controller-mode-com--m2--full-emit-map
    confidence: community
procedures:
  - id: enter
    goal: Use the OP-XY as a MIDI controller
    steps:
      - keys: com → M2
      - keys: shift + turn E1
        note: the channel your software listens on
    source: https://teenage.engineering/guides/op-xy/com#midi-controller-moder
  - id: exit
    goal: Leave controller mode
    preconditions: [controller mode is on]
    steps:
      - keys: shift + com
    source: https://teenage.engineering/guides/op-xy/com#midi-controller-moder
parameters:
  - screen: controller
    encoder: E1
    layer: shift
    name: midi channel
    source: https://teenage.engineering/guides/op-xy/com#midi-controller-moder
  - screen: controller
    encoder: E2
    layer: shift
    name: knob mode
    range: absolute / relative
    source: https://teenage.engineering/guides/op-xy/com#midi-controller-moder
  - screen: controller
    encoder: E3
    layer: shift
    name: octave keys
    note: enables or disables `[-]` and `[+]`
    source: https://teenage.engineering/guides/op-xy/com#midi-controller-moder
related: [com.overview, com.midi-cc-reference, com.usb]
---

Controller mode drives a DAW, a soft synth or another instrument from the OP-XY's panel. TE publishes
neither the CC numbers nor the default channel, so set the channel first and confirm the CCs with
your software's MIDI learn.
