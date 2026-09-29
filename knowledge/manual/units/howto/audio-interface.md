---
id: howto.audio-interface
title: Recipe — use an audio interface with the OP-XY
aliases: [audio interface, usb audio interface, sound card, multichannel interface]
area: howto
order: 26
summary: Plug a class-compliant USB audio interface into the OP-XY; the main output plays through it, inputs 1–2 are used by default, and the sample page or the external audio track takes it as the usb source.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.1.25']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: connect
    text: The interface connects to the OP-XY's USB-C port with a USB-C cable or a USB-A adapter; a powered hub helps if it needs more power.
    source: https://teenage.engineering/guides/op-xy/how-to#use-an-audio-interface-with-op-xy
  - id: class-compliant
    text: Interfaces that are USB audio class 1 or class 2 compliant work; ones that need a driver may not.
    source: https://teenage.engineering/guides/op-xy/how-to#use-an-audio-interface-with-op-xy
  - id: main-out
    text: The OP-XY's main output then plays through the interface; the internal speaker may still sound, so turn the volume knob down or monitor on headphones.
    source: https://teenage.engineering/guides/op-xy/how-to#use-an-audio-interface-with-op-xy
  - id: channels
    text: With a multichannel interface the OP-XY uses inputs 1 and 2 unless you choose others.
    source: https://teenage.engineering/guides/op-xy/how-to#use-an-audio-interface-with-op-xy
  - id: pick-channel
    text: On the `sample` page, `E1` sets the source to usb and `shift + turn E1` picks the input channel.
    source: https://teenage.engineering/guides/op-xy/sample#arrange
  - id: channel-conflict
    text: TE's audio-interface how-to picks the channel with `turn E2` instead; which gesture OS 1.1.33 uses is not confirmed on a unit.
    source: https://teenage.engineering/guides/op-xy/how-to#use-an-audio-interface-with-op-xy
    confidence: conflicting
  - id: live-input
    text: To hear the interface's inputs live, set the external audio track's input to usb audio with `E1` and `click E1` to activate it.
    source: https://teenage.engineering/guides/op-xy/how-to#use-an-audio-interface-with-op-xy
  - id: audio-only-fix
    text: OS 1.1.25 fixed audio-only interfaces being reported as disconnected.
    source: https://teenage.engineering/downloads/op-xy#1.1.25
    firmware_min: '1.1.25'
procedures:
  - id: sample-channel
    goal: Sample from other interface inputs
    steps:
      - keys: sample → turn E1
        note: usb source
      - keys: shift + turn E1
        note: input channel
    source: https://teenage.engineering/guides/op-xy/sample#arrange
  - id: live
    goal: Monitor the interface's input through the OP-XY
    steps:
      - keys: auxiliary → T5 → M1 → turn E1
        note: usb audio
      - keys: click E1
        note: activates the input
    source: https://teenage.engineering/guides/op-xy/how-to#use-an-audio-interface-with-op-xy
related: [com.usb, sampler.sampling, howto.external-effect]
---

Here the OP-XY is the USB host, the reverse of connecting it to a computer. The interface adds
better outputs for studio or stage and more inputs for sampling and live processing.
