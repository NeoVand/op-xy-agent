---
id: com.multi-out
title: Multi-out jack modes
aliases: [multi-out, multi out, aux out, trs midi out, cv out, sync out, din sync]
area: com
order: 50
context:
  screens: [com]
summary: The 3.5 mm multi-out sends MIDI, CV and gate, a sync pulse (sync8, sync16, sync24) or audio; the mode is chosen with `E3` on the com page while nothing is plugged in.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: modes
    text: 'The multi-out has six modes: midi, cv/gate, audio and three sync rates (sync8, sync16, sync24).'
    source: https://teenage.engineering/guides/op-xy/hardware-overview#inputs-outputs
  - id: select
    text: The mode is chosen on the com page by turning `E3`.
    source: https://teenage.engineering/guides/op-xy/com#setting-the-multi-out-port-and-bluetooth-midi
  - id: unplug-first
    text: The mode cannot change while a cable is in the jack, so set it before connecting.
    source: https://teenage.engineering/guides/op-xy/com#setting-the-multi-out-port-and-bluetooth-midi
  - id: midi
    text: In midi mode a type A TRS-to-DIN adapter cable reaches synths with DIN MIDI sockets.
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-control-a-synth-with-midi
  - id: cv-gate
    text: In cv/gate mode the tip carries pitch CV and the ring the gate.
    source: https://teenage.engineering/guides/op-xy/auxiliary#external-cv
  - id: sync
    text: The sync modes send a clock pulse while the OP-XY plays — sync8, an eighth-note pulse, suits pocket operators and sync24 suits DIN-sync drum machines.
    source: https://teenage.engineering/guides/op-xy/how-to#sync-a-vintage-drum-machine
  - id: audio
    text: In audio mode the jack is an auxiliary audio output, fed by the external audio track's routing and the tracks' aux sends.
    source: https://teenage.engineering/guides/op-xy/auxiliary#external-audio
procedures:
  - id: set
    goal: Choose what the multi-out sends
    preconditions: [no cable is plugged into the multi-out]
    steps:
      - keys: com → turn E3
    source: https://teenage.engineering/guides/op-xy/com#setting-the-multi-out-port-and-bluetooth-midi
parameters:
  - screen: com
    encoder: E3
    layer: base
    name: multi-out mode
    range: midi / cv/gate / sync8 / sync16 / sync24 / audio
    source: https://teenage.engineering/guides/op-xy/com#setting-the-multi-out-port-and-bluetooth-midi
related:
  [hardware.connectors, howto.control-synth-midi, howto.control-cv-synth, howto.external-effect]
---

Pick the job first, then plug in. The jack only sends — MIDI comes in through the MIDI in jack, USB
or bluetooth. TE does not say which gear sync16 is meant for; the output levels are listed with the
specifications.
