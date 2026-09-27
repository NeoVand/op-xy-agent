---
id: com.overview
title: The com page
aliases: [com, com menu, com screen, connections, connectivity, com key]
area: com
order: 0
context:
  screens: [com]
summary: '`com` opens the connection hub. Its main page handles bluetooth MIDI and the multi-out jack; the four module keys lead to system settings, controller mode, connected devices and MTP file transfer.'
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: m1
    text: '`com → M1` opens the system settings: screen, keyboard, MIDI, clock, pitchbend, battery and the MIDI monitor.'
    source: https://teenage.engineering/guides/op-xy/com
  - id: m2
    text: '`com → M2` switches to MIDI controller mode, where keys and encoders send MIDI to a computer or other gear.'
    source: https://teenage.engineering/guides/op-xy/com
  - id: m3
    text: '`com → M3` lists the MIDI devices connected right now, each with its own send and receive switches.'
    source: https://teenage.engineering/guides/op-xy/com
  - id: m4
    text: '`com → M4` starts MTP mode, used to copy samples, presets and projects between the unit and a computer.'
    source: https://teenage.engineering/guides/op-xy/com
  - id: main-page
    text: On the com page itself, `E1` makes the unit visible to bluetooth MIDI hosts and `E3` chooses what the multi-out jack carries.
    source: https://teenage.engineering/guides/op-xy/com#setting-the-multi-out-port-and-bluetooth-midi
procedures:
  - id: section
    goal: Go to one of the four com sections
    steps:
      - keys: com → M1…M4
        note: system settings, controller mode, devices or MTP
    source: https://teenage.engineering/guides/op-xy/com
related: [com.system-settings, com.controller-mode, com.devices, com.mtp, com.multi-out, com.usb]
---

Think of `com` as the OP-XY's patch bay and system menu in one. The main page itself only holds
bluetooth MIDI (`E1`) and the multi-out setting (`E3`); everything else is one module key away.

Two sections change how the unit behaves until you leave them: controller mode turns the panel into
a MIDI controller, and MTP mode takes the USB MIDI connection away while files move.
