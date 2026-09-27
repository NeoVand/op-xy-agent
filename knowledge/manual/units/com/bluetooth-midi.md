---
id: com.bluetooth-midi
title: Bluetooth MIDI
aliases: [ble midi, bluetooth, wireless midi, advertise, bluetooth le, pair]
area: com
order: 55
context:
  screens: [com]
summary: Turning or clicking `E1` on the com page advertises the OP-XY as a bluetooth LE MIDI device; a host such as a computer, tablet or phone then connects to it for notes and clock.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.0.29', '1.1.15']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: advertise
    text: On the com page, turning or clicking `E1` makes the OP-XY advertise itself over bluetooth MIDI.
    source: https://teenage.engineering/guides/op-xy/com#setting-the-multi-out-port-and-bluetooth-midi
  - id: device-role
    text: The OP-XY joins as a device; the other side is the host and makes the connection from its own bluetooth MIDI settings.
    source: https://teenage.engineering/guides/op-xy/com#setting-the-multi-out-port-and-bluetooth-midi
  - id: messages
    text: The wireless link carries notes and clock, in both directions.
    source: https://teenage.engineering/guides/op-xy/com#setting-the-multi-out-port-and-bluetooth-midi
  - id: clock-since
    text: Clock over bluetooth, incoming and outgoing, arrived in OS 1.0.29.
    source: https://teenage.engineering/downloads/op-xy#1.0.28
    firmware_min: '1.0.29'
  - id: advertise-fix
    text: OS 1.1.15 fixed advertising that sometimes failed to start.
    source: https://teenage.engineering/downloads/op-xy#1.1.15
    firmware_min: '1.1.15'
procedures:
  - id: connect
    goal: Pair the OP-XY with a bluetooth MIDI host
    steps:
      - keys: com → click E1
        note: turning `E1` works as well; the unit is now discoverable
    result: Choose the OP-XY in the host's bluetooth MIDI list to finish the connection.
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-control-a-synth-with-midi
parameters:
  - screen: com
    encoder: E1
    layer: base
    name: bluetooth midi
    note: advertise the unit (clicking does the same)
    source: https://teenage.engineering/guides/op-xy/com#setting-the-multi-out-port-and-bluetooth-midi
related: [com.overview, com.midi-settings, howto.control-synth-midi]
---

Bluetooth MIDI is the cable-free way to play or clock compatible gear and apps. The OP-XY does not
search for partners itself: it only announces that it is available, and the host (a computer, tablet
or phone app) picks it from its list. Audio still needs a cable: the wireless link carries MIDI only.
