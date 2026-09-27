---
id: howto.control-cv-synth
title: Recipe — play an analog synth with CV and gate
aliases: [cv gate, control voltage, eurorack, modular, external cv track]
area: howto
order: 21
context:
  modes: [auxiliary]
summary: Set the multi-out to cv/gate, split its tip (pitch CV) and ring (gate) into the synth's CV and gate inputs, then play and sequence from the external CV track, `T4` in auxiliary mode.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: what
    text: CV (control voltage) carries the pitch of a note to analog and Eurorack synths; the gate is high only while a note is held and fires the synth's envelopes.
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-control-an-analog-synth%20with%20cv%20and%20gate
  - id: tip-ring
    text: In cv/gate mode the multi-out sends CV on the tip and the gate on the ring.
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-control-an-analog-synth%20with%20cv%20and%20gate
  - id: splitter
    text: Use a splitter that breaks tip and ring out to two separate plugs (one that keeps the stereo pair together will not work), sized for the synth — 6.35 mm on many desktop synths, 3.5 mm on Eurorack.
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-control-an-analog-synth%20with%20cv%20and%20gate
  - id: patch
    text: The tip lead goes to the synth's CV (pitch) input and the ring lead to its gate input; on a modular these usually sit on the oscillator and the envelope.
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-control-an-analog-synth%20with%20cv%20and%20gate
  - id: track
    text: The external CV track, `T4` in auxiliary mode, plays and sequences the connected synth from the keyboard and steps.
    source: https://teenage.engineering/guides/op-xy/auxiliary#external-cv
  - id: range
    text: The CV output spans −5 V to +5 V and the gate is 5.2 V high; TE does not state the pitch standard (volts per octave), so check the tuning.
    source: https://teenage.engineering/guides/op-xy/hardware-overview#electrical-characteristics
procedures:
  - id: setup
    goal: Play an analog synth from the OP-XY
    preconditions: [the splitter is not yet plugged into the multi-out]
    steps:
      - keys: com → turn E3
        note: cv/gate; then patch the cables
      - keys: auxiliary → T4
      - keys: keys
        note: the synth follows; sequence it like any track
    source: https://teenage.engineering/guides/op-xy/auxiliary#external-cv
related: [com.multi-out, auxiliary.overview, howto.control-synth-midi]
---

One voltage says which note, the other says when. TE's how-to stops after the cabling; the playing
happens on the external CV track. Connect everything before sending notes.
