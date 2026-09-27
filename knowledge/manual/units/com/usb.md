---
id: com.usb
title: USB connections
aliases: [usb, usb-c, usb midi, usb audio, usb host, class compliant, powered hub]
area: com
order: 35
summary: The USB-C port works both ways. A computer sees a driverless audio and MIDI device; as a host the OP-XY accepts class-compliant MIDI gear and audio interfaces plugged into it.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.1.32']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: both-ways
    text: The USB-C port carries audio and MIDI as a USB device (to a computer) and as a USB host (for gear plugged into the OP-XY).
    source: https://teenage.engineering/guides/op-xy/hardware-overview#technical-specifications
  - id: class-compliant
    text: A computer sees the OP-XY as a class-compliant USB audio and MIDI device, so no driver is needed; its one MIDI input and one MIDI output are both named OP-XY.
    source: docs/research/90-device-probe.md#2026-09-26--first-contact-read-only
    verified_on: '1.1.33'
  - id: audio-to-computer
    text: The computer can record the OP-XY's output as a stereo USB audio input at 44.1 kHz and 16 bit.
    source: docs/research/90-device-probe.md#2026-09-26--session-1-results-owner-present-scratch-project-os-1133
    verified_on: '1.1.33'
  - id: audio-from-computer
    text: The USB link also offers an audio stream from the computer into the OP-XY; that it arrives as the external audio track's usb audio input is likely but not confirmed.
    source: docs/research/90-device-probe.md#2026-09-26--first-contact-read-only
    verified_on: '1.1.33'
  - id: host-gear
    text: USB MIDI keyboards, controllers and synths plug straight into the OP-XY through a USB-C cable or adapter, with no computer involved; a powered hub helps gear that needs more power.
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-control-op-xy
  - id: interfaces
    text: Audio interfaces work when they are USB audio class 1 or 2 compliant; ones that need a driver may not.
    source: https://teenage.engineering/guides/op-xy/how-to#use-an-audio-interface-with-op-xy
  - id: start-fix
    text: OS 1.1.32 fixed the unit sometimes failing to start while connected to USB.
    source: https://teenage.engineering/downloads/op-xy#1.1.32
    firmware_min: '1.1.32'
  - id: mtp-switch
    text: In MTP mode the computer sees a file-transfer device instead, so USB audio and MIDI are gone until MTP ends.
    source: docs/research/90-device-probe.md#2026-09-26--session-1-results-owner-present-scratch-project-os-1133
    verified_on: '1.1.33'
related: [hardware.connectors, com.devices, com.mtp, howto.midi-keyboard, howto.audio-interface]
---

With a computer, one cable carries MIDI and audio in both directions — this app uses it to play and
hear the OP-XY. With other gear, the OP-XY is the host.
